import React, { useMemo, useRef, useState } from 'react';
import { ExternalLink, Eye, Globe, HelpCircle, Lightbulb, Pause, Play, RefreshCw, Scale, Search, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { TRADITIONAL_BROKER_FEE_PCT } from '../data/marketData';
import { DeepAnalysisResult, PortfolioPosition, Sector, StockAsset, TradeOrder } from '../types';
import type { IssWeights } from '../firebase';
import { computeCompanyRiskMetrics } from '../utils/assetRiskMetrics';
import { computeFinancialStrength } from '../utils/financialStrength';
import type { InvestorEvaluationResult } from '../utils/investorProfileEngine';
import { AssetComparisonPanel } from './AssetComparisonPanel';
import { CompanyRiskMetricsPanel } from './CompanyRiskMetricsPanel';
import { CorrelationHeatmapPanel } from './CorrelationHeatmapPanel';
import { RealRiskSuitabilityPanel } from './RealRiskSuitabilityPanel';
import { SvgAreaChart } from './SvgAreaChart';

interface MarketViewProps {
  stocks: StockAsset[];
  selectedSymbol: string;
  positions: PortfolioPosition[];
  orders: TradeOrder[];
  cashMxn: number;
  isMarketLive: boolean;
  viewCounts: Record<string, number>;
  favoriteSectors: { sector: Sector; score: number }[];
  deepAnalyses: Record<string, DeepAnalysisResult>;
  loadingAnalysisSymbol: string | null;
  onToggleLive: () => void;
  onInspectStock: (symbol: string) => void;
  onRequestDeepAnalysis: (asset: StockAsset) => void;
  onExecuteTrade: (params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    shares: number;
    orderType: 'MARKET' | 'LIMIT';
    limitPriceMxn?: number;
    stopLossPct?: number;
    takeProfitPct?: number;
  }) => { ok: boolean; message: string };
  onOpenTooltip: (key: string) => void;
  investorEvaluation: InvestorEvaluationResult | null;
  issWeights: IssWeights;
  onUpdateIssWeights: (weights: IssWeights) => void;
  onOpenTestModal: () => void;
  usdMxnRate?: number | null;
  lastYahooSyncIso?: string | null;
  quotesLoading?: boolean;
  onRefreshQuotes?: () => void;
}

const SECTORS: ('Todos' | Sector)[] = [
  'Todos',
  'Tecnología',
  'Índices y ETFs',
  'Consumo y Retail',
  'Salud y Biotecnología',
  'Energía y Recursos',
  'Finanzas y Cripto',
];

export const MarketView: React.FC<MarketViewProps> = ({
  stocks,
  selectedSymbol,
  positions,
  orders,
  cashMxn,
  isMarketLive,
  viewCounts,
  favoriteSectors,
  deepAnalyses,
  loadingAnalysisSymbol,
  onToggleLive,
  onInspectStock,
  onRequestDeepAnalysis,
  onExecuteTrade,
  onOpenTooltip,
  investorEvaluation,
  issWeights,
  onUpdateIssWeights,
  onOpenTestModal,
  usdMxnRate,
  lastYahooSyncIso,
  quotesLoading,
  onRefreshQuotes,
}) => {
  const [sectorFilter, setSectorFilter] = useState<'Todos' | Sector>('Todos');
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [sharesInput, setSharesInput] = useState<string>('2');
  const [limitPriceInput, setLimitPriceInput] = useState<string>('');
  const [stopLossPct, setStopLossPct] = useState<number>(2.5);
  const [takeProfitPct, setTakeProfitPct] = useState<number>(7.0);
  const [tradeFeedback, setTradeFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [compareSymbolA, setCompareSymbolA] = useState<string>(selectedSymbol || 'NVDA');
  const [compareSymbolB, setCompareSymbolB] = useState<string>(selectedSymbol === 'SPY' ? 'NVDA' : 'SPY');
  const [webLookupLoading, setWebLookupLoading] = useState(false);
  const [webLookupBySymbol, setWebLookupBySymbol] = useState<
    Record<string, { summary: string; sources: { title: string; uri: string }[]; updatedAt: string }>
  >({});
  const comparisonRef = useRef<HTMLDivElement>(null);

  const handleWebResearch = async (asset: StockAsset) => {
    setWebLookupLoading(true);
    try {
      const res = await fetch('/api/ai/market-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: asset.symbol,
          sector: asset.sector,
          query: `Noticias recientes, reportes financieros y análisis actual de ${asset.symbol} (${asset.name})`,
        }),
      });
      const data = await res.json();
      setWebLookupBySymbol((prev) => ({
        ...prev,
        [asset.symbol]: {
          summary: data.summary,
          sources: Array.isArray(data.sources) ? data.sources : [],
          updatedAt: data.updatedAt || 'Ahora',
        },
      }));
    } catch {
      // ignore quietly
    } finally {
      setWebLookupLoading(false);
    }
  };

  const scrollToComparison = (preferredA?: string) => {
    if (preferredA) {
      setCompareSymbolA(preferredA);
      if (compareSymbolB === preferredA) {
        const alt = stocks.find((s) => s.symbol !== preferredA)?.symbol || 'SPY';
        setCompareSymbolB(alt);
      }
    }
    comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectedAsset = useMemo(
    () => stocks.find((s) => s.symbol === selectedSymbol) || stocks[0],
    [stocks, selectedSymbol]
  );

  const filteredStocks = useMemo(() => {
    return stocks.filter((s) => {
      const matchesSector = sectorFilter === 'Todos' || s.sector === sectorFilter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q || s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q);
      return matchesSector && matchesQuery;
    });
  }, [stocks, sectorFilter, query]);

  const benchmarkSpy = useMemo(
    () => stocks.find((s) => s.symbol === 'SPY') || stocks[0],
    [stocks]
  );

  const riskMetricsBySymbol = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeCompanyRiskMetrics>> = {};
    for (const s of stocks) {
      map[s.symbol] = computeCompanyRiskMetrics(s, benchmarkSpy);
    }
    return map;
  }, [stocks, benchmarkSpy]);

  const currentHolding = positions.find((p) => p.symbol === selectedAsset.symbol);
  const viewsOnSelected = viewCounts[selectedAsset.symbol] || 0;
  const analysis = deepAnalyses[selectedAsset.symbol];
  const selectedStrength = useMemo(
    () => computeFinancialStrength(selectedAsset, analysis),
    [selectedAsset, analysis]
  );
  const selectedRiskMetrics =
    riskMetricsBySymbol[selectedAsset.symbol] ||
    computeCompanyRiskMetrics(selectedAsset, benchmarkSpy);

  const shares = Math.max(0, Number(sharesInput) || 0);
  const execPrice =
    orderType === 'LIMIT' && Number(limitPriceInput) > 0
      ? Number(limitPriceInput)
      : selectedAsset.priceMxn;
  const grossMxn = shares * execPrice;
  const lowCommissionMxn = grossMxn * selectedAsset.commissionPct;
  const traditionalCommissionMxn = grossMxn * TRADITIONAL_BROKER_FEE_PCT;
  const savingsMxn = traditionalCommissionMxn - lowCommissionMxn;

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onExecuteTrade({
      symbol: selectedAsset.symbol,
      side,
      shares,
      orderType,
      limitPriceMxn: orderType === 'LIMIT' ? Number(limitPriceInput) : undefined,
      stopLossPct,
      takeProfitPct,
    });
    setTradeFeedback(res);
  };

  return (
    <div className="space-y-6">
      {/* Header Mercado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Casa de Bolsa en Tiempo Real · Comisiones de 0.10% por movimiento
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Fuente: <strong className="text-slate-800 dark:text-slate-200">Yahoo Finance</strong>
            {usdMxnRate ? ` · Tipo de cambio USD/MXN: $${usdMxnRate.toFixed(2)}` : ''}
            {lastYahooSyncIso
              ? ` · Actualizado ${new Date(lastYahooSyncIso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : ''}
            {' · '}Sectores favoritos: <strong className="text-slate-800 dark:text-slate-200">{favoriteSectors.slice(0, 2).map((s) => s.sector).join(' · ')}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRefreshQuotes && (
            <button
              type="button"
              onClick={onRefreshQuotes}
              disabled={quotesLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${quotesLoading ? 'animate-spin' : ''}`} />
              {quotesLoading ? 'Actualizando Yahoo...' : 'Actualizar Yahoo Finance'}
            </button>
          )}
          <button
            type="button"
            onClick={() => scrollToComparison(selectedAsset.symbol)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Scale className="w-3.5 h-3.5" />
            Comparar 2 Activos ({compareSymbolA} vs {compareSymbolB})
          </button>
          <button
            onClick={onToggleLive}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isMarketLive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isMarketLive ? 'Pausar Cotizaciones' : 'Reanudar Tiempo Real'}
          </button>
        </div>
      </div>

      {/* Filtros de Sector y Buscador */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 overflow-x-auto">
          {SECTORS.map((sec) => (
            <button
              key={sec}
              onClick={() => setSectorFilter(sec)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sectorFilter === sec
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ticker, empresa o sector..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Layout Principal: Lista de Acciones (Izquierda) + Operativa & Gráfico (Derecha) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Watchlist en Tiempo Real */}
        <div className="xl:col-span-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Fortaleza (A–F) · Instrumento</span>
            <span>Precio MXN · Comparar</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
            {filteredStocks.map((asset) => {
              const isSelected = asset.symbol === selectedAsset.symbol;
              const isCompA = asset.symbol === compareSymbolA;
              const isCompB = asset.symbol === compareSymbolB;
              const views = viewCounts[asset.symbol] || 0;
              const owned = positions.some((p) => p.symbol === asset.symbol);
              const strength = computeFinancialStrength(asset, deepAnalyses[asset.symbol]);
              return (
                <div
                  key={asset.symbol}
                  className={`px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onInspectStock(asset.symbol);
                      setTradeFeedback(null);
                    }}
                    className="flex-1 min-w-0 text-left flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        title={`Calificación de Fortaleza Financiera: ${strength.grade} (${strength.score}/100) — ${strength.label}`}
                        className={`w-7 h-7 rounded-lg border font-mono font-extrabold text-xs flex items-center justify-center shrink-0 ${strength.colorClasses.badge}`}
                      >
                        {strength.grade}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                            {asset.symbol}
                          </span>
                          {owned && (
                            <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                              En cartera
                            </span>
                          )}
                          {!owned && views >= 2 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                              <Eye className="w-3 h-3" /> {views}x
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {asset.name} · {asset.sector}
                        </div>
                        {riskMetricsBySymbol[asset.symbol] && (
                          <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            VaR {riskMetricsBySymbol[asset.symbol].var99DailyPct.toFixed(1)}% · β{' '}
                            {riskMetricsBySymbol[asset.symbol].beta.toFixed(2)} · Sharpe{' '}
                            {riskMetricsBySymbol[asset.symbol].sharpeRatio.toFixed(2)} · Sortino{' '}
                            {riskMetricsBySymbol[asset.symbol].sortinoRatio.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                        ${asset.priceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </div>
                      <div
                        className={`font-mono tabular-nums text-xs font-semibold ${
                          asset.changePct >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {asset.changePct >= 0 ? '+' : ''}
                        {asset.changePct.toFixed(2)}%
                      </div>
                    </div>
                  </button>

                  {/* Botones rápidos A / B para comparador lado a lado */}
                  <div className="flex items-center gap-1 shrink-0 pl-1 border-l border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      title={`Comparar ${asset.symbol} como Activo A`}
                      onClick={() => setCompareSymbolA(asset.symbol)}
                      className={`w-6 h-6 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                        isCompA
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                      }`}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      title={`Comparar ${asset.symbol} como Activo B`}
                      onClick={() => setCompareSymbolB(asset.symbol)}
                      className={`w-6 h-6 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                        isCompB
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                      }`}
                    >
                      B
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detalle del Activo + Ticket de Compra/Venta */}
        <div className="xl:col-span-7 space-y-6">
          {/* Encabezado y Gráfico Vivo */}
          <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedAsset.exchange} · {selectedAsset.sector} · Comisión {(selectedAsset.commissionPct * 100).toFixed(2)}%
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedAsset.symbol} — {selectedAsset.name}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{selectedAsset.aiThesis}</p>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  ${selectedAsset.priceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </div>
                {selectedAsset.priceOriginal !== undefined && selectedAsset.originalCurrency && (
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {selectedAsset.yahooTicker || selectedAsset.symbol}: ${selectedAsset.priceOriginal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedAsset.originalCurrency}
                    {selectedAsset.originalCurrency === 'USD' && selectedAsset.usdMxnRate
                      ? ` · TC $${selectedAsset.usdMxnRate.toFixed(2)}`
                      : ''}
                  </div>
                )}
                <div
                  className={`text-xs font-mono tabular-nums font-semibold ${
                    selectedAsset.changePct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {selectedAsset.changePct >= 0 ? '+' : ''}
                  {selectedAsset.changePct.toFixed(2)}% hoy · 12M: {selectedAsset.annualReturnPct >= 0 ? '+' : ''}
                  {selectedAsset.annualReturnPct.toFixed(1)}%
                </div>
              </div>
            </div>

            <SvgAreaChart
              data={selectedAsset.history}
              primaryLabel={`${selectedAsset.symbol} (MXN)`}
              height={210}
              accentColor={selectedAsset.changePct >= 0 ? '#10b981' : '#ef4444'}
            />

            {/* Métricas fundamentales limpias sin pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Volatilidad Anual</span>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedAsset.volatilityAnnualPct}%
                </div>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Sentimiento X Alcista</span>
                <div className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {selectedAsset.sentimentBullishPct}%
                </div>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Dividendo Anual</span>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedAsset.dividendYieldPct}%
                </div>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Vistas tuyas</span>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white mt-0.5">
                  {viewsOnSelected} {viewsOnSelected === 1 ? 'vez' : 'veces'}
                </div>
              </div>
            </div>

            {/* 7 Métricas Cuantitativas de Riesgo por Empresa */}
            <CompanyRiskMetricsPanel
              asset={selectedAsset}
              metrics={selectedRiskMetrics}
              onOpenTooltip={onOpenTooltip}
            />

            {/* Calificación de Fortaleza Financiera (Score A-F para principiantes) */}
            <div className={`p-4 rounded-xl border ${selectedStrength.colorClasses.border} ${selectedStrength.colorClasses.bgSoft} space-y-3`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center font-mono text-2xl font-black shrink-0 ${selectedStrength.colorClasses.badge}`}
                    aria-label={`Calificación de Fortaleza Financiera ${selectedStrength.grade}`}
                  >
                    {selectedStrength.grade}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <ShieldCheck className={`w-4 h-4 ${selectedStrength.colorClasses.text}`} />
                      Calificación de Fortaleza Financiera
                    </div>
                    <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {selectedStrength.label} ·{' '}
                      <span className="font-mono">{selectedStrength.score}/100 pts</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5">
                      {selectedStrength.beginnerAdvice}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRequestDeepAnalysis(selectedAsset)}
                  disabled={loadingAnalysisSymbol === selectedAsset.symbol}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 self-start sm:self-center"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {loadingAnalysisSymbol === selectedAsset.symbol
                    ? 'Calibrando...'
                    : selectedStrength.calibratedWithDeepAnalysis
                    ? 'Ver Análisis Profundo'
                    : 'Calibrar con Análisis IA'}
                </button>
              </div>

              {/* 4 Pilares de Fortaleza */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-800/70 text-[11px]">
                {[
                  { label: 'Estabilidad (Bajo Riesgo)', val: selectedStrength.pillars.stability },
                  { label: 'Retorno / Riesgo', val: selectedStrength.pillars.riskAdjustedReturn },
                  { label: 'Fundamentos', val: selectedStrength.pillars.fundamentals },
                  {
                    label: selectedStrength.calibratedWithDeepAnalysis
                      ? 'Análisis Profundo IA ✓'
                      : 'Señal IA Base',
                    val: selectedStrength.pillars.deepAnalysisAlignment,
                  },
                ].map((pillar) => (
                  <div key={pillar.label} className="space-y-1">
                    <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-200">
                      <span className="truncate">{pillar.label}</span>
                      <span className="font-mono ml-1">{pillar.val}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${pillar.val}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Investigación en tiempo real con Google Search Grounding */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  ¿Quieres verificar noticias recientes en Google antes de operar {selectedAsset.symbol}?
                </div>
                <button
                  type="button"
                  onClick={() => handleWebResearch(selectedAsset)}
                  disabled={webLookupLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-400/50 text-indigo-600 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer disabled:opacity-50"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {webLookupLoading ? 'Buscando en Google...' : `Buscar ${selectedAsset.symbol} en Google`}
                </button>
              </div>

              {webLookupBySymbol[selectedAsset.symbol] && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span>gemini-3.1-flash-lite + Google Search</span>
                    <span>{webLookupBySymbol[selectedAsset.symbol].updatedAt}</span>
                  </div>
                  <div className="text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                    {webLookupBySymbol[selectedAsset.symbol].summary}
                  </div>
                  {webLookupBySymbol[selectedAsset.symbol].sources.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {webLookupBySymbol[selectedAsset.symbol].sources.map((src, idx) => (
                        <a
                          key={`${src.uri}-${idx}`}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="max-w-[180px] truncate">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Consejero Inteligente cuando la vio varias veces sin comprar */}
          {!currentHolding && (viewsOnSelected >= 2 || analysis) && (
            <div className="p-5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {analysis
                        ? analysis.titulo
                        : `Has revisado ${selectedAsset.symbol} ${viewsOnSelected} veces sin comprarla`}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {analysis
                        ? `Veredicto: ${analysis.veredicto} — ${analysis.consejo_accionable}`
                        : '¿Indecisión? Solicita un análisis detallado con pros, riesgos y estrategia de entrada.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onRequestDeepAnalysis(selectedAsset)}
                  disabled={loadingAnalysisSymbol === selectedAsset.symbol}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {loadingAnalysisSymbol === selectedAsset.symbol
                    ? 'Analizando...'
                    : analysis
                    ? 'Ver Análisis Completo'
                    : 'Generar Análisis IA'}
                </button>
              </div>
            </div>
          )}

          {/* Análisis Histórico Real + Semáforo ISS + Motor de Decisiones Independiente */}
          <RealRiskSuitabilityPanel
            asset={selectedAsset}
            positions={positions}
            evaluation={investorEvaluation}
            issWeights={issWeights}
            onUpdateIssWeights={onUpdateIssWeights}
            onOpenTestModal={onOpenTestModal}
            onOpenTooltip={onOpenTooltip}
          />

          {/* Boleta de Compra / Venta en Tiempo Real */}
          <form
            onSubmit={handleOrderSubmit}
            className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setSide('BUY');
                    setTradeFeedback(null);
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    side === 'BUY'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Comprar {selectedAsset.symbol}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSide('SELL');
                    setTradeFeedback(null);
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    side === 'SELL'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Vender {selectedAsset.symbol}
                </button>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {side === 'BUY'
                  ? `Efectivo: $${cashMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                  : `Disponibles: ${currentHolding?.shares ?? 0} títulos`}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tipo de Orden
                </label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as 'MARKET' | 'LIMIT')}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold"
                >
                  <option value="MARKET">A Mercado (Inmediata)</option>
                  <option value="LIMIT">Orden Límite</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Cantidad de Acciones
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono font-bold"
                />
                {side === 'BUY' && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[1000, 2500, 5000, 10000].map((budgetMxn) => (
                      <button
                        key={budgetMxn}
                        type="button"
                        onClick={() => {
                          const calcShares = budgetMxn / Math.max(1, execPrice);
                          setSharesInput(calcShares >= 1 ? calcShares.toFixed(2) : calcShares.toFixed(4));
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        ${(budgetMxn / 1000).toFixed(budgetMxn === 2500 ? 1 : 0)}k
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {orderType === 'LIMIT' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Precio Límite (MXN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={limitPriceInput}
                    onChange={(e) => setLimitPriceInput(e.target.value)}
                    placeholder={selectedAsset.priceMxn.toFixed(2)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono font-bold"
                  />
                </div>
              ) : (
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    <span>Stop Loss (%)</span>
                    <button
                      type="button"
                      onClick={() => onOpenTooltip('stop_loss')}
                      className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="2.5"
                    step="0.1"
                    value={stopLossPct}
                    onChange={(e) => setStopLossPct(Math.min(2.5, Math.max(0.5, Number(e.target.value))))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono font-bold"
                  />
                </div>
              )}
            </div>

            {side === 'BUY' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Meta de Ganancia / Take Profit (%)
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="40"
                    step="0.5"
                    value={takeProfitPct}
                    onChange={(e) => setTakeProfitPct(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono font-bold"
                  />
                </div>
                <div className="flex items-end">
                  <div className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Escudo VaR 99% limita riesgo máximo de orden al 2.5% del portafolio.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Desglose Transparente de Bajas Comisiones */}
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Importe bruto estimado</span>
                <span className="font-mono tabular-nums font-semibold">
                  ${grossMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">
                  Comisión Smart Invest ({(selectedAsset.commissionPct * 100).toFixed(2)}%)
                </span>
                <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                  ${lowCommissionMxn.toFixed(2)} MXN (Ahorras ${savingsMxn.toFixed(2)} MXN vs 0.75%)
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-800 text-sm font-bold">
                <span>{side === 'BUY' ? 'Total a pagar' : 'Neto a recibir'}</span>
                <span className="font-mono tabular-nums">
                  $
                  {(side === 'BUY' ? grossMxn + lowCommissionMxn : Math.max(0, grossMxn - lowCommissionMxn)).toLocaleString(
                    'es-MX',
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}{' '}
                  MXN
                </span>
              </div>
            </div>

            {tradeFeedback && (
              <div
                className={`p-3 rounded-lg text-xs font-medium border ${
                  tradeFeedback.ok
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                }`}
              >
                {tradeFeedback.message}
              </div>
            )}

            <button
              type="submit"
              className={`w-full py-3 rounded-lg text-white text-sm font-bold transition-colors cursor-pointer ${
                side === 'BUY' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {side === 'BUY'
                ? `Confirmar Compra de ${shares || 0} ${selectedAsset.symbol}`
                : `Confirmar Venta de ${shares || 0} ${selectedAsset.symbol}`}
            </button>
          </form>

          {/* Historial Reciente de Órdenes */}
          {orders.length > 0 && (
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                Ejecuciones Recientes (Tiempo Real)
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {orders.slice(0, 5).map((ord) => (
                  <div key={ord.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <span
                        className={`font-bold ${
                          ord.side === 'BUY'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {ord.side === 'BUY' ? 'COMPRA' : 'VENTA'}
                      </span>{' '}
                      <span className="font-mono font-bold">{ord.shares} {ord.symbol}</span> @ ${ord.priceMxn.toFixed(2)}
                      {ord.side === 'SELL' && ord.realizedPnlPct !== undefined && (
                        <span
                          className={`ml-2 font-mono font-bold ${
                            ord.realizedPnlPct >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ({ord.realizedPnlPct >= 0 ? '+' : ''}
                          {ord.realizedPnlPct.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                    <div className="text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      Comisión: ${ord.commissionMxn.toFixed(2)} · {ord.timestamp}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comparador Lado a Lado de Dos Activos */}
      <div ref={comparisonRef}>
        <AssetComparisonPanel
          stocks={stocks}
          deepAnalyses={deepAnalyses}
          symbolA={compareSymbolA}
          symbolB={compareSymbolB}
          onChangeSymbolA={setCompareSymbolA}
          onChangeSymbolB={setCompareSymbolB}
          onSwap={() => {
            setCompareSymbolA(compareSymbolB);
            setCompareSymbolB(compareSymbolA);
          }}
          onSelectForTrade={(symbol) => {
            onInspectStock(symbol);
            setTradeFeedback(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenTooltip={onOpenTooltip}
        />
      </div>

      {/* Mapa de Calor de Correlación y Concentración Sectorial */}
      <CorrelationHeatmapPanel
        stocks={stocks}
        positions={positions}
        selectedSymbol={selectedAsset.symbol}
        onComparePair={(symA, symB) => {
          setCompareSymbolA(symA);
          setCompareSymbolB(symB);
          comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onOpenTooltip={onOpenTooltip}
      />
    </div>
  );
};
