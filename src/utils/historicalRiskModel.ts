import type { DefinitiveProfileKey, IssWeights } from '../firebase';
import type { PortfolioPosition, StockAsset } from '../types';
import type { InvestorEvaluationResult } from './investorProfileEngine';

export interface HistoricalPricePoint {
  date: string;
  close: number;
  volume: number | null;
}

export interface HistoricalMarketResponse {
  available: boolean;
  symbol: string;
  yahooTicker?: string;
  benchmarkTicker?: string;
  benchmarkName?: string;
  marketLabel?: string;
  tradingDaysPerYear?: number;
  frequency?: string;
  dataSource?: string;
  originalCurrency?: string;
  usdMxnRate?: number;
  latestPriceOriginal?: number;
  latestPriceMxn?: number;
  observationsCount?: number;
  periodStartDate?: string;
  periodEndDate?: string;
  updatedAtIso?: string;
  reason?: string;
  assetPoints?: HistoricalPricePoint[];
  benchmarkPoints?: HistoricalPricePoint[];
}

export interface HistoricalRiskCalculations {
  available: boolean;
  unavailableReason?: string;
  symbol: string;
  yahooTicker: string;
  benchmarkName: string;
  marketLabel: string;
  dataSource: string;
  frequency: string;
  periodLabel: string;
  observationsCount: number;
  updatedAtIso: string;
  originalCurrency: string;
  usdMxnRate: number;
  latestPriceOriginal: number;
  latestPriceMxn: number;
  riskFreeRateAnnualPct: number;

  // 7 Métricas Reales
  var99DailyPct: number; // Positive magnitude of loss or signed negative: we store signed negative e.g. -3.42%
  var99LossPer10kMxn: number;
  cvar99DailyPct: number; // Signed negative e.g. -4.85%
  cvar99LossPer10kMxn: number;
  beta: number | null; // null if benchmark paired returns insufficient
  dailyStdDevPct: number;
  annualVolatilityPct: number;
  annualizedReturnPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  downsideDevAnnualPct: number;
  maxDrawdownPct: number; // negative e.g. -18.42%
  maxDrawdownPeakDate: string;
  maxDrawdownTroughDate: string;

  // Technical & Liquidity indicators (for independent decision engine)
  avgDailyVolume: number | null;
  avgDailyTurnoverMxn: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  momentum20Pct: number | null;
}

export interface IssSubScores {
  vScore: number; // Volatility normalized 0..100
  cScore: number; // CVaR normalized 0..100
  bScore: number; // Beta normalized 0..100
  dScore: number; // Max Drawdown normalized 0..100
  sScore: number; // Sharpe normalized 0..100
}

export interface IssSuitabilityResult {
  score: number; // 0..100
  band: 'alta' | 'moderada' | 'baja';
  trafficLight: 'verde' | 'amarillo' | 'rojo';
  label: string;
  explanation: string;
  subScores: IssSubScores;
  weightsUsed: IssWeights;
}

export interface DecisionFactor {
  factor: string;
  status: 'favorable' | 'neutral' | 'precaucion';
  detail: string;
}

export interface DecisionEngineResult {
  signal: 'BUY' | 'HOLD' | 'SELL';
  headline: string;
  summary: string;
  conflictWithProfile: boolean;
  conflictWarning?: string;
  factors: DecisionFactor[];
}

export const DEFAULT_ISS_WEIGHTS: IssWeights = {
  v: 0.25,
  c: 0.25,
  b: 0.20,
  d: 0.15,
  s: 0.15,
};

const MIN_REQUIRED_RETURNS = 60;

export function normalizeIssWeights(weights: IssWeights): IssWeights {
  const sum = weights.v + weights.c + weights.b + weights.d + weights.s;
  if (!Number.isFinite(sum) || sum <= 0) return { ...DEFAULT_ISS_WEIGHTS };
  return {
    v: Number((weights.v / sum).toFixed(4)),
    c: Number((weights.c / sum).toFixed(4)),
    b: Number((weights.b / sum).toFixed(4)),
    d: Number((weights.d / sum).toFixed(4)),
    s: Number((weights.s / sum).toFixed(4)),
  };
}

function clamp0to100(val: number): number {
  return Number(Math.max(0, Math.min(100, val)).toFixed(1));
}

export function computeHistoricalRiskFromSeries(
  resp: HistoricalMarketResponse
): HistoricalRiskCalculations {
  if (
    !resp.available ||
    !Array.isArray(resp.assetPoints) ||
    resp.assetPoints.length < MIN_REQUIRED_RETURNS + 1
  ) {
    return {
      available: false,
      unavailableReason:
        resp.reason ||
        `Se requieren al menos ${MIN_REQUIRED_RETURNS} retornos diarios reales para calcular VaR 99% histórico, CVaR y Beta sin inventar datos (actuales: ${
          resp.assetPoints?.length ?? resp.observationsCount ?? 0
        }).`,
      symbol: resp.symbol,
      yahooTicker: resp.yahooTicker || resp.symbol,
      benchmarkName: resp.benchmarkName || 'No disponible',
      marketLabel: resp.marketLabel || 'Sin fuente',
      dataSource: resp.dataSource || 'No disponible',
      frequency: resp.frequency || 'Diaria (1D)',
      periodLabel: 'No disponible',
      observationsCount: resp.observationsCount || resp.assetPoints?.length || 0,
      updatedAtIso: resp.updatedAtIso || new Date().toISOString(),
      originalCurrency: resp.originalCurrency || 'MXN',
      usdMxnRate: resp.usdMxnRate || 1,
      latestPriceOriginal: resp.latestPriceOriginal || 0,
      latestPriceMxn: resp.latestPriceMxn || 0,
      riskFreeRateAnnualPct: 0,
      var99DailyPct: 0,
      var99LossPer10kMxn: 0,
      cvar99DailyPct: 0,
      cvar99LossPer10kMxn: 0,
      beta: null,
      dailyStdDevPct: 0,
      annualVolatilityPct: 0,
      annualizedReturnPct: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      downsideDevAnnualPct: 0,
      maxDrawdownPct: 0,
      maxDrawdownPeakDate: 'N/A',
      maxDrawdownTroughDate: 'N/A',
      avgDailyVolume: null,
      avgDailyTurnoverMxn: null,
      sma20: null,
      sma50: null,
      rsi14: null,
      momentum20Pct: null,
    };
  }

  const pts = resp.assetPoints;
  const tradingDays = resp.tradingDaysPerYear || 252;
  const origCurrency = resp.originalCurrency || 'USD';
  // CETES ~8.5% para acciones en MXN, US T-Bill ~4.5% para activos en USD
  const riskFreeAnnual = origCurrency === 'MXN' ? 0.085 : 0.045;
  const usdMxnRate = resp.usdMxnRate || 1;

  // Compute daily simple returns paired with dates
  const dailyReturns: Array<{ date: string; ret: number }> = [];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1].close;
    const curr = pts[i].close;
    if (prev > 0 && curr > 0) {
      dailyReturns.push({
        date: pts[i].date,
        ret: (curr - prev) / prev,
      });
    }
  }

  if (dailyReturns.length < MIN_REQUIRED_RETURNS) {
    return computeHistoricalRiskFromSeries({
      ...resp,
      available: false,
      reason: `Retornos diarios válidos insuficientes (${dailyReturns.length}/${MIN_REQUIRED_RETURNS}).`,
    });
  }

  const rawReturns = dailyReturns.map((d) => d.ret);
  const n = rawReturns.length;

  // A. Historical VaR 99% = -Percentile 1% of empirical returns
  const sortedReturns = [...rawReturns].sort((a, b) => a - b);
  const exactIndex = 0.01 * (n - 1);
  const lowIdx = Math.floor(exactIndex);
  const highIdx = Math.ceil(exactIndex);
  const weight = exactIndex - lowIdx;
  const percentile1 =
    lowIdx === highIdx
      ? sortedReturns[lowIdx]
      : sortedReturns[lowIdx] * (1 - weight) + sortedReturns[highIdx] * weight;

  // Keep negative sign for loss clarity, e.g., -4.15%
  const var99DailyDecimal = percentile1 < 0 ? Math.abs(percentile1) : 0;
  const var99DailyPct = -Number((var99DailyDecimal * 100).toFixed(2));
  const var99LossPer10kMxn = Number((10000 * var99DailyDecimal).toFixed(2));

  // B. Conditional Value at Risk (CVaR 99% / Expected Shortfall) = average of worst 1% tail returns
  const tailReturns = sortedReturns.filter((r) => r <= percentile1);
  const tailSlice = tailReturns.length > 0 ? tailReturns : [sortedReturns[0]];
  const meanTail = tailSlice.reduce((s, r) => s + r, 0) / tailSlice.length;
  const cvar99Decimal = meanTail < 0 ? Math.abs(meanTail) : var99DailyDecimal;
  const cvar99DailyPct = -Number((cvar99Decimal * 100).toFixed(2));
  const cvar99LossPer10kMxn = Number((10000 * cvar99Decimal).toFixed(2));

  // C. Beta = Cov(r_asset, r_benchmark) / Var(r_benchmark)
  let beta: number | null = null;
  if (Array.isArray(resp.benchmarkPoints) && resp.benchmarkPoints.length >= MIN_REQUIRED_RETURNS + 1) {
    const benchPts = resp.benchmarkPoints;
    const benchReturnMap = new Map<string, number>();
    for (let i = 1; i < benchPts.length; i++) {
      const prev = benchPts[i - 1].close;
      const curr = benchPts[i].close;
      if (prev > 0 && curr > 0) {
        benchReturnMap.set(benchPts[i].date, (curr - prev) / prev);
      }
    }

    const pairedA: number[] = [];
    const pairedB: number[] = [];
    for (const item of dailyReturns) {
      const bRet = benchReturnMap.get(item.date);
      if (bRet !== undefined && Number.isFinite(bRet)) {
        pairedA.push(item.ret);
        pairedB.push(bRet);
      }
    }

    if (pairedA.length >= 30) {
      const mA = pairedA.reduce((s, v) => s + v, 0) / pairedA.length;
      const mB = pairedB.reduce((s, v) => s + v, 0) / pairedB.length;
      let cov = 0;
      let varB = 0;
      for (let i = 0; i < pairedA.length; i++) {
        cov += (pairedA[i] - mA) * (pairedB[i] - mB);
        varB += (pairedB[i] - mB) ** 2;
      }
      if (varB > 1e-12) {
        beta = Number((cov / varB).toFixed(2));
      }
    }
  }

  // D. Standard deviation & Annualized volatility
  const meanDaily = rawReturns.reduce((s, r) => s + r, 0) / n;
  const sampleVar = rawReturns.reduce((s, r) => s + (r - meanDaily) ** 2, 0) / (n - 1);
  const dailyStdDev = Math.sqrt(Math.max(0, sampleVar));
  const annualVol = dailyStdDev * Math.sqrt(tradingDays);

  const dailyStdDevPct = Number((dailyStdDev * 100).toFixed(2));
  const annualVolatilityPct = Number((annualVol * 100).toFixed(2));

  // E. Sharpe Ratio = (R_annual - R_f) / sigma_annual
  const annualizedReturn = meanDaily * tradingDays;
  const annualizedReturnPct = Number((annualizedReturn * 100).toFixed(2));
  const sharpeRatio =
    annualVol > 1e-9 ? Number(((annualizedReturn - riskFreeAnnual) / annualVol).toFixed(2)) : 0;

  // F. Sortino Ratio (Downside Deviation below daily risk-free MAR)
  const dailyMar = riskFreeAnnual / tradingDays;
  const downsideSqSum = rawReturns.reduce((sum, r) => {
    const diff = Math.min(0, r - dailyMar);
    return sum + diff * diff;
  }, 0);
  const dailyDownsideDev = Math.sqrt(downsideSqSum / n);
  const annualDownsideDev = dailyDownsideDev * Math.sqrt(tradingDays);
  const downsideDevAnnualPct = Number((annualDownsideDev * 100).toFixed(2));
  const sortinoRatio =
    annualDownsideDev > 1e-9
      ? Number(((annualizedReturn - riskFreeAnnual) / annualDownsideDev).toFixed(2))
      : 0;

  // G. Maximum Drawdown over historical series
  let peakPrice = pts[0].close;
  let peakDateTemp = pts[0].date;
  let maxDd = 0;
  let maxDdPeakDate = pts[0].date;
  let maxDdTroughDate = pts[0].date;

  for (const pt of pts) {
    if (pt.close > peakPrice) {
      peakPrice = pt.close;
      peakDateTemp = pt.date;
    }
    if (peakPrice > 0) {
      const dd = (pt.close - peakPrice) / peakPrice; // <= 0
      if (dd < maxDd) {
        maxDd = dd;
        maxDdPeakDate = peakDateTemp;
        maxDdTroughDate = pt.date;
      }
    }
  }
  const maxDrawdownPct = Number((maxDd * 100).toFixed(2));

  // Technical & liquidity metrics from real series
  const recentVolumes = pts
    .slice(-20)
    .map((p) => p.volume)
    .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  const avgDailyVolume =
    recentVolumes.length >= 5
      ? Math.round(recentVolumes.reduce((s, v) => s + v, 0) / recentVolumes.length)
      : null;
  const latestClose = resp.latestPriceOriginal ?? pts[pts.length - 1].close;
  const avgDailyTurnoverMxn =
    avgDailyVolume !== null ? Number((avgDailyVolume * latestClose * usdMxnRate).toFixed(0)) : null;

  const closes = pts.map((p) => p.close);
  const sma20 =
    closes.length >= 20
      ? Number((closes.slice(-20).reduce((s, c) => s + c, 0) / 20).toFixed(4))
      : null;
  const sma50 =
    closes.length >= 50
      ? Number((closes.slice(-50).reduce((s, c) => s + c, 0) / 50).toFixed(4))
      : null;
  const momentum20Pct =
    closes.length >= 21 && closes[closes.length - 21] > 0
      ? Number((((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]) * 100).toFixed(2))
      : null;

  // 14-day Wilder-style simple RSI
  let rsi14: number | null = null;
  if (closes.length >= 15) {
    let gains = 0;
    let losses = 0;
    const recent = closes.slice(-15);
    for (let i = 1; i < recent.length; i++) {
      const delta = recent[i] - recent[i - 1];
      if (delta >= 0) gains += delta;
      else losses += Math.abs(delta);
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    if (avgLoss === 0) rsi14 = 100;
    else {
      const rs = avgGain / avgLoss;
      rsi14 = Number((100 - 100 / (1 + rs)).toFixed(1));
    }
  }

  return {
    available: true,
    symbol: resp.symbol,
    yahooTicker: resp.yahooTicker || resp.symbol,
    benchmarkName: resp.benchmarkName || 'Índice de mercado',
    marketLabel: resp.marketLabel || 'Mercado bursátil',
    dataSource: resp.dataSource || 'Serie histórica diaria',
    frequency: resp.frequency || 'Diaria (1D)',
    periodLabel: `${resp.periodStartDate || pts[0].date} al ${resp.periodEndDate || pts[pts.length - 1].date}`,
    observationsCount: pts.length,
    updatedAtIso: resp.updatedAtIso || new Date().toISOString(),
    originalCurrency: origCurrency,
    usdMxnRate,
    latestPriceOriginal: Number(latestClose.toFixed(4)),
    latestPriceMxn: resp.latestPriceMxn ?? Number((latestClose * usdMxnRate).toFixed(2)),
    riskFreeRateAnnualPct: Number((riskFreeAnnual * 100).toFixed(2)),
    var99DailyPct,
    var99LossPer10kMxn,
    cvar99DailyPct,
    cvar99LossPer10kMxn,
    beta,
    dailyStdDevPct,
    annualVolatilityPct,
    annualizedReturnPct,
    sharpeRatio,
    sortinoRatio,
    downsideDevAnnualPct,
    maxDrawdownPct,
    maxDrawdownPeakDate: maxDdPeakDate,
    maxDrawdownTroughDate: maxDdTroughDate,
    avgDailyVolume,
    avgDailyTurnoverMxn,
    sma20,
    sma50,
    rsi14,
    momentum20Pct,
  };
}

/**
 * Investment Suitability Score (ISS)
 * ISS = wV * V + wC * C + wB * B + wD * D + wS * S (default 0.25V + 0.25C + 0.20B + 0.15D + 0.15S)
 * Evaluates risk compatibility per investor profile (NEVER profit probability).
 */
export function computeInvestmentSuitabilityScore(
  metrics: HistoricalRiskCalculations,
  profileKey: DefinitiveProfileKey,
  rawWeights: IssWeights = DEFAULT_ISS_WEIGHTS
): IssSuitabilityResult | null {
  if (!metrics.available) return null;

  const w = normalizeIssWeights(rawWeights);

  // Profile thresholds (max comfortable annual vol, daily CVaR magnitude, Beta ceiling, MaxDD magnitude)
  const thresholds: Record<
    DefinitiveProfileKey,
    { maxVol: number; maxCvar: number; idealBetaMax: number; maxDd: number; minSharpe: number }
  > = {
    conservador: { maxVol: 18, maxCvar: 3.0, idealBetaMax: 0.90, maxDd: 14, minSharpe: 0.4 },
    moderado: { maxVol: 26, maxCvar: 4.5, idealBetaMax: 1.15, maxDd: 22, minSharpe: 0.5 },
    crecimiento: { maxVol: 38, maxCvar: 6.5, idealBetaMax: 1.45, maxDd: 32, minSharpe: 0.55 },
    agresivo: { maxVol: 58, maxCvar: 9.5, idealBetaMax: 2.0, maxDd: 48, minSharpe: 0.5 },
  };

  const t = thresholds[profileKey];

  // V: Volatilidad (mayor volatilidad reduce la puntuación de compatibilidad)
  const vScore = clamp0to100(100 * Math.exp(-Math.pow(metrics.annualVolatilityPct / t.maxVol, 1.45) * 0.48));

  // C: CVaR 99% (mayor pérdida potencial de cola reduce la puntuación)
  const cvarMag = Math.abs(metrics.cvar99DailyPct);
  const cScore = clamp0to100(100 * Math.exp(-Math.pow(cvarMag / t.maxCvar, 1.45) * 0.48));

  // B: Beta (sensibilidad excesiva al mercado reduce puntuación según perfil)
  const absBeta = metrics.beta !== null ? Math.abs(metrics.beta) : 1.0;
  const bScore =
    absBeta <= t.idealBetaMax
      ? clamp0to100(100 - (absBeta / t.idealBetaMax) * 18)
      : clamp0to100(82 - ((absBeta - t.idealBetaMax) / Math.max(0.4, t.idealBetaMax)) * 68);

  // D: Maximum Drawdown (mayor caída histórica reduce la puntuación)
  const ddMag = Math.abs(metrics.maxDrawdownPct);
  const dScore = clamp0to100(100 * Math.exp(-Math.pow(ddMag / t.maxDd, 1.4) * 0.48));

  // S: Sharpe Ratio + calidad/estabilidad de datos (observationsCount >= 200 da factor 1.0)
  const dataQualityFactor = Math.min(1, metrics.observationsCount / 220);
  const sharpeBase =
    metrics.sharpeRatio <= 0
      ? Math.max(8, 30 + metrics.sharpeRatio * 15)
      : Math.min(100, 35 + (metrics.sharpeRatio / (t.minSharpe + 1.2)) * 62);
  const sScore = clamp0to100(sharpeBase * (0.8 + 0.2 * dataQualityFactor));

  const rawIss = w.v * vScore + w.c * cScore + w.b * bScore + w.d * dScore + w.s * sScore;
  const score = Math.round(clamp0to100(rawIss));

  let band: IssSuitabilityResult['band'] = 'baja';
  let trafficLight: IssSuitabilityResult['trafficLight'] = 'rojo';
  let label = 'Compatibilidad Baja';
  let explanation =
    'El nivel de volatilidad o pérdida extrema histórica de esta acción excede el rango cómodo para tu perfil y capacidad financiera.';

  if (score >= 80) {
    band = 'alta';
    trafficLight = 'verde';
    label = 'Compatibilidad Alta';
    explanation =
      'Su perfil de riesgo histórico (volatilidad, CVaR, Beta y caídas máximas) encaja adecuadamente con tu tolerancia y capacidad financiera.';
  } else if (score >= 60) {
    band = 'moderada';
    trafficLight = 'amarillo';
    label = 'Compatibilidad Moderada';
    explanation =
      'Es operable para tu perfil, pero requiere cuidar el monto invertido, diversificar y mantener activo un Stop Loss.';
  }

  return {
    score,
    band,
    trafficLight,
    label,
    explanation,
    subScores: { vScore, cScore, bScore, dScore, sScore },
    weightsUsed: w,
  };
}

/**
 * Motor de Decisiones independiente del ISS.
 * Evalúa: Riesgo, Rendimiento esperado, Liquidez, Tendencia, Indicadores técnicos,
 * Diversificación, Horizonte de inversión y Capacidad financiera del usuario.
 */
export function computeIndependentDecisionEngine(params: {
  metrics: HistoricalRiskCalculations;
  asset: StockAsset;
  positions: PortfolioPosition[];
  evaluation: InvestorEvaluationResult | null;
  iss: IssSuitabilityResult | null;
}): DecisionEngineResult | null {
  const { metrics, asset, positions, evaluation, iss } = params;
  if (!metrics.available) return null;

  const factors: DecisionFactor[] = [];
  let quantitativeScore = 0;

  // 1. Riesgo (VaR / Volatilidad)
  if (metrics.annualVolatilityPct <= 24) {
    quantitativeScore += 1;
    factors.push({
      factor: '1. Riesgo histórico (VaR / Volatilidad)',
      status: 'favorable',
      detail: `Volatilidad anualizada controlada (${metrics.annualVolatilityPct.toFixed(1)}%) y VaR 99% de ${metrics.var99DailyPct.toFixed(2)}%.`,
    });
  } else if (metrics.annualVolatilityPct <= 38) {
    factors.push({
      factor: '1. Riesgo histórico (VaR / Volatilidad)',
      status: 'neutral',
      detail: `Volatilidad media-alta (${metrics.annualVolatilityPct.toFixed(1)}%); requiere gestión de tamaño de orden.`,
    });
  } else {
    quantitativeScore -= 1;
    factors.push({
      factor: '1. Riesgo histórico (VaR / Volatilidad)',
      status: 'precaucion',
      detail: `Volatilidad elevada (${metrics.annualVolatilityPct.toFixed(1)}%) con cola CVaR 99% de ${metrics.cvar99DailyPct.toFixed(2)}%.`,
    });
  }

  // 2. Rendimiento ajustado esperado (Sharpe & Sortino)
  if (metrics.sharpeRatio >= 0.8 && metrics.sortinoRatio >= 1.0) {
    quantitativeScore += 2;
    factors.push({
      factor: '2. Rendimiento ajustado al riesgo',
      status: 'favorable',
      detail: `Retorno anualizado ${metrics.annualizedReturnPct >= 0 ? '+' : ''}${metrics.annualizedReturnPct.toFixed(1)}% con Sharpe ${metrics.sharpeRatio.toFixed(2)} y Sortino ${metrics.sortinoRatio.toFixed(2)}.`,
    });
  } else if (metrics.sharpeRatio >= 0.2) {
    quantitativeScore += 0.5;
    factors.push({
      factor: '2. Rendimiento ajustado al riesgo',
      status: 'neutral',
      detail: `Desempeño moderado (Sharpe ${metrics.sharpeRatio.toFixed(2)}); compensa parcialmente el riesgo asumido.`,
    });
  } else {
    quantitativeScore -= 2;
    factors.push({
      factor: '2. Rendimiento ajustado al riesgo',
      status: 'precaucion',
      detail: `Sharpe débil (${metrics.sharpeRatio.toFixed(2)}) frente a la tasa libre de riesgo (${metrics.riskFreeRateAnnualPct}%).`,
    });
  }

  // 3. Liquidez (Volumen real operado)
  if (metrics.avgDailyTurnoverMxn !== null && metrics.avgDailyTurnoverMxn >= 50_000_000) {
    quantitativeScore += 1;
    factors.push({
      factor: '3. Liquidez diaria',
      status: 'favorable',
      detail: `Alta liquidez promedio (${(metrics.avgDailyVolume || 0).toLocaleString('es-MX')} títulos/día), fácil entrada y salida.`,
    });
  } else if (metrics.avgDailyVolume !== null && metrics.avgDailyVolume > 0) {
    factors.push({
      factor: '3. Liquidez diaria',
      status: 'neutral',
      detail: `Volumen promedio de ${metrics.avgDailyVolume.toLocaleString('es-MX')} unidades/día; se recomienda orden límite.`,
    });
  } else {
    factors.push({
      factor: '3. Liquidez diaria',
      status: 'neutral',
      detail: 'Sin datos de volumen intradía suficientes para calificar profundidad.',
    });
  }

  // 4. Tendencia (SMA20 vs SMA50 y precio actual)
  const price = metrics.latestPriceOriginal;
  if (metrics.sma20 !== null && metrics.sma50 !== null) {
    if (price > metrics.sma20 && metrics.sma20 >= metrics.sma50) {
      quantitativeScore += 2;
      factors.push({
        factor: '4. Tendencia (SMA 20 / SMA 50)',
        status: 'favorable',
        detail: 'Tendencia alcista confirmada: precio sobre SMA 20 y SMA 20 arriba de SMA 50.',
      });
    } else if (price < metrics.sma20 && metrics.sma20 < metrics.sma50) {
      quantitativeScore -= 2;
      factors.push({
        factor: '4. Tendencia (SMA 20 / SMA 50)',
        status: 'precaucion',
        detail: 'Tendencia bajista: precio por debajo de sus promedios móviles de 20 y 50 días.',
      });
    } else {
      factors.push({
        factor: '4. Tendencia (SMA 20 / SMA 50)',
        status: 'neutral',
        detail: 'Tendencia lateral o en transición entre promedios móviles.',
      });
    }
  }

  // 5. Indicadores técnicos (RSI 14 y Momentum 20d)
  if (metrics.rsi14 !== null) {
    if (metrics.rsi14 >= 45 && metrics.rsi14 <= 68) {
      quantitativeScore += 1;
      factors.push({
        factor: '5. Indicadores técnicos (RSI 14)',
        status: 'favorable',
        detail: `RSI en ${metrics.rsi14.toFixed(1)} (impulso sano sin sobrecompra extrema; momentum 20d: ${metrics.momentum20Pct ?? 0}%).`,
      });
    } else if (metrics.rsi14 > 74) {
      quantitativeScore -= 1;
      factors.push({
        factor: '5. Indicadores técnicos (RSI 14)',
        status: 'precaucion',
        detail: `RSI en ${metrics.rsi14.toFixed(1)} (sobrecompra): riesgo de toma de utilidades en el corto plazo.`,
      });
    } else if (metrics.rsi14 < 32) {
      quantitativeScore -= 0.5;
      factors.push({
        factor: '5. Indicadores técnicos (RSI 14)',
        status: 'neutral',
        detail: `RSI en ${metrics.rsi14.toFixed(1)} (sobreventa): conviene esperar confirmación de piso antes de entrar.`,
      });
    } else {
      factors.push({
        factor: '5. Indicadores técnicos (RSI 14)',
        status: 'neutral',
        detail: `RSI neutral en ${metrics.rsi14.toFixed(1)} (momentum 20d: ${metrics.momentum20Pct ?? 0}%).`,
      });
    }
  }

  // 6. Diversificación en cartera actual
  const sameSectorCount = positions.filter((p) => p.sector === asset.sector && p.symbol !== asset.symbol).length;
  if (sameSectorCount === 0) {
    quantitativeScore += 0.5;
    factors.push({
      factor: '6. Diversificación sectorial',
      status: 'favorable',
      detail: `Aporta exposición al sector ${asset.sector} sin duplicar posiciones actuales.`,
    });
  } else {
    factors.push({
      factor: '6. Diversificación sectorial',
      status: 'precaucion',
      detail: `Ya tienes ${sameSectorCount} activo(s) en ${asset.sector}; agregar más eleva concentración.`,
    });
  }

  // 7. Horizonte de inversión del usuario (Q3)
  const q3 = evaluation?.answers?.[2] ?? 2;
  if (q3 >= 3) {
    factors.push({
      factor: '7. Horizonte de inversión',
      status: 'favorable',
      detail: 'Tu horizonte (2+ años) permite absorber ciclos normales de renta variable.',
    });
  } else {
    factors.push({
      factor: '7. Horizonte de inversión',
      status: 'precaucion',
      detail: 'Tu horizonte es corto (< 2 años); las acciones volátiles pueden no recuperarse a tiempo.',
    });
  }

  // 8. Capacidad financiera del usuario (Q8 & score)
  const capScore = evaluation?.financialCapacityScore ?? 50;
  if (capScore >= 60) {
    factors.push({
      factor: '8. Capacidad financiera',
      status: 'favorable',
      detail: `Capacidad financiera (${capScore.toFixed(0)}/100) adecuada para destinar capital sin comprometer liquidez.`,
    });
  } else {
    factors.push({
      factor: '8. Capacidad financiera',
      status: 'precaucion',
      detail: `Capacidad financiera acotada (${capScore.toFixed(0)}/100): evita montos elevados aunque exista señal técnica.`,
    });
  }

  let signal: DecisionEngineResult['signal'] = 'HOLD';
  let headline = 'HOLD — Mantener o esperar mejor punto';
  let summary =
    'Las señales técnicas y cuantitativas se encuentran equilibradas. Si ya la posees, mantén vigilancia con Stop Loss; si estás fuera, espera una confirmación más clara.';

  if (quantitativeScore >= 2.5) {
    signal = 'BUY';
    headline = 'BUY — Señal técnica y cuantitativa favorable';
    summary =
      'Presenta tendencia positiva, retorno histórico ajustado favorable y liquidez sólida. Recuerda validar su compatibilidad ISS antes de operar.';
  } else if (quantitativeScore <= -1.5) {
    signal = 'SELL';
    headline = 'SELL — Señal de cautela o salida estratégica';
    summary =
      'Muestra debilidad tendencial, sobrecompra/sobre-riesgo o retorno ajustado desfavorable frente a la tasa libre de riesgo.';
  }

  const conflictWithProfile = signal === 'BUY' && iss?.band === 'baja';
  const conflictWarning = conflictWithProfile
    ? `Atención: ${asset.symbol} tiene señal cuantitativa BUY por tendencia/retorno, PERO su compatibilidad ISS (${iss?.score}/100 - Roja) indica que su nivel de riesgo NO es adecuado para tu perfil ${evaluation?.profileDisplayName || ''}.`
    : undefined;

  return {
    signal,
    headline,
    summary,
    conflictWithProfile,
    conflictWarning,
    factors,
  };
}
