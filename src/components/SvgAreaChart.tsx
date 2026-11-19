import React, { useState } from 'react';

interface SvgAreaChartProps {
  data: number[];
  secondaryData?: number[];
  labels?: string[];
  primaryLabel?: string;
  secondaryLabel?: string;
  height?: number;
  accentColor?: string;
  secondaryColor?: string;
  currencyPrefix?: string;
}

export const SvgAreaChart: React.FC<SvgAreaChartProps> = ({
  data,
  secondaryData,
  labels,
  primaryLabel = 'Valor',
  secondaryLabel = 'Piso VaR 2.5%',
  height = 240,
  accentColor = '#4f46e5',
  secondaryColor = '#ef4444',
  currencyPrefix = '$',
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500"
        style={{ height }}
      >
        Sin datos suficientes para graficar
      </div>
    );
  }

  const width = 760;
  const padLeft = 64;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allVals = secondaryData ? [...data, ...secondaryData] : data;
  const minRaw = Math.min(...allVals);
  const maxRaw = Math.max(...allVals);
  const span = Math.max(1e-6, maxRaw - minRaw);
  const minVal = minRaw - span * 0.12;
  const maxVal = maxRaw + span * 0.12;
  const range = maxVal - minVal;

  const getX = (idx: number) => padLeft + (idx / (data.length - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - ((val - minVal) / range) * plotH;

  const primaryPoints = data.map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`).join(' ');
  const areaPath = `M ${getX(0).toFixed(1)},${(padTop + plotH).toFixed(1)} L ${data
    .map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`)
    .join(' L ')} L ${getX(data.length - 1).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;

  const secondaryPoints = secondaryData
    ? secondaryData.map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`).join(' ')
    : null;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const val = minVal + range * (1 - ratio);
    const y = padTop + plotH * ratio;
    return { y, val };
  });

  const activeIdx = hoverIdx !== null ? Math.min(data.length - 1, Math.max(0, hoverIdx)) : data.length - 1;
  const activeVal = data[activeIdx];
  const activeSec = secondaryData ? secondaryData[activeIdx] : undefined;
  const activeLabel = labels?.[activeIdx] ?? `Punto ${activeIdx + 1}`;

  return (
    <div className="w-full select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300">
          <span className="font-medium">
            {activeLabel}:{' '}
            <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
              {currencyPrefix}
              {activeVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </span>
          {activeSec !== undefined && (
            <span className="text-rose-600 dark:text-rose-400">
              {secondaryLabel}:{' '}
              <strong className="font-mono tabular-nums">
                {currencyPrefix}
                {activeSec.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: accentColor }} />
            {primaryLabel}
          </span>
          {secondaryData && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-0.5 border-t-2 border-dashed"
                style={{ borderColor: secondaryColor }}
              />
              {secondaryLabel}
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={`grad-${accentColor.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.22" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {gridLines.map((g, idx) => (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={g.y}
                x2={width - padRight}
                y2={g.y}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={g.y + 4}
                textAnchor="end"
                className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
              >
                {currencyPrefix}
                {g.val >= 1000 ? `${(g.val / 1000).toFixed(1)}k` : g.val.toFixed(1)}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#grad-${accentColor.replace('#', '')})`} />

          <polyline
            fill="none"
            stroke={accentColor}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={primaryPoints}
          />

          {secondaryPoints && (
            <polyline
              fill="none"
              stroke={secondaryColor}
              strokeWidth="1.75"
              strokeDasharray="5 4"
              points={secondaryPoints}
            />
          )}

          {hoverIdx !== null && (
            <line
              x1={getX(activeIdx)}
              y1={padTop}
              x2={getX(activeIdx)}
              y2={padTop + plotH}
              stroke="currentColor"
              className="text-slate-300 dark:text-slate-600"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          <circle
            cx={getX(activeIdx)}
            cy={getY(activeVal)}
            r="4.5"
            fill={accentColor}
            stroke="#ffffff"
            strokeWidth="2"
          />

          {/* Interactive hover columns */}
          {data.map((_, idx) => {
            const colW = plotW / data.length;
            return (
              <rect
                key={idx}
                x={getX(idx) - colW / 2}
                y={padTop}
                width={colW}
                height={plotH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};
