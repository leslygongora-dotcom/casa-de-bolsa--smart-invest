import type { PortfolioPosition } from '../types';

export interface OpenStockPnlResult {
  grossEntryMxn: number;
  totalCostBasisMxn: number;
  marketValueMxn: number;
  netPnlMxn: number;
  pnlPct: number;
}

/**
 * Computes open stock position profitability accurately including entry commission
 * paid (`commissionPaidMxn`) in the cost basis and guarding against division by zero.
 */
export function computeOpenStockPnl(
  pos: PortfolioPosition,
  currentPriceMxn: number
): OpenStockPnlResult {
  const safeShares = Number.isFinite(pos.shares) && pos.shares > 0 ? pos.shares : 0;
  const safeAvgEntry = Number.isFinite(pos.avgEntryMxn) && pos.avgEntryMxn > 0 ? pos.avgEntryMxn : 0;
  const safePrice = Number.isFinite(currentPriceMxn) && currentPriceMxn > 0 ? currentPriceMxn : safeAvgEntry;
  const safeComm = Number.isFinite(pos.commissionPaidMxn) && pos.commissionPaidMxn > 0 ? pos.commissionPaidMxn : 0;

  const grossEntryMxn = Number((safeShares * safeAvgEntry).toFixed(2));
  const totalCostBasisMxn = Number((grossEntryMxn + safeComm).toFixed(2));
  const marketValueMxn = Number((safeShares * safePrice).toFixed(2));
  const netPnlMxn = Number((marketValueMxn - totalCostBasisMxn).toFixed(2));
  const rawPct = totalCostBasisMxn > 0 ? (netPnlMxn / totalCostBasisMxn) * 100 : 0;
  const pnlPct = Number((Number.isFinite(rawPct) ? rawPct : 0).toFixed(2));

  return {
    grossEntryMxn,
    totalCostBasisMxn,
    marketValueMxn,
    netPnlMxn,
    pnlPct,
  };
}
