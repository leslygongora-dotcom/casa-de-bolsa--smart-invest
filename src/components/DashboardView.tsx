import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Coins,
  ExternalLink,
  Gamepad2,
  Globe,
  HelpCircle,
  Mic,
  Newspaper,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { MobileAlarm, NewsItem, PortfolioPosition, Sector, StockAsset, TabId } from '../types';
import { computePortfolioRiskReturn } from '../utils/portfolioMetrics';
import { PortfolioRechartsWidget } from './PortfolioRechartsWidget';

interface DashboardViewProps {
  totalPortfolioMxn: number;
  cashMxn: number;
  dailyPnlMxn: number;
  dailyPnlPct: number;
  portfolioVarPct: number;
  totalCommissionSavedMxn: number;
  positions: PortfolioPosition[];
  stockMap: Record<string, StockAsset>;
  equityHistory: number[];
  news: NewsItem[];
  alarms: MobileAlarm[];
  favoriteSectors: { sector: Sector; score: number }[];
  gameModeEnabled: boolean;
  gameModeDaysClaimed: number;
  gameModeTotalUsdGranted: number;
  canClaimTodayGameBonus: boolean;
  dailyGrantMxn: number;
  effectiveUsdMxnRate: number;
  onToggleGameMode: () => void;
  onClaimDailyGameBonus: () => void;
  onNavigate: (tab: TabId) => void;
  onInspectStock: (symbol: string) => void;
  onQuickSell: (symbol: string, shares: number) => void;
  onOpenTooltip: (key: string) => void;
  onSimulateShock: (mode: 'drop' | 'rally' | 'dip_in_profit' | 'buy') => void;
  investorProfilePanel?: React.ReactNode;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  totalPortfolioMxn,
  cashMxn,
  dailyPnlMxn,
  dailyPnlPct,
  portfolioVarPct,
  totalCommissionSavedMxn,
  positions,
  stockMap,
  equityHistory,
  news,
  alarms,
  favoriteSectors,
  gameModeEnabled,
  gameModeDaysClaimed,
  gameModeTotalUsdGranted,
  canClaimTodayGameBonus,
  dailyGrantMxn,
  effectiveUsdMxnRate,
  onToggleGameMode,
  onClaimDailyGameBonus,
  onNavigate,
  onInspectStock,
  onQuickSell,
  onOpenTooltip,
  onSimulateShock,
  investorProfilePanel,
}) => {
  const heldSymbols = new Set(positions.map((p) => p.symbol));
  const topSector = favoriteSectors[0]?.sector || 'Tecnología';

  const prioritizedNews = [...news].sort((a, b) => {
    const aScore = (heldSymbols.has(a.symbol) ? 2 : 0) + (a.sector === topSector ? 1 : 0);
    const bScore = (heldSymbols.has(b.symbol) ? 2 : 0) + (b.sector === topSector ? 1 : 0);
    return bScore - aScore;
  });

  const activeAlarms = alarms.filter((a) => !a.acknowledged);
  const varLimitMxn = totalPortfolioMxn * 0.025;

  const riskReturnMetrics = useMemo(
    () => computePortfolioRiskReturn(equityHistory, totalPortfolioMxn),
    [equityHistory, totalPortfolioMxn]
  );

  const [searchInput, setSearchInput] = useState('');
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [webBrief, setWebBrief] = useState<{
    summary: string;
    sources: { title: string; uri: string }[];
    updatedAt: string;
    modelUsed: string;
  } | null>(null);

  const runLiveMarketSearch = async (customQuery?: string) => {
    const q = (customQuery ?? searchInput).trim();
    setSearchingWeb(true);
    try {
      const heldList = Array.from(heldSymbols).join(', ') || 'SPY, AAPL';
      const res = await fetch('/api/ai/market-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:
            q ||
            `Noticias financieras recientes de hoy sobre ${heldList} y el sector ${topSector} en bolsa de valores`,
          sector: topSector,
        }),
      });
      const data = await res.json();
      setWebBrief({
        summary: data.summary,
        sources: Array.isArray(data.sources) ? data.sources : [],
        updatedAt: data.updatedAt || 'Ahora',
        modelUsed: data.modelUsed || 'gemini-3.1-flash-lite + Google Search',
      });
    } catch {
      setWebBrief({
        summary:
          'No se pudo consultar Google Search en este momento. Consulta los titulares verificados de abajo para tomar decisiones informadas.',
        sources: [],
        updatedAt: 'Ahora',
        modelUsed: 'respaldo local',
      });
    } finally {
      setSearchingWeb(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Encabezado Patrimonial Institucional */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800/90">
        <div>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tracking-wide">
            {gameModeEnabled
              ? 'Modo Juego Activo · Simulador $10,000 USD / día'
              : 'Cuenta Patrimonial · Custodia MXN'}
          </p>
          <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Resumen Patrimonial y Mercado
          </h2>
          <p className="mt-1.5 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl">
            Ejecución bursátil en tiempo real con comisión institucional del 0.10% y resguardo automático de riesgo VaR 99% (tope 2.50%).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleGameMode}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
              gameModeEnabled
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-400 shadow-sm'
                : 'bg-amber-50 dark:bg-amber-950/35 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
            }`}
          >
            <Gamepad2 className="w-4 h-4 shrink-0" />
            <span>{gameModeEnabled ? 'Modo Juego: ACTIVO' : 'Activar Modo Juego ($10k USD/día)'}</span>
          </button>
          <button
            onClick={() => onNavigate('market')}
            className="px-5 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Comprar o Vender Activos
          </button>
          <button
            onClick={() => onNavigate('learn')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Mic className="w-4 h-4 text-emerald-500" />
            Asesoría por Voz e IA
          </button>
        </div>
      </div>

      {/* Barra Visible de Modo Juego ($10,000 USD diarios) */}
      <div
        className={`p-4 sm:p-5 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          gameModeEnabled
            ? 'bg-amber-50/90 dark:bg-amber-950/25 border-amber-300 dark:border-amber-700/80'
            : 'bg-white dark:bg-[#0E131B] border-slate-200 dark:border-slate-800/90'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
              gameModeEnabled
                ? 'bg-amber-500/20 border-amber-400 text-amber-700 dark:text-amber-300'
                : 'bg-slate-100 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {gameModeEnabled
                  ? 'Modo Juego Activo · Bono diario de $10,000 USD'
                  : 'Tu portafolio nuevo inicia en $0.00 MXN'}
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide ${
                  gameModeEnabled
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {gameModeEnabled ? 'Simulación con USD diarios' : 'Cuenta Inicial $0'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              {gameModeEnabled ? (
                <>
                  Recibes <strong>$10,000 USD diarios</strong> (≈{' '}
                  <span className="font-mono tabular-nums font-semibold">
                    ${dailyGrantMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </span>{' '}
                  a ${effectiveUsdMxnRate.toFixed(2)} MXN/USD). Días reclamados:{' '}
                  <strong className="font-mono tabular-nums">{gameModeDaysClaimed}</strong> · Total acreditado:{' '}
                  <strong className="font-mono tabular-nums">
                    ${gameModeTotalUsdGranted.toLocaleString('es-MX')} USD
                  </strong>.
                </>
              ) : (
                <>
                  Activa el <strong>Modo Juego</strong> para recibir automáticamente{' '}
                  <strong>$10,000 USD cada día</strong> (≈{' '}
                  <span className="font-mono tabular-nums">
                    ${dailyGrantMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </span>
                  ) y practicar comprando acciones y opciones sin afectar tu saldo inicial de $0.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {gameModeEnabled && (
            <button
              type="button"
              onClick={onClaimDailyGameBonus}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                canClaimTodayGameBonus
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {canClaimTodayGameBonus ? (
                <>
                  <Coins className="w-4 h-4" />
                  <span>Reclamar $10,000 USD hoy</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>$10,000 USD de hoy acreditados</span>
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleGameMode}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
              gameModeEnabled
                ? 'border border-amber-400 dark:border-amber-700 bg-white dark:bg-[#090C11] text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/60'
                : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-sm'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            <span>{gameModeEnabled ? 'Salir de Modo Juego' : 'Poner Modo Juego (+$10,000 USD)'}</span>
          </button>
        </div>
      </div>

      {/* Guía Operativa en 3 Pasos (Diseño Plano con Divisores Verticales) */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800/90 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90">
        <div className="p-5">
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            01 · Selección de Activos
          </div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1.5 leading-relaxed">
            Evalúa emisoras globales y ETFs con calificación de fortaleza financiera (A–F) en lenguaje claro.
          </p>
        </div>
        <div className="p-5">
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            02 · Ejecución Preferencial 0.10%
          </div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1.5 leading-relaxed">
            Comisión fija de $10 MXN por cada $10,000 operados, frente a 0.75% de la banca tradicional.
          </p>
        </div>
        <div className="p-5">
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            03 · Vigilancia y Alertas Push
          </div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1.5 leading-relaxed">
            Monitoreo continuo con avisos oportunos para vender, proteger ganancias o mantener posición.
          </p>
        </div>
      </div>

      {/* 4 KPIs Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="p-5 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90">
          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
            <span>Valor Total del Portafolio</span>
            <button
              onClick={() => onOpenTooltip('accion')}
              className="p-1 text-slate-400 hover:text-emerald-500 cursor-pointer"
              aria-label="¿Qué es el Valor Total del Portafolio?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            ${totalPortfolioMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div
            className={`mt-2 flex items-center gap-1 text-xs sm:text-sm font-semibold font-mono tabular-nums ${
              dailyPnlMxn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {dailyPnlMxn >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            {dailyPnlMxn >= 0 ? '+' : '-'}$
            {Math.abs(dailyPnlMxn).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({dailyPnlPct >= 0 ? '+' : ''}
            {dailyPnlPct.toFixed(2)}%) hoy
          </div>
        </div>

        <div className="p-5 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90">
          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
            <span>Liquidez Disponible (MXN)</span>
            <button
              onClick={() => onOpenTooltip('comprar')}
              className="p-1 text-slate-400 hover:text-emerald-500 cursor-pointer"
              aria-label="¿Cómo usar mi liquidez disponible?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            ${cashMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {cashMxn > 0 ? (
              <>
                ≈{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  $
                  {(cashMxn / effectiveUsdMxnRate).toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  USD
                </strong>{' '}
                {gameModeEnabled ? '· Saldo Modo Juego' : `· Sector: ${topSector}`}
              </>
            ) : (
              <>
                Saldo inicial $0.00 ·{' '}
                <button
                  type="button"
                  onClick={onToggleGameMode}
                  className="font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Activar Modo Juego
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-5 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90">
          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
            <span>Riesgo Diario (VaR 99%)</span>
            <button
              onClick={() => onOpenTooltip('var')}
              className="p-1 text-slate-400 hover:text-emerald-500 cursor-pointer"
              aria-label="¿Qué es el límite de riesgo VaR?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {portfolioVarPct.toFixed(2)}%
            </span>
            <span className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Controlado · Tope 2.50%
            </span>
          </div>
          <div className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Exposición máx: ${varLimitMxn.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
          </div>
        </div>

        <div className="p-5 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90">
          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
            <span>Ahorro en Comisiones</span>
            <button
              onClick={() => onOpenTooltip('comision')}
              className="p-1 text-slate-400 hover:text-emerald-500 cursor-pointer"
              aria-label="¿Por qué son bajas nuestras comisiones?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            ${totalCommissionSavedMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            Tarifa 0.10% vs 0.75% tradicional
          </div>
        </div>
      </div>

      {/* WIDGET RECHARTS: Historial interactivo */}
      <PortfolioRechartsWidget
        currentPortfolioMxn={totalPortfolioMxn}
        equityHistory={equityHistory}
        onOpenTooltip={onOpenTooltip}
      />

      {/* TARJETA DE RESUMEN CUANTITATIVO: Ratio de Sharpe y Máximo Drawdown */}
      <section
        aria-label="Resumen de Sharpe Ratio y Máximo Drawdown"
        className="rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Eficiencia y Resiliencia del Portafolio (Sharpe Ratio y Máximo Drawdown)
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Cálculo dinámico en tiempo real sobre {riskReturnMetrics.sampleCount} registros del historial de equity (ref. tasa CETES {riskReturnMetrics.riskFreeRateAnnualPct.toFixed(2)}% anual)
              </p>
            </div>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Estado: <strong className="text-slate-800 dark:text-slate-200">{riskReturnMetrics.recoveryStatus}</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800/90">
          {/* Bloque 1: Ratio de Sharpe */}
          <div className="lg:col-span-5 p-6 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
                  Ratio de Sharpe (Sharpe Ratio Anualizado)
                </span>
                <button
                  onClick={() => onOpenTooltip('sharpe')}
                  className="p-1 text-slate-400 hover:text-emerald-500 cursor-pointer"
                  aria-label="¿Qué es el Ratio de Sharpe?"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2.5 flex items-baseline gap-3">
                <span
                  className={`text-3xl sm:text-4xl font-bold font-mono tabular-nums ${
                    riskReturnMetrics.sharpeTone === 'positive'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : riskReturnMetrics.sharpeTone === 'warning'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {riskReturnMetrics.sharpeRatio.toFixed(2)}
                </span>
                <span
                  className={`text-xs sm:text-sm font-bold ${
                    riskReturnMetrics.sharpeTone === 'positive'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : riskReturnMetrics.sharpeTone === 'warning'
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  Desempeño {riskReturnMetrics.sharpeLabel}
                </span>
              </div>
              <p className="mt-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {riskReturnMetrics.sharpeRatio >= 1
                  ? 'Tu portafolio genera mayor rendimiento por cada punto de volatilidad asumida frente a deuda gubernamental.'
                  : riskReturnMetrics.sharpeRatio >= 0
                  ? 'Rendimiento ligeramente superior a la tasa libre de riesgo; diversificar por sector puede elevar esta eficiencia.'
                  : 'Volatilidad reciente superior al rendimiento acumulado; mantén vigilancia en tus límites Stop Loss.'}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Retorno Anualizado</div>
                <div
                  className={`font-mono tabular-nums font-bold text-sm mt-0.5 ${
                    riskReturnMetrics.annualizedReturnPct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {riskReturnMetrics.annualizedReturnPct >= 0 ? '+' : ''}
                  {riskReturnMetrics.annualizedReturnPct.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Volatilidad Anualizada</div>
                <div className="font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                  {riskReturnMetrics.annualizedVolatilityPct.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          {/* Bloque 2: Máximo Drawdown + Mini Trayectoria de Caída */}
          <div className="lg:col-span-7 p-6 flex flex-col justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
                    Máximo Drawdown (Caída Máxima Peak-to-Trough)
                  </span>
                  <button
                    onClick={() => onOpenTooltip('drawdown')}
                    className="p-1 text-slate-400 hover:text-emerald-500 cursor-pointer"
                    aria-label="¿Qué es el Máximo Drawdown?"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-baseline gap-3">
                  <span
                    className={`text-3xl sm:text-4xl font-bold font-mono tabular-nums ${
                      Math.abs(riskReturnMetrics.maxDrawdownPct) <= 2.5
                        ? 'text-slate-900 dark:text-white'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {riskReturnMetrics.maxDrawdownPct.toFixed(2)}%
                  </span>
                  <span className="text-sm font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                    (${Math.abs(riskReturnMetrics.maxDrawdownMxn).toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    MXN)
                  </span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  Peor retroceso histórico registrado desde un máximo de{' '}
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    ${riskReturnMetrics.peakEquityMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </span>
                  .
                </p>
              </div>

              <div className="shrink-0 sm:text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">Drawdown Actual</div>
                <div
                  className={`font-mono tabular-nums font-bold text-base mt-0.5 ${
                    riskReturnMetrics.currentDrawdownPct >= -0.05
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {riskReturnMetrics.currentDrawdownPct.toFixed(2)}%
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                  Retorno hist.: {riskReturnMetrics.cumulativeReturnPct >= 0 ? '+' : ''}
                  {riskReturnMetrics.cumulativeReturnPct.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Perfil Visual del Drawdown sobre Equity History */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Perfil de retrocesos sobre tu historial de equity</span>
                <span className="font-mono tabular-nums inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Tope objetivo: -2.50%
                </span>
              </div>
              <div className="h-20 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={riskReturnMetrics.drawdownSeries}
                    margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
                  >
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#090C11',
                        borderColor: '#1E293B',
                        borderRadius: '0.5rem',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                      formatter={(value: unknown) => [
                        `${Number(value ?? 0).toFixed(2)}%`,
                        'Drawdown vs Máximo',
                      ]}
                      labelFormatter={(label) => `Registro: ${String(label)}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="drawdownPct"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      fill="#f43f5e"
                      fillOpacity={0.18}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Noticias de Mercado + Centro de Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-2.5">
              <Newspaper className="w-5 h-5 text-emerald-500" />
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Inteligencia de Mercado y Noticias
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Priorizadas según tus posiciones en custodia y sector líder ({topSector})
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('alerts')}
              className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ver mis correos
            </button>
          </div>

          {/* Buscador en Tiempo Real con Google Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runLiveMarketSearch();
            }}
            className="mb-5 p-3.5 rounded-md bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Consulta hechos relevantes o noticias en vivo (ej. Apple, NVIDIA, tasas México)..."
                  className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs sm:text-sm text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={searchingWeb}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Globe className="w-3.5 h-3.5" />
                {searchingWeb ? 'Consultando...' : 'Buscar en Google IA'}
              </button>
            </div>

            {webBrief && (
              <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs sm:text-sm">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  <span>{webBrief.modelUsed}</span>
                  <span>Actualizado: {webBrief.updatedAt}</span>
                </div>
                <div className="text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                  {webBrief.summary}
                </div>
                {webBrief.sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {webBrief.sources.map((src, i) => (
                      <a
                        key={`${src.uri}-${i}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="max-w-[200px] truncate">{src.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {prioritizedNews.slice(0, 4).map((item) => {
              const isHeld = heldSymbols.has(item.symbol);
              return (
                <div
                  key={item.id}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{item.symbol}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.sector}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.publishedAgo}</span>
                      {isHeld && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">En custodia</span>
                        </>
                      )}
                    </div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                      {item.headline}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                      {item.summary}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onInspectStock(item.symbol);
                      onNavigate('market');
                    }}
                    className="px-4 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-emerald-500 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
                  >
                    {item.quickActionLabel}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Centro de Alertas en Tiempo Real */}
        <div className="p-6 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Centro de Alertas
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums font-semibold text-slate-500 dark:text-slate-400">
                {activeAlarms.length} activas
              </span>
            </div>

            {alarms.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-6">
                Sin alertas recientes. El monitor de precios permanece activo sobre tus posiciones.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800/80 rounded-md bg-slate-50 dark:bg-[#090C11]">
                {alarms.slice(0, 3).map((alarm) => (
                  <div key={alarm.id} className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span
                        className={`font-bold font-mono ${
                          alarm.action === 'VENDER'
                            ? 'text-rose-600 dark:text-rose-400'
                            : alarm.action === 'COMPRAR'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-sky-600 dark:text-sky-400'
                        }`}
                      >
                        {alarm.action} · {alarm.symbol}
                      </span>
                      <span className="text-xs text-slate-400">{alarm.triggeredAt}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {alarm.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
            <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-2">
              Simular tonos diferenciados de alerta móvil:
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSimulateShock('drop')}
                className="px-3 py-2 rounded-md border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
              >
                Urgente Vender
              </button>
              <button
                onClick={() => onSimulateShock('buy')}
                className="px-3 py-2 rounded-md border border-sky-300 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 text-xs font-semibold hover:bg-sky-100 dark:hover:bg-sky-950/50 transition-colors cursor-pointer"
              >
                Urgente Comprar
              </button>
              <button
                onClick={() => onSimulateShock('dip_in_profit')}
                className="px-3 py-2 rounded-md border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors cursor-pointer"
              >
                Bajó en Ganancia
              </button>
              <button
                onClick={() => onSimulateShock('rally')}
                className="px-3 py-2 rounded-md border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer"
              >
                Meta Ganancia
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Posiciones Activas en Custodia */}
      <div className="p-6 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Posiciones Activas en Custodia
            </h3>
            <button
              onClick={() => onOpenTooltip('stop_loss')}
              className="p-1 text-slate-400 hover:text-emerald-500 cursor-pointer"
              aria-label="¿Qué es el Stop Loss?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => onNavigate('market')}
            className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            + Nueva orden de compra
          </button>
        </div>

        {positions.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-300 max-w-xl mx-auto">
              {totalPortfolioMxn <= 0
                ? 'Tu portafolio inicia en $0.00 MXN sin posiciones activas. Activa el Modo Juego para recibir $10,000 USD diarios y comenzar a comprar acciones u opciones.'
                : 'No mantienes emisoras en custodia por el momento. El 100% de tu capital permanece disponible en liquidez MXN.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {totalPortfolioMxn <= 0 && !gameModeEnabled && (
                <button
                  type="button"
                  onClick={onToggleGameMode}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-bold cursor-pointer"
                >
                  <Gamepad2 className="w-4 h-4" />
                  <span>Activar Modo Juego (+$10,000 USD/día)</span>
                </button>
              )}
              <button
                onClick={() => onNavigate('market')}
                className="px-5 py-2.5 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 cursor-pointer"
              >
                Explorar Mercado Disponible
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 pr-4">Emisora</th>
                  <th className="py-3 px-3 text-right">Títulos</th>
                  <th className="py-3 px-3 text-right">Costo Promedio</th>
                  <th className="py-3 px-3 text-right">Precio Mercado</th>
                  <th className="py-3 px-3 text-right">Stop Loss</th>
                  <th className="py-3 px-3 text-right">Take Profit</th>
                  <th className="py-3 px-3 text-right">Plusvalía / Minusvalía</th>
                  <th className="py-3 px-3">Señal</th>
                  <th className="py-3 pl-3 text-right">Ejecución</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {positions.map((pos) => {
                  const current = stockMap[pos.symbol]?.priceMxn ?? pos.avgEntryMxn;
                  const pnlMxn = (current - pos.avgEntryMxn) * pos.shares;
                  const pnlPct = ((current - pos.avgEntryMxn) / pos.avgEntryMxn) * 100;
                  const shouldSell = current <= pos.stopLossMxn || current >= pos.takeProfitMxn;

                  return (
                    <tr key={pos.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/35 transition-colors">
                      <td className="py-3.5 pr-4">
                        <button
                          onClick={() => {
                            onInspectStock(pos.symbol);
                            onNavigate('market');
                          }}
                          className="text-left group cursor-pointer"
                        >
                          <div className="font-mono font-bold text-slate-900 dark:text-white group-hover:text-emerald-400">
                            {pos.symbol}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {pos.name} · {pos.sector}
                          </div>
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold">{pos.shares}</td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                        ${pos.avgEntryMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        ${current.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-rose-500 dark:text-rose-400">
                        ${pos.stopLossMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        ${pos.takeProfitMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`py-3.5 px-3 text-right font-mono tabular-nums font-bold ${
                          pnlMxn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {pnlMxn >= 0 ? '+' : ''}${pnlMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ({pnlPct >= 0 ? '+' : ''}
                        {pnlPct.toFixed(2)}%)
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`text-xs font-bold ${
                            shouldSell
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {shouldSell ? 'VENDER' : 'MANTENER'}
                        </span>
                      </td>
                      <td className="py-3.5 pl-3 text-right">
                        <button
                          onClick={() => onQuickSell(pos.symbol, pos.shares)}
                          className="px-3.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:border-rose-500 hover:text-rose-400 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Liquidar posición
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resultados del Perfil de Inversionista (Dimensiones, Instrumentos, Riesgos y Firebase) */}
      {investorProfilePanel}
    </div>
  );
};
