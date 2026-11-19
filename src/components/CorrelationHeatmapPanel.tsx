import React, { useMemo, useState } from 'react';
import { AlertTriangle, Grid3X3, HelpCircle, Scale, ShieldCheck } from 'lucide-react';
import { PortfolioPosition, StockAsset } from '../types';
import {
  buildCorrelationMatrix,
  describeCorrelationPair,
} from '../utils/correlationMatrix';

interface CorrelationHeatmapPanelProps {
  stocks: StockAsset[];
  positions: PortfolioPosition[];
  selectedSymbol: string;
  onComparePair: (symbolA: string, symbolB: string) => void;
  onOpenTooltip: (key: string) => void;
}

type HeatmapScope = 'portfolio_plus' | 'portfolio_only' | 'all_market';

function getCellToneClasses(value: number, isDiagonal: boolean): string {
  if (isDiagonal) {
    return 'bg-slate-200/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
  }
  if (value >= 0.65) {
    return 'bg-rose-500/25 dark:bg-rose-500/35 text-rose-950 dark:text-rose-100 font-bold';
  }
  if (value >= 0.3) {
    return 'bg-amber-500/20 dark:bg-amber-500/25 text-amber-950 dark:text-amber-100 font-semibold';
  }
  if (value >= -0.15) {
    return 'bg-slate-100 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200';
  }
  return 'bg-emerald-500/25 dark:bg-emerald-500/35 text-emerald-950 dark:text-emerald-100 font-bold';
}

export const CorrelationHeatmapPanel: React.FC<CorrelationHeatmapPanelProps> = ({
  stocks,
  positions,
  selectedSymbol,
  onComparePair,
  onOpenTooltip,
}) => {
  const [scope, setScope] = useState<HeatmapScope>('portfolio_plus');
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  const stockMap = useMemo(() => {
    const map: Record<string, StockAsset> = {};
    for (const s of stocks) map[s.symbol] = s;
    return map;
  }, [stocks]);

  const ownedSymbols = useMemo(
    () => new Set(positions.map((p) => p.symbol)),
    [positions]
  );

  const scopedAssets = useMemo(() => {
    if (scope === 'all_market') return stocks;

    const heldAssets = positions
      .map((p) => stockMap[p.symbol])
      .filter((a): a is StockAsset => Boolean(a));

    if (scope === 'portfolio_only') {
      return heldAssets;
    }

    // portfolio_plus: held assets + selectedSymbol + key cross-sector benchmarks up to 6 tickers
    const map = new Map<string, StockAsset>();
    heldAssets.forEach((a) => map.set(a.symbol, a));
    if (stockMap[selectedSymbol]) {
      map.set(selectedSymbol, stockMap[selectedSymbol]);
    }
    const candidateBenchmarks = ['NVDA', 'MSFT', 'WALMEX', 'XOM', 'GFNORTE', 'SPY'];
    for (const sym of candidateBenchmarks) {
      if (map.size >= 6) break;
      if (stockMap[sym] && !map.has(sym)) {
        map.set(sym, stockMap[sym]);
      }
    }
    return Array.from(map.values());
  }, [scope, stocks, positions, stockMap, selectedSymbol]);

  const analysis = useMemo(
    () => buildCorrelationMatrix(scopedAssets, positions, stockMap),
    [scopedAssets, positions, stockMap]
  );

  const activePair = useMemo(() => {
    if (scopedAssets.length < 2) return null;
    const rowIdx = selectedCell && selectedCell.row < scopedAssets.length ? selectedCell.row : 0;
    const colIdx =
      selectedCell && selectedCell.col < scopedAssets.length
        ? selectedCell.col
        : Math.min(1, scopedAssets.length - 1);
    const a = scopedAssets[rowIdx];
    const b = scopedAssets[colIdx];
    const corr = analysis.matrix[rowIdx]?.[colIdx] ?? 0;
    return {
      rowIdx,
      colIdx,
      a,
      b,
      corr,
      description: describeCorrelationPair(a, b, corr),
    };
  }, [selectedCell, scopedAssets, analysis.matrix]);

  return (
    <section
      aria-label="Mapa de Calor de Correlación y Riesgo de Concentración Sectorial"
      className="rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90 overflow-hidden"
    >
      {/* Encabezado */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800/90 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-emerald-500 shrink-0" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Mapa de Calor de Correlación y Concentración Sectorial
            </h3>
            <button
              type="button"
              onClick={() => onOpenTooltip('correlacion')}
              className="p-1 text-slate-400 hover:text-emerald-500 cursor-pointer"
              aria-label="¿Qué es la correlación entre activos?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Visualiza cómo se mueven tus activos entre sí (-1.00 a +1.00) para detectar exposición excesiva a un mismo sector antes de operar.
          </p>
        </div>

        {/* Selector de Alcance */}
        <div
          className="inline-flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 self-start lg:self-auto"
          role="group"
          aria-label="Alcance de activos en el mapa de correlación"
        >
          <button
            type="button"
            onClick={() => {
              setScope('portfolio_plus');
              setSelectedCell(null);
            }}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              scope === 'portfolio_plus'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Portafolio + Candidatos
          </button>
          <button
            type="button"
            onClick={() => {
              setScope('portfolio_only');
              setSelectedCell(null);
            }}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              scope === 'portfolio_only'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Solo Mis Posiciones ({positions.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setScope('all_market');
              setSelectedCell(null);
            }}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              scope === 'all_market'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Mercado Completo ({stocks.length})
          </button>
        </div>
      </div>

      {/* Cuerpo Principal: Matriz (Izquierda) + Diagnóstico Sectorial (Derecha) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-200 dark:divide-slate-800/90">
        {/* Matriz de Calor */}
        <div className="xl:col-span-8 p-6 space-y-4">
          {scopedAssets.length < 2 ? (
            <div className="py-10 text-center space-y-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-md">
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                Necesitas al menos 2 posiciones en custodia para medir su correlación directa. Puedes cambiar a <strong>Portafolio + Candidatos</strong> o <strong>Mercado Completo</strong> para simular cómo diversificar.
              </p>
              <button
                type="button"
                onClick={() => setScope('portfolio_plus')}
                className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                Ver Portafolio + Candidatos
              </button>
            </div>
          ) : (
            <>
              {/* Leyenda de Escala */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-rose-500/35 border border-rose-500/50 inline-block" />
                    Alta (+0.65 a +1.00 · Riesgo conjunto)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-amber-500/25 border border-amber-500/50 inline-block" />
                    Moderada (+0.30 a +0.64)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-slate-200 dark:bg-slate-700 inline-block" />
                    Baja (-0.15 a +0.29 · Diversifica)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-emerald-500/35 border border-emerald-500/50 inline-block" />
                    Inversa (&le; -0.16 · Cobertura)
                  </span>
                </div>
              </div>

              {/* Tabla Heatmap */}
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-1 text-xs">
                  <thead>
                    <tr>
                      <th className="py-2 px-2 text-left font-semibold text-slate-500 dark:text-slate-400">
                        Activo / Sector
                      </th>
                      {scopedAssets.map((colAsset, cIdx) => {
                        const isOwned = ownedSymbols.has(colAsset.symbol);
                        const isHighlighted = activePair?.colIdx === cIdx;
                        return (
                          <th
                            key={colAsset.symbol}
                            className={`py-2 px-1.5 text-center font-mono font-bold whitespace-nowrap transition-colors ${
                              isHighlighted
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                            title={`${colAsset.name} · ${colAsset.sector}`}
                          >
                            <div>{colAsset.symbol}</div>
                            {isOwned && (
                              <div className="text-[10px] font-sans font-semibold text-emerald-600 dark:text-emerald-400">
                                Cartera
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {scopedAssets.map((rowAsset, rIdx) => {
                      const isOwnedRow = ownedSymbols.has(rowAsset.symbol);
                      const isRowActive = activePair?.rowIdx === rIdx;
                      return (
                        <tr key={rowAsset.symbol}>
                          <td
                            className={`py-1.5 px-2 whitespace-nowrap rounded transition-colors ${
                              isRowActive
                                ? 'bg-slate-100 dark:bg-slate-800/70'
                                : ''
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 dark:text-white">
                                {rowAsset.symbol}
                              </span>
                              {isOwnedRow && (
                                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  · En cartera
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[130px]">
                              {rowAsset.sector}
                            </div>
                          </td>
                          {scopedAssets.map((colAsset, cIdx) => {
                            const val = analysis.matrix[rIdx][cIdx];
                            const isDiag = rIdx === cIdx;
                            const isSelectedCell =
                              activePair?.rowIdx === rIdx && activePair?.colIdx === cIdx;
                            return (
                              <td key={`${rowAsset.symbol}-${colAsset.symbol}`} className="p-0">
                                <button
                                  type="button"
                                  onClick={() => setSelectedCell({ row: rIdx, col: cIdx })}
                                  onMouseEnter={() => setSelectedCell({ row: rIdx, col: cIdx })}
                                  title={`${rowAsset.symbol} vs ${colAsset.symbol}: ${val.toFixed(2)}`}
                                  className={`w-full min-w-[54px] py-2.5 px-1.5 rounded font-mono tabular-nums text-center transition-all cursor-pointer ${getCellToneClasses(
                                    val,
                                    isDiag
                                  )} ${
                                    isSelectedCell
                                      ? 'ring-2 ring-emerald-500 dark:ring-emerald-400'
                                      : ''
                                  }`}
                                >
                                  {val > 0 && !isDiag ? `+${val.toFixed(2)}` : val.toFixed(2)}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Inspector del Par Seleccionado */}
              {activePair && (
                <div className="p-3.5 rounded-md bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      <span className="font-mono">{activePair.a.symbol}</span>
                      <span className="text-slate-400">({activePair.a.sector})</span>
                      <span aria-hidden="true">↔</span>
                      <span className="font-mono">{activePair.b.symbol}</span>
                      <span className="text-slate-400">({activePair.b.sector})</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-mono tabular-nums ${
                          activePair.corr >= 0.65 && activePair.a.symbol !== activePair.b.symbol
                            ? 'text-rose-600 dark:text-rose-400'
                            : activePair.corr <= 0.15
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        r = {activePair.corr > 0 ? `+${activePair.corr.toFixed(2)}` : activePair.corr.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {activePair.description}
                    </p>
                  </div>
                  {activePair.a.symbol !== activePair.b.symbol && (
                    <button
                      type="button"
                      onClick={() => onComparePair(activePair.a.symbol, activePair.b.symbol)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Scale className="w-3.5 h-3.5 text-emerald-500" />
                      Comparar par lado a lado
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Diagnóstico de Concentración Sectorial */}
        <div className="xl:col-span-4 p-6 space-y-5">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Diagnóstico de Concentración
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span
                className={`text-lg font-bold ${
                  analysis.concentrationLevel === 'Alta Concentración'
                    ? 'text-rose-600 dark:text-rose-400'
                    : analysis.concentrationLevel === 'Concentración Moderada'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {analysis.concentrationLevel}
              </span>
              <span className="font-mono tabular-nums text-xs font-semibold text-slate-600 dark:text-slate-300">
                Media r = {analysis.avgOffDiagonalCorr > 0 ? `+${analysis.avgOffDiagonalCorr.toFixed(2)}` : analysis.avgOffDiagonalCorr.toFixed(2)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {analysis.concentrationLevel === 'Alta Concentración'
                ? 'Varios activos muestran correlación elevada; una caída en un sector puede afectar simultáneamente gran parte de la muestra.'
                : analysis.concentrationLevel === 'Concentración Moderada'
                ? 'Equilibrio intermedio: existen pares correlacionados, aunque se compensan parcialmente con otros sectores.'
                : 'Buena dispersión entre sectores con baja dependencia mutua.'}
            </p>
          </div>

          {/* Exposición Real por Sector en Cartera */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
              <span>Peso por Sector en tu Portafolio</span>
              <span className="text-slate-400 font-normal">Tope sugerido 45%</span>
            </div>
            {analysis.sectorExposures.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aún no tienes acciones compradas en cartera.
              </p>
            ) : (
              <div className="space-y-2.5">
                {analysis.sectorExposures.map((sec) => (
                  <div key={sec.sector} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {sec.sector}{' '}
                        <span className="font-mono text-[11px] text-slate-400">
                          ({sec.symbols.join(', ')})
                        </span>
                      </span>
                      <span
                        className={`font-mono tabular-nums font-bold ${
                          sec.concentrationAlert
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {sec.weightPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          sec.concentrationAlert ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, sec.weightPct)}%` }}
                      />
                    </div>
                    {sec.concentrationAlert && (
                      <div className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Concentración superior al 45% en un solo sector
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pares Críticos y Diversificadores */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3 text-xs">
            {analysis.highestRiskPair && (
              <div className="p-3 rounded-md bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 space-y-1">
                <div className="flex items-center justify-between font-bold text-rose-700 dark:text-rose-300">
                  <span>Mayor Riesgo Conjunto</span>
                  <span className="font-mono tabular-nums">
                    +{analysis.highestRiskPair.correlation.toFixed(2)}
                  </span>
                </div>
                <div className="font-mono font-semibold text-slate-900 dark:text-white">
                  {analysis.highestRiskPair.symbolA} ↔ {analysis.highestRiskPair.symbolB} ·{' '}
                  <span className="font-sans font-normal text-slate-600 dark:text-slate-300">
                    {analysis.highestRiskPair.sameSector
                      ? `Mismo sector (${analysis.highestRiskPair.sectorA})`
                      : `${analysis.highestRiskPair.sectorA} / ${analysis.highestRiskPair.sectorB}`}
                  </span>
                </div>
              </div>
            )}

            {analysis.bestDiversifierPair && (
              <div className="p-3 rounded-md bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 space-y-1">
                <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Mejor Par Diversificador
                  </span>
                  <span className="font-mono tabular-nums">
                    {analysis.bestDiversifierPair.correlation > 0
                      ? `+${analysis.bestDiversifierPair.correlation.toFixed(2)}`
                      : analysis.bestDiversifierPair.correlation.toFixed(2)}
                  </span>
                </div>
                <div className="font-mono font-semibold text-slate-900 dark:text-white">
                  {analysis.bestDiversifierPair.symbolA} ↔ {analysis.bestDiversifierPair.symbolB} ·{' '}
                  <span className="font-sans font-normal text-slate-600 dark:text-slate-300">
                    {analysis.bestDiversifierPair.sectorA} / {analysis.bestDiversifierPair.sectorB}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
