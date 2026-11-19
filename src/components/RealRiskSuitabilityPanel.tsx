import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import type { IssWeights } from '../firebase';
import type { PortfolioPosition, StockAsset } from '../types';
import {
  computeHistoricalRiskFromSeries,
  computeIndependentDecisionEngine,
  computeInvestmentSuitabilityScore,
  DEFAULT_ISS_WEIGHTS,
  normalizeIssWeights,
  type HistoricalMarketResponse,
} from '../utils/historicalRiskModel';
import type { InvestorEvaluationResult } from '../utils/investorProfileEngine';

interface RealRiskSuitabilityPanelProps {
  asset: StockAsset;
  positions: PortfolioPosition[];
  evaluation: InvestorEvaluationResult | null;
  issWeights: IssWeights;
  onUpdateIssWeights: (weights: IssWeights) => void;
  onOpenTestModal: () => void;
  onOpenTooltip: (key: string) => void;
}

export const RealRiskSuitabilityPanel: React.FC<RealRiskSuitabilityPanelProps> = ({
  asset,
  positions,
  evaluation,
  issWeights,
  onUpdateIssWeights,
  onOpenTestModal,
  onOpenTooltip,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [histResp, setHistResp] = useState<HistoricalMarketResponse | null>(null);
  const [showWeightsConfig, setShowWeightsConfig] = useState<boolean>(false);
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);

  const fetchHistorical = async (symbol: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/market/historical/${encodeURIComponent(symbol)}`);
      const data = (await res.json()) as HistoricalMarketResponse;
      setHistResp(data);
    } catch {
      setHistResp({
        available: false,
        symbol,
        reason:
          'No se pudo conectar con la fuente de datos históricos reales. Verifica tu conexión o configura una fuente bursátil.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistorical(asset.symbol);
  }, [asset.symbol]);

  const metrics = useMemo(
    () => (histResp ? computeHistoricalRiskFromSeries(histResp) : null),
    [histResp]
  );

  const profileKey = evaluation?.definitiveProfileKey || 'moderado';

  const iss = useMemo(
    () => (metrics ? computeInvestmentSuitabilityScore(metrics, profileKey, issWeights) : null),
    [metrics, profileKey, issWeights]
  );

  const decision = useMemo(
    () =>
      metrics
        ? computeIndependentDecisionEngine({
            metrics,
            asset,
            positions,
            evaluation,
            iss,
          })
        : null,
    [metrics, asset, positions, evaluation, iss]
  );

  const trafficLightStyles =
    iss?.trafficLight === 'verde'
      ? {
          container: 'border-emerald-500/50 bg-emerald-500/10',
          dot: 'bg-emerald-500',
          text: 'text-emerald-700 dark:text-emerald-400',
        }
      : iss?.trafficLight === 'amarillo'
        ? {
            container: 'border-amber-500/50 bg-amber-500/10',
            dot: 'bg-amber-500',
            text: 'text-amber-700 dark:text-amber-400',
          }
        : {
            container: 'border-rose-500/50 bg-rose-500/10',
            dot: 'bg-rose-500',
            text: 'text-rose-700 dark:text-rose-400',
          };

  const normalizedWeights = normalizeIssWeights(issWeights);

  const handleWeightSlider = (key: keyof IssWeights, pctVal: number) => {
    const next = { ...issWeights, [key]: Math.max(0.05, Math.min(0.6, pctVal / 100)) };
    onUpdateIssWeights(next);
  };

  return (
    <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header con precio real actualizado y fecha del dato */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <Database className="w-4 h-4 shrink-0" />
            <span>Análisis Histórico Real · Compatibilidad (ISS) & Decisión</span>
          </div>
          <h4 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {asset.name} ({asset.symbol})
          </h4>
          {metrics?.available ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Fuente: <strong className="text-slate-700 dark:text-slate-200">{metrics.dataSource}</strong> ·{' '}
              Periodo: <span className="font-mono">{metrics.periodLabel}</span> ({metrics.observationsCount} sesiones,{' '}
              {metrics.frequency}) · Actualizado:{' '}
              <span className="font-mono">
                {new Date(metrics.updatedAtIso).toLocaleString('es-MX', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Verificando serie histórica diaria real para {asset.symbol}...
            </p>
          )}
        </div>

        <div className="flex flex-col sm:items-end gap-1 shrink-0">
          {metrics?.available && (
            <div className="text-left sm:text-right">
              <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white">
                ${metrics.latestPriceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </div>
              {metrics.originalCurrency !== 'MXN' && (
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {metrics.latestPriceOriginal.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                  {metrics.originalCurrency} · TC {metrics.usdMxnRate.toFixed(2)}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => fetchHistorical(asset.symbol)}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Actualizando...' : 'Actualizar serie real'}
          </button>
        </div>
      </div>

      {!evaluation && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-slate-800 dark:text-amber-200">
            Aún no has completado tu Test de Perfil. Mostramos compatibilidad preliminar con perfil{' '}
            <strong>Moderado</strong>.
          </span>
          <button
            type="button"
            onClick={onOpenTestModal}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 cursor-pointer shrink-0"
          >
            Hacer mi test ahora
          </button>
        </div>
      )}

      {/* Estado de carga o insuficiencia estricta de datos */}
      {loading && !metrics && (
        <div className="p-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Descargando precios históricos diarios reales y calculando percentiles de riesgo...
        </div>
      )}

      {metrics && !metrics.available && (
        <div className="p-5 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-rose-300 dark:border-rose-800 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-700 dark:text-rose-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Cálculo histórico no disponible</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            {metrics.unavailableReason}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Por rigor financiero, no inventamos rendimientos ni métricas sin respaldo histórico suficiente.
          </p>
        </div>
      )}

      {metrics && metrics.available && iss && decision && (
        <>
          {/* 1. Semáforo de Compatibilidad (ISS) */}
          <div className={`p-4 sm:p-5 rounded-xl border-2 space-y-4 ${trafficLightStyles.container}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                  <div
                    className={`w-8 h-8 rounded-full ${trafficLightStyles.dot} ring-4 ring-white/60 dark:ring-slate-900/60`}
                    aria-label={`Semáforo ${iss.trafficLight}`}
                  />
                  <span className={`text-[10px] font-bold uppercase ${trafficLightStyles.text}`}>
                    {iss.trafficLight}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Investment Suitability Score (ISS) · Perfil{' '}
                      {evaluation?.profileDisplayName || 'Moderado'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenTooltip('iss')}
                      className="text-slate-500 hover:text-emerald-600 cursor-pointer"
                      aria-label="¿Qué es el ISS?"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <span className="font-mono tabular-nums text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                      {iss.score} / 100
                    </span>
                    <span className={`text-sm sm:text-base font-bold ${trafficLightStyles.text}`}>
                      {iss.label}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {iss.explanation}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Nota: El ISS mide compatibilidad de riesgo con tu perfil, NO es una probabilidad de obtener ganancias.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowWeightsConfig((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/80 dark:bg-[#090C11] border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-emerald-500 shrink-0 cursor-pointer self-start"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Ajustar Pesos ISS
              </button>
            </div>

            {/* Desglose normalizado 0-100: V, C, B, D, S */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-3 border-t border-slate-300/50 dark:border-slate-700/60 text-xs">
              {[
                { key: 'V (Volatilidad)', weight: normalizedWeights.v, val: iss.subScores.vScore },
                { key: 'C (CVaR 99%)', weight: normalizedWeights.c, val: iss.subScores.cScore },
                { key: 'B (Beta β)', weight: normalizedWeights.b, val: iss.subScores.bScore },
                { key: 'D (Max DD)', weight: normalizedWeights.d, val: iss.subScores.dScore },
                { key: 'S (Sharpe)', weight: normalizedWeights.s, val: iss.subScores.sScore },
              ].map((item) => (
                <div
                  key={item.key}
                  className="p-2.5 rounded-lg bg-white/75 dark:bg-[#090C11]/85 border border-slate-200 dark:border-slate-800"
                >
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                    {item.key} · {(item.weight * 100).toFixed(0)}%
                  </div>
                  <div className="font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                    {item.val.toFixed(0)}/100
                  </div>
                </div>
              ))}
            </div>

            {/* Sliders configurables de pesos ISS */}
            {showWeightsConfig && (
              <div className="p-4 rounded-xl bg-white dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Pesos configurables del modelo ISS (se normalizan automáticamente al 100%)
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateIssWeights(DEFAULT_ISS_WEIGHTS)}
                    className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Restaurar 25/25/20/15/15
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {(
                    [
                      ['v', 'Volatilidad (V)'],
                      ['c', 'CVaR 99% (C)'],
                      ['b', 'Beta (B)'],
                      ['d', 'Drawdown (D)'],
                      ['s', 'Sharpe (S)'],
                    ] as Array<[keyof IssWeights, string]>
                  ).map(([k, label]) => (
                    <label key={k} className="space-y-1">
                      <div className="flex justify-between font-semibold text-slate-600 dark:text-slate-300">
                        <span>{label}</span>
                        <span className="font-mono">{(normalizedWeights[k] * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={50}
                        step={5}
                        value={Math.round(issWeights[k] * 100)}
                        onChange={(e) => handleWeightSlider(k, Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. Las 7 Métricas Matemáticas Reales con burbujas ? */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                id: 'var',
                tooltipKey: 'var',
                title: 'VaR Histórico 99%',
                value: `${metrics.var99DailyPct.toFixed(2)}% / día`,
                sub: `En $10,000 MXN: pérdida potencial hasta $${metrics.var99LossPer10kMxn.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN en un mal día (1% peor histórico).`,
                explain:
                  'Calculado con el método histórico (-Percentil 1% de los rendimientos diarios reales). Indica cuánto podrías perder en un día difícil similar al peor 1% observado en el último año.',
                tone: 'text-amber-600 dark:text-amber-400',
              },
              {
                id: 'cvar',
                tooltipKey: 'cvar',
                title: 'CVaR 99% (Expected Shortfall)',
                value: `${metrics.cvar99DailyPct.toFixed(2)}% / día`,
                sub: `En $10,000 MXN: pérdida promedio de $${metrics.cvar99LossPer10kMxn.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN si se supera el VaR.`,
                explain:
                  'Es el promedio de las pérdidas observadas en el peor 1% de días históricos. Mide la severidad de una caída extrema cuando las cosas salen peor que el VaR.',
                tone: 'text-rose-600 dark:text-rose-400',
              },
              {
                id: 'beta',
                tooltipKey: 'beta',
                title: `Beta (β) vs ${metrics.benchmarkName.split(' ')[0]}`,
                value: metrics.beta !== null ? metrics.beta.toFixed(2) : 'No disponible',
                sub: `Referencia: ${metrics.benchmarkName}.`,
                explain:
                  'Calculada como Covarianza(acción, índice) / Varianza(índice) con fechas diarias emparejadas. Si β = 1.5 y el índice cae $100, esta acción tiende a moverse ~$150.',
                tone: 'text-slate-900 dark:text-white',
              },
              {
                id: 'vol',
                tooltipKey: 'desviacion_estandar',
                title: 'Volatilidad (σ) Histórica',
                value: `${metrics.annualVolatilityPct.toFixed(2)}% anual`,
                sub: `Desviación estándar diaria: ±${metrics.dailyStdDevPct.toFixed(2)}%`,
                explain:
                  'Mide qué tanto se alejan los rendimientos diarios de su promedio (σ diaria × √días bursátiles). Mayor porcentaje implica oscilaciones de precio más bruscas en pesos.',
                tone: 'text-slate-900 dark:text-white',
              },
              {
                id: 'sharpe',
                tooltipKey: 'sharpe',
                title: 'Sharpe Ratio',
                value: metrics.sharpeRatio.toFixed(2),
                sub: `Tasa libre de riesgo base: ${metrics.riskFreeRateAnnualPct}% (${metrics.originalCurrency})`,
                explain:
                  'Se calcula como (Rendimiento anualizado - Tasa libre de riesgo) / Volatilidad anual. Mide cuánto rendimiento extra ganas por cada unidad de riesgo total asumido.',
                tone:
                  metrics.sharpeRatio >= 1
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-white',
              },
              {
                id: 'sortino',
                tooltipKey: 'sortino',
                title: 'Sortino Ratio',
                value: metrics.sortinoRatio.toFixed(2),
                sub: `Desviación bajista anual: ${metrics.downsideDevAnnualPct.toFixed(2)}%`,
                explain:
                  'Igual que el Sharpe, pero solo divide entre las caídas negativas (volatilidad bajista). Premia empresas que suben fuerte sin sufrir tantos retrocesos.',
                tone:
                  metrics.sortinoRatio >= 1.2
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-white',
              },
              {
                id: 'drawdown',
                tooltipKey: 'drawdown',
                title: 'Maximum Drawdown',
                value: `${metrics.maxDrawdownPct.toFixed(2)}%`,
                sub: `Pico ${metrics.maxDrawdownPeakDate} → Valle ${metrics.maxDrawdownTroughDate}`,
                explain:
                  'Es la mayor caída porcentual real desde un punto máximo hasta el mínimo posterior en el periodo. En $10,000 MXN, -20% equivaldría a bajar temporalmente a $8,000 MXN.',
                tone: 'text-rose-600 dark:text-rose-400',
              },
            ].map((m) => (
              <div
                key={m.id}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-1.5 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {m.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveBubbleId((cur) => (cur === m.id ? null : m.id));
                      onOpenTooltip(m.tooltipKey);
                    }}
                    className="text-slate-400 hover:text-emerald-600 cursor-pointer shrink-0"
                    aria-label={`Explicación de ${m.title}`}
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className={`font-mono tabular-nums text-base sm:text-lg font-bold ${m.tone}`}>
                  {m.value}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                  {m.sub}
                </div>
                {activeBubbleId === m.id && (
                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                    {m.explain}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 3. Motor de Decisiones Independiente (BUY / HOLD / SELL) separado del ISS */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Motor de Decisiones Cuantitativo (Separado del ISS)
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenTooltip('senal_vs_iss')}
                    className="text-slate-400 hover:text-emerald-600 cursor-pointer"
                    aria-label="Diferencia entre señal BUY/HOLD/SELL e ISS"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={`px-3 py-1 rounded-md font-mono font-black text-sm ${
                      decision.signal === 'BUY'
                        ? 'bg-emerald-600 text-white'
                        : decision.signal === 'SELL'
                          ? 'bg-rose-600 text-white'
                          : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    {decision.signal}
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {decision.headline}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  {decision.summary}
                </p>
              </div>
            </div>

            {decision.conflictWithProfile && decision.conflictWarning && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 flex items-start gap-2.5 text-xs sm:text-sm text-rose-800 dark:text-rose-200">
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Separación Señal vs. Perfil:</strong> {decision.conflictWarning}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {decision.factors.map((f) => (
                <div
                  key={f.factor}
                  className="p-3 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs"
                >
                  {f.status === 'favorable' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : f.status === 'precaucion' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  ) : (
                    <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{f.factor}</div>
                    <div className="text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                      {f.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
