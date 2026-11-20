import { OptionContractType, OptionPosition } from '../types';

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function normalPdf(x: number): number {
  return 0.3989422804014327 * Math.exp((-x * x) / 2);
}

export interface BlackScholesQuote {
  premiumPerShareMxn: number;
  delta: number;
  gamma: number;
  thetaPerDayMxn: number;
  vega: number;
  probItmPct: number;
  breakevenMxn: number;
}

export function priceBlackScholesOption(params: {
  spotMxn: number;
  strikeMxn: number;
  daysToExpiration: number;
  volatilityAnnualPct: number;
  optionType: OptionContractType;
  riskFreeRate?: number;
}): BlackScholesQuote {
  const S = Math.max(0.01, params.spotMxn);
  const K = Math.max(0.01, params.strikeMxn);
  const days = Math.max(1 / 24, params.daysToExpiration);
  const T = days / 365;
  const sigma = Math.max(0.05, params.volatilityAnnualPct / 100);
  const r = params.riskFreeRate ?? 0.085; // Tasa referencia MXN/CETES

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const discountedK = K * Math.exp(-r * T);

  if (params.optionType === 'CALL') {
    const premium = Math.max(0.01, S * normalCdf(d1) - discountedK * normalCdf(d2));
    const delta = normalCdf(d1);
    const gamma = normalPdf(d1) / (S * sigma * sqrtT);
    const theta = (-(S * normalPdf(d1) * sigma) / (2 * sqrtT) - r * discountedK * normalCdf(d2)) / 365;
    const vega = (S * normalPdf(d1) * sqrtT) / 100;
    return {
      premiumPerShareMxn: Number(premium.toFixed(2)),
      delta: Number(delta.toFixed(3)),
      gamma: Number(gamma.toFixed(5)),
      thetaPerDayMxn: Number(theta.toFixed(2)),
      vega: Number(vega.toFixed(2)),
      probItmPct: Number((normalCdf(d2) * 100).toFixed(1)),
      breakevenMxn: Number((K + premium).toFixed(2)),
    };
  }

  const premium = Math.max(0.01, discountedK * normalCdf(-d2) - S * normalCdf(-d1));
  const delta = normalCdf(d1) - 1;
  const gamma = normalPdf(d1) / (S * sigma * sqrtT);
  const theta = (-(S * normalPdf(d1) * sigma) / (2 * sqrtT) + r * discountedK * normalCdf(-d2)) / 365;
  const vega = (S * normalPdf(d1) * sqrtT) / 100;

  return {
    premiumPerShareMxn: Number(premium.toFixed(2)),
    delta: Number(delta.toFixed(3)),
    gamma: Number(gamma.toFixed(5)),
    thetaPerDayMxn: Number(theta.toFixed(2)),
    vega: Number(vega.toFixed(2)),
    probItmPct: Number((normalCdf(-d2) * 100).toFixed(1)),
    breakevenMxn: Number(Math.max(0.01, K - premium).toFixed(2)),
  };
}

export function getRemainingOptionDays(expirationDateIso: string): number {
  const expMs = new Date(expirationDateIso).getTime();
  if (!Number.isFinite(expMs)) return 1;
  const diffDays = (expMs - Date.now()) / (1000 * 60 * 60 * 24);
  return Math.max(0.25, diffDays);
}

export function markOptionPositionToMarket(
  pos: OptionPosition,
  currentSpotMxn: number,
  currentVolPct?: number
): {
  quote: BlackScholesQuote;
  remainingDays: number;
  currentValueMxn: number;
  pnlMxn: number;
  pnlPct: number;
} {
  const remainingDays = getRemainingOptionDays(pos.expirationDateIso);
  const quote = priceBlackScholesOption({
    spotMxn: currentSpotMxn,
    strikeMxn: pos.strikeMxn,
    daysToExpiration: remainingDays,
    volatilityAnnualPct: currentVolPct || pos.impliedVolatilityPct,
    optionType: pos.optionType,
  });
  const totalShares = pos.contracts * pos.contractMultiplier;
  const currentValueMxn = Number((quote.premiumPerShareMxn * totalShares).toFixed(2));
  const entryCost = Math.max(0.01, pos.totalCostMxn + (pos.commissionPaidMxn || 0));
  const pnlMxn = Number((currentValueMxn - entryCost).toFixed(2));
  const rawPct = (pnlMxn / entryCost) * 100;
  const pnlPct = Number((Number.isFinite(rawPct) ? rawPct : 0).toFixed(2));
  return {
    quote,
    remainingDays: Number(remainingDays.toFixed(1)),
    currentValueMxn,
    pnlMxn,
    pnlPct,
  };
}
