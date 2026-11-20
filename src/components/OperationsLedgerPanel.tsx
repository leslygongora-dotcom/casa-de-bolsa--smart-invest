import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, Layers } from 'lucide-react';
import type { OptionPosition, PortfolioPosition, StockAsset, TradeOrder } from '../types';
import { markOptionPositionToMarket } from '../utils/blackScholes';
import { computeOpenStockPnl } from '../utils/tradeMetrics';

interface OperationsLedgerPanelProps {
  positions: PortfolioPosition[];
  optionPositions: OptionPosition[];
  orders: TradeOrder[];
  stockMap: Record<string, StockAsset>;
  onQuickSellStock: (symbol: string, shares: number) => void;
  onCloseOptionPosition?: (positionId: string) => { ok: boolean; message: string };
  onInspectStock: (symbol: string) => void;
  onNavigateMarket: () => void;
  onNavigateOptions: () => void;
}

type LedgerFilter = 'all' | 'open' | 'closed';

export const OperationsLedgerPanel: React.FC<OperationsLedgerPanelProps> = ({
  positions,
  optionPositions,
  orders,
  stockMap,
  onQuickSellStock,
  onCloseOptionPosition,
  onInspectStock,
  onNavigateMarket,
  onNavigateOptions,
}) => {
  const [filter, setFilter] = useState<LedgerFilter>('all');

  const openStockRows = useMemo(() => {
    return positions.map((pos) => {
      const current = stockMap[pos.symbol]?.priceMxn ?? pos.avgEntryMxn;
      const metrics = computeOpenStockPnl(pos, current);
      return {
        kind: 'STOCK' as const,
        id: pos.id,
        symbol: pos.symbol,
        name: pos.name,
        quantityLabel: `${pos.shares} acc.`,
        entryPriceMxn: pos.avgEntryMxn,
        currentPriceMxn: current,
        costBasisMxn: metrics.totalCostBasisMxn,
        currentValueMxn: metrics.marketValueMxn,
        pnlMxn: metrics.netPnlMxn,
        pnlPct: metrics.pnlPct,
        openedAt: pos.openedAt,
        shares: pos.shares,
      };
    });
  }, [positions, stockMap]);

  const openOptionRows = useMemo(() => {
    return optionPositions.map((pos) => {
      const underlying = stockMap[pos.underlyingSymbol];
      const spot = underlying?.priceMxn ?? pos.strikeMxn;
      const valued = markOptionPositionToMarket(pos, spot, underlying?.volatilityAnnualPct);
      const costBasis = Number((pos.totalCostMxn + (pos.commissionPaidMxn || 0)).toFixed(2));
      return {
        kind: 'OPTION' as const,
        id: pos.id,
        symbol: `${pos.underlyingSymbol} ${pos.optionType} $${pos.strikeMxn.toFixed(0)}`,
        name: `${pos.underlyingName} (${valued.remainingDays}d rest.)`,
        quantityLabel: `${pos.contracts}×${pos.contractMultiplier}`,
        entryPriceMxn: pos.entryPremiumPerShareMxn,
        currentPriceMxn: valued.quote.premiumPerShareMxn,
        costBasisMxn: costBasis,
        currentValueMxn: valued.currentValueMxn,
        pnlMxn: valued.pnlMxn,
        pnlPct: valued.pnlPct,
        openedAt: pos.openedAt,
      };
    });
  }, [optionPositions, stockMap]);

  const closedOrders = useMemo(() => {
    return orders
      .filter((ord) => ord.side === 'SELL')
      .map((ord) => {
        const entryPrice = ord.entryPriceMxn ?? ord.priceMxn;
        const costBasis =
          ord.costBasisMxn ?? Number((entryPrice * ord.shares + ord.commissionMxn).toFixed(2));
        const netProceeds =
          ord.netProceedsMxn ?? Number(Math.max(0, ord.totalMxn - ord.commissionMxn).toFixed(2));
        const realizedPnlMxn =
          ord.realizedPnlMxn !== undefined
            ? ord.realizedPnlMxn
            : Number((netProceeds - costBasis).toFixed(2));
        const rawPct = costBasis > 0 ? (realizedPnlMxn / costBasis) * 100 : 0;
        const realizedPnlPct =
          ord.realizedPnlPct !== undefined && Number.isFinite(ord.realizedPnlPct)
            ? ord.realizedPnlPct
            : Number((Number.isFinite(rawPct) ? rawPct : 0).toFixed(2));

        return {
          ...ord,
          entryPriceMxn: entryPrice,
          costBasisMxn: costBasis,
          netProceedsMxn: netProceeds,
          realizedPnlMxn,
          realizedPnlPct,
        };
      });
  }, [orders]);

  const summary = useMemo(() => {
    const openCost =
      openStockRows.reduce((a, r) => a + r.costBasisMxn, 0) +
      openOptionRows.reduce((a, r) => a + r.costBasisMxn, 0);
    const openPnl =
      openStockRows.reduce((a, r) => a + r.pnlMxn, 0) +
      openOptionRows.reduce((a, r) => a + r.pnlMxn, 0);
    const openPct = openCost > 0 ? (openPnl / openCost) * 100 : 0;

    const closedCost = closedOrders.reduce((a, o) => a + o.costBasisMxn, 0);
    const closedPnl = closedOrders.reduce((a, o) => a + o.realizedPnlMxn, 0);
    const closedPct = closedCost > 0 ? (closedPnl / closedCost) * 100 : 0;

    const totalCost = openCost + closedCost;
    const totalPnl = openPnl + closedPnl;
    const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    return {
      openCount: openStockRows.length + openOptionRows.length,
      openPnl,
      openPct,
      closedCount: closedOrders.length,
      closedPnl,
      closedPct,
      totalPnl,
      totalPct,
    };
  }, [openStockRows, openOptionRows, closedOrders]);

  const showOpen = filter === 'all' || filter === 'open';
  const showClosed = filter === 'all' || filter === 'closed';

  return (
    <section
      aria-label="Operaciones Abiertas y Cerradas con Rentabilidad"
      className="p-6 rounded-lg bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800/90 space-y-5"
    >
      {/* Header + Filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-500" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Operaciones Abiertas y Cerradas · Rentabilidad Neta
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Seguimiento completo de acciones y opciones con comisiones del 0.10% incluidas en el porcentaje real de rentabilidad.
          </p>
        </div>

        <div
          className="inline-flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 self-start md:self-auto"
          role="group"
          aria-label="Filtrar operaciones"
        >
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
              filter === 'all'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Todas ({summary.openCount + summary.closedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('open')}
            className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
              filter === 'open'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Abiertas ({summary.openCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('closed')}
            className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
              filter === 'closed'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Cerradas ({summary.closedCount})
          </button>
        </div>
      </div>

      {/* KPIs de Rentabilidad Abierta, Cerrada y Total */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Abiertas ({summary.openCount})</span>
            <Clock className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <div
            className={`mt-1.5 text-lg font-bold font-mono tabular-nums ${
              summary.openPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {summary.openPnl >= 0 ? '+' : '-'}$
            {Math.abs(summary.openPnl).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN ({summary.openPct >= 0 ? '+' : ''}
            {summary.openPct.toFixed(2)}%)
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Cerradas ({summary.closedCount})</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div
            className={`mt-1.5 text-lg font-bold font-mono tabular-nums ${
              summary.closedPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {summary.closedPnl >= 0 ? '+' : '-'}$
            {Math.abs(summary.closedPnl).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN ({summary.closedPct >= 0 ? '+' : ''}
            {summary.closedPct.toFixed(2)}%)
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Rentabilidad Neta Combinada</span>
            {summary.totalPnl >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-rose-500" />
            )}
          </div>
          <div
            className={`mt-1.5 text-lg font-bold font-mono tabular-nums ${
              summary.totalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {summary.totalPnl >= 0 ? '+' : '-'}$
            {Math.abs(summary.totalPnl).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN ({summary.totalPct >= 0 ? '+' : ''}
            {summary.totalPct.toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Tabla Unificada */}
      {summary.openCount === 0 && summary.closedCount === 0 ? (
        <div className="py-8 px-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Aún no registras operaciones abiertas ni cerradas en este portafolio.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={onNavigateMarket}
              className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Operar Acciones
            </button>
            <button
              type="button"
              onClick={onNavigateOptions}
              className="px-4 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Operar Opciones Call &amp; Put
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-3 pr-3">Estado</th>
                <th className="py-3 px-3">Instrumento</th>
                <th className="py-3 px-3 text-right">Cantidad</th>
                <th className="py-3 px-3 text-right">Entrada</th>
                <th className="py-3 px-3 text-right">Actual / Salida</th>
                <th className="py-3 px-3 text-right">Invertido (c/ com.)</th>
                <th className="py-3 px-3 text-right">Rentabilidad ($ / %)</th>
                <th className="py-3 pl-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {showOpen &&
                openStockRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/35">
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[11px] font-bold">
                        ABIERTA · ACCIÓN
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => {
                          onInspectStock(row.symbol);
                          onNavigateMarket();
                        }}
                        className="text-left hover:text-emerald-500 cursor-pointer"
                      >
                        <div className="font-mono font-bold text-slate-900 dark:text-white">{row.symbol}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{row.name}</div>
                      </button>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{row.quantityLabel}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      ${row.entryPriceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                      ${row.currentPriceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      ${row.costBasisMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums font-bold ${
                        row.pnlMxn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {row.pnlMxn >= 0 ? '+' : '-'}${Math.abs(row.pnlMxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ({row.pnlPct >= 0 ? '+' : ''}
                      {row.pnlPct.toFixed(2)}%)
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => onQuickSellStock(row.symbol, row.shares)}
                        className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500 hover:text-rose-500 text-[11px] font-semibold cursor-pointer"
                      >
                        Cerrar
                      </button>
                    </td>
                  </tr>
                ))}

              {showOpen &&
                openOptionRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/35">
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
                        ABIERTA · OPCIÓN
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">{row.symbol}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{row.name}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{row.quantityLabel}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      ${row.entryPriceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                      ${row.currentPriceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      ${row.costBasisMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums font-bold ${
                        row.pnlMxn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {row.pnlMxn >= 0 ? '+' : '-'}${Math.abs(row.pnlMxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ({row.pnlPct >= 0 ? '+' : ''}
                      {row.pnlPct.toFixed(2)}%)
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {onCloseOptionPosition && (
                        <button
                          type="button"
                          onClick={() => onCloseOptionPosition(row.id)}
                          className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500 hover:text-rose-500 text-[11px] font-semibold cursor-pointer"
                        >
                          Cerrar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

              {showClosed &&
                closedOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/35">
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold">
                        CERRADA · {ord.instrumentType === 'OPTION' ? 'OPCIÓN' : 'ACCIÓN'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">{ord.symbol}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{ord.timestamp}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{ord.shares}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      ${ord.entryPriceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                      ${ord.priceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      ${ord.costBasisMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums font-bold ${
                        ord.realizedPnlMxn >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {ord.realizedPnlMxn >= 0 ? '+' : '-'}$
                      {Math.abs(ord.realizedPnlMxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ({ord.realizedPnlPct >= 0 ? '+' : ''}
                      {ord.realizedPnlPct.toFixed(2)}%)
                    </td>
                    <td className="py-3 pl-3 text-right text-[11px] font-mono text-slate-400">
                      Realizada
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
