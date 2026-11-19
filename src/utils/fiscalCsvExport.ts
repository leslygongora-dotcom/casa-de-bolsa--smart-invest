import { StockAsset, TradeOrder } from '../types';

export interface FiscalSummary {
  totalOrders: number;
  buyCount: number;
  sellCount: number;
  totalBuysMxn: number;
  totalSellsMxn: number;
  totalCommissionsMxn: number;
  totalSavingsMxn: number;
}

export function computeFiscalSummary(orders: TradeOrder[]): FiscalSummary {
  let buyCount = 0;
  let sellCount = 0;
  let totalBuysMxn = 0;
  let totalSellsMxn = 0;
  let totalCommissionsMxn = 0;
  let totalSavingsMxn = 0;

  for (const ord of orders) {
    if (ord.side === 'BUY') {
      buyCount += 1;
      totalBuysMxn += ord.totalMxn;
    } else {
      sellCount += 1;
      totalSellsMxn += ord.totalMxn;
    }
    totalCommissionsMxn += ord.commissionMxn;
    totalSavingsMxn += Math.max(0, ord.traditionalCommissionMxn - ord.commissionMxn);
  }

  return {
    totalOrders: orders.length,
    buyCount,
    sellCount,
    totalBuysMxn: Number(totalBuysMxn.toFixed(2)),
    totalSellsMxn: Number(totalSellsMxn.toFixed(2)),
    totalCommissionsMxn: Number(totalCommissionsMxn.toFixed(2)),
    totalSavingsMxn: Number(totalSavingsMxn.toFixed(2)),
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportOrdersToFiscalCsv(
  orders: TradeOrder[],
  stocks: StockAsset[],
  userEmail: string
): { fileName: string; count: number } {
  const stockBySymbol: Record<string, StockAsset> = {};
  for (const s of stocks) {
    stockBySymbol[s.symbol] = s;
  }

  const headers = [
    'ID_Operacion',
    'Fecha_ISO',
    'Fecha_Hora_Local',
    'Tipo_Operacion',
    'Modalidad_Orden',
    'Ticker',
    'Emisora',
    'Sector',
    'Cantidad_Acciones',
    'Precio_Unitario_MXN',
    'Importe_Bruto_MXN',
    'Comision_Pagada_MXN',
    'Flujo_Neto_Fiscal_MXN',
    'Comision_Tradicional_Ref_MXN',
    'Ahorro_Comision_MXN',
    'Titular_Cuenta',
  ];

  const rows = orders.map((ord) => {
    const asset = stockBySymbol[ord.symbol];
    const netCashflowMxn =
      ord.side === 'BUY'
        ? -(ord.totalMxn + ord.commissionMxn)
        : ord.totalMxn - ord.commissionMxn;
    const savings = Math.max(0, ord.traditionalCommissionMxn - ord.commissionMxn);

    return [
      ord.id,
      ord.executedAtIso || new Date().toISOString(),
      ord.timestamp,
      ord.side === 'BUY' ? 'COMPRA (ADQUISICION)' : 'VENTA (ENAJENACION)',
      ord.orderType === 'MARKET' ? 'A MERCADO' : 'LIMITE',
      ord.symbol,
      asset?.name || (ord.instrumentType === 'OPTION' ? `Contrato Opción (${ord.symbol})` : ord.symbol),
      asset?.sector || (ord.instrumentType === 'OPTION' ? 'Derivados (Opciones)' : 'Renta Variable'),
      ord.shares,
      ord.priceMxn.toFixed(2),
      ord.totalMxn.toFixed(2),
      ord.commissionMxn.toFixed(2),
      netCashflowMxn.toFixed(2),
      ord.traditionalCommissionMxn.toFixed(2),
      savings.toFixed(2),
      userEmail,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  // UTF-8 BOM ensures Excel / Sheets renders Spanish accents properly
  const csvContent = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `smart_invest_operaciones_fiscales_${dateStamp}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { fileName, count: orders.length };
}
