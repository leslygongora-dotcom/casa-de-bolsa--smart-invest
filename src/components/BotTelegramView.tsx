import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Lock,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Terminal,
  UserCheck,
  Users,
} from 'lucide-react';
import { auth } from '../firebase';
import type { InvestorEvaluationResult } from '../utils/investorProfileEngine';

interface TelegramConfigPayload {
  botUsername: string | null;
  botId: string | null;
  botFirstName?: string | null;
  telegramUrl: string | null;
  webhookPath: string;
  isTokenConfigured: boolean;
  webhookUrl?: string | null;
  webhookConnected?: boolean;
  pollingActive?: boolean;
  pollingState?: 'inactive' | 'active' | 'paused_by_user' | 'yielded_to_external_python' | 'webhook_mode';
  pendingUpdateCount?: number;
  lastErrorMessage?: string | null;
  commands: string[];
}

interface BotGatewayStatusPayload {
  online: boolean;
  service: string;
  protocol: string;
  activeHttpPort: number;
  dedicatedLocalBotPort: number | null;
  websocketPath: string;
  endpoints: {
    status: string;
    market: string;
    classifyUser: string;
    signal: string;
    telegramWebhook: string;
  };
  commissionRatePct: number;
  maxPortfolioVar99Pct: number;
  supportedSymbols: string[];
  requiresBearerToken: boolean;
  telegram: TelegramConfigPayload;
  timestampIso: string;
}

interface ClassificationApiResult {
  userId: string | null;
  telegramUsername: string | null;
  answers: number[];
  totalScore: number;
  initialProfile: string;
  definitiveProfile: string;
  experienceTier: 'principiante' | 'intermedio' | 'avanzado';
  eligibleForAdvancedBot: boolean;
  dimensions: {
    emotionalTolerancePct: number;
    financialCapacityPct: number;
    knowledgePct: number;
  };
  safetyRulesApplied: string[];
  serverAccess: {
    wsPath: string;
    restMarketPath: string;
    restSignalPath: string;
    commissionRatePct: number;
    maxVar99Pct: number;
    recommendedChannel: string;
  };
  classifiedAtIso: string;
}

interface SignalTestResult {
  symbol: string;
  side: 'BUY' | 'SELL';
  shares: number;
  priceMxn: number;
  priceOriginal: number;
  originalCurrency: string;
  grossMxn: number;
  commissionPct: number;
  commissionMxn: number;
  stopLossPct: number;
  maxLossAtStopMxn: number;
  maxVarBudgetMxn: number;
  approved: boolean;
  decision: string;
  reason: string;
  updatedAtIso: string;
}

interface BotTelegramViewProps {
  evaluation: InvestorEvaluationResult | null;
  totalPortfolioMxn: number;
  usdMxnRate: number | null;
  onOpenTestModal: () => void;
  onNotifyToast: (msg: string, tone?: 'success' | 'warning' | 'info') => void;
}

export const BotTelegramView: React.FC<BotTelegramViewProps> = ({
  evaluation,
  totalPortfolioMxn,
  usdMxnRate,
  onOpenTestModal,
  onNotifyToast,
}) => {
  const [status, setStatus] = useState<BotGatewayStatusPayload | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [adminPreviewEnabled, setAdminPreviewEnabled] = useState<boolean>(false);

  // Clasificador de nuevos usuarios (Q1..Q8)
  const [telegramHandleInput, setTelegramHandleInput] = useState<string>('@nuevo_trader');
  const [horizonMonths, setHorizonMonths] = useState<number>(36);
  const [savingsPct, setSavingsPct] = useState<number>(25);
  const [experienceLevel, setExperienceLevel] = useState<number>(3);
  const [riskTolerance, setRiskTolerance] = useState<number>(3);
  const [classifying, setClassifying] = useState<boolean>(false);
  const [classificationResult, setClassificationResult] = useState<ClassificationApiResult | null>(null);

  // Prueba rápida de señal (/api/bot/v1/signal)
  const [signalSymbol, setSignalSymbol] = useState<string>('NVDA');
  const [signalShares, setSignalShares] = useState<number>(1);
  const [testingSignal, setTestingSignal] = useState<boolean>(false);
  const [signalResult, setSignalResult] = useState<SignalTestResult | null>(null);

  // Conexión directa Polling / Webhook Telegram & Simulador
  const [togglingPolling, setTogglingPolling] = useState<boolean>(false);
  const [connectingWebhook, setConnectingWebhook] = useState<boolean>(false);
  const [webhookActionFeedback, setWebhookActionFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [tgSimCommand, setTgSimCommand] = useState<string>('/clasificar 3,3,4,3,3,4,3,4');
  const [tgSimBusy, setTgSimBusy] = useState<boolean>(false);
  const [tgSimReply, setTgSimReply] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const wsOrigin = origin.replace(/^http/, 'ws');
  const wsFullUrl = `${wsOrigin}${status?.websocketPath || '/ws/trading-bot'}`;
  const webhookFullUrl = `${origin}${status?.telegram?.webhookPath || '/api/telegram/webhook'}`;

  const getUiHeaders = useCallback(async (withJson = false): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    if (withJson) headers['Content-Type'] = 'application/json';
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) headers['x-firebase-token'] = token;
    } catch {
      // ignore if user token unavailable
    }
    return headers;
  }, []);

  const fetchGatewayStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const headers = await getUiHeaders(false);
      const res = await fetch('/api/bot/v1/status', { headers });
      if (res.status === 401) {
        // Still load public Telegram config so @username / Bot ID appear cleanly
        try {
          const tgRes = await fetch('/api/bot/v1/telegram/config');
          if (tgRes.ok) {
            const tgData = (await tgRes.json()) as TelegramConfigPayload;
            setStatus((prev) => ({
              online: true,
              service: 'Smart Invest Trading Bot Gateway',
              protocol: 'v1',
              activeHttpPort: prev?.activeHttpPort ?? 3000,
              dedicatedLocalBotPort: prev?.dedicatedLocalBotPort ?? null,
              websocketPath: '/ws/trading-bot',
              endpoints: prev?.endpoints ?? {
                status: '/api/bot/v1/status',
                market: '/api/bot/v1/market',
                classifyUser: '/api/bot/v1/classify-user',
                signal: '/api/bot/v1/signal',
                telegramWebhook: '/api/telegram/webhook',
              },
              commissionRatePct: 0.1,
              maxPortfolioVar99Pct: 2.5,
              supportedSymbols: prev?.supportedSymbols ?? ['SPY', 'AAPL', 'NVDA', 'MSFT', 'AMZN', 'LLY', 'XOM', 'WALMEX', 'GFNORTE', 'XRP_USDT'],
              requiresBearerToken: true,
              telegram: tgData,
              timestampIso: new Date().toISOString(),
            }));
          }
        } catch {
          // ignore
        }
        setStatusError(
          'Tu servidor tiene BOT_API_SECRET activo para scripts Python externos. Inicia sesión en la app para operar la consola web o envía Authorization: Bearer <BOT_API_SECRET> desde Python.'
        );
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BotGatewayStatusPayload;
      setStatus(data);
    } catch {
      setStatusError('No se pudo consultar /api/bot/v1/status en este instante.');
    } finally {
      setLoadingStatus(false);
    }
  }, [getUiHeaders]);

  useEffect(() => {
    void fetchGatewayStatus();
  }, [fetchGatewayStatus]);

  const userQualification = useMemo(() => {
    if (!evaluation) {
      return {
        tier: 'Sin evaluar',
        isAdvanced: false,
        reason: 'Completa el Test de Perfil de Inversionista (Pregunta 6 y capacidad financiera) para desbloquear el nivel Avanzado.',
      };
    }
    const isAdvanced =
      evaluation.knowledgeScore >= 70 ||
      (evaluation.knowledgeScore >= 60 &&
        (evaluation.definitiveProfileKey === 'crecimiento' ||
          evaluation.definitiveProfileKey === 'agresivo'));

    const tier =
      evaluation.knowledgeScore >= 90
        ? 'Avanzado'
        : evaluation.knowledgeScore >= 60
        ? 'Intermedio'
        : 'Principiante';

    return {
      tier,
      isAdvanced,
      reason: isAdvanced
        ? `Tu perfil ${evaluation.profileDisplayName} (${evaluation.knowledgeLabel}) cumple los criterios técnicos para operar con bots en Python.`
        : `Tu nivel actual es ${tier} (${evaluation.profileDisplayName}). El bot automatizado está reservado para usuarios avanzados (Pregunta 6 ≥ 3–4 y capacidad compatible).`,
    };
  }, [evaluation]);

  const canInspectFullPanel = userQualification.isAdvanced || adminPreviewEnabled;

  const pythonScript = useMemo(() => {
    const authLine = status?.requiresBearerToken
      ? 'BOT_SECRET = os.getenv("BOT_API_SECRET", "TU_BOT_API_SECRET")\nHEADERS = {"Authorization": f"Bearer {BOT_SECRET}"}'
      : 'BOT_SECRET = os.getenv("BOT_API_SECRET", "")\nHEADERS = {"Authorization": f"Bearer {BOT_SECRET}"} if BOT_SECRET else {}';

    return `"""
Smart Invest · Bot Cuantitativo en Python (REST + WebSocket)
Requisitos: pip install requests websockets
"""
import asyncio
import json
import os
import requests
import websockets

SERVER_URL = os.getenv("SMART_INVEST_URL", "${origin}")
WS_URL = os.getenv("SMART_INVEST_WS", "${wsFullUrl}")
${authLine}


def clasificar_nuevo_usuario(answers: list[int], telegram_user: str = "@nuevo"):
    """Envía 8 respuestas (1..4) para decidir si pasa al servidor avanzado o a Modo Juego."""
    resp = requests.post(
        f"{SERVER_URL}/api/bot/v1/classify-user",
        json={"answers": answers, "telegramUsername": telegram_user},
        headers=HEADERS,
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    print(f"[Clasificador] {telegram_user} -> {data['definitiveProfile']} | Canal: {data['serverAccess']['recommendedChannel']}")
    return data


def evaluar_senal_var(symbol: str, shares: float, portfolio_mxn: float):
    """Valida comisión 0.10% y tope estricto VaR 99% (2.50%) con precios Yahoo Finance."""
    resp = requests.post(
        f"{SERVER_URL}/api/bot/v1/signal",
        json={
            "symbol": symbol,
            "side": "BUY",
            "shares": shares,
            "portfolioMxn": portfolio_mxn,
            "stopLossPct": 2.5,
        },
        headers=HEADERS,
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


async def stream_mercado_en_vivo():
    ws_target = f"{WS_URL}?token={BOT_SECRET}" if BOT_SECRET else WS_URL
    async with websockets.connect(ws_target) as ws:
        bienvenida = json.loads(await ws.recv())
        print("[WebSocket conectado]", bienvenida)

        await ws.send(json.dumps({"action": "subscribe", "symbols": ["SPY", "AAPL", "NVDA"]}))
        while True:
            evento = json.loads(await ws.recv())
            if evento.get("type") == "market_tick":
                for sym, q in evento.get("quotes", {}).items():
                    print(f"[{sym}] ${'{'}q['priceMxn']:,.2f{'}'} MXN ({'{'}q['changePct']:+.2f{'}'}%)")
            elif evento.get("type") == "subscribed":
                print("[Suscrito]", evento["symbols"])


if __name__ == "__main__":
    # 1. Ejemplo de clasificación automática para usuario avanzado vs principiante
    clasificar_nuevo_usuario([3, 3, 4, 3, 3, 4, 3, 4], "@trader_avanzado")
    # 2. Ejemplo de validación de orden con comisión 0.10% y escudo VaR 2.5%
    print("[Señal NVDA]", evaluar_senal_var("NVDA", 1, 190000))
    # 3. Escucha en vivo de ticks Yahoo Finance vía WebSocket
    asyncio.run(stream_mercado_en_vivo())
`;
  }, [origin, wsFullUrl, status?.requiresBearerToken]);

  const copyText = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        onNotifyToast(`${label} copiado al portapapeles.`, 'success');
      } catch {
        onNotifyToast(`No se pudo copiar automáticamente (${label}).`, 'warning');
      }
    },
    [onNotifyToast]
  );

  const downloadPythonScript = useCallback(() => {
    const blob = new Blob([pythonScript], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smart_invest_bot.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotifyToast('Archivo smart_invest_bot.py descargado.', 'success');
  }, [pythonScript, onNotifyToast]);

  const handleClassifyNewUser = async (preset?: 'principiante' | 'avanzado') => {
    let h = horizonMonths;
    let s = savingsPct;
    let exp = experienceLevel;
    let rsk = riskTolerance;

    if (preset === 'principiante') {
      h = 6;
      s = 60;
      exp = 1;
      rsk = 1;
      setHorizonMonths(6);
      setSavingsPct(60);
      setExperienceLevel(1);
      setRiskTolerance(1);
    } else if (preset === 'avanzado') {
      h = 60;
      s = 15;
      exp = 4;
      rsk = 4;
      setHorizonMonths(60);
      setSavingsPct(15);
      setExperienceLevel(4);
      setRiskTolerance(4);
    }

    setClassifying(true);
    try {
      const headers = await getUiHeaders(true);
      const res = await fetch('/api/bot/v1/classify-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          telegramUsername: telegramHandleInput.trim() || '@nuevo_usuario',
          horizonMonths: h,
          savingsPct: s,
          experienceLevel: exp,
          riskTolerance: rsk,
        }),
      });
      const data = (await res.json()) as ClassificationApiResult;
      if (!res.ok) throw new Error('Error al clasificar usuario');
      setClassificationResult(data);
      onNotifyToast(
        `Usuario clasificado como ${data.definitiveProfile.toUpperCase()} (${data.serverAccess.recommendedChannel}).`,
        data.eligibleForAdvancedBot ? 'success' : 'info'
      );
    } catch {
      onNotifyToast('No se pudo ejecutar la clasificación en el servidor.', 'warning');
    } finally {
      setClassifying(false);
    }
  };

  const handleTestSignal = async () => {
    setTestingSignal(true);
    try {
      const portfolioBase = totalPortfolioMxn > 0 ? totalPortfolioMxn : (usdMxnRate || 19.5) * 10000;
      const headers = await getUiHeaders(true);
      const res = await fetch('/api/bot/v1/signal', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          symbol: signalSymbol,
          side: 'BUY',
          shares: signalShares,
          portfolioMxn: portfolioBase,
          stopLossPct: 2.5,
        }),
      });
      const data = (await res.json()) as SignalTestResult;
      if (!res.ok) throw new Error(data.reason || 'Error en señal');
      setSignalResult(data);
    } catch {
      onNotifyToast('Error al evaluar señal en /api/bot/v1/signal.', 'warning');
    } finally {
      setTestingSignal(false);
    }
  };

  const handleToggleTelegramPolling = async (action: 'start' | 'stop') => {
    setTogglingPolling(true);
    setWebhookActionFeedback(null);
    try {
      const headers = await getUiHeaders(true);
      const res = await fetch('/api/bot/v1/telegram/polling', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        telegram?: TelegramConfigPayload;
      };
      if (!res.ok || !data.ok) {
        const errMsg = data.error || 'No se pudo actualizar el modo Polling de Telegram.';
        setWebhookActionFeedback({ ok: false, message: errMsg });
        onNotifyToast(errMsg, 'warning');
        return;
      }
      if (data.telegram) {
        setStatus((prev) => (prev ? { ...prev, telegram: data.telegram! } : prev));
      } else {
        await fetchGatewayStatus();
      }
      const okMsg =
        data.message ||
        (action === 'start'
          ? 'Bot de Telegram escuchando en vivo (Polling activo).'
          : 'Bot de Telegram pausado para permitir tu script Python local.');
      setWebhookActionFeedback({ ok: true, message: okMsg });
      onNotifyToast(okMsg, action === 'start' ? 'success' : 'info');
    } catch {
      const msg = 'No se pudo contactar al servidor para cambiar el estado del bot en Telegram.';
      setWebhookActionFeedback({ ok: false, message: msg });
      onNotifyToast(msg, 'warning');
    } finally {
      setTogglingPolling(false);
    }
  };

  const handleConnectTelegramWebhook = async () => {
    setConnectingWebhook(true);
    setWebhookActionFeedback(null);
    try {
      const headers = await getUiHeaders(true);
      const res = await fetch('/api/bot/v1/telegram/connect-webhook', {
        method: 'POST',
        headers,
        body: JSON.stringify({ origin }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        telegram?: TelegramConfigPayload;
      };
      if (!res.ok || !data.ok) {
        const errMsg = data.error || 'No se pudo activar el Webhook en Telegram.';
        setWebhookActionFeedback({ ok: false, message: errMsg });
        onNotifyToast(errMsg, 'warning');
        return;
      }
      if (data.telegram) {
        setStatus((prev) => (prev ? { ...prev, telegram: data.telegram! } : prev));
      } else {
        await fetchGatewayStatus();
      }
      const okMsg = data.message || 'Webhook de Telegram activado correctamente.';
      setWebhookActionFeedback({ ok: true, message: okMsg });
      onNotifyToast(okMsg, 'success');
    } catch {
      const msg = 'No se pudo contactar al servidor para activar el Webhook.';
      setWebhookActionFeedback({ ok: false, message: msg });
      onNotifyToast(msg, 'warning');
    } finally {
      setConnectingWebhook(false);
    }
  };

  const handleSimulateTelegramCommand = async (customCmd?: string) => {
    const cmdText = (customCmd ?? tgSimCommand).trim();
    if (!cmdText) return;
    if (customCmd) setTgSimCommand(customCmd);
    setTgSimBusy(true);
    try {
      const res = await fetch('/api/telegram/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          message: {
            chat: { id: 999000111 },
            from: { username: 'inversionista_prueba', first_name: 'Prueba' },
            text: cmdText,
          },
        }),
      });
      const data = (await res.json()) as { replyText?: string };
      setTgSimReply(data.replyText || 'Sin respuesta del webhook.');
    } catch {
      onNotifyToast('No se pudo probar el comando en /api/telegram/webhook.', 'warning');
    } finally {
      setTgSimBusy(false);
    }
  };

  const telegramCfg = status?.telegram;
  const setWebhookCmd = `curl -X POST "https://api.telegram.org/bot<TU_TELEGRAM_BOT_TOKEN>/setWebhook" -H "Content-Type: application/json" -d '{"url":"${webhookFullUrl}"}'`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <Terminal className="w-4 h-4" />
            <span>Gateway para Bot Python, Telegram y Usuarios Avanzados</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white">
            Conexión API / WebSocket y Clasificador de Acceso al Servidor
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Conecta tu script de Python al puerto del servidor en tiempo real, enlaza tu propio Bot de Telegram mediante Webhook y clasifica automáticamente a usuarios nuevos para decidir si pasan al servidor avanzado o a Modo Juego.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchGatewayStatus()}
            disabled={loadingStatus}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            Actualizar estado
          </button>
          {!userQualification.isAdvanced && (
            <button
              type="button"
              onClick={() => setAdminPreviewEnabled((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                adminPreviewEnabled
                  ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              {adminPreviewEnabled ? 'Vista Administrador: ACTIVA' : 'Vista de Administrador del Servidor'}
            </button>
          )}
        </div>
      </div>

      {/* Banner de calificación de usuario avanzado */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          userQualification.isAdvanced
            ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-950 dark:text-emerald-100'
            : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/25 text-amber-950 dark:text-amber-100'
        }`}
      >
        <div className="flex items-start gap-3">
          {userQualification.isAdvanced ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5 text-xs sm:text-sm">
            <div className="font-bold">
              Nivel de acceso actual: {userQualification.tier}
              {userQualification.isAdvanced ? ' · Acceso completo al Bot en Python' : ' · Restringido para bots en vivo'}
            </div>
            <p className="opacity-90 text-xs">{userQualification.reason}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenTestModal}
          className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold shrink-0 cursor-pointer"
        >
          {evaluation ? 'Actualizar Test de Perfil' : 'Hacer Test de Perfil'}
        </button>
      </div>

      {statusError && (
        <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-900 dark:text-rose-200">
          {statusError}
        </div>
      )}

      {/* Métricas de red y puerto del servidor */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold">
              <Server className="w-4 h-4 text-emerald-500" />
              Puerto Activo y Protocolo
            </span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {status?.online ? 'EN LÍNEA' : 'VERIFICANDO'}
            </span>
          </div>
          <div className="text-lg font-mono font-bold text-slate-900 dark:text-white">
            Puerto {status?.activeHttpPort ?? 3000} (HTTP / WS)
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            En la nube, el tráfico externo entra por HTTPS (443) hacia el puerto {status?.activeHttpPort ?? 3000}. En servidor propio puedes activar <code className="font-mono">BOT_GATEWAY_PORT</code>{status?.dedicatedLocalBotPort ? ` (activo: ${status.dedicatedLocalBotPort})` : ''}.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Activity className="w-4 h-4 text-sky-500" />
            WebSocket Python en Vivo
          </div>
          <div className="text-xs font-mono font-bold text-slate-900 dark:text-white break-all">
            {wsFullUrl}
          </div>
          <button
            type="button"
            onClick={() => void copyText(wsFullUrl, 'URL WebSocket')}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            <Copy className="w-3 h-3" />
            Copiar endpoint WebSocket
          </button>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-violet-500" />
              Bot de Telegram (@username / ID)
            </span>
            <span
              className={`font-mono text-[10px] font-bold ${
                telegramCfg?.pollingActive || telegramCfg?.webhookConnected
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : telegramCfg?.pollingState === 'yielded_to_external_python'
                  ? 'text-sky-600 dark:text-sky-400'
                  : telegramCfg?.isTokenConfigured
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-500'
              }`}
            >
              {telegramCfg?.pollingActive
                ? 'EN VIVO (POLLING)'
                : telegramCfg?.webhookConnected
                ? 'WEBHOOK ACTIVO'
                : telegramCfg?.pollingState === 'yielded_to_external_python'
                ? 'PYTHON LOCAL ACTIVO'
                : telegramCfg?.pollingState === 'paused_by_user'
                ? 'PAUSADO (PYTHON LOCAL)'
                : telegramCfg?.isTokenConfigured
                ? 'LISTO PARA ACTIVAR'
                : 'SIN TOKEN'}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {telegramCfg?.botUsername
              ? `@${telegramCfg.botUsername}${telegramCfg.botFirstName ? ` · ${telegramCfg.botFirstName}` : ''}`
              : 'Pendiente: agrega TELEGRAM_BOT_TOKEN'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Bot ID: {telegramCfg?.botId || 'Se detecta automático al poner el token'} · Token:{' '}
            {telegramCfg?.isTokenConfigured ? 'Configurado' : 'Pendiente en Secrets'}
          </div>
        </div>
      </div>

      {/* Sección Principal: 2 columnas */}
      {canInspectFullPanel ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Columna 1: Código Python + Prueba de Señal VaR */}
          <div className="space-y-6">
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-emerald-500" />
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Script Listo para Bot de Trading en Python
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Instala dependencias: <code className="font-mono">pip install requests websockets</code>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyText(pythonScript, 'Código Python')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar
                  </button>
                  <button
                    type="button"
                    onClick={downloadPythonScript}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar .py
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block">GET Mercado Yahoo Finance</span>
                  <span className="text-slate-900 dark:text-slate-100 break-all">/api/bot/v1/market</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 block">POST Validar Señal 0.10% / VaR</span>
                  <span className="text-slate-900 dark:text-slate-100 break-all">/api/bot/v1/signal</span>
                </div>
              </div>

              <pre className="p-4 rounded-lg bg-slate-950 text-emerald-300 text-[11px] leading-relaxed font-mono overflow-x-auto max-h-96 border border-slate-800">
                <code>{pythonScript}</code>
              </pre>
            </div>

            {/* Probador en vivo de /api/bot/v1/signal */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Probar Validación de Orden Python (Comisión 0.10% + VaR 2.50%)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Simula exactamente la respuesta JSON que recibe tu bot antes de enviar una orden.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Símbolo</span>
                  <select
                    value={signalSymbol}
                    onChange={(e) => setSignalSymbol(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    {(status?.supportedSymbols || ['SPY', 'AAPL', 'NVDA', 'MSFT', 'AMZN', 'LLY', 'XOM', 'WALMEX', 'GFNORTE', 'XRP_USDT']).map(
                      (sym) => (
                        <option key={sym} value={sym}>
                          {sym}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Acciones</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={signalShares}
                    onChange={(e) => setSignalShares(Math.max(0.1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => void handleTestSignal()}
                    disabled={testingSignal}
                    className="w-full py-2 px-3 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:opacity-90 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {testingSignal ? 'Consultando Yahoo...' : 'Evaluar señal'}
                  </button>
                </div>
              </div>

              {signalResult && (
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {signalResult.symbol} · Decisión: <span className="font-mono">{signalResult.decision}</span>
                    </span>
                    <span
                      className={`font-bold ${
                        signalResult.approved ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                      }`}
                    >
                      {signalResult.approved ? 'APROBADA' : 'BLOQUEADA POR VaR'}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{signalResult.reason}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                    <div>Precio: ${signalResult.priceMxn.toLocaleString('es-MX')} MXN</div>
                    <div>Comisión 0.10%: ${signalResult.commissionMxn} MXN</div>
                    <div>Riesgo Stop: ${signalResult.maxLossAtStopMxn} MXN</div>
                    <div>Límite VaR: ${signalResult.maxVarBudgetMxn} MXN</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Columna 2: Bot de Telegram + Clasificador de Nuevos Usuarios */}
          <div className="space-y-6">
            {/* Telegram */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-5 h-5 text-sky-500 shrink-0" />
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Integración de Bot en Telegram (Modo Bot en Vivo · Polling / Webhook)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      El servidor lee tu token <code className="font-mono">TELEGRAM_BOT_TOKEN</code> y responde directo en Telegram usando <strong>Polling saliente</strong> (sin bloqueos 302 en vista previa) o mediante Webhook en tu URL pública.
                    </p>
                  </div>
                </div>
                {telegramCfg?.telegramUrl && (
                  <a
                    href={telegramCfg.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shrink-0"
                  >
                    Abrir @{telegramCfg.botUsername}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {/* Estado de los 3 pasos de conexión real */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">1. Bot Detectado</div>
                  <p className="text-slate-600 dark:text-slate-400">
                    {telegramCfg?.botUsername
                      ? `@${telegramCfg.botUsername} (ID ${telegramCfg.botId}) listo para responder comandos.`
                      : 'Crea tu bot en @BotFather (/newbot) y copia el token.'}
                  </p>
                </div>
                <div
                  className={`p-3 rounded-lg border space-y-1 ${
                    telegramCfg?.isTokenConfigured
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20'
                      : 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20'
                  }`}
                >
                  <div className="font-bold text-slate-900 dark:text-white">
                    2. Token en Secrets {telegramCfg?.isTokenConfigured ? '✓ Listo' : '· Pendiente'}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    <code className="font-mono">TELEGRAM_BOT_TOKEN</code> cargado en el servidor para enviar respuestas reales a Telegram.
                  </p>
                </div>
                <div
                  className={`p-3 rounded-lg border space-y-1 ${
                    telegramCfg?.pollingActive || telegramCfg?.webhookConnected
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20'
                      : 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20'
                  }`}
                >
                  <div className="font-bold text-slate-900 dark:text-white">
                    3. Canal en Vivo{' '}
                    {telegramCfg?.pollingActive
                      ? '✓ Polling Activo'
                      : telegramCfg?.webhookConnected
                      ? '✓ Webhook Activo'
                      : telegramCfg?.pollingState === 'paused_by_user' ||
                        telegramCfg?.pollingState === 'yielded_to_external_python'
                      ? '· En pausa (Python local)'
                      : ''}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    En vista previa (<code className="font-mono">ais-dev</code>) se usa <strong>Polling directo</strong> para evitar redirecciones 302. Pausa con 1 clic si correrás tu propio script Python.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleToggleTelegramPolling('start')}
                  disabled={togglingPolling}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {togglingPolling
                    ? 'Actualizando bot...'
                    : 'Activar / Reanudar Bot en Telegram (En Vivo)'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleTelegramPolling('stop')}
                  disabled={togglingPolling}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pausar para usar mi script Python local
                </button>
              </div>

              {telegramCfg?.pollingState === 'yielded_to_external_python' && (
                <div className="p-3 rounded-lg border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-xs text-sky-900 dark:text-sky-200">
                  Se detectó otro script de Python escuchando este mismo bot (<code className="font-mono">HTTP 409</code>). Smart Invest cedió el control automáticamente para no interferir con tu bot local. Cuando quieras que responda este servidor, presiona <strong>Activar / Reanudar Bot en Telegram (En Vivo)</strong>.
                </div>
              )}

              {telegramCfg?.pollingState === 'paused_by_user' && (
                <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
                  El polling de Smart Invest está pausado para que puedas correr tu script local en Python (por ejemplo <code className="font-mono">Activar trading</code> / <code className="font-mono">Obtener Excel</code>). Presiona el botón verde cuando quieras reactivar las respuestas desde aquí.
                </div>
              )}

              {webhookActionFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    webhookActionFeedback.ok
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                      : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  {webhookActionFeedback.message}
                </div>
              )}

              {telegramCfg?.lastErrorMessage && (
                <div className="p-2.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-[11px] text-rose-800 dark:text-rose-200">
                  Último aviso reportado por Telegram: <code className="font-mono">{telegramCfg.lastErrorMessage}</code>
                </div>
              )}

              {/* Simulador en vivo de comandos de Telegram */}
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Probar respuesta real del Bot aquí (antes o después de conectar Telegram)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {['/start', '/clasificar 3,3,4,3,3,4,3,4', '/mercado NVDA', '/avanzado'].map((presetCmd) => (
                      <button
                        key={presetCmd}
                        type="button"
                        onClick={() => void handleSimulateTelegramCommand(presetCmd)}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[10px] font-mono font-semibold hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {presetCmd.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tgSimCommand}
                    onChange={(e) => setTgSimCommand(e.target.value)}
                    placeholder="/clasificar 3,3,4,3,3,4,3,4"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSimulateTelegramCommand()}
                    disabled={tgSimBusy}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {tgSimBusy ? 'Probando...' : 'Probar'}
                  </button>
                </div>
                {tgSimReply && (
                  <pre className="p-3 rounded-lg bg-slate-950 text-sky-200 text-[11px] font-mono whitespace-pre-wrap border border-slate-800">
                    {tgSimReply}
                  </pre>
                )}
              </div>

              <details className="text-[11px] text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer font-semibold hover:text-slate-800 dark:hover:text-slate-200">
                  Opciones avanzadas: Webhook en URL pública publicada (Shared App URL) y curl
                </summary>
                <div className="mt-2.5 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleConnectTelegramWebhook()}
                      disabled={connectingWebhook}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {connectingWebhook
                        ? 'Conectando Webhook...'
                        : telegramCfg?.webhookConnected
                        ? 'Re-sincronizar Webhook y Comandos'
                        : 'Activar Webhook en esta URL pública'}
                    </button>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {telegramCfg?.webhookConnected && telegramCfg.webhookUrl
                        ? `Webhook activo en: ${telegramCfg.webhookUrl}`
                        : 'Úsalo solo cuando abras la app publicada (Shared App URL sin login Google).'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-500 block">Webhook URL del Servidor</span>
                      <span className="font-mono text-slate-900 dark:text-slate-100 break-all">{webhookFullUrl}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(webhookFullUrl, 'Webhook URL')}
                      className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-semibold shrink-0 cursor-pointer"
                    >
                      Copiar
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-500 block">Comando manual setWebhook (curl)</span>
                      <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 break-all">{setWebhookCmd}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(setWebhookCmd, 'Comando setWebhook')}
                      className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-semibold shrink-0 cursor-pointer"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              </details>
            </div>

            {/* Clasificador en vivo de nuevos usuarios */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-500" />
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Clasificador en Vivo de Nuevos Usuarios → Servidor
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Usa exactamente la misma lógica del servidor (<code className="font-mono">POST /api/bot/v1/classify-user</code>) para enrutar nuevas cuentas.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleClassifyNewUser('principiante')}
                    className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Preset Principiante
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClassifyNewUser('avanzado')}
                    className="px-2.5 py-1 rounded-md border border-emerald-500/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/10 cursor-pointer"
                  >
                    Preset Avanzado
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Usuario de Telegram o Correo
                  </span>
                  <input
                    type="text"
                    value={telegramHandleInput}
                    onChange={(e) => setTelegramHandleInput(e.target.value)}
                    placeholder="@usuario_nuevo"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Experiencia (Pregunta 6: {experienceLevel}/4)
                  </span>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value={1}>1 · Principiante sin experiencia</option>
                    <option value={2}>2 · Conceptos básicos</option>
                    <option value={3}>3 · Intermedio (volatilidad y riesgo)</option>
                    <option value={4}>4 · Avanzado (análisis y bots)</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Horizonte de inversión (meses)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={horizonMonths}
                    onChange={(e) => setHorizonMonths(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    % de ahorros comprometidos ({savingsPct}%)
                  </span>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={savingsPct}
                    onChange={(e) => setSavingsPct(Math.min(100, Math.max(5, Number(e.target.value) || 20)))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </label>

                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Tolerancia emocional a caídas ({riskTolerance}/4)
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={1}
                    value={riskTolerance}
                    onChange={(e) => setRiskTolerance(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => void handleClassifyNewUser()}
                disabled={classifying}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {classifying ? 'Clasificando en servidor...' : 'Clasificar usuario y asignar canal del servidor'}
              </button>

              {classificationResult && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                      <UserCheck className="w-4 h-4 text-emerald-500" />
                      <span>
                        {classificationResult.telegramUsername || 'Usuario'} → Perfil{' '}
                        {classificationResult.definitiveProfile.toUpperCase()} ({classificationResult.totalScore}/32)
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                        classificationResult.eligibleForAdvancedBot
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {classificationResult.serverAccess.recommendedChannel}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                    <div>Emocional: {classificationResult.dimensions.emotionalTolerancePct}%</div>
                    <div>Capacidad: {classificationResult.dimensions.financialCapacityPct}%</div>
                    <div>Conocimiento: {classificationResult.dimensions.knowledgePct}%</div>
                  </div>

                  {classificationResult.safetyRulesApplied.length > 0 && (
                    <ul className="space-y-1 text-[11px] text-amber-700 dark:text-amber-300 list-disc pl-4">
                      {classificationResult.safetyRulesApplied.map((rule, idx) => (
                        <li key={idx}>{rule}</li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>
                      {classificationResult.eligibleForAdvancedBot
                        ? `Autorizado para conectar Python a ${classificationResult.serverAccess.wsPath}`
                        : 'Canal sugerido: iniciar con $0 reales + Modo Juego ($10,000 USD/día) antes de conectar bots.'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <Lock className="w-8 h-8 text-amber-500 mx-auto" />
          <div className="max-w-lg mx-auto space-y-1.5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Módulo de Trading Algorítmico Reservado para Usuarios Avanzados
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Para proteger a quienes están iniciando, los scripts de Python en vivo y las credenciales de conexión del servidor se habilitan cuando tu perfil alcanza nivel <strong>Avanzado</strong> o cuando activas la vista de administrador del servidor.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenTestModal}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Actualizar Test de Perfil
            </button>
            <button
              type="button"
              onClick={() => setAdminPreviewEnabled(true)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Soy el administrador del servidor (mostrar conexión)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
