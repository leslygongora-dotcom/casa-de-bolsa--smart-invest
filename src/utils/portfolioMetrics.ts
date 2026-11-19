export interface DrawdownPoint {
  index: number;
  label: string;
  equityMxn: number;
  peakMxn: number;
  drawdownPct: number;
}

export interface PortfolioRiskReturnSummary {
  sharpeRatio: number;
  sharpeLabel: 'Sobresaliente' | 'Óptimo' | 'Moderado' | 'Defensivo';
  sharpeTone: 'positive' | 'neutral' | 'warning';
  maxDrawdownPct: number;
  maxDrawdownMxn: number;
  currentDrawdownPct: number;
  peakEquityMxn: number;
  troughEquityMxn: number;
  cumulativeReturnPct: number;
  annualizedReturnPct: number;
  annualizedVolatilityPct: number;
  riskFreeRateAnnualPct: number;
  sampleCount: number;
  recoveryStatus: 'En máximo histórico' | 'En recuperación' | 'Retroceso activo';
  drawdownSeries: DrawdownPoint[];
}

const TRADING_PERIODS_PER_YEAR = 252;
const RISK_FREE_RATE_ANNUAL = 0.085; // 8.50% CETES / Tasa libre de riesgo de referencia

export function computePortfolioRiskReturn(
  equityHistory: number[],
  currentPortfolioMxn: number
): PortfolioRiskReturnSummary {
  const cleanHistory = equityHistory.filter((v) => Number.isFinite(v) && v > 0);
  const series = [...cleanHistory];

  if (Number.isFinite(currentPortfolioMxn) && currentPortfolioMxn > 0) {
    const last = series[series.length - 1];
    if (last === undefined || Math.abs(last - currentPortfolioMxn) >= 0.01) {
      series.push(Number(currentPortfolioMxn.toFixed(2)));
    }
  }

  if (series.length < 2) {
    const val = series[0] ?? currentPortfolioMxn ?? 100000;
    return {
      sharpeRatio: 0,
      sharpeLabel: 'Moderado',
      sharpeTone: 'neutral',
      maxDrawdownPct: 0,
      maxDrawdownMxn: 0,
      currentDrawdownPct: 0,
      peakEquityMxn: val,
      troughEquityMxn: val,
      cumulativeReturnPct: 0,
      annualizedReturnPct: 0,
      annualizedVolatilityPct: 0,
      riskFreeRateAnnualPct: Number((RISK_FREE_RATE_ANNUAL * 100).toFixed(2)),
      sampleCount: series.length,
      recoveryStatus: 'En máximo histórico',
      drawdownSeries: [
        {
          index: 1,
          label: 'T1',
          equityMxn: val,
          peakMxn: val,
          drawdownPct: 0,
        },
      ],
    };
  }

  // 1. Máximo Drawdown y trayectoria Peak-to-Trough sobre el historial de equity
  let runningPeak = series[0];
  let maxDrawdownPct = 0;
  let maxDrawdownMxn = 0;
  let peakAtMaxDd = series[0];
  let troughAtMaxDd = series[0];

  const drawdownSeries: DrawdownPoint[] = series.map((val, idx) => {
    if (val > runningPeak) {
      runningPeak = val;
    }
    const ddMxn = val - runningPeak;
    const ddPct = runningPeak > 0 ? (ddMxn / runningPeak) * 100 : 0;

    if (ddPct < maxDrawdownPct) {
      maxDrawdownPct = ddPct;
      maxDrawdownMxn = ddMxn;
      peakAtMaxDd = runningPeak;
      troughAtMaxDd = val;
    }

    return {
      index: idx + 1,
      label: idx === series.length - 1 ? 'Actual' : `T-${series.length - 1 - idx}`,
      equityMxn: Number(val.toFixed(2)),
      peakMxn: Number(runningPeak.toFixed(2)),
      drawdownPct: Number(ddPct.toFixed(3)),
    };
  });

  const latestVal = series[series.length - 1];
  const firstVal = series[0];
  const currentDrawdownPct = runningPeak > 0 ? ((latestVal - runningPeak) / runningPeak) * 100 : 0;
  const cumulativeReturnPct = firstVal > 0 ? ((latestVal - firstVal) / firstVal) * 100 : 0;

  // 2. Retornos periódicos y Sharpe Ratio anualizado
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    }
  }

  const n = returns.length;
  const meanReturn = n > 0 ? returns.reduce((sum, r) => sum + r, 0) / n : 0;
  const variance =
    n > 1
      ? returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(Math.max(0, variance));

  const annualizedReturn = meanReturn * TRADING_PERIODS_PER_YEAR;
  const annualizedVol = stdDev * Math.sqrt(TRADING_PERIODS_PER_YEAR);

  // Evitar explosión numérica si la serie aún tiene volatilidad casi nula
  const effectiveVol = Math.max(annualizedVol, 0.015);
  const rawSharpe = (annualizedReturn - RISK_FREE_RATE_ANNUAL) / effectiveVol;
  const sharpeRatio = Number(Math.max(-5, Math.min(8, rawSharpe)).toFixed(2));

  let sharpeLabel: PortfolioRiskReturnSummary['sharpeLabel'] = 'Moderado';
  let sharpeTone: PortfolioRiskReturnSummary['sharpeTone'] = 'neutral';

  if (sharpeRatio >= 2.0) {
    sharpeLabel = 'Sobresaliente';
    sharpeTone = 'positive';
  } else if (sharpeRatio >= 1.0) {
    sharpeLabel = 'Óptimo';
    sharpeTone = 'positive';
  } else if (sharpeRatio >= 0) {
    sharpeLabel = 'Moderado';
    sharpeTone = 'neutral';
  } else {
    sharpeLabel = 'Defensivo';
    sharpeTone = 'warning';
  }

  let recoveryStatus: PortfolioRiskReturnSummary['recoveryStatus'] = 'En máximo histórico';
  if (currentDrawdownPct <= -0.35) {
    recoveryStatus = 'Retroceso activo';
  } else if (currentDrawdownPct < -0.02) {
    recoveryStatus = 'En recuperación';
  }

  return {
    sharpeRatio,
    sharpeLabel,
    sharpeTone,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    maxDrawdownMxn: Number(maxDrawdownMxn.toFixed(2)),
    currentDrawdownPct: Number(currentDrawdownPct.toFixed(2)),
    peakEquityMxn: Number(Math.max(runningPeak, peakAtMaxDd).toFixed(2)),
    troughEquityMxn: Number(troughAtMaxDd.toFixed(2)),
    cumulativeReturnPct: Number(cumulativeReturnPct.toFixed(2)),
    annualizedReturnPct: Number((annualizedReturn * 100).toFixed(2)),
    annualizedVolatilityPct: Number((annualizedVol * 100).toFixed(2)),
    riskFreeRateAnnualPct: Number((RISK_FREE_RATE_ANNUAL * 100).toFixed(2)),
    sampleCount: series.length,
    recoveryStatus,
    drawdownSeries,
  };
}
