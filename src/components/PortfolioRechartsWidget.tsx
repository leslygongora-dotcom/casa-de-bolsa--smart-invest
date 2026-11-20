import React, { useMemo, useState } from 'react';
import { CalendarClock, HelpCircle, ShieldCheck } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EquityTimelinePoint } from '../types';

interface PortfolioRechartsWidgetProps {
  currentPortfolioMxn: number;
  equityHistory: number[];
  portfolioCreatedAtIso: string;
  equityTimeline: EquityTimelinePoint[];
  onOpenTooltip: (key: string) => void;
}

type TimeRange = 'ALL' | '24H' | '7D' | '30D';

function formatAxisLabel(iso: string, spanMs: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Inicio';
  if (spanMs <= 48 * 60 * 60 * 1000) {
    return d.toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
  });
}

export const PortfolioRechartsWidget: React.FC<PortfolioRechartsWidgetProps> = ({
  currentPortfolioMxn,
  equityHistory,
  portfolioCreatedAtIso,
  equityTimeline,
  onOpenTooltip,
}) => {
  const [range, setRange] = useState<TimeRange>('ALL');

  const createdAtMs = useMemo(() => {
    const parsed = new Date(portfolioCreatedAtIso).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  }, [portfolioCreatedAtIso]);

  const createdFormatted = useMemo(() => {
    const d = new Date(createdAtMs);
    return d.toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [createdAtMs]);

  const chartData = useMemo(() => {
    const nowMs = Date.now();
    const safeCurrent = Number.isFinite(currentPortfolioMxn)
      ? Number(currentPortfolioMxn.toFixed(2))
      : 0;

    // Build chronological points strictly starting at portfolio creation
    const sourcePoints: EquityTimelinePoint[] =
      equityTimeline.length > 0
        ? [...equityTimeline]
        : equityHistory.map((val, idx) => ({
            timestampIso: new Date(
              createdAtMs + ((nowMs - createdAtMs) * idx) / Math.max(1, equityHistory.length - 1)
            ).toISOString(),
            equityMxn: Number((Number.isFinite(val) ? val : 0).toFixed(2)),
            eventLabel: idx === 0 ? 'Creación del portafolio' : undefined,
          }));

    const clamped = sourcePoints
      .map((pt) => {
        const ms = new Date(pt.timestampIso).getTime();
        return {
          ms: Number.isFinite(ms) ? Math.max(createdAtMs, ms) : createdAtMs,
          timestampIso: pt.timestampIso,
          equityMxn: Number((Number.isFinite(pt.equityMxn) ? pt.equityMxn : 0).toFixed(2)),
          eventLabel: pt.eventLabel,
        };
      })
      .sort((a, b) => a.ms - b.ms);

    if (clamped.length === 0) {
      clamped.push({
        ms: createdAtMs,
        timestampIso: new Date(createdAtMs).toISOString(),
        equityMxn: 0,
        eventLabel: 'Creación del portafolio',
      });
    }

    const windowMsMap: Record<TimeRange, number> = {
      ALL: Infinity,
      '24H': 24 * 60 * 60 * 1000,
      '7D': 7 * 24 * 60 * 60 * 1000,
      '30D': 30 * 24 * 60 * 60 * 1000,
    };
    const cutoffMs =
      range === 'ALL' ? createdAtMs : Math.max(createdAtMs, nowMs - windowMsMap[range]);

    const filtered = clamped.filter((pt) => pt.ms >= cutoffMs);
    const activePoints = filtered.length > 0 ? filtered : [clamped[clamped.length - 1]];

    // Ensure live "Ahora" point reflects currentPortfolioMxn
    const lastPt = activePoints[activePoints.length - 1];
    if (
      !lastPt ||
      Math.abs(lastPt.equityMxn - safeCurrent) >= 0.01 ||
      nowMs - lastPt.ms > 30000
    ) {
      activePoints.push({
        ms: Math.max(nowMs, (lastPt?.ms ?? createdAtMs) + 1000),
        timestampIso: new Date().toISOString(),
        equityMxn: safeCurrent,
        eventLabel: 'Valor actual',
      });
    }

    // If only 1 point exists (brand new portfolio), duplicate creation -> now so line renders cleanly
    if (activePoints.length === 1) {
      activePoints.push({
        ms: Math.max(nowMs, activePoints[0].ms + 1000),
        timestampIso: new Date().toISOString(),
        equityMxn: safeCurrent,
        eventLabel: 'Valor actual',
      });
    }

    const spanMs = Math.max(1000, activePoints[activePoints.length - 1].ms - activePoints[0].ms);
    const startVal = activePoints[0].equityMxn;

    return activePoints.map((pt, idx) => {
      const pisoVar = Number((pt.equityMxn * 0.975).toFixed(2));
      const deltaPct =
        startVal > 0 ? Number((((pt.equityMxn - startVal) / startVal) * 100).toFixed(2)) : 0;
      return {
        label:
          idx === 0 && pt.ms === createdAtMs
            ? `Inicio (${formatAxisLabel(pt.timestampIso, spanMs)})`
            : idx === activePoints.length - 1
            ? 'Ahora'
            : formatAxisLabel(pt.timestampIso, spanMs),
        fullTimestamp: new Date(pt.ms).toLocaleString('es-MX', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        eventLabel: pt.eventLabel,
        portafolio: pt.equityMxn,
        pisoVar,
        deltaPct,
      };
    });
  }, [range, currentPortfolioMxn, equityHistory, equityTimeline, createdAtMs]);

  const firstVal = chartData[0]?.portafolio ?? 0;
  const lastVal = chartData[chartData.length - 1]?.portafolio ?? currentPortfolioMxn;
  const periodChangeMxn = lastVal - firstVal;
  const periodChangePct = firstVal > 0 ? (periodChangeMxn / firstVal) * 100 : 0;

  return (
    <div className="p-6 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Evolución Patrimonial del Portafolio (Desde Creación)
            </h3>
            <button
              onClick={() => onOpenTooltip('volatilidad')}
              className="p-1 text-slate-400 hover:text-emerald-500 cursor-pointer"
              aria-label="Explicación de la gráfica de rendimiento"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <CalendarClock className="w-3.5 h-3.5 text-emerald-500" />
              Creado: <strong className="text-slate-700 dark:text-slate-200">{createdFormatted}</strong>
            </span>
            <span>
              Variación neta:{' '}
              <span
                className={`font-mono font-bold tabular-nums ${
                  periodChangeMxn >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {periodChangeMxn >= 0 ? '+' : '-'}$
                {Math.abs(periodChangeMxn).toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                MXN{firstVal > 0 ? ` (${periodChangePct >= 0 ? '+' : ''}${periodChangePct.toFixed(2)}%)` : ''}
              </span>
            </span>
          </div>
        </div>

        {/* Selector de Escala Temporal */}
        <div
          className="inline-flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 self-start md:self-auto"
          role="group"
          aria-label="Seleccionar escala de tiempo"
        >
          {(
            [
              { id: 'ALL', label: 'Desde creación' },
              { id: '24H', label: '24 horas' },
              { id: '7D', label: '7 días' },
              { id: '30D', label: '30 días' },
            ] as { id: TimeRange; label: string }[]
          ).map((scale) => (
            <button
              key={scale.id}
              type="button"
              onClick={() => setRange(scale.id)}
              className={`px-3 py-1.5 rounded text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                range === scale.id
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {scale.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gráfica Interactiva Recharts */}
      <div className="h-72 sm:h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 16, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.28} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              minTickGap={24}
            />
            <YAxis
              domain={[0, 'auto']}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
              width={64}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#090C11',
                borderColor: '#1E293B',
                borderRadius: '0.5rem',
                color: '#f8fafc',
                fontSize: '13px',
              }}
              labelStyle={{ color: '#cbd5e1', fontWeight: 700, marginBottom: '4px' }}
              labelFormatter={(_label, payload) => {
                const pt = payload?.[0]?.payload as { fullTimestamp?: string; eventLabel?: string } | undefined;
                if (!pt) return String(_label);
                return pt.eventLabel ? `${pt.fullTimestamp} · ${pt.eventLabel}` : pt.fullTimestamp || String(_label);
              }}
              formatter={(value: unknown, name: unknown) => {
                const num = Number(value) || 0;
                const label =
                  name === 'portafolio' ? 'Valor del Portafolio' : 'Piso Protegido (VaR 2.5%)';
                return [
                  `$${num.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} MXN`,
                  label,
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="portafolio"
              name="portafolio"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={chartData.length <= 16 ? { r: 3, fill: '#10b981' } : false}
              activeDot={{ r: 5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="pisoVar"
              name="pisoVar"
              stroke="#f43f5e"
              strokeWidth={1.75}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-6">
          <span className="inline-flex items-center gap-2 font-medium">
            <span className="w-4 h-0.5 rounded bg-emerald-500 inline-block" />
            Evolución real desde creación (MXN)
          </span>
          <span className="inline-flex items-center gap-2 font-medium">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-rose-500 inline-block" />
            Piso de resguardo VaR 99% (2.50%)
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
          <ShieldCheck className="w-4 h-4" />
          Resguardo cuantitativo activo
        </span>
      </div>
    </div>
  );
};
