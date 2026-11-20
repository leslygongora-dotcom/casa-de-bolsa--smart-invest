export type TabId =
  | 'dashboard'
  | 'market'
  | 'alerts'
  | 'simulator'
  | 'learn'
  | 'options'
  | 'backtest'
  | 'bot'
  | 'profile';

export type Sector =
  | 'Tecnología'
  | 'Índices y ETFs'
  | 'Consumo y Retail'
  | 'Energía y Recursos'
  | 'Salud y Biotecnología'
  | 'Finanzas y Cripto';

export type RiskLevel = 'conservador' | 'moderado' | 'agresivo';

export interface StockAsset {
  symbol: string;
  name: string;
  sector: Sector;
  exchange: string;
  priceMxn: number;
  openPriceMxn: number;
  changePct: number;
  commissionPct: number; // e.g., 0.10%
  volatilityAnnualPct: number;
  annualReturnPct: number;
  peRatio: number | null;
  dividendYieldPct: number;
  aiScore: number;
  aiSignal: 'BUY' | 'HOLD' | 'WATCH';
  aiThesis: string;
  history: number[]; // last 24 data points
  sentimentBullishPct: number;
  yahooTicker?: string;
  priceOriginal?: number;
  originalCurrency?: string;
  usdMxnRate?: number;
  yahooUpdatedAtIso?: string;
  priceSource?: string;
}

export interface PortfolioPosition {
  id: string;
  symbol: string;
  name: string;
  sector: Sector;
  shares: number;
  avgEntryMxn: number;
  stopLossMxn: number;
  takeProfitMxn: number;
  openedAt: string;
  commissionPaidMxn: number;
}

export type OptionContractType = 'CALL' | 'PUT';

export interface OptionPosition {
  id: string;
  underlyingSymbol: string;
  underlyingName: string;
  optionType: OptionContractType;
  contracts: number;
  contractMultiplier: number; // e.g., 1 (Micro) or 10 (Mini)
  strikeMxn: number;
  daysToExpiration: number;
  expirationDateIso: string;
  impliedVolatilityPct: number;
  entryPremiumPerShareMxn: number;
  totalCostMxn: number;
  commissionPaidMxn: number;
  openedAt: string;
  openedAtIso: string;
}

export interface TradeOrder {
  id: string;
  symbol: string;
  instrumentType?: 'STOCK' | 'OPTION';
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  shares: number;
  priceMxn: number;
  totalMxn: number;
  commissionMxn: number;
  traditionalCommissionMxn: number;
  timestamp: string;
  executedAtIso?: string;
  entryPriceMxn?: number;
  costBasisMxn?: number;
  netProceedsMxn?: number;
  realizedPnlMxn?: number;
  realizedPnlPct?: number;
}

export interface EquityTimelinePoint {
  timestampIso: string;
  equityMxn: number;
  eventLabel?: string;
}

export interface WeeklyTransferState {
  lastTransferIso: string | null;
  transfersCount: number;
  totalTransferredMxn: number;
}

export interface NewsItem {
  id: string;
  symbol: string;
  sector: Sector;
  headline: string;
  summary: string;
  source: string;
  publishedAgo: string;
  impact: 'positivo' | 'neutral' | 'alerta';
  quickActionLabel: string;
}

export interface EmailMessage {
  id: string;
  type: 'news_digest' | 'offer' | 'alert_summary';
  to: string;
  subject: string;
  preview: string;
  body: string;
  sentAt: string;
  read: boolean;
  relatedSymbol?: string;
  relatedSector?: Sector;
}

export type AlarmToneKind =
  | 'urgent_sell_loss'
  | 'buy_opportunity'
  | 'dip_in_profit'
  | 'sell_profit'
  | 'hold_steady';

export type TonePreset =
  | 'sirena_urgente'
  | 'pulso_alerta'
  | 'alarma_institucional'
  | 'campana_ascendente'
  | 'timbre_suave'
  | 'acorde_ganancia'
  | 'pulso_discreto';

export interface CustomAudioClip {
  name: string;
  dataUrl: string;
  mimeType: string;
  sizeKb: number;
}

export interface MobileAlarm {
  id: string;
  symbol: string;
  action: 'VENDER' | 'MANTENER' | 'COMPRAR';
  urgency: 'alta' | 'media';
  toneKind?: AlarmToneKind;
  tonePreset?: TonePreset;
  title: string;
  message: string;
  currentPriceMxn: number;
  pnlPct: number;
  triggeredAt: string;
  acknowledged: boolean;
}

export interface DeepAnalysisResult {
  symbol: string;
  titulo: string;
  veredicto: string;
  razones_para_invertir: string[];
  riesgos_clave: string[];
  consejo_accionable: string;
  generatedAt: string;
}

export interface InvestorProfile {
  email: string;
  experience: 'principiante' | 'intermedio' | 'avanzado';
  goal: 'preservacion' | 'crecimiento_moderado' | 'agresivo';
  riskLevel: RiskLevel;
  autoNewsEmail: boolean;
  autoOfferEmail: boolean;
  mobilePushEnabled: boolean;
  soundAlarmEnabled: boolean;
  holdAlertEnabled: boolean;
  sellAlarmDropThresholdPct: number;
  sellAlarmGainThresholdPct: number;
  maxPortfolioVarLimitPct: number;
  alarmCooldownMinutes: number;
  dipInProfitDropPct: number;
  toneSellLoss: TonePreset;
  toneBuyOpportunity: TonePreset;
  toneDipInProfit: TonePreset;
  informativeTonePreset: TonePreset;
  customSoundHighPriority: CustomAudioClip | null;
  customSoundInformative: CustomAudioClip | null;
}

export interface GlossaryEntry {
  termino: string;
  explicacion: string;
  ejemplo_numerico: string;
}
