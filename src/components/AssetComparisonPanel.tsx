import React, { useMemo } from 'react';
import {
  ArrowLeftRight,
  ArrowUpRight,
  HelpCircle,
  Scale,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DeepAnalysisResult, StockAsset } from '../types';
import { ASSET_RISK_FREE_RATE_PCT, computeCompanyRiskMetrics } from '../utils/assetRiskMetrics';
import { computeFinancialStrength } from '../utils/financialStrength';

interface AssetComparisonPanelProps {
  stocks: StockAsset[];
  deepAnalyses?: Record<string, DeepAnalysisResult>;
  symbolA: string;
  symbolB: string;
  onChangeSymbolA: (symbol: string) => void;
  onChangeSymbolB: (symbol: string) => void;
  onSwap: () => void;
  onSelectForTrade: (symbol: string) => void;
  onOpenTooltip: (key: string) => void;
}

interface ComputedAssetMetrics {
  dailyVar99Pct: number;
  varLossOn10kMxn: number;
  dailyCvar99Pct: number;
  cvarLossOn10kMxn: number;
  beta: number;
  stdDevDailyPct: number;
  stdDevAnnualPct: number;
  maxDrawdownPct: number;
  windowReturnPct: number;
  minHistoryMxn: number;
  maxHistoryMxn: number;
  amplitudePct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  projected10kMxn: number;
  commissionOn10kMxn: number;
  riskTier: 'Bajo / Defensivo' | 'Moderado' | 'Alto / Volátil';
}

const RISK_FREE_RATE_PCT = ASSET_RISK_FREE_RATE_PCT;

function computeMetrics(asset: StockAsset, benchmark?: StockAsset): ComputedAssetMetrics {
  const risk = computeCompanyRiskMetrics(asset, benchmark);

  const series = asset.history.length > 0 ? asset.history : [asset.priceMxn];
  let minVal = series[0];
  let maxVal = series[0];

  for (const val of series) {
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
  }

  const first = series[0] || asset.priceMxn;
  const last = series[series.length - 1] || asset.priceMxn;
  const windowReturnPct = first > 0 ? Number((((last - first) / first) * 100).toFixed(2)) : 0;
  const amplitudePct = minVal > 0 ? Number((((maxVal - minVal) / minVal) * 100).toFixed(2)) : 0;

  const projected10kMxn = Number((10000 * (1 + asset.annualReturnPct / 100)).toFixed(2));
  const commissionOn10kMxn = Number((10000 * asset.commissionPct).toFixed(2));

  const riskTier: ComputedAssetMetrics['riskTier'] =
    asset.volatilityAnnualPct <= 20
      ? 'Bajo / Defensivo'
      : asset.volatilityAnnualPct <= 30
      ? 'Moderado'
      : 'Alto / Volátil';

  return {
    dailyVar99Pct: Math.abs(risk.var99DailyPct),
    varLossOn10kMxn: risk.var99On10kMxn,
    dailyCvar99Pct: Math.abs(risk.cvar99DailyPct),
    cvarLossOn10kMxn: risk.cvar99On10kMxn,
    beta: risk.beta,
    stdDevDailyPct: risk.stdDevDailyPct,
    stdDevAnnualPct: risk.stdDevAnnualPct,
    maxDrawdownPct: Math.abs(risk.maxDrawdownPct),
    windowReturnPct,
    minHistoryMxn: minVal,
    maxHistoryMxn: maxVal,
    amplitudePct,
    sharpeRatio: risk.sharpeRatio,
    sortinoRatio: risk.sortinoRatio,
    projected10kMxn,
    commissionOn10kMxn,
    riskTier,
  };
}

export const AssetComparisonPanel: React.FC<AssetComparisonPanelProps> = ({
  stocks,
  deepAnalyses = {},
  symbolA,
  symbolB,
  onChangeSymbolA,
  onChangeSymbolB,
  onSwap,
  onSelectForTrade,
  onOpenTooltip,
}) => {
  const assetA = useMemo(
    () => stocks.find((s) => s.symbol === symbolA) || stocks[0],
    [stocks, symbolA]
  );
  const assetB = useMemo(
    () => stocks.find((s) => s.symbol === symbolB) || stocks[1] || stocks[0],
    [stocks, symbolB]
  );

  const benchmarkSpy = useMemo(
    () => stocks.find((s) => s.symbol === 'SPY') || stocks[0],
    [stocks]
  );

  const metricsA = useMemo(() => computeMetrics(assetA, benchmarkSpy), [assetA, benchmarkSpy]);
  const metricsB = useMemo(() => computeMetrics(assetB, benchmarkSpy), [assetB, benchmarkSpy]);
  const strengthA = useMemo(
    () => computeFinancialStrength(assetA, deepAnalyses[assetA.symbol]),
    [assetA, deepAnalyses]
  );
  const strengthB = useMemo(
    () => computeFinancialStrength(assetB, deepAnalyses[assetB.symbol]),
    [assetB, deepAnalyses]
  );

  // Normalized % return chart data so assets with different share prices compare cleanly
  const normalizedChartData = useMemo(() => {
    const len = Math.max(assetA.history.length, assetB.history.length);
    const startA = assetA.history[0] || assetA.priceMxn;
    const startB = assetB.history[0] || assetB.priceMxn;

    return Array.from({ length: len }, (_, idx) => {
      const valA = assetA.history[Math.min(idx, assetA.history.length - 1)] ?? assetA.priceMxn;
      const valB = assetB.history[Math.min(idx, assetB.history.length - 1)] ?? assetB.priceMxn;
      const pctA = startA > 0 ? Number((((valA - startA) / startA) * 100).toFixed(2)) : 0;
      const pctB = startB > 0 ? Number((((valB - startB) / startB) * 100).toFixed(2)) : 0;
      return {
        periodo: idx === len - 1 ? 'Actual' : `T-${len - 1 - idx}`,
        [assetA.symbol]: pctA,
        [assetB.symbol]: pctB,
        priceA: valA,
        priceB: valB,
      };
    });
  }, [assetA, assetB]);

  const lowerRiskSymbol =
    metricsA.dailyVar99Pct === metricsB.dailyVar99Pct
      ? 'Empate'
      : metricsA.dailyVar99Pct < metricsB.dailyVar99Pct
      ? assetA.symbol
      : assetB.symbol;

  const higherReturnSymbol =
    assetA.annualReturnPct === assetB.annualReturnPct
      ? 'Empate'
      : assetA.annualReturnPct > assetB.annualReturnPct
      ? assetA.symbol
      : assetB.symbol;

  const betterSharpeSymbol =
    metricsA.sharpeRatio === metricsB.sharpeRatio
      ? 'Empate'
      : metricsA.sharpeRatio > metricsB.sharpeRatio
      ? assetA.symbol
      : assetB.symbol;

  const formatWinner = (aWins: boolean, bWins: boolean, labelA: string, labelB: string, tieLabel = 'Empate técnico') => {
    if (!aWins && !bWins) return tieLabel;
    return aWins ? `${assetA.symbol} (${labelA})` : `${assetB.symbol} (${labelB})`;
  };

  return (
    <section
      aria-labelledby="comparador-activos-titulo"
      className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6"
    >
      {/* Encabezado del Comparador */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3
              id="comparador-activos-titulo"
              className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white"
            >
              Comparador Lado a Lado: Riesgo vs. Rendimiento Histórico
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            Selecciona dos activos para contrastar su volatilidad, riesgo diario (VaR 99%), comisiones y desempeño histórico antes de invertir.
          </p>
        </div>

        <button
          type="button"
          onClick={onSwap}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer self-start lg:self-auto"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Intercambiar A ↔ B
        </button>
      </div>

      {/* Selectores Lado a Lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Activo A */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border-2 border-indigo-500/40 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="select-asset-a"
              className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400"
            >
              Activo A (Referencia Principal)
            </label>
            <button
              type="button"
              onClick={() => onSelectForTrade(assetA.symbol)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Operar {assetA.symbol} <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <select
            id="select-asset-a"
            value={assetA.symbol}
            onChange={(e) => onChangeSymbolA(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white"
          >
            {stocks.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} — {s.name} ({s.sector})
              </option>
            ))}
          </select>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              {assetA.exchange} · {assetA.sector}
            </span>
            <span className="font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white">
              ${assetA.priceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN{' '}
              <span
                className={
                  assetA.changePct >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }
              >
                ({assetA.changePct >= 0 ? '+' : ''}
                {assetA.changePct.toFixed(2)}%)
              </span>
            </span>
          </div>
        </div>

        {/* Activo B */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border-2 border-emerald-500/40 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="select-asset-b"
              className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
            >
              Activo B (Alternativa a Comparar)
            </label>
            <button
              type="button"
              onClick={() => onSelectForTrade(assetB.symbol)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Operar {assetB.symbol} <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <select
            id="select-asset-b"
            value={assetB.symbol}
            onChange={(e) => onChangeSymbolB(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white"
          >
            {stocks.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} — {s.name} ({s.sector})
              </option>
            ))}
          </select>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              {assetB.exchange} · {assetB.sector}
            </span>
            <span className="font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white">
              ${assetB.priceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN{' '}
              <span
                className={
                  assetB.changePct >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }
              >
                ({assetB.changePct >= 0 ? '+' : ''}
                {assetB.changePct.toFixed(2)}%)
              </span>
            </span>
          </div>
        </div>
      </div>

      {assetA.symbol === assetB.symbol && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
          Seleccionaste el mismo activo en ambos lados ({assetA.symbol}). Elige un instrumento diferente en <strong>Activo B</strong> para aprovechar la comparativa lado a lado.
        </div>
      )}

      {/* 3 Conclusiones Rápidas para Decisión Sencilla */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Menor Riesgo (Más Estable)
          </div>
          <div className="mt-1.5 text-base font-bold text-slate-900 dark:text-white font-mono">
            {lowerRiskSymbol}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {lowerRiskSymbol === 'Empate'
              ? 'Ambos comparten volatilidad y VaR idénticos.'
              : `${lowerRiskSymbol} presenta menor volatilidad anual y menor pérdida diaria potencial (VaR 99%).`}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            Mayor Rendimiento 12M
          </div>
          <div className="mt-1.5 text-base font-bold text-slate-900 dark:text-white font-mono">
            {higherReturnSymbol}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {assetA.symbol}: {assetA.annualReturnPct >= 0 ? '+' : ''}
            {assetA.annualReturnPct}% vs {assetB.symbol}: {assetB.annualReturnPct >= 0 ? '+' : ''}
            {assetB.annualReturnPct}% en los últimos 12 meses.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Scale className="w-4 h-4 text-amber-500" />
            Mejor Relación Retorno / Riesgo
          </div>
          <div className="mt-1.5 text-base font-bold text-slate-900 dark:text-white font-mono">
            {betterSharpeSymbol}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Ratio Sharpe estimado: {assetA.symbol} ({metricsA.sharpeRatio.toFixed(2)}) vs {assetB.symbol} ({metricsB.sharpeRatio.toFixed(2)}).
          </p>
        </div>
      </div>

      {/* Gráfica Comparativa Normalizada (% Variación Acumulada en Ventana Reciente) */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Trayectoria Comparada en Ventana Reciente (% acumulado desde inicio)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ambos activos parten en 0.00% para comparar su comportamiento real sin importar si su precio es alto o bajo.
            </p>
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={normalizedChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} />
              <XAxis
                dataKey="periodo"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                stroke="#475569"
              />
              <YAxis
                tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                stroke="#475569"
                width={54}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                  color: '#f8fafc',
                }}
                formatter={(value, name) => {
                  const num = Number(value ?? 0);
                  return [
                    `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`,
                    String(name ?? ''),
                  ];
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey={assetA.symbol}
                name={`${assetA.symbol} (Activo A)`}
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
              />
              {assetB.symbol !== assetA.symbol && (
                <Line
                  type="monotone"
                  dataKey={assetB.symbol}
                  name={`${assetB.symbol} (Activo B)`}
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla 1: Métricas de Riesgo y Protección */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Tabla 1 · Métricas de Riesgo y Protección de Capital
          </h4>
          <button
            type="button"
            onClick={() => onOpenTooltip('var')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" /> ¿Qué es el VaR 99%?
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4 font-bold">Métrica de Riesgo</th>
                <th className="py-3 px-4 font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                  {assetA.symbol} (A)
                </th>
                <th className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {assetB.symbol} (B)
                </th>
                <th className="py-3 px-4 font-bold">Ventaja / Lectura Sencilla</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Desviación Estándar (σ anual / diaria)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {metricsA.stdDevAnnualPct.toFixed(2)}%{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    (±{metricsA.stdDevDailyPct.toFixed(2)}%/día)
                  </span>
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {metricsB.stdDevAnnualPct.toFixed(2)}%{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    (±{metricsB.stdDevDailyPct.toFixed(2)}%/día)
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    metricsA.stdDevAnnualPct < metricsB.stdDevAnnualPct,
                    metricsB.stdDevAnnualPct < metricsA.stdDevAnnualPct,
                    'menos oscilaciones',
                    'menos oscilaciones'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  VaR Diario 99% (Value at Risk)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-slate-900 dark:text-white">
                    -{metricsA.dailyVar99Pct.toFixed(2)}%
                  </span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    (${metricsA.varLossOn10kMxn.toFixed(0)} MXN)
                  </span>
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-slate-900 dark:text-white">
                    -{metricsB.dailyVar99Pct.toFixed(2)}%
                  </span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    (${metricsB.varLossOn10kMxn.toFixed(0)} MXN)
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    metricsA.dailyVar99Pct < metricsB.dailyVar99Pct,
                    metricsB.dailyVar99Pct < metricsA.dailyVar99Pct,
                    'menor riesgo diario',
                    'menor riesgo diario'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  CVaR 99% (Expected Shortfall)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    -{metricsA.dailyCvar99Pct.toFixed(2)}%
                  </span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    (${metricsA.cvarLossOn10kMxn.toFixed(0)} MXN)
                  </span>
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    -{metricsB.dailyCvar99Pct.toFixed(2)}%
                  </span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    (${metricsB.cvarLossOn10kMxn.toFixed(0)} MXN)
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    metricsA.dailyCvar99Pct < metricsB.dailyCvar99Pct,
                    metricsB.dailyCvar99Pct < metricsA.dailyCvar99Pct,
                    'menor pérdida en cola extrema',
                    'menor pérdida en cola extrema'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Beta (β frente a SPY)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {metricsA.beta.toFixed(2)}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {metricsB.beta.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    Math.abs(metricsA.beta) < Math.abs(metricsB.beta),
                    Math.abs(metricsB.beta) < Math.abs(metricsA.beta),
                    'menor sensibilidad al mercado',
                    'menor sensibilidad al mercado'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Máximo Drawdown (Caída Pico-a-Valle)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                  -{metricsA.maxDrawdownPct.toFixed(2)}%
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                  -{metricsB.maxDrawdownPct.toFixed(2)}%
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    metricsA.maxDrawdownPct < metricsB.maxDrawdownPct,
                    metricsB.maxDrawdownPct < metricsA.maxDrawdownPct,
                    'retroceso más suave',
                    'retroceso más suave'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Nivel de Riesgo Sugerido
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                  {metricsA.riskTier}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                  {metricsB.riskTier}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  Clasificación automática por volatilidad anual
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Comisión Smart Invest (y costo en $10,000)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {(assetA.commissionPct * 100).toFixed(2)}%
                  </span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    (${metricsA.commissionOn10kMxn.toFixed(2)} MXN)
                  </span>
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {(assetB.commissionPct * 100).toFixed(2)}%
                  </span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    (${metricsB.commissionOn10kMxn.toFixed(2)} MXN)
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    assetA.commissionPct < assetB.commissionPct,
                    assetB.commissionPct < assetA.commissionPct,
                    'menor comisión',
                    'menor comisión',
                    'Misma comisión preferencial'
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla 2: Rendimiento Histórico, Valuación y Eficiencia */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Tabla 2 · Rendimiento Histórico, Valuación y Señal IA
          </h4>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tasa libre de riesgo base: {RISK_FREE_RATE_PCT}% anual
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4 font-bold">Indicador de Rendimiento</th>
                <th className="py-3 px-4 font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                  {assetA.symbol} (A)
                </th>
                <th className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {assetB.symbol} (B)
                </th>
                <th className="py-3 px-4 font-bold">Ventaja / Lectura Sencilla</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Precio Actual y Variación de Hoy
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-slate-900 dark:text-white">
                    ${assetA.priceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>{' '}
                  <span
                    className={`text-xs font-semibold ${
                      assetA.changePct >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    ({assetA.changePct >= 0 ? '+' : ''}
                    {assetA.changePct.toFixed(2)}%)
                  </span>
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-slate-900 dark:text-white">
                    ${assetB.priceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>{' '}
                  <span
                    className={`text-xs font-semibold ${
                      assetB.changePct >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    ({assetB.changePct >= 0 ? '+' : ''}
                    {assetB.changePct.toFixed(2)}%)
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    assetA.changePct > assetB.changePct,
                    assetB.changePct > assetA.changePct,
                    'mejor impulso hoy',
                    'mejor impulso hoy'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Rendimiento Histórico 12 Meses
                </td>
                <td
                  className={`py-3 px-4 font-mono tabular-nums font-bold ${
                    assetA.annualReturnPct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {assetA.annualReturnPct >= 0 ? '+' : ''}
                  {assetA.annualReturnPct.toFixed(1)}%
                </td>
                <td
                  className={`py-3 px-4 font-mono tabular-nums font-bold ${
                    assetB.annualReturnPct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {assetB.annualReturnPct >= 0 ? '+' : ''}
                  {assetB.annualReturnPct.toFixed(1)}%
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    assetA.annualReturnPct > assetB.annualReturnPct,
                    assetB.annualReturnPct > assetA.annualReturnPct,
                    `+${Math.abs(assetA.annualReturnPct - assetB.annualReturnPct).toFixed(1)} pts arriba`,
                    `+${Math.abs(assetB.annualReturnPct - assetA.annualReturnPct).toFixed(1)} pts arriba`
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Si hubieras invertido $10,000 MXN hace 12M
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  ${metricsA.projected10kMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  ${metricsB.projected10kMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  Diferencia:{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    ${Math.abs(metricsA.projected10kMxn - metricsB.projected10kMxn).toLocaleString('es-MX', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}{' '}
                    MXN
                  </strong>
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Sharpe Ratio (Eficiencia Total)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {metricsA.sharpeRatio.toFixed(2)}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {metricsB.sharpeRatio.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    metricsA.sharpeRatio > metricsB.sharpeRatio,
                    metricsB.sharpeRatio > metricsA.sharpeRatio,
                    'paga mejor cada punto de riesgo',
                    'paga mejor cada punto de riesgo'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Sortino Ratio (Eficiencia ante Caídas)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {metricsA.sortinoRatio.toFixed(2)}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {metricsB.sortinoRatio.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    metricsA.sortinoRatio > metricsB.sortinoRatio,
                    metricsB.sortinoRatio > metricsA.sortinoRatio,
                    'mejor retorno por riesgo bajista',
                    'mejor retorno por riesgo bajista'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Variación en Ventana Reciente (Serie)
                </td>
                <td
                  className={`py-3 px-4 font-mono tabular-nums font-bold ${
                    metricsA.windowReturnPct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {metricsA.windowReturnPct >= 0 ? '+' : ''}
                  {metricsA.windowReturnPct.toFixed(2)}%
                </td>
                <td
                  className={`py-3 px-4 font-mono tabular-nums font-bold ${
                    metricsB.windowReturnPct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {metricsB.windowReturnPct >= 0 ? '+' : ''}
                  {metricsB.windowReturnPct.toFixed(2)}%
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  Rango {assetA.symbol}: ${metricsA.minHistoryMxn.toFixed(2)}–${metricsA.maxHistoryMxn.toFixed(2)} |{' '}
                  {assetB.symbol}: ${metricsB.minHistoryMxn.toFixed(2)}–${metricsB.maxHistoryMxn.toFixed(2)}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Dividendo Anual
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {assetA.dividendYieldPct.toFixed(2)}%
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {assetB.dividendYieldPct.toFixed(2)}%
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    assetA.dividendYieldPct > assetB.dividendYieldPct,
                    assetB.dividendYieldPct > assetA.dividendYieldPct,
                    'mayor flujo por dividendos',
                    'mayor flujo por dividendos'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Múltiplo P/U (Valuación)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {assetA.peRatio !== null ? `${assetA.peRatio.toFixed(1)}x` : 'N/A (Cripto)'}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {assetB.peRatio !== null ? `${assetB.peRatio.toFixed(1)}x` : 'N/A (Cripto)'}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {assetA.peRatio !== null && assetB.peRatio !== null
                    ? formatWinner(
                        assetA.peRatio < assetB.peRatio,
                        assetB.peRatio < assetA.peRatio,
                        'valuación más barata',
                        'valuación más barata'
                      )
                    : 'Múltiplo aplicable solo a acciones/ETFs'}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Score IA y Sentimiento Alcista
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-slate-900 dark:text-white">{assetA.aiScore}/100</span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({assetA.aiSignal} · {assetA.sentimentBullishPct}% alcista)
                  </span>
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span className="font-bold text-slate-900 dark:text-white">{assetB.aiScore}/100</span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({assetB.aiSignal} · {assetB.sentimentBullishPct}% alcista)
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    assetA.aiScore > assetB.aiScore,
                    assetB.aiScore > assetA.aiScore,
                    'mayor convicción cuantitativa',
                    'mayor convicción cuantitativa'
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                  Calificación de Fortaleza Financiera (A–F)
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded border font-bold text-xs mr-2 ${strengthA.colorClasses.badge}`}
                  >
                    {strengthA.grade}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {strengthA.score}/100
                  </span>{' '}
                  <span className="text-xs font-sans text-slate-500 dark:text-slate-400">
                    ({strengthA.label})
                  </span>
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded border font-bold text-xs mr-2 ${strengthB.colorClasses.badge}`}
                  >
                    {strengthB.grade}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {strengthB.score}/100
                  </span>{' '}
                  <span className="text-xs font-sans text-slate-500 dark:text-slate-400">
                    ({strengthB.label})
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {formatWinner(
                    strengthA.score > strengthB.score,
                    strengthB.score > strengthA.score,
                    `calificación ${strengthA.grade} más sólida`,
                    `calificación ${strengthB.grade} más sólida`
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
