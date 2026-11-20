import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  CheckCircle2,
  FlaskConical,
  Gamepad2,
  LineChart,
  LogOut,
  Mail,
  Menu,
  Moon,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Terminal,
  UserCheck,
  WifiOff,
  X,
} from 'lucide-react';
import { AlertsMailView } from './components/AlertsMailView';
import {
  BacktestView,
  LearnView,
  OptionsView,
  ProfileView,
  SimulatorView,
} from './components/AnalyticsViews';
import { AuthGateView } from './components/AuthGateView';
import { BotTelegramView } from './components/BotTelegramView';
import { DashboardView } from './components/DashboardView';
import { FloatingBrokerChatbot } from './components/FloatingBrokerChatbot';
import { InvestorProfileSummaryPanel } from './components/InvestorProfileSummaryPanel';
import { InvestorProfileTestModal } from './components/InvestorProfileTestModal';
import { MarketView } from './components/MarketView';
import { auth } from './firebase';
import { useBrokerageEngine } from './hooks/useBrokerageEngine';
import { useInvestorOnboarding } from './hooks/useInvestorOnboarding';
import { GlossaryEntry, TabId } from './types';
import { formatSavedTimestamp } from './utils/portfolioStorage';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Error inesperado en la aplicación.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090C11] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full p-6 rounded-xl bg-[#0E131B] border border-rose-800 space-y-4">
            <h2 className="text-lg font-bold text-rose-400">Ocurrió un inconveniente al cargar tu sesión</h2>
            <p className="text-xs text-slate-300 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ToastItem {
  id: string;
  message: string;
  tone: 'success' | 'warning' | 'info';
}

const NAV_ITEMS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Resumen Patrimonial', icon: Briefcase },
  { id: 'market', label: 'Mercado y Órdenes', icon: Activity },
  { id: 'alerts', label: 'Correos y Alertas', icon: Mail },
  { id: 'simulator', label: 'Simulador Monte Carlo', icon: Sliders },
  { id: 'learn', label: 'Asesoría IA y Voz', icon: BookOpen },
  { id: 'options', label: 'Opciones Black-Scholes', icon: LineChart },
  { id: 'backtest', label: 'Backtesting Cuantitativo', icon: FlaskConical },
  { id: 'bot', label: 'Bot Python y Telegram', icon: Terminal },
  { id: 'profile', label: 'Perfil y Umbrales', icon: UserCheck },
];

interface AppAuthenticatedContentProps {
  authUser: User;
  onUserUpdated: (user: User) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

function AppAuthenticatedContent({
  authUser,
  onUserUpdated,
  darkMode,
  onToggleDarkMode,
}: AppAuthenticatedContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [largeText, setLargeText] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [glossary, setGlossary] = useState<Record<string, GlossaryEntry>>({});
  const [activeTooltipKey, setActiveTooltipKey] = useState<string | null>(null);
  const [learnQuestion, setLearnQuestion] = useState<string | null>(null);

  const pushToast = useCallback((message: string, tone: 'success' | 'warning' | 'info' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [{ id, message, tone }, ...prev].slice(0, 3));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

  const userEmail = authUser.email || '';
  const userDisplayLabel = authUser.displayName?.trim() || userEmail || 'Inversionista';

  const engine = useBrokerageEngine(pushToast, authUser.uid, userEmail);

  const onboarding = useInvestorOnboarding({
    firebaseUser: authUser,
    initialPortfolioMxn: engine.totalPortfolioMxn,
    onSyncEngineRiskLevel: (riskLevel) =>
      engine.setProfile((prev) =>
        prev.riskLevel === riskLevel ? prev : { ...prev, riskLevel }
      ),
    onUserReloaded: onUserUpdated,
    onToast: pushToast,
  });

  useEffect(() => {
    document.documentElement.classList.toggle('large-text', largeText);
  }, [largeText]);

  useEffect(() => {
    fetch('/api/glossary/tooltips')
      .then((r) => r.json())
      .then(setGlossary)
      .catch(() => {});
  }, []);

  const unreadEmailsCount = engine.emails.filter((e) => !e.read).length;
  const unreadAlarmsCount = engine.alarms.filter((a) => !a.acknowledged).length;

  const currentNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Smart Invest';
  const activeTooltip = activeTooltipKey
    ? glossary[activeTooltipKey] || {
        termino: 'Concepto de Inversión',
        explicacion:
          'Este indicador mide el equilibrio entre rendimiento esperado y protección de capital bajo el límite estricto del 2.5% VaR.',
        ejemplo_numerico:
          'Con $100,000 MXN y VaR máximo de 2.5%, tu riesgo diario estimado queda acotado a $2,500 MXN.',
      }
    : null;

  const activeAdviceAsset = engine.activeAdviceModalSymbol
    ? engine.stockMap[engine.activeAdviceModalSymbol]
    : null;
  const activeAdvice = engine.activeAdviceModalSymbol
    ? engine.deepAnalyses[engine.activeAdviceModalSymbol]
    : null;

  return (
    <div className="min-h-screen flex bg-[#F5F6F8] dark:bg-[#090C11] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Sidebar Desktop Institucional */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0E131B] shrink-0 sticky top-0 h-screen">
        <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800/90 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-slate-900 dark:bg-emerald-500/15 border border-slate-800 dark:border-emerald-500/30 text-white dark:text-emerald-400 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap block">
              Smart Invest
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const badgeCount = item.id === 'alerts' ? unreadEmailsCount + unreadAlarmsCount : 0;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 font-medium'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {badgeCount > 0 && (
                  <span className="font-mono tabular-nums text-xs font-bold text-emerald-500 dark:text-emerald-400">
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Cuenta Activa y Estado de Protección VaR en Sidebar */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800/90 space-y-2.5 text-xs">
          <div className="pb-2.5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                {userDisplayLabel}
              </div>
              {authUser.displayName && userEmail && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {userEmail}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void onboarding.signOutAccount()}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Control VaR 99%</span>
            </span>
            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              {engine.portfolioVarPct.toFixed(2)}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, (engine.portfolioVarPct / 2.5) * 100)}%` }}
            />
          </div>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            Límite patrimonial: <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">2.50%</span> · Comisión <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">0.10%</span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Respaldo local: <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">{formatSavedTimestamp(engine.lastSavedAt)}</span>
          </p>
        </div>
      </aside>

      {/* Drawer Móvil */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/70" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-[#0E131B] h-full border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <span className="font-display font-bold text-base text-slate-900 dark:text-white">Smart Invest</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium ${
                      active
                        ? 'bg-slate-900 text-white dark:bg-slate-800 font-semibold'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? 'text-emerald-400' : ''}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-600 dark:text-slate-300 font-medium">
                {userEmail || userDisplayLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void onboarding.signOutAccount();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Área Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 px-4 sm:px-8 border-b border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0E131B] sticky top-0 z-30 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
              aria-label="Abrir navegación"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              Banca Patrimonial <span aria-hidden="true">/</span>{' '}
              <span className="font-semibold text-slate-900 dark:text-white">{currentNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setActiveTab('alerts')}
              className="relative p-2 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Ver correos y alertas"
            >
              <Bell className="w-4 h-4" />
              {unreadEmailsCount + unreadAlarmsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center font-mono tabular-nums">
                  {unreadEmailsCount + unreadAlarmsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setLargeText((l) => !l)}
              className={`px-3 py-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                largeText
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              aria-pressed={largeText}
              aria-label="Activar o desactivar texto grande para facilitar lectura"
            >
              A+ Texto Grande
            </button>

            <button
              onClick={onToggleDarkMode}
              className="p-2 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Cambiar entre modo claro y oscuro"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => onboarding.setIsTestModalOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              {onboarding.evaluation
                ? `Perfil: ${onboarding.evaluation.profileDisplayName}`
                : 'Test de Perfil'}
            </button>

            <button
              onClick={() => void onboarding.signOutAccount()}
              className="hidden xl:inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title={`Cerrar sesión (${userEmail || userDisplayLabel})`}
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span>Salir</span>
            </button>

            <button
              type="button"
              onClick={engine.toggleGameMode}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                engine.gameModeEnabled
                  ? 'border-amber-400 bg-amber-500 text-slate-950 hover:bg-amber-600 shadow-sm'
                  : 'border-amber-400/70 bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50'
              }`}
              aria-pressed={engine.gameModeEnabled}
              title="Activa el Modo Juego para recibir $10,000 USD diarios de práctica sin afectar tu saldo inicial de $0"
            >
              <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {engine.gameModeEnabled ? 'Modo Juego: ON' : 'Modo Juego ($10k/día)'}
              </span>
              <span className="sm:hidden">
                {engine.gameModeEnabled ? 'Juego ON' : 'Juego'}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('market')}
              className="hidden sm:inline-flex px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Operar en Mercado
            </button>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 space-y-6">
          {onboarding.needsEmailVerification && (
            <div
              role="status"
              className="p-4 rounded-lg border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-sky-950 dark:text-sky-100"
            >
              <div className="flex items-start sm:items-center gap-2.5">
                <Mail className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5 sm:mt-0" />
                <span>
                  Enviamos un enlace de verificación a <strong>{userEmail}</strong>. Confírmalo para activar el respaldo privado en Firebase Firestore (mientras tanto tu perfil y portafolio ya se guardan en este dispositivo).
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void onboarding.resendVerification()}
                  disabled={onboarding.firebaseBusy}
                  className="px-3 py-1.5 rounded-md border border-sky-400 dark:border-sky-700 text-xs font-bold hover:bg-sky-100 dark:hover:bg-sky-900/50 cursor-pointer disabled:opacity-50"
                >
                  Reenviar correo
                </button>
                <button
                  type="button"
                  onClick={() => void onboarding.verifyEmailStatus()}
                  disabled={onboarding.firebaseBusy}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  Ya verifiqué mi correo
                </button>
              </div>
            </div>
          )}

          {!engine.isOnline && (
            <div
              role="status"
              className="p-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm text-amber-900 dark:text-amber-200"
            >
              <div className="flex items-center gap-2.5 font-semibold">
                <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  Sin conexión a internet · Consultando tus posiciones y últimas cotizaciones guardadas localmente en este dispositivo.
                </span>
              </div>
              <span className="font-mono tabular-nums text-xs shrink-0">
                Último respaldo: {formatSavedTimestamp(engine.lastSavedAt)}
              </span>
            </div>
          )}
          {activeTab === 'dashboard' && (
            <DashboardView
              totalPortfolioMxn={engine.totalPortfolioMxn}
              cashMxn={engine.cashMxn}
              dailyPnlMxn={engine.dailyPnlMxn}
              dailyPnlPct={engine.dailyPnlPct}
              portfolioVarPct={engine.portfolioVarPct}
              totalCommissionSavedMxn={engine.totalCommissionSavedMxn}
              positions={engine.positions}
              optionPositions={engine.optionPositions}
              orders={engine.orders}
              stockMap={engine.stockMap}
              equityHistory={engine.equityHistory}
              portfolioCreatedAtIso={engine.portfolioCreatedAtIso}
              equityTimeline={engine.equityTimeline}
              weeklyTransfer={engine.weeklyTransfer}
              canTransferWeekly10k={engine.canTransferWeekly10k}
              nextWeeklyTransferAtIso={engine.nextWeeklyTransferAtIso}
              daysUntilNextWeeklyTransfer={engine.daysUntilNextWeeklyTransfer}
              onTransferWeekly10k={engine.transferWeekly10k}
              news={engine.news}
              alarms={engine.alarms}
              favoriteSectors={engine.favoriteSectors}
              gameModeEnabled={engine.gameModeEnabled}
              gameModeDaysClaimed={engine.gameModeDaysClaimed}
              gameModeTotalUsdGranted={engine.gameModeTotalUsdGranted}
              canClaimTodayGameBonus={engine.canClaimTodayGameBonus}
              dailyGrantMxn={engine.dailyGrantMxn}
              effectiveUsdMxnRate={engine.effectiveUsdMxnRate}
              onToggleGameMode={engine.toggleGameMode}
              onClaimDailyGameBonus={engine.claimDailyGameBonus}
              onNavigate={setActiveTab}
              onInspectStock={(symbol) => engine.inspectStock(symbol)}
              onQuickSell={(symbol, shares) =>
                engine.executeTrade({ symbol, side: 'SELL', shares, orderType: 'MARKET' })
              }
              onCloseOptionPosition={engine.closeOptionPosition}
              onOpenTooltip={setActiveTooltipKey}
              onSimulateShock={engine.simulateMarketShock}
              investorProfilePanel={
                <InvestorProfileSummaryPanel
                  evaluation={onboarding.evaluation}
                  firebaseUserEmail={onboarding.firebaseUser.email ?? null}
                  emailVerified={onboarding.emailVerified}
                  firebaseSyncedAtIso={onboarding.firebaseSyncedAtIso}
                  firebaseBusy={onboarding.firebaseBusy}
                  onRetakeTest={() => onboarding.setIsTestModalOpen(true)}
                  onResendVerification={onboarding.resendVerification}
                  onCheckVerification={onboarding.verifyEmailStatus}
                  onSignOut={onboarding.signOutAccount}
                  onDeleteFirebaseProfile={onboarding.deleteFirebaseProfile}
                  onOpenTooltip={setActiveTooltipKey}
                />
              }
            />
          )}

          {activeTab === 'market' && (
            <MarketView
              stocks={engine.stocks}
              selectedSymbol={engine.selectedSymbol}
              positions={engine.positions}
              orders={engine.orders}
              cashMxn={engine.cashMxn}
              isMarketLive={engine.isMarketLive}
              viewCounts={engine.viewCounts}
              favoriteSectors={engine.favoriteSectors}
              deepAnalyses={engine.deepAnalyses}
              loadingAnalysisSymbol={engine.loadingAnalysisSymbol}
              onToggleLive={() => engine.setIsMarketLive((v) => !v)}
              onInspectStock={engine.inspectStock}
              onRequestDeepAnalysis={(asset) =>
                engine.fetchDeepAnalysis(asset, engine.viewCounts[asset.symbol] || 3, true)
              }
              onExecuteTrade={engine.executeTrade}
              onOpenTooltip={setActiveTooltipKey}
              investorEvaluation={onboarding.evaluation}
              issWeights={onboarding.issWeights}
              onUpdateIssWeights={onboarding.updateWeights}
              onOpenTestModal={() => onboarding.setIsTestModalOpen(true)}
              usdMxnRate={engine.usdMxnRate}
              lastYahooSyncIso={engine.lastYahooSyncIso}
              quotesLoading={engine.quotesLoading}
              onRefreshQuotes={() => void engine.refreshYahooQuotes(true)}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsMailView
              emails={engine.emails}
              alarms={engine.alarms}
              profile={engine.profile}
              positions={engine.positions}
              stockMap={engine.stockMap}
              favoriteSectors={engine.favoriteSectors}
              deepAnalyses={engine.deepAnalyses}
              totalPortfolioMxn={engine.totalPortfolioMxn}
              cashMxn={engine.cashMxn}
              dailyPnlMxn={engine.dailyPnlMxn}
              dailyPnlPct={engine.dailyPnlPct}
              portfolioVarPct={engine.portfolioVarPct}
              totalCommissionSavedMxn={engine.totalCommissionSavedMxn}
              onGenerateEmail={(t) => engine.generatePersonalizedEmail(t)}
              onMarkEmailRead={engine.markEmailRead}
              onAcknowledgeAlarm={engine.acknowledgeAlarm}
              onQuickSell={(symbol, shares) =>
                engine.executeTrade({ symbol, side: 'SELL', shares, orderType: 'MARKET' })
              }
              onSimulateShock={engine.simulateMarketShock}
              onEnablePush={engine.enablePushNotifications}
              onToggleSound={() =>
                engine.setProfile((p) => ({ ...p, soundAlarmEnabled: !p.soundAlarmEnabled }))
              }
              onUpdateProfile={engine.setProfile}
              onInspectStock={(sym) => {
                engine.inspectStock(sym);
                setActiveTab('market');
              }}
              onNotifyToast={pushToast}
            />
          )}

          {activeTab === 'simulator' && <SimulatorView />}

          {activeTab === 'learn' && (
            <LearnView
              positions={engine.positions}
              favoriteSectors={engine.favoriteSectors}
              initialQuestion={learnQuestion}
            />
          )}

          {activeTab === 'options' && (
            <OptionsView
              stocks={engine.stocks}
              cashMxn={engine.cashMxn}
              totalPortfolioMxn={engine.totalPortfolioMxn}
              maxVarLimitPct={engine.profile.maxPortfolioVarLimitPct}
              optionPositions={engine.optionPositions}
              onExecuteOptionBuy={engine.executeOptionBuy}
              onCloseOptionPosition={engine.closeOptionPosition}
              onOpenTooltip={setActiveTooltipKey}
            />
          )}

          {activeTab === 'backtest' && <BacktestView />}

          {activeTab === 'bot' && (
            <BotTelegramView
              evaluation={onboarding.evaluation}
              totalPortfolioMxn={engine.totalPortfolioMxn}
              usdMxnRate={engine.usdMxnRate}
              onOpenTestModal={() => onboarding.setIsTestModalOpen(true)}
              onNotifyToast={pushToast}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              profile={engine.profile}
              favoriteSectors={engine.favoriteSectors}
              stocks={engine.stocks}
              orders={engine.orders}
              positionsCount={engine.positions.length}
              cashMxn={engine.cashMxn}
              isOnline={engine.isOnline}
              lastSavedAt={engine.lastSavedAt}
              onSaveSnapshotNow={() => {
                const ts = engine.savePortfolioSnapshotNow();
                if (ts) {
                  pushToast(
                    `Portafolio respaldado en el dispositivo (${formatSavedTimestamp(ts)}).`,
                    'success'
                  );
                }
              }}
              onResetPortfolio={engine.resetPortfolioToDefault}
              onSaveProfile={(updated) => {
                engine.setProfile(updated);
                pushToast(
                  `Umbrales guardados: alerta venta en -${updated.sellAlarmDropThresholdPct.toFixed(1)}% / +${updated.sellAlarmGainThresholdPct.toFixed(1)}% y VaR máx ${updated.maxPortfolioVarLimitPct.toFixed(1)}%.`,
                  'success'
                );
              }}
              onGenerateOffer={async (asset) => {
                await engine.generatePersonalizedEmail('offer', asset);
                setActiveTab('alerts');
              }}
              onEnablePush={engine.enablePushNotifications}
              onTestSellAlarm={() => engine.simulateMarketShock('drop')}
              onNotifyToast={pushToast}
              investorProfilePanel={
                <InvestorProfileSummaryPanel
                  evaluation={onboarding.evaluation}
                  firebaseUserEmail={onboarding.firebaseUser.email ?? null}
                  emailVerified={onboarding.emailVerified}
                  firebaseSyncedAtIso={onboarding.firebaseSyncedAtIso}
                  firebaseBusy={onboarding.firebaseBusy}
                  onRetakeTest={() => onboarding.setIsTestModalOpen(true)}
                  onResendVerification={onboarding.resendVerification}
                  onCheckVerification={onboarding.verifyEmailStatus}
                  onSignOut={onboarding.signOutAccount}
                  onDeleteFirebaseProfile={onboarding.deleteFirebaseProfile}
                  onOpenTooltip={setActiveTooltipKey}
                />
              }
            />
          )}
        </main>
      </div>

      {/* Modal de Análisis Profundo (Cuando el usuario vio varias veces una acción sin comprarla) */}
      {engine.activeAdviceModalSymbol && activeAdviceAsset && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 rounded-lg max-w-xl w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Análisis por Interés Repetido ({engine.viewCounts[activeAdviceAsset.symbol] || 3} consultas)
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {activeAdvice ? activeAdvice.titulo : `Evaluando ${activeAdviceAsset.symbol}...`}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => engine.setActiveAdviceModalSymbol(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Cerrar análisis"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {engine.loadingAnalysisSymbol === activeAdviceAsset.symbol && !activeAdvice ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Evaluando desempeño histórico de {activeAdviceAsset.symbol}, tolerancia al riesgo y límite VaR 2.5%...
              </div>
            ) : activeAdvice ? (
              <div className="space-y-4 text-sm">
                <div className="p-3.5 rounded-md bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    Veredicto: {activeAdvice.veredicto}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">
                    {activeAdvice.consejo_accionable}
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1.5">
                    Argumentos a favor
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {activeAdvice.razones_para_invertir.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-rose-700 dark:text-rose-400 mb-1.5">
                    Riesgos a vigilar
                  </h4>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400 list-disc pl-4">
                    {activeAdvice.riesgos_clave.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
              <button
                onClick={() => {
                  const sym = activeAdviceAsset.symbol;
                  engine.setActiveAdviceModalSymbol(null);
                  setLearnQuestion(`Explícame más sobre ${sym} y cómo entrar con bajo riesgo.`);
                  setActiveTab('learn');
                }}
                className="px-4 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Consultar con Asesor IA
              </button>
              <button
                onClick={() => {
                  engine.setActiveAdviceModalSymbol(null);
                  engine.setSelectedSymbol(activeAdviceAsset.symbol);
                  setActiveTab('market');
                }}
                className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                Operar {activeAdviceAsset.symbol}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Glosario Educativo (?) */}
      {activeTooltip && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeTooltip.termino}</h3>
              <button
                onClick={() => setActiveTooltipKey(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Cerrar explicación"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{activeTooltip.explicacion}</p>
            <div className="p-3.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200">
              <strong>Ejemplo numérico:</strong> {activeTooltip.ejemplo_numerico}
            </div>
            <button
              onClick={() => setActiveTooltipKey(null)}
              className="w-full py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Chatbot Multi-Turno Global con Google Search */}
      <FloatingBrokerChatbot
        activeTab={activeTab}
        selectedSymbol={engine.selectedSymbol}
        positions={engine.positions}
        favoriteSectors={engine.favoriteSectors}
        portfolioVarPct={engine.portfolioVarPct}
      />

      {/* Toasts No Intrusivos */}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto p-3.5 rounded-md border shadow-lg text-xs font-semibold ${
                t.tone === 'success'
                  ? 'bg-emerald-950 text-emerald-100 border-emerald-800'
                  : t.tone === 'warning'
                  ? 'bg-rose-950 text-rose-100 border-rose-800'
                  : 'bg-[#0E131B] text-slate-100 border-slate-700'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
      {/* Test Inicial de Perfil de Inversionista (Primer Ingreso / Actualización) */}
      <InvestorProfileTestModal
        isOpen={onboarding.isTestModalOpen}
        isFirstTimeOnboarding={!onboarding.onboardingCompleted}
        initialAnswers={onboarding.answers ?? undefined}
        firebaseUserEmail={onboarding.firebaseUser.email ?? null}
        emailVerified={onboarding.emailVerified}
        savingToFirebase={onboarding.isSavingProfile}
        onComplete={onboarding.completeTest}
        onClose={() => onboarding.setIsTestModalOpen(false)}
      />
    </div>
  );
}

function AppRoot() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [, setAuthRefreshTick] = useState<number>(0);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] dark:bg-[#090C11] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-lg bg-emerald-600/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 animate-pulse" />
          </div>
          <p className="text-sm font-semibold">Cargando Smart Invest...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <AuthGateView
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
      />
    );
  }

  return (
    <AppAuthenticatedContent
      key={authUser.uid}
      authUser={authUser}
      onUserUpdated={(updatedUser) => {
        setAuthUser(updatedUser);
        setAuthRefreshTick((t) => t + 1);
      }}
      darkMode={darkMode}
      onToggleDarkMode={() => setDarkMode((d) => !d)}
    />
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppRoot />
    </AppErrorBoundary>
  );
}
