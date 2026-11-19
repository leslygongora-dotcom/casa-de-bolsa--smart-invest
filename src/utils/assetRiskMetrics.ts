import { StockAsset } from '../types';
import { computePairwiseCorrelation } from './correlationMatrix';

export interface CompanyRiskMetrics {
  symbol: string;
  var99DailyPct: number; // e.g. -3.57 (negative percentage)
  var99On10kMxn: number; // e.g. 357.00 MXN
  cvar99DailyPct: number; // Expected Shortfall (always <= var99DailyPct, e.g. -4.11)
  cvar99On10kMxn: number; // e.g. 411.00 MXN
  beta: number; // Market beta relative to SPY benchmark
  betaLabel: string;
  stdDevAnnualPct: number; // Desviación estándar anualizada (%)
  stdDevDailyPct: number; // Desviación estándar diaria (%)
  sharpeRatio: number;
  sharpeLabel: string;
  maxDrawdownPct: number; // Negative % e.g. -2.15
  sortinoRatio: number;
  sortinoLabel: string;
  downsideDevAnnualPct: number;
}

export const ASSET_RISK_FREE_RATE_PCT = 8.5; // 8.50% CETES / Tasa libre de riesgo de referencia
const TRADING_DAYS_PER_YEAR = 252;
const Z_99 = 2.3263;
// Standard normal PDF at z = 2.3263 divided by tail probability (1 - 0.99 = 0.01) => ~2.6652 * sigma
const NORMAL_CVAR_99_MULT = 2.6652;

function getPriceSeries(asset: StockAsset): number[] {
  const base = asset.history.filter((p) => Number.isFinite(p) && p > 0);
  if (base.length === 0) return [asset.priceMxn];
  const last = base[base.length - 1];
  if (Math.abs(last - asset.priceMxn) > 0.0001) {
    return [...base, asset.priceMxn];
  }
  return base;
}

export function computeCompanyRiskMetrics(
  asset: StockAsset,
  benchmarkAsset?: StockAsset
): CompanyRiskMetrics {
  const series = getPriceSeries(asset);
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    if (prev > 0) {
      returns.push((series[i] - prev) / prev);
    }
  }

  // 1. Desviación estándar (diaria y anualizada)
  const structuralAnnualVolPct = Math.max(2, asset.volatilityAnnualPct);
  const structuralDailyVol = structuralAnnualVolPct / 100 / Math.sqrt(TRADING_DAYS_PER_YEAR);

  let empiricalDailyStd = structuralDailyVol;
  if (returns.length >= 4) {
    const meanR = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance =
      returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (returns.length - 1);
    empiricalDailyStd = Math.sqrt(Math.max(0, variance));
  }

  // Blend structural volatility (75%) + live intraday empirical std dev (25%) for realism & stability
  const blendedDailyStd = 0.75 * structuralDailyVol + 0.25 * empiricalDailyStd;
  const stdDevDailyPct = Number((blendedDailyStd * 100).toFixed(2));
  const stdDevAnnualPct = Number(
    (blendedDailyStd * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100).toFixed(2)
  );

  // 2. VaR 99% diario (Value at Risk)
  const dailyDrift = asset.annualReturnPct / 100 / TRADING_DAYS_PER_YEAR;
  const parametricVar99 = Math.max(0.002, Z_99 * blendedDailyStd - dailyDrift * 0.25);

  let empiricalVar99 = parametricVar99;
  if (returns.length >= 8) {
    const sorted = [...returns].sort((a, b) => a - b);
    const worstLoss = -sorted[0];
    if (worstLoss > 0) {
      empiricalVar99 = Math.max(parametricVar99 * 0.7, worstLoss);
    }
  }
  const var99Decimal = 0.75 * parametricVar99 + 0.25 * empiricalVar99;
  const var99DailyPct = -Number((var99Decimal * 100).toFixed(2));
  const var99On10kMxn = Number((10000 * var99Decimal).toFixed(2));

  // 3. CVaR 99% diario (Expected Shortfall — pérdida esperada en la cola más allá del VaR)
  const parametricCvar99 = Math.max(
    var99Decimal * 1.14,
    NORMAL_CVAR_99_MULT * blendedDailyStd - dailyDrift * 0.25
  );
  let tailAvgLoss = parametricCvar99;
  const negativeReturns = returns.filter((r) => r < 0).sort((a, b) => a - b);
  if (negativeReturns.length >= 2) {
    const tailCount = Math.max(1, Math.ceil(negativeReturns.length * 0.2));
    const avgTail =
      negativeReturns.slice(0, tailCount).reduce((s, r) => s + Math.abs(r), 0) / tailCount;
    tailAvgLoss = Math.max(var99Decimal * 1.1, avgTail);
  }
  const cvar99Decimal = Math.max(
    var99Decimal * 1.12,
    0.75 * parametricCvar99 + 0.25 * tailAvgLoss
  );
  const cvar99DailyPct = -Number((cvar99Decimal * 100).toFixed(2));
  const cvar99On10kMxn = Number((10000 * cvar99Decimal).toFixed(2));

  // 4. Beta (β) respecto al índice de referencia (SPY)
  let beta = 1.0;
  if (benchmarkAsset && benchmarkAsset.symbol !== asset.symbol) {
    const corrWithMarket = computePairwiseCorrelation(asset, benchmarkAsset);
    const benchVol = Math.max(1, benchmarkAsset.volatilityAnnualPct);
    const rawBeta = corrWithMarket * (stdDevAnnualPct / benchVol);
    beta = Number(Math.max(-1.5, Math.min(3.5, rawBeta)).toFixed(2));
  } else if (!benchmarkAsset && asset.symbol !== 'SPY') {
    beta = Number((stdDevAnnualPct / 18.2).toFixed(2));
  }

  let betaLabel = 'Sensibilidad similar al mercado';
  if (Math.abs(beta - 1) <= 0.12) {
    betaLabel = 'Se mueve en línea con el S&P 500';
  } else if (beta < 0) {
    betaLabel = 'Movimiento inverso (cobertura)';
  } else if (beta < 0.88) {
    betaLabel = 'Defensiva (menos volátil que SPY)';
  } else {
    betaLabel = 'Agresiva (amplifica movimientos)';
  }

  // 5. Máximo Drawdown sobre la serie reciente del activo
  let peak = series[0];
  let maxDd = 0;
  for (const val of series) {
    if (val > peak) peak = val;
    if (peak > 0) {
      const dd = ((val - peak) / peak) * 100; // negative or 0
      if (dd < maxDd) maxDd = dd;
    }
  }
  // Ensure realistic minimum drawdown display if intraday drop occurred
  const maxDrawdownPct = Number(maxDd.toFixed(2));

  // 6. Sharpe Ratio anualizado
  const excessReturnPct = asset.annualReturnPct - ASSET_RISK_FREE_RATE_PCT;
  const sharpeRatio =
    stdDevAnnualPct > 0
      ? Number((excessReturnPct / stdDevAnnualPct).toFixed(2))
      : 0;

  let sharpeLabel = 'Moderado';
  if (sharpeRatio >= 1.5) sharpeLabel = 'Sobresaliente';
  else if (sharpeRatio >= 1.0) sharpeLabel = 'Óptimo';
  else if (sharpeRatio >= 0.4) sharpeLabel = 'Aceptable';
  else sharpeLabel = 'Bajo / Riesgo elevado';

  // 7. Sortino Ratio (penaliza únicamente la volatilidad bajista / downside deviation)
  const dailyMar = ASSET_RISK_FREE_RATE_PCT / 100 / TRADING_DAYS_PER_YEAR;
  let empiricalDownsideAnnualPct = stdDevAnnualPct * 0.65;
  if (returns.length >= 4) {
    const sqDownside = returns.reduce((sum, r) => {
      const diff = Math.min(0, r - dailyMar);
      return sum + diff * diff;
    }, 0);
    const dailyDownside = Math.sqrt(sqDownside / returns.length);
    empiricalDownsideAnnualPct = dailyDownside * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
  }
  // Structural downside ratio (~62% of total vol for growth stocks, higher for negative-skew assets)
  const structuralDownsidePct =
    asset.changePct < 0 ? stdDevAnnualPct * 0.74 : stdDevAnnualPct * 0.64;
  const downsideDevAnnualPct = Number(
    Math.max(
      stdDevAnnualPct * 0.45,
      0.7 * structuralDownsidePct + 0.3 * empiricalDownsideAnnualPct
    ).toFixed(2)
  );
  const sortinoRatio =
    downsideDevAnnualPct > 0
      ? Number((excessReturnPct / downsideDevAnnualPct).toFixed(2))
      : sharpeRatio;

  let sortinoLabel = 'Moderado';
  if (sortinoRatio >= 2.0) sortinoLabel = 'Excelente protección bajista';
  else if (sortinoRatio >= 1.2) sortinoLabel = 'Buen retorno asimétrico';
  else if (sortinoRatio >= 0.5) sortinoLabel = 'Equilibrado';
  else sortinoLabel = 'Exposición bajista alta';

  return {
    symbol: asset.symbol,
    var99DailyPct,
    var99On10kMxn,
    cvar99DailyPct,
    cvar99On10kMxn,
    beta,
    betaLabel,
    stdDevAnnualPct,
    stdDevDailyPct,
    sharpeRatio,
    sharpeLabel,
    maxDrawdownPct,
    sortinoRatio,
    sortinoLabel,
    downsideDevAnnualPct,
  };
}
