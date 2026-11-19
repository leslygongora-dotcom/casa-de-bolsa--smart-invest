import { PortfolioPosition, Sector, StockAsset } from '../types';

export interface CorrelationPairInsight {
  symbolA: string;
  symbolB: string;
  sectorA: Sector;
  sectorB: Sector;
  correlation: number;
  sameSector: boolean;
  interpretation: string;
}

export interface SectorExposureRow {
  sector: Sector;
  valueMxn: number;
  weightPct: number;
  symbols: string[];
  concentrationAlert: boolean;
}

export interface CorrelationMatrixResult {
  assets: StockAsset[];
  matrix: number[][];
  avgOffDiagonalCorr: number;
  concentrationLevel: 'Diversificado' | 'Concentración Moderada' | 'Alta Concentración';
  highestRiskPair: CorrelationPairInsight | null;
  bestDiversifierPair: CorrelationPairInsight | null;
  sectorExposures: SectorExposureRow[];
}

function getReturnsFromHistory(history: number[], currentPrice: number): number[] {
  const series = [...history];
  const last = series[series.length - 1];
  if (last === undefined || Math.abs(last - currentPrice) > 0.001) {
    series.push(currentPrice);
  }
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    if (prev > 0) {
      returns.push((series[i] - prev) / prev);
    }
  }
  return returns;
}

function getStructuralSectorPrior(a: StockAsset, b: StockAsset): number {
  if (a.symbol === b.symbol) return 1;
  if (a.sector === b.sector) {
    if (a.sector === 'Tecnología') return 0.78;
    if (a.sector === 'Finanzas y Cripto') return a.symbol === 'XRP_USDT' || b.symbol === 'XRP_USDT' ? 0.28 : 0.62;
    return 0.66;
  }
  if (a.sector === 'Índices y ETFs' || b.sector === 'Índices y ETFs') {
    const other = a.sector === 'Índices y ETFs' ? b : a;
    if (other.sector === 'Tecnología') return 0.68;
    if (other.sector === 'Consumo y Retail') return 0.56;
    if (other.sector === 'Energía y Recursos') return 0.18;
    if (other.symbol === 'XRP_USDT') return 0.24;
    return 0.48;
  }
  if (
    (a.sector === 'Energía y Recursos' && b.sector === 'Tecnología') ||
    (b.sector === 'Energía y Recursos' && a.sector === 'Tecnología')
  ) {
    return -0.22;
  }
  if (
    (a.sector === 'Salud y Biotecnología' && b.sector === 'Energía y Recursos') ||
    (b.sector === 'Salud y Biotecnología' && a.sector === 'Energía y Recursos')
  ) {
    return -0.08;
  }
  if (a.symbol === 'XRP_USDT' || b.symbol === 'XRP_USDT') {
    return 0.16;
  }
  return 0.22;
}

export function computePairwiseCorrelation(a: StockAsset, b: StockAsset): number {
  if (a.symbol === b.symbol) return 1;

  const retA = getReturnsFromHistory(a.history, a.priceMxn);
  const retB = getReturnsFromHistory(b.history, b.priceMxn);
  const len = Math.min(retA.length, retB.length);
  const prior = getStructuralSectorPrior(a, b);

  if (len < 4) {
    return Number(prior.toFixed(2));
  }

  const sliceA = retA.slice(retA.length - len);
  const sliceB = retB.slice(retB.length - len);

  const meanA = sliceA.reduce((s, v) => s + v, 0) / len;
  const meanB = sliceB.reduce((s, v) => s + v, 0) / len;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < len; i++) {
    const dA = sliceA[i] - meanA;
    const dB = sliceB[i] - meanB;
    cov += dA * dB;
    varA += dA * dA;
    varB += dB * dB;
  }

  const denom = Math.sqrt(varA * varB);
  const empirical = denom > 1e-12 ? cov / denom : prior;
  // Blend empirical return co-movement (65%) with structural sector prior (35%) for stability on short intraday windows
  const blended = Math.max(-0.98, Math.min(0.98, 0.65 * empirical + 0.35 * prior));
  return Number(blended.toFixed(2));
}

export function describeCorrelationPair(
  a: StockAsset,
  b: StockAsset,
  corr: number
): string {
  const sameSector = a.sector === b.sector;
  if (a.symbol === b.symbol) {
    return 'Correlación unitaria del mismo instrumento consigo mismo.';
  }
  if (corr >= 0.65) {
    return sameSector
      ? `Alta concentración en ${a.sector}: ambos activos tienden a subir y caer juntos.`
      : 'Fuerte movimiento conjunto; combinar ambos amplifica la volatilidad direccional.';
  }
  if (corr >= 0.3) {
    return 'Correlación positiva moderada; comparten tendencia de mercado con cierta independencia.';
  }
  if (corr >= -0.15) {
    return 'Baja correlación: buena combinación para reducir riesgo de concentración sectorial.';
  }
  return 'Correlación inversa: tienden a compensarse cuando uno retrocede, aportando cobertura natural.';
}

export function buildCorrelationMatrix(
  assets: StockAsset[],
  positions: PortfolioPosition[],
  stockMap: Record<string, StockAsset>
): CorrelationMatrixResult {
  const n = assets.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(1));

  let offDiagSum = 0;
  let offDiagCount = 0;
  let highestRiskPair: CorrelationPairInsight | null = null;
  let bestDiversifierPair: CorrelationPairInsight | null = null;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        continue;
      }
      if (j > i) {
        const corr = computePairwiseCorrelation(assets[i], assets[j]);
        matrix[i][j] = corr;
        matrix[j][i] = corr;
        offDiagSum += corr;
        offDiagCount += 1;

        const insight: CorrelationPairInsight = {
          symbolA: assets[i].symbol,
          symbolB: assets[j].symbol,
          sectorA: assets[i].sector,
          sectorB: assets[j].sector,
          correlation: corr,
          sameSector: assets[i].sector === assets[j].sector,
          interpretation: describeCorrelationPair(assets[i], assets[j], corr),
        };

        if (!highestRiskPair || corr > highestRiskPair.correlation) {
          highestRiskPair = insight;
        }
        if (!bestDiversifierPair || corr < bestDiversifierPair.correlation) {
          bestDiversifierPair = insight;
        }
      }
    }
  }

  const avgOffDiagonalCorr =
    offDiagCount > 0 ? Number((offDiagSum / offDiagCount).toFixed(2)) : 0;

  let concentrationLevel: CorrelationMatrixResult['concentrationLevel'] = 'Diversificado';
  if (avgOffDiagonalCorr >= 0.62) {
    concentrationLevel = 'Alta Concentración';
  } else if (avgOffDiagonalCorr >= 0.35) {
    concentrationLevel = 'Concentración Moderada';
  }

  // Compute user's actual portfolio exposure by sector
  const sectorMap = new Map<Sector, { valueMxn: number; symbols: string[] }>();
  let totalInvested = 0;
  positions.forEach((pos) => {
    const livePrice = stockMap[pos.symbol]?.priceMxn ?? pos.avgEntryMxn;
    const val = pos.shares * livePrice;
    totalInvested += val;
    const prev = sectorMap.get(pos.sector) || { valueMxn: 0, symbols: [] };
    prev.valueMxn += val;
    if (!prev.symbols.includes(pos.symbol)) prev.symbols.push(pos.symbol);
    sectorMap.set(pos.sector, prev);
  });

  const sectorExposures: SectorExposureRow[] = Array.from(sectorMap.entries())
    .map(([sector, info]) => {
      const weightPct = totalInvested > 0 ? (info.valueMxn / totalInvested) * 100 : 0;
      return {
        sector,
        valueMxn: Number(info.valueMxn.toFixed(2)),
        weightPct: Number(weightPct.toFixed(1)),
        symbols: info.symbols,
        concentrationAlert: weightPct >= 45,
      };
    })
    .sort((a, b) => b.weightPct - a.weightPct);

  return {
    assets,
    matrix,
    avgOffDiagonalCorr,
    concentrationLevel,
    highestRiskPair,
    bestDiversifierPair,
    sectorExposures,
  };
}
