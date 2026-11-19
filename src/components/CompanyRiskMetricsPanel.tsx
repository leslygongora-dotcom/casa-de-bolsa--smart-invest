import React from 'react';
import { HelpCircle, ShieldAlert } from 'lucide-react';
import { StockAsset } from '../types';
import { ASSET_RISK_FREE_RATE_PCT, CompanyRiskMetrics } from '../utils/assetRiskMetrics';

interface CompanyRiskMetricsPanelProps {
  asset: StockAsset;
  metrics: CompanyRiskMetrics;
  onOpenTooltip: (key: string) => void;
}

interface MetricCardItem {
  id: string;
  label: string;
  subLabel: string;
  value: string;
  detail: string;
  tooltipKey: string;
  toneClass: string;
}

export const CompanyRiskMetricsPanel: React.FC<CompanyRiskMetricsPanelProps> = ({
  asset,
  metrics,
  onOpenTooltip,
}) => {
  const items: MetricCardItem[] = [
    {
      id: 'var',
      label: 'VaR (Value at Risk 99%)',
      subLabel: 'Pérdida máxima diaria estimada (99% conf.)',
      value: `${metrics.var99DailyPct.toFixed(2)}%`,
      detail: `~$${metrics.var99On10kMxn.toLocaleString('es-MX', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })} MXN por cada $10,000 MXN`,
      tooltipKey: 'var',
      toneClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      id: 'cvar',
      label: 'CVaR (Expected Shortfall)',
      subLabel: 'Pérdida promedio si se supera el VaR',
      value: `${metrics.cvar99DailyPct.toFixed(2)}%`,
      detail: `Escenario extremo: ~$${metrics.cvar99On10kMxn.toLocaleString('es-MX', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })} MXN / $10k`,
      tooltipKey: 'cvar',
      toneClass: 'text-rose-600 dark:text-rose-400',
    },
    {
      id: 'beta',
      label: 'Beta (β)',
      subLabel: 'Sensibilidad frente al S&P 500 (SPY)',
      value: `${metrics.beta.toFixed(2)}`,
      detail: metrics.betaLabel,
      tooltipKey: 'beta',
      toneClass:
        Math.abs(metrics.beta) > 1.25
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-900 dark:text-white',
    },
    {
      id: 'stddev',
      label: 'Desviación estándar (σ)',
      subLabel: 'Dispersión total de rendimientos',
      value: `${metrics.stdDevAnnualPct.toFixed(2)}% anual`,
      detail: `Oscilación diaria típica: ±${metrics.stdDevDailyPct.toFixed(2)}%`,
      tooltipKey: 'desviacion_estandar',
      toneClass: 'text-slate-900 dark:text-white',
    },
    {
      id: 'sharpe',
      label: 'Sharpe Ratio',
      subLabel: `Retorno ajustado por riesgo total (vs ${ASSET_RISK_FREE_RATE_PCT}%)`,
      value: `${metrics.sharpeRatio.toFixed(2)}`,
      detail: `Eficiencia: ${metrics.sharpeLabel}`,
      tooltipKey: 'sharpe',
      toneClass:
        metrics.sharpeRatio >= 1.0
          ? 'text-emerald-600 dark:text-emerald-400'
          : metrics.sharpeRatio >= 0.4
            ? 'text-slate-900 dark:text-white'
            : 'text-rose-600 dark:text-rose-400',
    },
    {
      id: 'drawdown',
      label: 'Máximo Drawdown',
      subLabel: 'Peor caída pico-a-valle en ventana reciente',
      value: `${metrics.maxDrawdownPct.toFixed(2)}%`,
      detail:
        metrics.maxDrawdownPct > -1.5
          ? 'Retroceso histórico acotado'
          : 'Vigilar Stop Loss ante caídas',
      tooltipKey: 'drawdown',
      toneClass: 'text-rose-600 dark:text-rose-400',
    },
    {
      id: 'sortino',
      label: 'Sortino Ratio',
      subLabel: 'Retorno ajustado solo por volatilidad bajista',
      value: `${metrics.sortinoRatio.toFixed(2)}`,
      detail: `${metrics.sortinoLabel} (σ bajista ${metrics.downsideDevAnnualPct.toFixed(1)}%)`,
      tooltipKey: 'sortino',
      toneClass:
        metrics.sortinoRatio >= 1.2
          ? 'text-emerald-600 dark:text-emerald-400'
          : metrics.sortinoRatio >= 0.5
            ? 'text-slate-900 dark:text-white'
            : 'text-rose-600 dark:text-rose-400',
    },
  ];

  return (
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Matriz de Riesgo Cuantitativo · {asset.symbol} ({asset.name})
          </h4>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
          Referencia libre de riesgo: CETES {ASSET_RISK_FREE_RATE_PCT}% · Benchmark: SPY
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`p-3 rounded-lg bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800/90 flex flex-col justify-between gap-1.5 ${
              index === items.length - 1 ? 'sm:col-span-2 lg:col-span-2' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                  {item.label}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                  {item.subLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenTooltip(item.tooltipKey)}
                className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 shrink-0 cursor-pointer"
                title={`Explicación de ${item.label}`}
                aria-label={`Explicación de ${item.label}`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className={`font-mono tabular-nums text-base font-bold mt-1 ${item.toneClass}`}>
              {item.value}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
              {item.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
