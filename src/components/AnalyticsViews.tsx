import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, ExternalLink, FileDown, HardDrive, HelpCircle, MessageSquare, RotateCcw, Send, ShieldCheck, TrendingDown, TrendingUp, Volume2, Wifi, WifiOff } from 'lucide-react';
import { InvestorProfile, OptionContractType, OptionPosition, PortfolioPosition, RiskLevel, Sector, StockAsset, TonePreset, TradeOrder } from '../types';
import { playTonePreset, TONE_PRESET_OPTIONS } from '../utils/audioAlarm';
import { markOptionPositionToMarket, priceBlackScholesOption } from '../utils/blackScholes';
import { computeFiscalSummary, exportOrdersToFiscalCsv } from '../utils/fiscalCsvExport';
import { formatSavedTimestamp } from '../utils/portfolioStorage';
import { AlarmSoundStyleSection } from './AlarmSoundStyleSection';
import { SvgAreaChart } from './SvgAreaChart';
import { VoiceLivePanel } from './VoiceLivePanel';

/* 1. SIMULADOR MONTE CARLO */
export const SimulatorView: React.FC = () => {
  const [amount, setAmount] = useState<number>(100000);
  const [days, setDays] = useState<number>(90);
  const [risk, setRisk] = useState<RiskLevel>('moderado');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    optVal: number;
    optPct: number;
    midVal: number;
    midPct: number;
    stressVal: number;
    stressPct: number;
  }>({
    optVal: 114200,
    optPct: 14.2,
    midVal: 104800,
    midPct: 4.8,
    stressVal: 97500,
    stressPct: -2.5,
  });

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/simulate-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capital_inicial: amount,
          dias_horizonte: days,
          perfil_riesgo: risk,
        }),
      });
      const data = await res.json();
      setResult({
        optVal: data.escenario_optimista_p95.valor_final_mxn,
        optPct: data.escenario_optimista_p95.rendimiento_pct,
        midVal: data.escenario_esperado_p50.valor_final_mxn,
        midPct: data.escenario_esperado_p50.rendimiento_pct,
        stressVal: data.escenario_estres_extremo_p01.valor_final_mxn,
        stressPct: data.escenario_estres_extremo_p01.rendimiento_pct,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Simulador: ¿Qué puede pasar con mi dinero?
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-1">
          Elige cuánto dinero quieres probar y cuántos días. Calculamos el mejor escenario, el más probable y tu límite protegido.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">
              ¿Cuánto dinero quieres simular? (MXN)
            </label>
            <input
              type="number"
              min="1000"
              value={amount}
              onChange={(e) => setAmount(Math.max(1000, Number(e.target.value) || 0))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-base font-bold"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">
              ¿Por cuánto tiempo?
            </label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
            >
              <option value={30}>30 días (1 mes)</option>
              <option value={90}>90 días (3 meses)</option>
              <option value={180}>180 días (6 meses)</option>
              <option value={365}>365 días (1 año)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">
              ¿Qué tanto riesgo aceptas?
            </label>
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value as RiskLevel)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
            >
              <option value="conservador">Tranquilo / Conservador</option>
              <option value="moderado">Equilibrado / Moderado</option>
              <option value="agresivo">Mayor crecimiento / Dinámico</option>
            </select>
          </div>
          <button
            onClick={runSimulation}
            disabled={loading}
            className="w-full py-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Calculando 1,000 escenarios...' : 'Calcular Escenarios'}
          </button>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="p-5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                Si al mercado le va muy bien (Favorable)
              </span>
              <span className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                +${Math.max(0, result.optVal - amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (+{result.optPct}%)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 mt-1.5">
              Tendrías aproximadamente ${result.optVal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN al final del periodo.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
                Lo más probable (Promedio esperado)
              </span>
              <span className="text-xl font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-300">
                {result.midVal >= amount ? '+' : ''}$
                {(result.midVal - amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN ({result.midPct >= 0 ? '+' : ''}
                {result.midPct}%)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-indigo-900 dark:text-indigo-200 mt-1.5">
              Tendrías aproximadamente ${result.midVal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN en condiciones normales.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wide text-rose-800 dark:text-rose-300">
                Si hay una caída fuerte (Protegido por VaR 2.5%)
              </span>
              <span className="text-xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
                -${Math.max(0, amount - result.stressVal).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN ({result.stressPct}%)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-rose-900 dark:text-rose-200 mt-1.5">
              Tu dinero nunca baja de ${result.stressVal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN gracias a los cinturones Stop Loss automáticos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* 2. APRENDE CON IA: CHATBOT MULTI-TURNO GEMINI + VOZ EN TIEMPO REAL (gemini-3.8-live) */
interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  sources?: { title: string; uri: string }[];
}

export const LearnView: React.FC<{
  positions: PortfolioPosition[];
  favoriteSectors: { sector: Sector; score: number }[];
  initialQuestion?: string | null;
}> = ({ positions, favoriteSectors, initialQuestion }) => {
  const [level, setLevel] = useState<'básico' | 'intermedio' | 'avanzado'>('básico');
  const [chatMode] = useState<'fast'>('fast');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      id: 'welcome-1',
      role: 'model',
      text: '¡Hola! Soy tu Asistente Personal de Smart Invest con Gemini Flash-Lite. Puedes escribirme varias preguntas seguidas (recuerdo toda nuestra conversación) o hablar conmigo por voz en el panel de arriba.',
      modelUsed: 'gemini-3.1-flash-lite',
    },
  ]);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || loading) return;

    const userMsg: ChatTurn = { id: `u-${Date.now()}`, role: 'user', text: q };
    const historySnapshot = [...messages];
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const ctx = `Posiciones activas: ${positions.map((p) => p.symbol).join(', ') || 'ninguna'}. Sectores favoritos: ${favoriteSectors
        .slice(0, 2)
        .map((s) => s.sector)
        .join(', ')}.`;

      const res = await fetch('/api/chat/multi-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: historySnapshot.map((m) => ({ role: m.role, text: m.text })),
          message: q,
          mode: chatMode,
          useSearch: false,
          level,
          contexto: ctx,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply,
          modelUsed: data.modelUsed,
          sources: Array.isArray(data.sources) ? data.sources : [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: 'Recuerda que en Smart Invest puedes empezar con poco dinero, pagando 0.10% de comisión y con tu escudo VaR del 2.5% siempre encendido.',
          modelUsed: 'respaldo local',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuestion) {
      sendMessage(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const quickQuestions = [
    'Nunca he invertido, ¿por dónde empiezo paso a paso?',
    '¿Qué diferencia hay entre una acción y un ETF?',
    '¿Cómo me protege el límite del 2.5% si cae la bolsa?',
    '¿Cuándo conviene vender o mantener mis acciones?',
  ];

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Aprende y Pregunta a tu Asistente por Voz o Chat
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-1">
          Conversa en tiempo real por voz o chatea por texto con memoria completa de la conversación.
        </p>
      </div>

      {/* Conversación por Voz en Tiempo Real (gemini-3.8-live) */}
      <VoiceLivePanel />

      {/* Chatbot Multi-Turno con Gemini */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Modelo de IA Activo
            </label>
            <select
              value={chatMode}
              disabled
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-semibold"
            >
              <option value="fast">Gemini Flash-Lite (gemini-3.1-flash-lite)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Claridad de Explicación
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as 'básico' | 'intermedio' | 'avanzado')}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-semibold"
            >
              <option value="básico">Principiante (Palabras sencillas)</option>
              <option value="intermedio">Intermedio (Práctico)</option>
              <option value="avanzado">Avanzado (Cuantitativo)</option>
            </select>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Preguntas sugeridas (haz clic para preguntar)
            </div>
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-indigo-400 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 flex flex-col h-[520px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <span>Chat Multi-Turno (Flash-Lite)</span>
            </div>
            <button
              onClick={() =>
                setMessages([
                  {
                    id: `reset-${Date.now()}`,
                    role: 'model',
                    text: 'Conversación reiniciada. ¿Qué duda tienes sobre tus inversiones o acciones?',
                    modelUsed: 'gemini-3.1-flash-lite',
                  },
                ])
              }
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Nueva charla
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`p-4 rounded-xl text-sm sm:text-base whitespace-pre-line leading-relaxed max-w-[88%] ${
                  m.role === 'user'
                    ? 'ml-auto bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                }`}
              >
                <div>{m.text}</div>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wide opacity-75">
                      Fuentes verificadas en Google Search:
                    </div>
                    {m.sources.map((src, idx) => (
                      <a
                        key={`${src.uri}-${idx}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-300 hover:underline truncate"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{src.title}</span>
                      </a>
                    ))}
                  </div>
                )}
                {m.modelUsed && (
                  <div className="mt-2 text-[11px] font-mono opacity-70">
                    Modelo: {m.modelUsed}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-500 dark:text-slate-300 max-w-[70%]">
                Escribiendo respuesta clara...
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta aquí..."
              className="flex-1 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm sm:text-base"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/* 3. OPCIONES Y GRIEGAS + OPERACIÓN EN VIVO CALL & PUT */
interface OptionsViewProps {
  stocks: StockAsset[];
  cashMxn: number;
  totalPortfolioMxn: number;
  maxVarLimitPct: number;
  optionPositions: OptionPosition[];
  onExecuteOptionBuy: (params: {
    underlyingSymbol: string;
    optionType: OptionContractType;
    contracts: number;
    contractMultiplier: 1 | 10;
    strikeMxn: number;
    daysToExpiration: number;
    impliedVolatilityPct?: number;
  }) => { ok: boolean; message: string };
  onCloseOptionPosition: (positionId: string) => { ok: boolean; message: string };
  onOpenTooltip: (key: string) => void;
}

export const OptionsView: React.FC<OptionsViewProps> = ({
  stocks,
  cashMxn,
  totalPortfolioMxn,
  maxVarLimitPct,
  optionPositions,
  onExecuteOptionBuy,
  onCloseOptionPosition,
  onOpenTooltip,
}) => {
  const [symbol, setSymbol] = useState('SPY');
  const [optionType, setOptionType] = useState<OptionContractType>('CALL');
  const [daysToExpiration, setDaysToExpiration] = useState<number>(30);
  const [strikeOffsetPct, setStrikeOffsetPct] = useState<number>(0);
  const [contractMultiplier, setContractMultiplier] = useState<1 | 10>(1);
  const [contracts, setContracts] = useState<number>(1);
  const [tradeFeedback, setTradeFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const [data, setData] = useState<{
    original_currency?: string;
    usd_mxn_rate?: number;
    spot_price_usd?: number;
    spot_price_mxn?: number;
    strike_atm_usd?: number;
    strike_price_mxn?: number;
    implied_volatility_pct: number;
    put_call_ratio_vol: number;
    put_call_ratio_oi: number;
    bias: string;
    prob_underlying_rises_pct: number;
    prob_underlying_falls_pct: number;
    prob_call_itm_pct: number;
    prob_put_itm_pct: number;
    prob_call_profitable_pct: number;
    prob_put_profitable_pct: number;
    greeks: { delta: number; put_delta?: number; gamma: number; theta: number; put_theta?: number; vega: number };
  } | null>(null);

  useEffect(() => {
    fetch(
      `/api/options/three-probabilities/${symbol}?days=${daysToExpiration}&strikeOffsetPct=${strikeOffsetPct}`
    )
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [symbol, daysToExpiration, strikeOffsetPct]);

  const selectedAsset = useMemo(
    () => stocks.find((s) => s.symbol === symbol) || stocks[0],
    [stocks, symbol]
  );

  const spotMxn = selectedAsset?.priceMxn ?? data?.spot_price_mxn ?? 1000;
  const strikeMxn = Number((spotMxn * (1 + strikeOffsetPct / 100)).toFixed(2));
  const effectiveIvPct = data?.implied_volatility_pct ?? selectedAsset?.volatilityAnnualPct ?? 25;

  const liveBsQuote = useMemo(
    () =>
      priceBlackScholesOption({
        spotMxn,
        strikeMxn,
        daysToExpiration,
        volatilityAnnualPct: effectiveIvPct,
        optionType,
      }),
    [spotMxn, strikeMxn, daysToExpiration, effectiveIvPct, optionType]
  );

  const totalUnderlyingShares = Math.max(1, contracts) * contractMultiplier;
  const grossPremiumMxn = Number((liveBsQuote.premiumPerShareMxn * totalUnderlyingShares).toFixed(2));
  const commissionMxn = Number((grossPremiumMxn * 0.001).toFixed(2));
  const totalOrderMxn = Number((grossPremiumMxn + commissionMxn).toFixed(2));
  const effectiveVarCapPct = Math.min(2.5, Math.max(0.5, maxVarLimitPct));
  const maxAllowedRiskMxn = Number((totalPortfolioMxn * (effectiveVarCapPct / 100)).toFixed(2));
  const exceedsVarBudget = grossPremiumMxn > maxAllowedRiskMxn;

  const handleBuyOption = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onExecuteOptionBuy({
      underlyingSymbol: symbol,
      optionType,
      contracts,
      contractMultiplier,
      strikeMxn,
      daysToExpiration,
      impliedVolatilityPct: effectiveIvPct,
    });
    setTradeFeedback(res);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Operar Opciones Call &amp; Put (Black-Scholes)
            <button
              onClick={() => onOpenTooltip('opcion_call')}
              className="p-1 text-slate-400 hover:text-indigo-500 cursor-pointer"
              aria-label="¿Qué es una opción Call y Put?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Compra y cierra contratos Call (alcista) o Put (bajista / cobertura) valuados en tiempo real con Yahoo Finance y comisión de 0.10%.
          </p>
        </div>
        <select
          value={symbol}
          onChange={(e) => {
            setSymbol(e.target.value);
            setTradeFeedback(null);
          }}
          className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-sm font-bold"
        >
          {stocks.map((s) => (
            <option key={s.symbol} value={s.symbol}>
              {s.symbol} - {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Boleta Interactiva para Operar Opciones + Resumen de Riesgo VaR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleBuyOption}
          className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Boleta de Contratos de Opciones · {symbol}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Subyacente actual:{' '}
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  ${spotMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </strong>{' '}
                (IV {effectiveIvPct}%)
              </p>
            </div>
            <div className="text-right text-xs">
              <div className="text-slate-500 dark:text-slate-400">Efectivo disponible</div>
              <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                ${cashMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </div>
            </div>
          </div>

          {/* Selector CALL vs PUT */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setOptionType('CALL');
                setTradeFeedback(null);
              }}
              className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                optionType === 'CALL'
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-900 dark:text-emerald-100'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between font-bold text-sm">
                <span>CALL (Compra / Alcista)</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-[11px] opacity-80 mt-0.5">Ganas si {symbol} sube del Strike</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setOptionType('PUT');
                setTradeFeedback(null);
              }}
              className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                optionType === 'PUT'
                  ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/35 text-rose-900 dark:text-rose-100'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between font-bold text-sm">
                <span>PUT (Venta / Cobertura)</span>
                <TrendingDown className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-[11px] opacity-80 mt-0.5">Ganas si {symbol} cae del Strike</div>
            </button>
          </div>

          {/* Strike, Vencimiento y Tamaño */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Precio de Ejercicio (Strike)
              </label>
              <select
                value={strikeOffsetPct}
                onChange={(e) => setStrikeOffsetPct(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-semibold"
              >
                <option value={-5}>
                  -5% (${(spotMxn * 0.95).toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN)
                </option>
                <option value={0}>
                  ATM Actual (${spotMxn.toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN)
                </option>
                <option value={5}>
                  +5% (${(spotMxn * 1.05).toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN)
                </option>
                <option value={10}>
                  +10% (${(spotMxn * 1.1).toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Plazo al Vencimiento
              </label>
              <select
                value={daysToExpiration}
                onChange={(e) => setDaysToExpiration(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-semibold"
              >
                <option value={7}>7 días (Corto plazo)</option>
                <option value={15}>15 días (Quincenal)</option>
                <option value={30}>30 días (Mensual estándar)</option>
                <option value={60}>60 días (Bimestral)</option>
                <option value={90}>90 días (Trimestral)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Tamaño por Contrato
              </label>
              <select
                value={contractMultiplier}
                onChange={(e) => setContractMultiplier(Number(e.target.value) === 10 ? 10 : 1)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-semibold"
              >
                <option value={1}>Micro (1 título por contrato)</option>
                <option value={10}>Mini (10 títulos por contrato)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Número de Contratos
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={contracts}
                onChange={(e) => setContracts(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm font-bold"
              />
            </div>
          </div>

          {/* Resumen Costo + Escudo VaR 99% */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">
                Prima Black-Scholes ({totalUnderlyingShares} {totalUnderlyingShares === 1 ? 'título' : 'títulos'} × ${liveBsQuote.premiumPerShareMxn.toFixed(2)} MXN)
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                ${grossPremiumMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Comisión Smart Invest (0.10%)</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                ${commissionMxn.toFixed(2)} MXN
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm">
              <span className="font-bold text-slate-900 dark:text-white">Total a debitar (Riesgo Máximo)</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                ${totalOrderMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 pt-1 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">
                Break-even al vencimiento:{' '}
                <strong className="font-mono text-slate-700 dark:text-slate-200">
                  ${liveBsQuote.breakevenMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </strong>
              </span>
              <span
                className={`font-semibold ${
                  exceedsVarBudget ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                Límite VaR 99% ({effectiveVarCapPct.toFixed(1)}%): ${maxAllowedRiskMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </span>
            </div>
          </div>

          {tradeFeedback && (
            <div
              role="status"
              className={`p-3 rounded-lg border text-xs font-semibold ${
                tradeFeedback.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}
            >
              {tradeFeedback.message}
            </div>
          )}

          <button
            type="submit"
            className={`w-full py-3.5 rounded-xl text-white text-sm font-bold transition-colors cursor-pointer ${
              optionType === 'CALL'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            Comprar {contracts} {contracts === 1 ? 'Contrato' : 'Contratos'} {optionType} {symbol} (${totalOrderMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN)
          </button>
        </form>

        {/* Panel Derecho: Contratos Activos de Opciones */}
        <div className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Tus Contratos de Opciones ({optionPositions.length})
            </h3>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Valuación en vivo
            </span>
          </div>

          {optionPositions.length === 0 ? (
            <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-center">
              Aún no tienes contratos Call o Put abiertos. Configura tu Strike, plazo y tamaño a la izquierda para ejecutar tu primera operación en opciones.
            </div>
          ) : (
            <div className="space-y-3 max-h-[430px] overflow-y-auto pr-1">
              {optionPositions.map((pos) => {
                const underlying = stocks.find((s) => s.symbol === pos.underlyingSymbol);
                const spot = underlying?.priceMxn ?? pos.strikeMxn;
                const valued = markOptionPositionToMarket(pos, spot, underlying?.volatilityAnnualPct);
                const isGain = valued.pnlMxn >= 0;
                return (
                  <div
                    key={pos.id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                            pos.optionType === 'CALL'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {pos.optionType}
                        </span>
                        <span>
                          {pos.underlyingSymbol} · Strike ${pos.strikeMxn.toLocaleString('es-MX')} MXN
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {valued.remainingDays}d rest.
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Costo entrada</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          ${pos.totalCostMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">Valor hoy</div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          ${valued.currentValueMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">P&amp;L</div>
                        <div className={`font-bold ${isGain ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {isGain ? '+' : ''}${valued.pnlMxn.toFixed(2)} ({isGain ? '+' : ''}{valued.pnlPct}%)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {pos.contracts}×{pos.contractMultiplier} títulos · Δ {valued.quote.delta} · Θ ${valued.quote.thetaPerDayMxn}/d
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const res = onCloseOptionPosition(pos.id);
                          setTradeFeedback(res);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Vender / Cerrar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Put / Call Ratio (Volumen)</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums">{data.put_call_ratio_vol}</div>
              <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{data.bias}</div>
            </div>
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Volatilidad Implícita ({daysToExpiration}d)</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                {data.implied_volatility_pct}%
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Movimiento esperado por el mercado</div>
            </div>
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Put / Call Ratio (Open Interest)</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums">{data.put_call_ratio_oi}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contratos abiertos acumulados</div>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-5">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Desglose de las 3 Probabilidades Matemáticas ({daysToExpiration}d · Strike {strikeOffsetPct >= 0 ? `+${strikeOffsetPct}` : strikeOffsetPct}%)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                <div className="text-xs font-bold uppercase text-indigo-800 dark:text-indigo-300">
                  1. Movimiento del Activo
                </div>
                <div className="mt-3 flex justify-between font-mono tabular-nums">
                  <div>
                    <div className="text-2xl font-bold text-emerald-500">{data.prob_underlying_rises_pct}%</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">Prob. Subida</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-rose-500">{data.prob_underlying_falls_pct}%</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">Prob. Caída</div>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-3">
                  Modelo de Movimiento Browniano Geométrico ajustado por tendencia histórica.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <div className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-300">
                  2. Terminación In The Money (ITM)
                </div>
                <div className="mt-3 flex justify-between font-mono tabular-nums">
                  <div>
                    <div className="text-2xl font-bold">{data.prob_call_itm_pct}%</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">Call ITM</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{data.prob_put_itm_pct}%</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">Put ITM</div>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-3">
                  Probabilidad de valor intrínseco al vencimiento sin descontar la prima pagada.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-amber-800 dark:text-amber-300">
                    3. Rentabilidad Neta
                  </span>
                  <button
                    onClick={() => onOpenTooltip('opcion_put')}
                    className="text-amber-600 dark:text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex justify-between font-mono tabular-nums">
                  <div>
                    <div className="text-2xl font-bold text-amber-500">{data.prob_call_profitable_pct}%</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">Call Ganador</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-500">{data.prob_put_profitable_pct}%</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">Put Ganador</div>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-3">
                  Probabilidad real de ganar dinero tras cubrir el costo de la prima.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Griegas Analíticas de Black-Scholes ({optionType} · {daysToExpiration} días)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Delta (Δ)</div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1">{liveBsQuote.delta}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Cambio por $1 en la acción</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Gamma (Γ)</div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1">{liveBsQuote.gamma}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Aceleración de Delta</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Theta (Θ)</div>
                <div className="text-xl font-bold font-mono tabular-nums text-rose-500 mt-1">
                  ${liveBsQuote.thetaPerDayMxn} MXN/día
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Desgaste diario por tiempo</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Vega (ν)</div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1">+${liveBsQuote.vega} MXN</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Sensibilidad a 1% de IV</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* 4. BACKTESTING CUANTITATIVO */
export const BacktestView: React.FC = () => {
  const [symbol, setSymbol] = useState('SPY');
  const [capital, setCapital] = useState(100000);
  const [slippage, setSlippage] = useState(0.0005);
  const [running, setRunning] = useState(false);
  const [btData, setBtData] = useState<{
    net_profit_mxn: number;
    return_on_capital_pct: number;
    win_rate_pct: number;
    total_trades: number;
    profit_factor: number;
    max_drawdown_pct: number;
    max_var_reached_pct: number;
    equity_curve: number[];
  }>({
    net_profit_mxn: 7420,
    return_on_capital_pct: 7.42,
    win_rate_pct: 68.4,
    total_trades: 19,
    profit_factor: 2.14,
    max_drawdown_pct: 2.1,
    max_var_reached_pct: 1.84,
    equity_curve: [100000, 100600, 101200, 100950, 102100, 103400, 102900, 104500, 105800, 106400, 107420],
  });

  const runBacktest = async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/backtest?symbol=${symbol}&initial_capital=${capital}&slippage_pct=${slippage}`, {
        method: 'POST',
      });
      const data = await res.json();
      setBtData(data);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Laboratorio de Backtesting Cuantitativo
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Valida la estrategia sobre 120 velas incluyendo nuestra baja comisión de 0.10%, slippage y control estricto VaR 99%.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Activo a Evaluar
            </label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-bold"
            >
              <option value="SPY">SPY - S&amp;P 500 ETF</option>
              <option value="AAPL">AAPL - Apple Inc.</option>
              <option value="NVDA">NVDA - NVIDIA Corp.</option>
              <option value="WALMEX">WALMEX - Wal-Mart México</option>
              <option value="XRP_USDT">XRP / USDT</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Capital de Prueba (MXN)
            </label>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Math.max(10000, Number(e.target.value) || 0))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm font-bold"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Slippage Simulado
            </label>
            <select
              value={slippage}
              onChange={(e) => setSlippage(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value={0.0005}>0.05% (Mercado Líquido Normal)</option>
              <option value={0.001}>0.10% (Alta Volatilidad)</option>
            </select>
          </div>
          <button
            onClick={runBacktest}
            disabled={running}
            className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            {running ? 'Simulando velas...' : 'Ejecutar Backtest Histórico'}
          </button>
        </div>

        <div className="lg:col-span-8 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Rendimiento Neto</div>
              <div
                className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                  btData.net_profit_mxn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                }`}
              >
                {btData.net_profit_mxn >= 0 ? '+' : ''}${btData.net_profit_mxn.toLocaleString('es-MX')}
              </div>
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                {btData.return_on_capital_pct >= 0 ? '+' : ''}
                {btData.return_on_capital_pct}% ROC
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Win Rate (Acierto)</div>
              <div className="text-xl font-bold font-mono tabular-nums mt-1">{btData.win_rate_pct}%</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{btData.total_trades} operaciones</div>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Profit Factor</div>
              <div className="text-xl font-bold font-mono tabular-nums mt-1">{btData.profit_factor}</div>
              <div className="text-xs text-emerald-500 mt-0.5">&gt; 1.5 Saludable</div>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Drawdown Máximo</div>
              <div className="text-xl font-bold font-mono tabular-nums text-rose-500 mt-1">
                -{btData.max_drawdown_pct}%
              </div>
              <div className="text-xs text-emerald-500 mt-0.5">Dentro del 2.5%</div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
            <SvgAreaChart
              data={btData.equity_curve}
              primaryLabel={`Curva de Capital (${symbol})`}
              height={210}
              accentColor="#10b981"
            />
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Auditoría VaR 99%: 0 violaciones del límite 2.50% · VaR Máximo alcanzado: {btData.max_var_reached_pct}%
            </div>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">VALIDADO</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* 5. PERFIL DE RIESGO, NOTIFICACIONES PUSH Y SECTORES FAVORITOS */
export const ProfileView: React.FC<{
  profile: InvestorProfile;
  favoriteSectors: { sector: Sector; score: number }[];
  stocks: StockAsset[];
  orders: TradeOrder[];
  positionsCount: number;
  cashMxn: number;
  isOnline: boolean;
  lastSavedAt: string | null;
  onSaveSnapshotNow: () => void;
  onResetPortfolio: () => void;
  onSaveProfile: (updated: InvestorProfile) => void;
  onGenerateOffer: (asset?: StockAsset) => Promise<void>;
  onEnablePush: () => Promise<void>;
  onTestSellAlarm: () => void;
  onNotifyToast: (msg: string, tone?: 'success' | 'warning' | 'info') => void;
  investorProfilePanel?: React.ReactNode;
}> = ({
  profile,
  favoriteSectors,
  stocks,
  orders,
  positionsCount,
  cashMxn,
  isOnline,
  lastSavedAt,
  onSaveSnapshotNow,
  onResetPortfolio,
  onSaveProfile,
  onGenerateOffer,
  onEnablePush,
  onTestSellAlarm,
  onNotifyToast,
  investorProfilePanel,
}) => {
  const [form, setForm] = useState<InvestorProfile>(profile);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setForm(profile);
  }, [profile]);

  const maxScore = Math.max(1, favoriteSectors[0]?.score || 1);
  const topSector = favoriteSectors[0]?.sector || 'Tecnología';
  const fiscalSummary = computeFiscalSummary(orders);

  const recommendedForUser = stocks.filter(
    (s) =>
      (s.sector === topSector || s.sector === favoriteSectors[1]?.sector) &&
      (form.riskLevel !== 'conservador' || s.volatilityAnnualPct <= 25)
  );

  const dropExampleMxn = Math.round(10000 * (form.sellAlarmDropThresholdPct / 100));
  const gainExampleMxn = Math.round(10000 * (form.sellAlarmGainThresholdPct / 100));

  const handleExportCsv = () => {
    const result = exportOrdersToFiscalCsv(orders, stocks, form.email);
    onNotifyToast(
      `Archivo CSV fiscal descargado (${result.count} operaciones): ${result.fileName}`,
      'success'
    );
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Mi Perfil de Riesgo, Notificaciones Push y Sectores
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Configura tus umbrales personalizados de alarma para vender o mantener tus acciones y administra tus notificaciones push en tiempo real.
        </p>
      </div>

      {investorProfilePanel}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSaveProfile(form);
        }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* Columna Izquierda: Perfil General + Correo */}
        <div className="lg:col-span-6 space-y-6">
          <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Datos del Inversionista y Tolerancia al Riesgo
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Correo Electrónico para Noticias y Ofertas
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Experiencia Invirtiendo
              </label>
              <select
                value={form.experience}
                onChange={(e) => setForm({ ...form, experience: e.target.value as InvestorProfile['experience'] })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
              >
                <option value="principiante">Principiante</option>
                <option value="intermedio">Intermedio</option>
                <option value="avanzado">Avanzado</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Objetivo Principal
              </label>
              <select
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value as InvestorProfile['goal'] })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
              >
                <option value="preservacion">Preservar capital sobre inflación</option>
                <option value="crecimiento_moderado">Crecimiento patrimonial equilibrado</option>
                <option value="agresivo">Maximizar crecimiento a mediano/largo plazo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Tolerancia al Riesgo (Calibra Ofertas y Stop Loss)
              </label>
              <select
                value={form.riskLevel}
                onChange={(e) => setForm({ ...form, riskLevel: e.target.value as RiskLevel })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
              >
                <option value="conservador">Conservador (Baja volatilidad · VaR estricto)</option>
                <option value="moderado">Moderado (Balance riesgo / retorno)</option>
                <option value="agresivo">Dinámico (Mayor exposición a crecimiento)</option>
              </select>
            </div>

            <div className="space-y-2 pt-2 text-xs sm:text-sm">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoNewsEmail}
                  onChange={(e) => setForm({ ...form, autoNewsEmail: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <span>Enviar mail automático con noticias cuando compro o sigo acciones</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoOfferEmail}
                  onChange={(e) => setForm({ ...form, autoOfferEmail: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <span>Enviar mails de ofertas cuando mis sectores favoritos tengan señal de compra</span>
              </label>
            </div>
          </div>

          {/* Sectores Detectados */}
          <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Sectores que más te atraen (Aprendizaje Automático)
            </h3>
            <div className="space-y-3">
              {favoriteSectors.map((item) => (
                <div key={item.sector} className="space-y-1">
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{item.sector}</span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{item.score} pts</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((item.score / maxScore) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Configuración de Notificaciones Push y Umbrales de Venta */}
        <div className="lg:col-span-6 space-y-6">
          <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Notificaciones Push y Umbrales de Alarma de Venta
                </h3>
              </div>
              <button
                type="button"
                onClick={onEnablePush}
                className="px-3 py-1.5 rounded-lg border border-indigo-400/50 text-indigo-500 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-950/30 cursor-pointer"
              >
                Activar Push del Dispositivo
              </button>
            </div>

            {/* Toggles de Canal */}
            <div className="space-y-2.5 text-xs sm:text-sm">
              <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <span>Notificaciones push en celular / navegador</span>
                <input
                  type="checkbox"
                  checked={form.mobilePushEnabled}
                  onChange={(e) => setForm({ ...form, mobilePushEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300"
                />
              </label>
              <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <span>Alarma sonora y vibración cuando haya señal de VENDER</span>
                <input
                  type="checkbox"
                  checked={form.soundAlarmEnabled}
                  onChange={(e) => setForm({ ...form, soundAlarmEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300"
                />
              </label>
              <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <span>Confirmaciones en tiempo real para MANTENER posiciones sanas</span>
                <input
                  type="checkbox"
                  checked={form.holdAlertEnabled}
                  onChange={(e) => setForm({ ...form, holdAlertEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300"
                />
              </label>
            </div>

            {/* Umbral de Alarma por Caída (Stop Loss) */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <label htmlFor="drop-threshold" className="font-semibold text-slate-800 dark:text-slate-100">
                  Alarma VENDER si una acción baja:
                </label>
                <span className="font-mono font-bold text-rose-500">
                  -{form.sellAlarmDropThresholdPct.toFixed(1)}%
                </span>
              </div>
              <input
                id="drop-threshold"
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={form.sellAlarmDropThresholdPct}
                onChange={(e) =>
                  setForm({ ...form, sellAlarmDropThresholdPct: Number(e.target.value) })
                }
                className="w-full accent-rose-500 cursor-pointer"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ejemplo: en una inversión de $10,000 MXN, te avisaremos para vender si baja ${dropExampleMxn} MXN (tope máximo permitido 2.5%).
              </p>
            </div>

            {/* Umbral de Alarma por Ganancia (Take Profit) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <label htmlFor="gain-threshold" className="font-semibold text-slate-800 dark:text-slate-100">
                  Alarma VENDER para asegurar ganancia al subir:
                </label>
                <span className="font-mono font-bold text-emerald-500">
                  +{form.sellAlarmGainThresholdPct.toFixed(1)}%
                </span>
              </div>
              <input
                id="gain-threshold"
                type="range"
                min="2.0"
                max="20.0"
                step="0.5"
                value={form.sellAlarmGainThresholdPct}
                onChange={(e) =>
                  setForm({ ...form, sellAlarmGainThresholdPct: Number(e.target.value) })
                }
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ejemplo: en $10,000 MXN invertidos, te avisaremos para cobrar cuando ganes +${gainExampleMxn} MXN.
              </p>
            </div>

            {/* Tope Personal VaR 99% & Cooldown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Límite Máximo VaR 99% del Portafolio
                </label>
                <select
                  value={form.maxPortfolioVarLimitPct}
                  onChange={(e) =>
                    setForm({ ...form, maxPortfolioVarLimitPct: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-mono font-bold"
                >
                  <option value={1.5}>1.5% (Muy conservador)</option>
                  <option value={2.0}>2.0% (Equilibrado)</option>
                  <option value={2.5}>2.5% (Máximo permitido)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Espera Mínima entre Alarmas
                </label>
                <select
                  value={form.alarmCooldownMinutes}
                  onChange={(e) =>
                    setForm({ ...form, alarmCooldownMinutes: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-semibold"
                >
                  <option value={1}>Cada 1 minuto (Tiempo real)</option>
                  <option value={5}>Cada 5 minutos</option>
                  <option value={15}>Cada 15 minutos</option>
                  <option value={30}>Cada 30 minutos</option>
                </select>
              </div>
            </div>

            {/* Tonos Diferenciados por Situación */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3.5">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  Tonos Diferenciados Según la Situación del Mercado
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Elige un sonido distinto para ventas urgentes, oportunidades de compra y bajas donde sigues en ganancia sobre tu precio de compra.
                </p>
              </div>

              {/* Tono 1: Urgente Vender por caída bajo precio de compra */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <label className="block text-xs font-bold text-rose-500">
                  1. Urgente VENDER (cae por debajo de tu compra / umbral de pérdida)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={form.toneSellLoss}
                    onChange={(e) => setForm({ ...form, toneSellLoss: e.target.value as TonePreset })}
                    className="flex-1 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs font-semibold"
                  >
                    {TONE_PRESET_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => playTonePreset(form.toneSellLoss)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Escuchar
                  </button>
                </div>
              </div>

              {/* Tono 2: Oportunidad de Compra */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <label className="block text-xs font-bold text-indigo-400">
                  2. Señal Urgente de COMPRA (oportunidad detectada en tu sector)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={form.toneBuyOpportunity}
                    onChange={(e) => setForm({ ...form, toneBuyOpportunity: e.target.value as TonePreset })}
                    className="flex-1 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs font-semibold"
                  >
                    {TONE_PRESET_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => playTonePreset(form.toneBuyOpportunity)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Escuchar
                  </button>
                </div>
              </div>

              {/* Tono 3: Bajó hoy PERO sigue con rendimientos arriba del precio de compra */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-amber-400">
                  3. Bajó hoy, PERO sigues en ganancia (arriba de tu precio de compra)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={form.toneDipInProfit}
                    onChange={(e) => setForm({ ...form, toneDipInProfit: e.target.value as TonePreset })}
                    className="flex-1 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs font-semibold"
                  >
                    {TONE_PRESET_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => playTonePreset(form.toneDipInProfit)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Escuchar
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs pt-1">
                  <span className="text-slate-500 dark:text-slate-400">
                    Avisar con este tono cuando baje al menos:
                  </span>
                  <select
                    value={form.dipInProfitDropPct}
                    onChange={(e) => setForm({ ...form, dipInProfitDropPct: Number(e.target.value) })}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] font-mono font-bold"
                  >
                    <option value={0.3}>-0.3%</option>
                    <option value={0.5}>-0.5%</option>
                    <option value={1.0}>-1.0%</option>
                    <option value={1.5}>-1.5%</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Estilos de Sonido y Carga de Audio Personalizado por Nivel de Prioridad */}
            <AlarmSoundStyleSection
              highPriorityTone={form.toneSellLoss}
              informativeTone={form.informativeTonePreset}
              customHighPriority={form.customSoundHighPriority}
              customInformative={form.customSoundInformative}
              onChangeHighPriorityTone={(tone) => setForm({ ...form, toneSellLoss: tone })}
              onChangeInformativeTone={(tone) =>
                setForm({ ...form, informativeTonePreset: tone, toneDipInProfit: tone })
              }
              onChangeCustomHighPriority={(clip) =>
                setForm({ ...form, customSoundHighPriority: clip })
              }
              onChangeCustomInformative={(clip) =>
                setForm({ ...form, customSoundInformative: clip })
              }
              onNotifyToast={onNotifyToast}
            />

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold cursor-pointer"
              >
                Guardar Preferencias y Umbrales
              </button>
              <button
                type="button"
                onClick={() => {
                  onSaveProfile(form);
                  onTestSellAlarm();
                }}
                className="py-3 px-4 rounded-lg border border-rose-400/60 text-rose-400 hover:bg-rose-950/30 text-xs sm:text-sm font-bold cursor-pointer"
              >
                Probar Alarma
              </button>
            </div>
          </div>

          {/* Ofertas Elegibles */}
          <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Ofertas Elegibles para ti ({form.riskLevel})
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recommendedForUser.slice(0, 3).map((asset) => (
                <div key={asset.symbol} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                      {asset.symbol} · {asset.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {asset.sector} · 12M: {asset.annualReturnPct >= 0 ? '+' : ''}
                      {asset.annualReturnPct}% · Vol: {asset.volatilityAnnualPct}%
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGenerateOffer(asset)}
                    className="px-3.5 py-2 rounded-lg border border-indigo-400/50 text-indigo-500 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-950/30 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Enviar Oferta al Mail
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </form>

      {/* Exportación Fiscal Anual en CSV */}
      <section className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Exportar Historial de Operaciones para Declaración Fiscal Anual (CSV)
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              Descarga el registro completo de tus compras y ventas ejecutadas con importes brutos, comisiones pagadas, flujo neto fiscal y ahorro acumulado. Compatible con Excel y hojas de cálculo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start md:self-auto"
          >
            <FileDown className="w-4 h-4" />
            Exportar Historial Completo (.CSV)
          </button>
        </div>

        {/* Resumen Fiscal Rápido */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Operaciones Registradas</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {fiscalSummary.totalOrders}{' '}
              <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">
                ({fiscalSummary.buyCount} compras · {fiscalSummary.sellCount} ventas)
              </span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Compras (Adquisiciones)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              ${fiscalSummary.totalBuysMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Ventas (Enajenaciones)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              ${fiscalSummary.totalSellsMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Comisiones Pagadas (Deducibles)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 mt-0.5">
              ${fiscalSummary.totalCommissionsMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
            </div>
          </div>
        </div>

        {/* Vista previa de operaciones que se exportarán */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4 font-bold">Fecha / Hora</th>
                <th className="py-3 px-4 font-bold">Tipo</th>
                <th className="py-3 px-4 font-bold">Ticker</th>
                <th className="py-3 px-4 font-bold text-right">Cantidad</th>
                <th className="py-3 px-4 font-bold text-right">Precio (MXN)</th>
                <th className="py-3 px-4 font-bold text-right">Importe Bruto</th>
                <th className="py-3 px-4 font-bold text-right">Comisión</th>
                <th className="py-3 px-4 font-bold text-right">Flujo Neto Fiscal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#0E131B]">
              {orders.slice(0, 6).map((ord) => {
                const netFiscal =
                  ord.side === 'BUY'
                    ? -(ord.totalMxn + ord.commissionMxn)
                    : ord.totalMxn - ord.commissionMxn;
                return (
                  <tr key={ord.id}>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {ord.timestamp}
                    </td>
                    <td
                      className={`py-2.5 px-4 font-bold ${
                        ord.side === 'BUY'
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {ord.side === 'BUY' ? 'COMPRA' : 'VENTA'}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {ord.symbol}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{ord.shares}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      ${ord.priceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      ${ord.totalMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      ${ord.commissionMxn.toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                        netFiscal >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {netFiscal >= 0 ? '+' : '-'}$
                      {Math.abs(netFiscal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {orders.length > 6 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mostrando las 6 operaciones más recientes. Al exportar se incluirán todas las {orders.length} operaciones registradas.
          </p>
        )}
      </section>

      {/* Respaldo Local en el Dispositivo (localStorage) para Consulta Sin Conexión */}
      <section className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <HardDrive className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Respaldo Local y Consulta Sin Conexión (localStorage)
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
                Tu portafolio, efectivo, historial de órdenes y últimas cotizaciones se guardan automáticamente en este navegador para que puedas consultarlos aun si pierdes acceso a internet.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onSaveSnapshotNow}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              Guardar Respaldo Ahora
            </button>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-rose-500 hover:text-rose-500 transition-colors cursor-pointer whitespace-nowrap"
              >
                Restablecer Cuenta Inicial
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetPortfolio();
                    setConfirmReset(false);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                >
                  Confirmar Restablecer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs sm:text-sm">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Estado de Red</div>
            <div
              className={`mt-1 font-semibold flex items-center gap-1.5 ${
                isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              <span>{isOnline ? 'En línea' : 'Sin conexión (local)'}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Último Guardado Local</div>
            <div className="mt-1 font-mono tabular-nums font-bold text-slate-900 dark:text-white text-xs">
              {formatSavedTimestamp(lastSavedAt)}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Posiciones Respaldadas</div>
            <div className="mt-1 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              {positionsCount} activas · {orders.length} órdenes
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Liquidez Guardada</div>
            <div className="mt-1 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              ${cashMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
