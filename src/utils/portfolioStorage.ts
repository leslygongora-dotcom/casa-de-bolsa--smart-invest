import {
  DeepAnalysisResult,
  EmailMessage,
  EquityTimelinePoint,
  InvestorProfile,
  MobileAlarm,
  OptionPosition,
  PortfolioPosition,
  Sector,
  StockAsset,
  TradeOrder,
  WeeklyTransferState,
} from '../types';

export function getPortfolioStorageKey(uid: string): string {
  const safeUid = (uid || 'guest').replace(/[^a-zA-Z0-9_-]/g, '');
  return `smart_invest_portfolio_state_v3_${safeUid}`;
}

export type PersistedProfileSettings = Omit<
  InvestorProfile,
  'customSoundHighPriority' | 'customSoundInformative'
>;

export interface PortfolioSnapshotBucket {
  cashMxn: number;
  positions: PortfolioPosition[];
  optionPositions: OptionPosition[];
  orders: TradeOrder[];
  equityHistory: number[];
  portfolioCreatedAtIso?: string;
  equityTimeline?: EquityTimelinePoint[];
  weeklyTransfer?: WeeklyTransferState;
}

export interface GameModeState {
  enabled: boolean;
  lastGrantDate: string | null; // YYYY-MM-DD local calendar day
  daysClaimed: number;
  totalUsdGranted: number;
  sandboxBackup: PortfolioSnapshotBucket;
  normalBackup: PortfolioSnapshotBucket;
}

export interface PersistedPortfolioState {
  version: 3;
  uid: string;
  savedAtIso: string;
  portfolioCreatedAtIso?: string;
  cashMxn: number;
  positions: PortfolioPosition[];
  optionPositions?: OptionPosition[];
  orders: TradeOrder[];
  equityHistory: number[];
  equityTimeline?: EquityTimelinePoint[];
  weeklyTransfer?: WeeklyTransferState;
  stocks: StockAsset[];
  viewCounts: Record<string, number>;
  sectorScores: Record<Sector, number>;
  emails: EmailMessage[];
  alarms: MobileAlarm[];
  deepAnalyses: Record<string, DeepAnalysisResult>;
  profileSettings?: PersistedProfileSettings;
  gameMode?: GameModeState;
}

export function loadPersistedPortfolio(uid: string): PersistedPortfolioState | null {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return null;
  try {
    const raw = window.localStorage.getItem(getPortfolioStorageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedPortfolioState>;
    if (
      parsed?.version !== 3 ||
      parsed.uid !== uid ||
      !Number.isFinite(parsed.cashMxn) ||
      !Array.isArray(parsed.positions) ||
      !Array.isArray(parsed.orders) ||
      !Array.isArray(parsed.equityHistory) ||
      !Array.isArray(parsed.stocks)
    ) {
      return null;
    }
    return parsed as PersistedPortfolioState;
  } catch {
    return null;
  }
}

export function savePersistedPortfolio(
  uid: string,
  payload: Omit<PersistedPortfolioState, 'version' | 'uid' | 'savedAtIso'>
): string | null {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return null;
  const savedAtIso = new Date().toISOString();
  const record: PersistedPortfolioState = {
    version: 3,
    uid,
    savedAtIso,
    ...payload,
  };
  try {
    window.localStorage.setItem(getPortfolioStorageKey(uid), JSON.stringify(record));
    return savedAtIso;
  } catch {
    return null;
  }
}

export function clearPersistedPortfolio(uid: string): void {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return;
  try {
    window.localStorage.removeItem(getPortfolioStorageKey(uid));
  } catch {
    // ignore storage removal errors
  }
}

export function formatSavedTimestamp(iso: string | null): string {
  if (!iso) return 'Pendiente';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Reciente';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
