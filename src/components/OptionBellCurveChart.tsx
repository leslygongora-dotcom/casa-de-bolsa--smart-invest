import React, { useMemo } from 'react';
import { BellRing } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OptionContractType } from '../types';

interface OptionBellCurveChartProps {
  symbol: string;
  optionType: OptionContractType;
  spotMxn: number;
  strikeMxn: number;
  breakevenMxn: number;
  daysToExpiration: number;
  impliedVolatilityPct: number;
  probItmPct: number;
  probProfitablePct: number;
}

interface BellPoint {
  priceMxn: number;
  priceLabel: string;
  pctMove: number;
  densityTotal: number;
  densityProfit: number | null;
  densityLoss: number | null;
}

export const OptionBellCurveChart: React.FC<OptionBellCurveChartProps> = ({
  symbol,
  optionType,
  spotMxn,
  strikeMxn,
  breakevenMxn,
  daysToExpiration,
  impliedVolatilityPct,
  probItmPct,
  probProfitablePct,
}) => {
  const { points, lower1Sigma, upper1Sigma, nearestSpotLabel, nearestStrikeLabel, nearestBeLabel } =
    useMemo(() => {
      const S = Math.max(1, spotMxn);
      const T = Math.max(1 / 365, daysToExpiration / 365);
      const sigma = Math.max(0.05, impliedVolatilityPct / 100);
      const r = 0.085;
      const logStd = Math.max(0.015, sigma * Math.sqrt(T));
      const logMean = Math.log(S) + (r - 0.5 * sigma * sigma) * T;

      const uMin = logMean - 3.0 * logStd;
      const uMax = logMean + 3.0 * logStd;
      const steps = 80;
      const rawPoints: BellPoint[] = [];

      for (let i = 0; i <= steps; i++) {
        const u = uMin + ((uMax - uMin) * i) / steps;
        const price = Math.exp(u);
        const z = (u - logMean) / logStd;
        // Relative bell density scaled 0..100 at peak
        const density = Number((Math.exp(-0.5 * z * z) * 100).toFixed(2));
        const pctMove = Number((((price - S) / S) * 100).toFixed(1));
        const isProfit = optionType === 'CALL' ? price >= breakevenMxn : price <= breakevenMxn;

        rawPoints.push({
          priceMxn: Number(price.toFixed(2)),
          priceLabel: `$${Math.round(price).toLocaleString('es-MX')}`,
          pctMove,
          densityTotal: density,
          densityProfit: isProfit ? density : null,
          densityLoss: !isProfit ? density : null,
        });
      }

      // Stitch boundary point so green and rose areas meet without a visual gap
      for (let i = 1; i < rawPoints.length; i++) {
        const prev = rawPoints[i - 1];
        const curr = rawPoints[i];
        const prevProfit = prev.densityProfit !== null;
        const currProfit = curr.densityProfit !== null;
        if (prevProfit !== currProfit) {
          if (currProfit) {
            curr.densityLoss = curr.densityTotal;
          } else {
            curr.densityProfit = curr.densityTotal;
          }
        }
      }

      const findClosestLabel = (targetPrice: number) => {
        let best = rawPoints[0]?.priceLabel || '';
        let bestDiff = Infinity;
        for (const p of rawPoints) {
          const diff = Math.abs(p.priceMxn - targetPrice);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = p.priceLabel;
          }
        }
        return best;
      };

      return {
        points: rawPoints,
        lower1Sigma: Math.exp(logMean - logStd),
        upper1Sigma: Math.exp(logMean + logStd),
        nearestSpotLabel: findClosestLabel(S),
        nearestStrikeLabel: findClosestLabel(strikeMxn),
        nearestBeLabel: findClosestLabel(breakevenMxn),
      };
    }, [spotMxn, strikeMxn, breakevenMxn, daysToExpiration, impliedVolatilityPct, optionType]);

  return (
    <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BellRing className="w-4 h-4 text-indigo-500" />
            Gráfica de Campana de Probabilidad al Vencimiento ({symbol} · {optionType} {daysToExpiration}d)
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Distribución esperada del precio al vencimiento según Black-Scholes (IV {impliedVolatilityPct}%). La zona verde muestra escenarios donde superas el Break-even y generas utilidad neta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono shrink-0">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Prob. ITM</span>
            <strong className="text-slate-900 dark:text-white text-sm">{probItmPct.toFixed(1)}%</strong>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Prob. Ganar Neto</span>
            <strong className="text-emerald-600 dark:text-emerald-400 text-sm">{probProfitablePct.toFixed(1)}%</strong>
          </div>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 18, right: 18, left: 4, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
            <XAxis
              dataKey="priceLabel"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              minTickGap={28}
            />
            <YAxis
              domain={[0, 108]}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}%`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#090C11',
                borderColor: '#1E293B',
                borderRadius: '0.5rem',
                color: '#f8fafc',
                fontSize: '12px',
              }}
              labelFormatter={(_label, payload) => {
                const pt = payload?.[0]?.payload as BellPoint | undefined;
                if (!pt) return '';
                return `Precio al vencer: $${pt.priceMxn.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })} MXN (${pt.pctMove >= 0 ? '+' : ''}${pt.pctMove}% vs hoy)`;
              }}
              formatter={(value: unknown, name: unknown) => {
                if (value === null || value === undefined) return ['—', ''];
                const label =
                  name === 'densityProfit'
                    ? 'Densidad en Ganancia Neta'
                    : 'Densidad bajo Break-even';
                return [`${Number(value).toFixed(1)}% rel.`, label];
              }}
            />

            <Area
              type="monotone"
              dataKey="densityLoss"
              name="densityLoss"
              stroke="#f43f5e"
              strokeWidth={2}
              fill="#f43f5e"
              fillOpacity={0.22}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="densityProfit"
              name="densityProfit"
              stroke="#10b981"
              strokeWidth={2.2}
              fill="#10b981"
              fillOpacity={0.28}
              connectNulls={false}
              isAnimationActive={false}
            />

            <ReferenceLine
              x={nearestSpotLabel}
              stroke="#38bdf8"
              strokeWidth={2}
              strokeDasharray="4 3"
              label={{
                value: 'Spot',
                position: 'top',
                fill: '#38bdf8',
                fontSize: 11,
                fontWeight: 700,
              }}
            />
            <ReferenceLine
              x={nearestStrikeLabel}
              stroke="#f59e0b"
              strokeWidth={2}
              label={{
                value: 'Strike',
                position: 'insideTopRight',
                fill: '#f59e0b',
                fontSize: 11,
                fontWeight: 700,
              }}
            />
            <ReferenceLine
              x={nearestBeLabel}
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="3 3"
              label={{
                value: 'Break-even',
                position: 'top',
                fill: '#10b981',
                fontSize: 11,
                fontWeight: 700,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-3 h-3 rounded-xs bg-emerald-500/40 border border-emerald-500 inline-block" />
            Zona de ganancia neta ({optionType === 'CALL' ? `≥ $${breakevenMxn.toLocaleString('es-MX')}` : `≤ $${breakevenMxn.toLocaleString('es-MX')}`} MXN)
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-3 h-3 rounded-xs bg-rose-500/35 border border-rose-500 inline-block" />
            Zona bajo punto de equilibrio
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-sky-500 font-bold">Spot:</span> ${spotMxn.toLocaleString('es-MX')} ·
            <span className="text-amber-500 font-bold">Strike:</span> ${strikeMxn.toLocaleString('es-MX')}
          </span>
        </div>
        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
          Rango 1σ (68.2%): ${lower1Sigma.toLocaleString('es-MX', { maximumFractionDigits: 0 })} – $
          {upper1Sigma.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
        </div>
      </div>
    </div>
  );
};
