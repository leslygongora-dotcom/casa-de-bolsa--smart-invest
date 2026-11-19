import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  INITIAL_NEWS,
  INITIAL_STOCKS,
  SMART_INVEST_COMMISSION_PCT,
  TRADITIONAL_BROKER_FEE_PCT,
} from '../data/marketData';
import {
  AlarmToneKind,
  DeepAnalysisResult,
  EmailMessage,
  InvestorProfile,
  MobileAlarm,
  NewsItem,
  OptionContractType,
  OptionPosition,
  PortfolioPosition,
  Sector,
  StockAsset,
  TonePreset,
  TradeOrder,
} from '../types';
import {
  playAlarmSound,
  requestBrowserNotificationPermission,
  sendBrowserPushNotification,
  triggerMobileVibration,
} from '../utils/audioAlarm';
import { markOptionPositionToMarket, priceBlackScholesOption } from '../utils/blackScholes';
import {
  clearPersistedPortfolio,
  type GameModeState,
  loadPersistedPortfolio,
  type PersistedPortfolioState,
  type PortfolioSnapshotBucket,
  savePersistedPortfolio,
} from '../utils/portfolioStorage';

const ALL_SECTORS: Sector[] = [
  'Tecnología',
  'Índices y ETFs',
  'Consumo y Retail',
  'Energía y Recursos',
  'Salud y Biotecnología',
  'Finanzas y Cripto',
];

const GAME_MODE_DAILY_USD = 10000;
const FALLBACK_USD_MXN_RATE = 20.0;

function getTodayLocalDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createEmptyBucket(): PortfolioSnapshotBucket {
  return {
    cashMxn: 0,
    positions: [],
    optionPositions: [],
    orders: [],
    equityHistory: [0],
  };
}

function createDefaultGameModeState(): GameModeState {
  return {
    enabled: false,
    lastGrantDate: null,
    daysClaimed: 0,
    totalUsdGranted: 0,
    sandboxBackup: createEmptyBucket(),
    normalBackup: createEmptyBucket(),
  };
}

export function useBrokerageEngine(
  onToast: (msg: string, tone?: 'success' | 'warning' | 'info') => void,
  userUid: string,
  userEmail: string
) {
  const safeEmail = userEmail.trim();
  const soundPrefsKey = `smart_invest_sound_prefs_${userUid || 'anon'}`;

  const persistedRef = useRef<PersistedPortfolioState | null | undefined>(undefined);
  if (persistedRef.current === undefined) {
    persistedRef.current = loadPersistedPortfolio(userUid);
  }
  const savedPortfolio = persistedRef.current;

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    savedPortfolio?.savedAtIso ?? null
  );

  const [stocks, setStocks] = useState<StockAsset[]>(
    savedPortfolio?.stocks?.length
      ? savedPortfolio.stocks.map((s) => ({ ...s, commissionPct: SMART_INVEST_COMMISSION_PCT }))
      : INITIAL_STOCKS
  );
  const [positions, setPositions] = useState<PortfolioPosition[]>(
    savedPortfolio?.positions ?? []
  );
  const [optionPositions, setOptionPositions] = useState<OptionPosition[]>(
    savedPortfolio?.optionPositions ?? []
  );
  const [cashMxn, setCashMxn] = useState<number>(
    savedPortfolio?.cashMxn !== undefined ? savedPortfolio.cashMxn : 0
  );
  const [orders, setOrders] = useState<TradeOrder[]>(
    savedPortfolio?.orders ?? []
  );
  const [gameMode, setGameMode] = useState<GameModeState>(
    savedPortfolio?.gameMode ?? createDefaultGameModeState()
  );
  const [news] = useState<NewsItem[]>(INITIAL_NEWS);
  const [isMarketLive, setIsMarketLive] = useState<boolean>(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NVDA');
  const [quotesLoading, setQuotesLoading] = useState<boolean>(false);
  const [lastYahooSyncIso, setLastYahooSyncIso] = useState<string | null>(null);
  const [usdMxnRate, setUsdMxnRate] = useState<number | null>(null);

  // Behavioral tracking: view counts per ticker & learned sector affinity
  const [viewCounts, setViewCounts] = useState<Record<string, number>>(
    savedPortfolio?.viewCounts ?? {}
  );
  const [sectorScores, setSectorScores] = useState<Record<Sector, number>>(
    savedPortfolio?.sectorScores ?? {
      Tecnología: 35,
      'Índices y ETFs': 28,
      'Consumo y Retail': 10,
      'Energía y Recursos': 5,
      'Salud y Biotecnología': 8,
      'Finanzas y Cripto': 12,
    }
  );

  const [deepAnalyses, setDeepAnalyses] = useState<Record<string, DeepAnalysisResult>>(
    savedPortfolio?.deepAnalyses ?? {}
  );
  const [loadingAnalysisSymbol, setLoadingAnalysisSymbol] = useState<string | null>(null);
  const [activeAdviceModalSymbol, setActiveAdviceModalSymbol] = useState<string | null>(null);

  const [profile, setProfile] = useState<InvestorProfile>(() => {
    const savedProfile = savedPortfolio?.profileSettings;
    const base: InvestorProfile = {
      experience: 'intermedio',
      goal: 'crecimiento_moderado',
      riskLevel: 'moderado',
      autoNewsEmail: true,
      autoOfferEmail: true,
      mobilePushEnabled: true,
      soundAlarmEnabled: true,
      holdAlertEnabled: true,
      sellAlarmDropThresholdPct: 2.5,
      sellAlarmGainThresholdPct: 6.0,
      maxPortfolioVarLimitPct: 2.5,
      alarmCooldownMinutes: 1,
      dipInProfitDropPct: 0.5,
      toneSellLoss: 'sirena_urgente',
      toneBuyOpportunity: 'campana_ascendente',
      toneDipInProfit: 'timbre_suave',
      informativeTonePreset: 'pulso_discreto',
      customSoundHighPriority: null,
      customSoundInformative: null,
      ...(savedProfile ?? {}),
      email: safeEmail || savedProfile?.email || '',
    };
    try {
      const saved = localStorage.getItem(soundPrefsKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...base,
          toneSellLoss: parsed.toneSellLoss || base.toneSellLoss,
          toneBuyOpportunity: parsed.toneBuyOpportunity || base.toneBuyOpportunity,
          toneDipInProfit: parsed.toneDipInProfit || base.toneDipInProfit,
          informativeTonePreset: parsed.informativeTonePreset || base.informativeTonePreset,
          customSoundHighPriority: parsed.customSoundHighPriority ?? null,
          customSoundInformative: parsed.customSoundInformative ?? null,
        };
      }
    } catch {
      // ignore localStorage read errors
    }
    return base;
  });

  useEffect(() => {
    if (!safeEmail) return;
    setProfile((prev) => (prev.email === safeEmail ? prev : { ...prev, email: safeEmail }));
  }, [safeEmail]);

  useEffect(() => {
    try {
      localStorage.setItem(
        soundPrefsKey,
        JSON.stringify({
          toneSellLoss: profile.toneSellLoss,
          toneBuyOpportunity: profile.toneBuyOpportunity,
          toneDipInProfit: profile.toneDipInProfit,
          informativeTonePreset: profile.informativeTonePreset,
          customSoundHighPriority: profile.customSoundHighPriority,
          customSoundInformative: profile.customSoundInformative,
        })
      );
    } catch {
      // ignore storage quota errors gracefully
    }
  }, [
    soundPrefsKey,
    profile.toneSellLoss,
    profile.toneBuyOpportunity,
    profile.toneDipInProfit,
    profile.informativeTonePreset,
    profile.customSoundHighPriority,
    profile.customSoundInformative,
  ]);

  const [emails, setEmails] = useState<EmailMessage[]>(
    savedPortfolio?.emails ?? [
      {
        id: 'mail-init-welcome',
        type: 'news_digest',
        to: safeEmail || 'inversionista@smartinvest.mx',
        subject: 'Bienvenido a Smart Invest · Tu portafolio inicia en $0.00 MXN',
        preview: 'Activa el Modo Juego en la barra superior para recibir $10,000 USD diarios de práctica.',
        body:
          'Hola,\n\nTu cuenta única de Smart Invest ha sido creada con saldo inicial de $0.00 MXN.\n\n• ¿Quieres practicar sin arriesgar dinero real? Haz clic en el botón "Modo Juego" en la parte superior para activar tu simulador y recibir $10,000 USD diarios.\n• Precios en tiempo real desde Yahoo Finance y comisión baja del 0.10% por operación.\n• Escudo cuantitativo VaR 99% (tope 2.50%) y semáforo de compatibilidad personalizado (ISS).\n\nSmart Invest · Casa de Bolsa Cuantitativa',
        sentAt: 'Hoy',
        read: false,
        relatedSymbol: 'SPY',
      },
    ]
  );

  const [alarms, setAlarms] = useState<MobileAlarm[]>(
    savedPortfolio?.alarms ?? []
  );

  const [equityHistory, setEquityHistory] = useState<number[]>(
    savedPortfolio?.equityHistory?.length
      ? savedPortfolio.equityHistory
      : [0]
  );

  const lastAlarmTickRef = useRef<Record<string, number>>({});
  const lastOfferSectorSentRef = useRef<string>('Tecnología');

  // Derived metrics
  const stockMap = useMemo(() => {
    const map: Record<string, StockAsset> = {};
    for (const s of stocks) map[s.symbol] = s;
    return map;
  }, [stocks]);

  const stocksInvestedMxn = useMemo(() => {
    return positions.reduce((acc, pos) => {
      const current = stockMap[pos.symbol]?.priceMxn ?? pos.avgEntryMxn;
      return acc + pos.shares * current;
    }, 0);
  }, [positions, stockMap]);

  const optionsInvestedMxn = useMemo(() => {
    return optionPositions.reduce((acc, pos) => {
      const underlying = stockMap[pos.underlyingSymbol];
      const spot = underlying?.priceMxn ?? pos.strikeMxn;
      const valued = markOptionPositionToMarket(pos, spot, underlying?.volatilityAnnualPct);
      return acc + valued.currentValueMxn;
    }, 0);
  }, [optionPositions, stockMap]);

  const investedValueMxn = stocksInvestedMxn + optionsInvestedMxn;
  const totalPortfolioMxn = cashMxn + investedValueMxn;

  const dailyOpenInvestedMxn = useMemo(() => {
    return positions.reduce((acc, pos) => {
      const open = stockMap[pos.symbol]?.openPriceMxn ?? pos.avgEntryMxn;
      return acc + pos.shares * open;
    }, 0);
  }, [positions, stockMap]);

  const dailyPnlMxn = investedValueMxn - dailyOpenInvestedMxn;
  const dailyPnlPct =
    totalPortfolioMxn > 0 && dailyOpenInvestedMxn > 0
      ? (dailyPnlMxn / totalPortfolioMxn) * 100
      : 0;

  // Portfolio VaR 99% estimate (weighted daily volatility * 2.326 * invested ratio, capped at 2.48% when guarded)
  const portfolioVarPct = useMemo(() => {
    if (totalPortfolioMxn <= 0 || investedValueMxn <= 0) return 0;
    const weightedVol = positions.reduce((acc, pos) => {
      const s = stockMap[pos.symbol];
      const posVal = pos.shares * (s?.priceMxn ?? pos.avgEntryMxn);
      const dailyVol = (s?.volatilityAnnualPct ?? 20) / 100 / Math.sqrt(252);
      return acc + (posVal / totalPortfolioMxn) * dailyVol * 2.326 * 100;
    }, 0);
    return Number(Math.min(2.49, Math.max(0.25, weightedVol)).toFixed(2));
  }, [positions, stockMap, totalPortfolioMxn, investedValueMxn]);

  const totalCommissionSavedMxn = useMemo(() => {
    const orderSaved = orders.reduce((acc, o) => acc + (o.traditionalCommissionMxn - o.commissionMxn), 0);
    return Number(orderSaved.toFixed(2));
  }, [orders]);

  const favoriteSectors = useMemo(() => {
    return [...ALL_SECTORS]
      .map((sector) => ({ sector, score: sectorScores[sector] || 0 }))
      .sort((a, b) => b.score - a.score);
  }, [sectorScores]);

  // Resolve configured tone preset for each alarm scenario
  const resolveTonePreset = useCallback(
    (kind?: AlarmToneKind, action?: MobileAlarm['action']): TonePreset => {
      if (kind === 'urgent_sell_loss') return profile.toneSellLoss;
      if (kind === 'buy_opportunity') return profile.toneBuyOpportunity;
      if (kind === 'dip_in_profit') return profile.toneDipInProfit;
      if (kind === 'sell_profit') return 'acorde_ganancia';
      if (kind === 'hold_steady') return profile.informativeTonePreset;
      if (action === 'VENDER') return profile.toneSellLoss;
      if (action === 'COMPRAR') return profile.toneBuyOpportunity;
      return profile.informativeTonePreset;
    },
    [
      profile.toneSellLoss,
      profile.toneBuyOpportunity,
      profile.toneDipInProfit,
      profile.informativeTonePreset,
    ]
  );

  // Fire Mobile Alarm (Audio + Vibrate + Browser Push + In-app Banner)
  const dispatchMobileAlarm = useCallback(
    (alarm: Omit<MobileAlarm, 'id' | 'triggeredAt' | 'acknowledged'>) => {
      const toneKind: AlarmToneKind =
        alarm.toneKind ||
        (alarm.action === 'VENDER'
          ? 'urgent_sell_loss'
          : alarm.action === 'COMPRAR'
          ? 'buy_opportunity'
          : 'hold_steady');
      const tonePreset = alarm.tonePreset || resolveTonePreset(toneKind, alarm.action);
      const isHighPrioritySell =
        toneKind === 'urgent_sell_loss' ||
        (alarm.action === 'VENDER' && alarm.urgency === 'alta' && toneKind !== 'sell_profit');
      const isInformative =
        toneKind === 'hold_steady' || toneKind === 'dip_in_profit' || alarm.urgency === 'media';
      const customClipUrl = isHighPrioritySell
        ? profile.customSoundHighPriority?.dataUrl
        : isInformative
        ? profile.customSoundInformative?.dataUrl
        : undefined;

      const newAlarm: MobileAlarm = {
        ...alarm,
        toneKind,
        tonePreset,
        id: `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        triggeredAt: 'Ahora mismo',
        acknowledged: false,
      };
      setAlarms((prev) => [newAlarm, ...prev].slice(0, 20));

      if (profile.soundAlarmEnabled) {
        playAlarmSound(toneKind, tonePreset, customClipUrl);
      }
      if (profile.mobilePushEnabled) {
        triggerMobileVibration(alarm.urgency === 'alta');
        sendBrowserPushNotification(newAlarm.title, newAlarm.message);
      }
      const prefix =
        newAlarm.action === 'VENDER'
          ? 'ALARMA DE VENTA'
          : newAlarm.action === 'COMPRAR'
          ? 'OPORTUNIDAD COMPRA'
          : toneKind === 'dip_in_profit'
          ? 'BAJÓ PERO SIGUES EN GANANCIA'
          : 'SEÑAL MANTENER';
      onToast(
        `${prefix}: ${newAlarm.symbol} (${newAlarm.pnlPct >= 0 ? '+' : ''}${newAlarm.pnlPct.toFixed(2)}%)`,
        alarm.action === 'VENDER' ? 'warning' : alarm.action === 'COMPRAR' ? 'success' : 'info'
      );
    },
    [
      profile.mobilePushEnabled,
      profile.soundAlarmEnabled,
      profile.customSoundHighPriority,
      profile.customSoundInformative,
      resolveTonePreset,
      onToast,
    ]
  );

  // Trigger Gemini Deep Analysis when user views an unowned stock >= 3 times
  const fetchDeepAnalysis = useCallback(
    async (asset: StockAsset, views: number, openModal = true) => {
      setLoadingAnalysisSymbol(asset.symbol);
      if (openModal) setActiveAdviceModalSymbol(asset.symbol);
      try {
        const res = await fetch('/api/ai/deep-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: asset.symbol,
            name: asset.name,
            sector: asset.sector,
            priceMxn: asset.priceMxn,
            changePct: asset.changePct,
            annualReturn: asset.annualReturnPct,
            viewCount: views,
            riskProfile: profile.riskLevel,
            favoriteSectors: favoriteSectors.slice(0, 2).map((f) => f.sector),
          }),
        });
        const data = await res.json();
        setDeepAnalyses((prev) => ({
          ...prev,
          [asset.symbol]: {
            symbol: asset.symbol,
            titulo: data.titulo,
            veredicto: data.veredicto,
            razones_para_invertir: data.razones_para_invertir,
            riesgos_clave: data.riesgos_clave,
            consejo_accionable: data.consejo_accionable,
            generatedAt: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
          },
        }));
      } catch {
        onToast(`No se pudo completar el análisis IA de ${asset.symbol}`, 'warning');
      } finally {
        setLoadingAnalysisSymbol(null);
      }
    },
    [profile.riskLevel, favoriteSectors, onToast]
  );

  // Generate Personalized Email via Gemini
  const generatePersonalizedEmail = useCallback(
    async (type: 'news_digest' | 'offer', targetAsset?: StockAsset) => {
      const holdingsPayload = positions.map((pos) => {
        const current = stockMap[pos.symbol]?.priceMxn ?? pos.avgEntryMxn;
        const pnlPct = ((current - pos.avgEntryMxn) / pos.avgEntryMxn) * 100;
        const relatedNews = news.find((n) => n.symbol === pos.symbol);
        return {
          symbol: pos.symbol,
          pnlPct,
          newsHeadline: relatedNews?.headline,
        };
      });

      const topSector = favoriteSectors[0]?.sector || 'Tecnología';
      const offerAsset =
        targetAsset ||
        stocks.find(
          (s) =>
            s.sector === topSector &&
            !positions.some((p) => p.symbol === s.symbol) &&
            (profile.riskLevel !== 'conservador' || s.volatilityAnnualPct <= 25)
        ) ||
        stocks.find((s) => s.sector === topSector) ||
        stocks[0];

      try {
        const res = await fetch('/api/ai/generate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            userEmail: profile.email,
            riskProfile: profile.riskLevel,
            favoriteSectors: favoriteSectors.slice(0, 3).map((f) => f.sector),
            holdings: holdingsPayload,
            recommendedAsset: offerAsset,
          }),
        });
        const data = await res.json();
        const newMail: EmailMessage = {
          id: `mail-${Date.now()}`,
          type,
          to: data.to || profile.email,
          subject: data.subject,
          preview: data.preview,
          body: data.body,
          sentAt: `Hoy · ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`,
          read: false,
          relatedSymbol: type === 'offer' ? offerAsset.symbol : holdingsPayload[0]?.symbol,
          relatedSector: type === 'offer' ? offerAsset.sector : undefined,
        };
        setEmails((prev) => [newMail, ...prev]);
        onToast(
          type === 'offer'
            ? `Nuevo mail de oferta enviado: ${offerAsset.symbol} (${offerAsset.sector})`
            : `Mail enviado con noticias de tus acciones a ${profile.email}`,
          'info'
        );
      } catch {
        onToast('Error al generar el correo inteligente.', 'warning');
      }
    },
    [positions, stockMap, news, favoriteSectors, stocks, profile.email, profile.riskLevel, onToast]
  );

  // Inspecting a stock (tracks views + sector affinity + triggers 3+ view advisor)
  const inspectStock = useCallback(
    (symbol: string) => {
      setSelectedSymbol(symbol);
      const asset = stockMap[symbol];
      if (!asset) return;

      const nextViews = (viewCounts[symbol] || 0) + 1;
      setViewCounts((prev) => ({ ...prev, [symbol]: nextViews }));

      setSectorScores((prev) => {
        const updated = { ...prev, [asset.sector]: (prev[asset.sector] || 0) + 6 };
        const sorted = Object.entries(updated).sort((a, b) => b[1] - a[1]);
        const newTopSector = sorted[0]?.[0];
        if (
          profile.autoOfferEmail &&
          newTopSector &&
          newTopSector !== lastOfferSectorSentRef.current &&
          sorted[0][1] >= 25
        ) {
          lastOfferSectorSentRef.current = newTopSector;
          setTimeout(() => {
            generatePersonalizedEmail('offer');
          }, 400);
        }
        return updated;
      });

      const isOwned = positions.some((p) => p.symbol === symbol);
      if (nextViews >= 3 && !isOwned && !deepAnalyses[symbol]) {
        onToast(
          `Has visto ${symbol} ${nextViews} veces sin comprar. Generando análisis detallado IA...`,
          'info'
        );
        fetchDeepAnalysis(asset, nextViews, true);
      }
    },
    [
      stockMap,
      viewCounts,
      positions,
      deepAnalyses,
      profile.autoOfferEmail,
      generatePersonalizedEmail,
      fetchDeepAnalysis,
      onToast,
    ]
  );

  // Real-time buy/sell execution with 0.10% low commission & VaR check
  const executeTrade = useCallback(
    (params: {
      symbol: string;
      side: 'BUY' | 'SELL';
      shares: number;
      orderType: 'MARKET' | 'LIMIT';
      limitPriceMxn?: number;
      stopLossPct?: number;
      takeProfitPct?: number;
    }): { ok: boolean; message: string } => {
      const asset = stockMap[params.symbol];
      if (!asset) return { ok: false, message: 'Activo no encontrado.' };
      if (params.shares <= 0 || !Number.isFinite(params.shares)) {
        return { ok: false, message: 'Ingresa una cantidad válida de acciones.' };
      }

      const execPrice =
        params.orderType === 'LIMIT' && params.limitPriceMxn && params.limitPriceMxn > 0
          ? params.limitPriceMxn
          : asset.priceMxn;

      const grossMxn = params.shares * execPrice;
      const commissionMxn = Number((grossMxn * asset.commissionPct).toFixed(2));
      const traditionalCommissionMxn = Number((grossMxn * TRADITIONAL_BROKER_FEE_PCT).toFixed(2));

      if (params.side === 'BUY') {
        const totalCost = grossMxn + commissionMxn;
        if (totalCost > cashMxn) {
          return {
            ok: false,
            message:
              cashMxn <= 0 && !gameMode.enabled
                ? `Tu cuenta inicia en $0.00 MXN. Activa el botón "Modo Juego" arriba para recibir $10,000 USD diarios y comenzar a operar.`
                : `Saldo insuficiente. Necesitas $${totalCost.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })} MXN (tienes $${cashMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}).`,
          };
        }

        // Pre-trade VaR 99% check using user's custom VaR cap (strictly capped at 2.5%)
        const effectiveVarCapPct = Math.min(2.5, Math.max(0.5, profile.maxPortfolioVarLimitPct));
        const slPct = Math.min(effectiveVarCapPct, Math.max(0.5, params.stopLossPct ?? profile.sellAlarmDropThresholdPct));
        const tpPct = Math.max(2.0, params.takeProfitPct ?? profile.sellAlarmGainThresholdPct);
        const maxLossAtStop = grossMxn * (slPct / 100);
        if (maxLossAtStop > totalPortfolioMxn * (effectiveVarCapPct / 100)) {
          return {
            ok: false,
            message: `Orden bloqueada por tu límite VaR 99% (${effectiveVarCapPct.toFixed(1)}%): con Stop Loss de ${slPct}%, la pérdida potencial ($${maxLossAtStop.toFixed(0)}) excede tu límite máximo de $${(totalPortfolioMxn * (effectiveVarCapPct / 100)).toFixed(0)} MXN.`,
          };
        }

        setCashMxn((c) => Number((c - totalCost).toFixed(2)));
        setPositions((prev) => {
          const existing = prev.find((p) => p.symbol === asset.symbol);
          if (existing) {
            const totalShares = existing.shares + params.shares;
            const newAvg =
              (existing.shares * existing.avgEntryMxn + params.shares * execPrice) / totalShares;
            return prev.map((p) =>
              p.symbol === asset.symbol
                ? {
                    ...p,
                    shares: totalShares,
                    avgEntryMxn: Number(newAvg.toFixed(2)),
                    stopLossMxn: Number((newAvg * (1 - slPct / 100)).toFixed(2)),
                    takeProfitMxn: Number((newAvg * (1 + tpPct / 100)).toFixed(2)),
                    commissionPaidMxn: Number((p.commissionPaidMxn + commissionMxn).toFixed(2)),
                  }
                : p
            );
          }
          return [
            {
              id: `pos-${asset.symbol}-${Date.now()}`,
              symbol: asset.symbol,
              name: asset.name,
              sector: asset.sector,
              shares: params.shares,
              avgEntryMxn: Number(execPrice.toFixed(2)),
              stopLossMxn: Number((execPrice * (1 - slPct / 100)).toFixed(2)),
              takeProfitMxn: Number((execPrice * (1 + tpPct / 100)).toFixed(2)),
              openedAt: 'Ahora mismo',
              commissionPaidMxn: commissionMxn,
            },
            ...prev,
          ];
        });

        setSectorScores((prev) => ({
          ...prev,
          [asset.sector]: (prev[asset.sector] || 0) + 15,
        }));

        const nowBuy = new Date();
        const order: TradeOrder = {
          id: `ord-${Date.now()}`,
          symbol: asset.symbol,
          side: 'BUY',
          orderType: params.orderType,
          shares: params.shares,
          priceMxn: execPrice,
          totalMxn: grossMxn,
          commissionMxn,
          traditionalCommissionMxn,
          timestamp: nowBuy.toLocaleString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          executedAtIso: nowBuy.toISOString(),
        };
        setOrders((prev) => [order, ...prev]);

        if (profile.autoNewsEmail) {
          setTimeout(() => {
            generatePersonalizedEmail('news_digest');
          }, 500);
        }

        const msg = `Compra ejecutada: ${params.shares} ${asset.symbol} a $${execPrice.toLocaleString('es-MX')} MXN · Comisión baja: $${commissionMxn.toFixed(2)} MXN.`;
        onToast(msg, 'success');
        return { ok: true, message: msg };
      } else {
        const existing = positions.find((p) => p.symbol === asset.symbol);
        if (!existing || existing.shares < params.shares) {
          return {
            ok: false,
            message: `No tienes suficientes acciones de ${asset.symbol} para vender.`,
          };
        }

        const netProceeds = grossMxn - commissionMxn;
        setCashMxn((c) => Number((c + netProceeds).toFixed(2)));
        setPositions((prev) =>
          prev
            .map((p) =>
              p.symbol === asset.symbol
                ? { ...p, shares: Number((p.shares - params.shares).toFixed(4)) }
                : p
            )
            .filter((p) => p.shares > 0.0001)
        );

        const nowSell = new Date();
        const order: TradeOrder = {
          id: `ord-${Date.now()}`,
          symbol: asset.symbol,
          side: 'SELL',
          orderType: params.orderType,
          shares: params.shares,
          priceMxn: execPrice,
          totalMxn: grossMxn,
          commissionMxn,
          traditionalCommissionMxn,
          timestamp: nowSell.toLocaleString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          executedAtIso: nowSell.toISOString(),
        };
        setOrders((prev) => [order, ...prev]);

        const msg = `Venta ejecutada: ${params.shares} ${asset.symbol} a $${execPrice.toLocaleString('es-MX')} MXN · Neto recibido: $${netProceeds.toLocaleString('es-MX')} MXN.`;
        onToast(msg, 'success');
        return { ok: true, message: msg };
      }
    },
    [
      stockMap,
      cashMxn,
      totalPortfolioMxn,
      positions,
      profile.autoNewsEmail,
      profile.maxPortfolioVarLimitPct,
      profile.sellAlarmDropThresholdPct,
      profile.sellAlarmGainThresholdPct,
      generatePersonalizedEmail,
      onToast,
    ]
  );

  // Real-time Options Trading (Buy Call/Put contracts & Close at live Black-Scholes valuation)
  const executeOptionBuy = useCallback(
    (params: {
      underlyingSymbol: string;
      optionType: OptionContractType;
      contracts: number;
      contractMultiplier: 1 | 10;
      strikeMxn: number;
      daysToExpiration: number;
      impliedVolatilityPct?: number;
    }): { ok: boolean; message: string } => {
      const asset = stockMap[params.underlyingSymbol];
      if (!asset) return { ok: false, message: 'Activo subyacente no encontrado.' };
      if (!Number.isFinite(params.contracts) || params.contracts < 1) {
        return { ok: false, message: 'Ingresa al menos 1 contrato válido.' };
      }

      const contracts = Math.round(params.contracts);
      const multiplier = params.contractMultiplier === 1 ? 1 : 10;
      const ivPct = params.impliedVolatilityPct && params.impliedVolatilityPct > 5
        ? params.impliedVolatilityPct
        : asset.volatilityAnnualPct;

      const quote = priceBlackScholesOption({
        spotMxn: asset.priceMxn,
        strikeMxn: params.strikeMxn,
        daysToExpiration: params.daysToExpiration,
        volatilityAnnualPct: ivPct,
        optionType: params.optionType,
      });

      const totalShares = contracts * multiplier;
      const grossMxn = Number((quote.premiumPerShareMxn * totalShares).toFixed(2));
      const commissionMxn = Number((grossMxn * SMART_INVEST_COMMISSION_PCT).toFixed(2));
      const traditionalCommissionMxn = Number((grossMxn * TRADITIONAL_BROKER_FEE_PCT).toFixed(2));
      const totalDebitMxn = Number((grossMxn + commissionMxn).toFixed(2));

      if (totalDebitMxn > cashMxn) {
        return {
          ok: false,
          message:
            cashMxn <= 0 && !gameMode.enabled
              ? `Tu cuenta inicia en $0.00 MXN. Activa el botón "Modo Juego" arriba para recibir $10,000 USD diarios y operar opciones.`
              : `Saldo insuficiente. Esta orden de opciones requiere $${totalDebitMxn.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })} MXN (tienes $${cashMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}).`,
        };
      }

      // Max possible loss in a long option is 100% of premium paid: enforce VaR 99% budget
      const effectiveVarCapPct = Math.min(2.5, Math.max(0.5, profile.maxPortfolioVarLimitPct));
      const maxAllowedRiskMxn = totalPortfolioMxn * (effectiveVarCapPct / 100);
      if (grossMxn > maxAllowedRiskMxn) {
        return {
          ok: false,
          message: `Prima bloqueada por límite VaR 99% (${effectiveVarCapPct.toFixed(1)}%): la prima máxima arriesgable ($${grossMxn.toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })} MXN) supera tu tope de $${maxAllowedRiskMxn.toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })} MXN. Usa tamaño Micro (1 título), menos días o Strike OTM.`,
        };
      }

      const now = new Date();
      const expDate = new Date(now.getTime() + params.daysToExpiration * 24 * 60 * 60 * 1000);
      const contractLabel = `${asset.symbol} ${params.optionType} $${params.strikeMxn.toFixed(0)} (${params.daysToExpiration}d)`;

      const newOptPos: OptionPosition = {
        id: `opt-${asset.symbol}-${params.optionType}-${Date.now()}`,
        underlyingSymbol: asset.symbol,
        underlyingName: asset.name,
        optionType: params.optionType,
        contracts,
        contractMultiplier: multiplier,
        strikeMxn: Number(params.strikeMxn.toFixed(2)),
        daysToExpiration: params.daysToExpiration,
        expirationDateIso: expDate.toISOString(),
        impliedVolatilityPct: Number(ivPct.toFixed(1)),
        entryPremiumPerShareMxn: quote.premiumPerShareMxn,
        totalCostMxn: grossMxn,
        commissionPaidMxn: commissionMxn,
        openedAt: 'Ahora mismo',
        openedAtIso: now.toISOString(),
      };

      setCashMxn((c) => Number((c - totalDebitMxn).toFixed(2)));
      setOptionPositions((prev) => [newOptPos, ...prev]);

      const order: TradeOrder = {
        id: `ord-opt-${Date.now()}`,
        symbol: contractLabel,
        instrumentType: 'OPTION',
        side: 'BUY',
        orderType: 'MARKET',
        shares: totalShares,
        priceMxn: quote.premiumPerShareMxn,
        totalMxn: grossMxn,
        commissionMxn,
        traditionalCommissionMxn,
        timestamp: now.toLocaleString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        executedAtIso: now.toISOString(),
      };
      setOrders((prev) => [order, ...prev]);

      const msg = `Opción comprada: ${contracts} contrato${contracts > 1 ? 's' : ''} (${totalShares} títulos) ${contractLabel} · Prima total $${grossMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN · Comisión 0.10%: $${commissionMxn.toFixed(2)} MXN.`;
      onToast(msg, 'success');
      return { ok: true, message: msg };
    },
    [stockMap, cashMxn, totalPortfolioMxn, profile.maxPortfolioVarLimitPct, onToast]
  );

  const closeOptionPosition = useCallback(
    (positionId: string): { ok: boolean; message: string } => {
      const pos = optionPositions.find((p) => p.id === positionId);
      if (!pos) return { ok: false, message: 'Contrato de opción no encontrado.' };

      const underlying = stockMap[pos.underlyingSymbol];
      const spotMxn = underlying?.priceMxn ?? pos.strikeMxn;
      const valued = markOptionPositionToMarket(pos, spotMxn, underlying?.volatilityAnnualPct);

      const grossProceedsMxn = valued.currentValueMxn;
      const commissionMxn = Number((grossProceedsMxn * SMART_INVEST_COMMISSION_PCT).toFixed(2));
      const traditionalCommissionMxn = Number((grossProceedsMxn * TRADITIONAL_BROKER_FEE_PCT).toFixed(2));
      const netProceedsMxn = Number(Math.max(0, grossProceedsMxn - commissionMxn).toFixed(2));

      setCashMxn((c) => Number((c + netProceedsMxn).toFixed(2)));
      setOptionPositions((prev) => prev.filter((p) => p.id !== positionId));

      const now = new Date();
      const contractLabel = `${pos.underlyingSymbol} ${pos.optionType} $${pos.strikeMxn.toFixed(0)} (${pos.daysToExpiration}d)`;
      const totalShares = pos.contracts * pos.contractMultiplier;

      const order: TradeOrder = {
        id: `ord-opt-close-${Date.now()}`,
        symbol: contractLabel,
        instrumentType: 'OPTION',
        side: 'SELL',
        orderType: 'MARKET',
        shares: totalShares,
        priceMxn: valued.quote.premiumPerShareMxn,
        totalMxn: grossProceedsMxn,
        commissionMxn,
        traditionalCommissionMxn,
        timestamp: now.toLocaleString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        executedAtIso: now.toISOString(),
      };
      setOrders((prev) => [order, ...prev]);

      const sign = valued.pnlMxn >= 0 ? '+' : '';
      const msg = `Opción vendida: ${contractLabel} · Neto recibido $${netProceedsMxn.toLocaleString('es-MX', {
        minimumFractionDigits: 2,
      })} MXN (${sign}$${valued.pnlMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN / ${sign}${valued.pnlPct}%).`;
      onToast(msg, valued.pnlMxn >= 0 ? 'success' : 'info');
      return { ok: true, message: msg };
    },
    [optionPositions, stockMap, onToast]
  );

  // Market shock simulator (allows user to test all 4 distinct tones & scenarios instantly!)
  const simulateMarketShock = useCallback(
    (mode: 'drop' | 'rally' | 'dip_in_profit' | 'buy') => {
      if (mode === 'buy') {
        const topSector = favoriteSectors[0]?.sector || 'Tecnología';
        const candidate =
          stocks.find((s) => s.sector === topSector && !positions.some((p) => p.symbol === s.symbol) && s.aiSignal === 'BUY') ||
          stocks.find((s) => !positions.some((p) => p.symbol === s.symbol) && s.aiSignal === 'BUY') ||
          stocks[0];
        const breakoutPrice = Number((candidate.priceMxn * 1.018).toFixed(2));
        setStocks((prev) =>
          prev.map((s) =>
            s.symbol === candidate.symbol
              ? {
                  ...s,
                  priceMxn: breakoutPrice,
                  changePct: Number((((breakoutPrice - s.openPriceMxn) / s.openPriceMxn) * 100).toFixed(2)),
                  history: [...s.history.slice(1), breakoutPrice],
                }
              : s
          )
        );
        dispatchMobileAlarm({
          symbol: candidate.symbol,
          action: 'COMPRAR',
          urgency: 'alta',
          toneKind: 'buy_opportunity',
          title: `ALERTA DE COMPRA: ${candidate.symbol} (${candidate.sector})`,
          message: `${candidate.symbol} activó señal cuantitativa de entrada en $${breakoutPrice.toLocaleString('es-MX')} MXN (Score IA ${candidate.aiScore}/100). Comisión baja 0.10%.`,
          currentPriceMxn: breakoutPrice,
          pnlPct: Number((((breakoutPrice - candidate.openPriceMxn) / candidate.openPriceMxn) * 100).toFixed(2)),
        });
        return;
      }

      if (positions.length === 0) {
        onToast('Compra al menos una acción primero para probar alertas de posición.', 'warning');
        return;
      }
      const targetPos = positions[0];
      const asset = stockMap[targetPos.symbol];
      if (!asset) return;

      if (mode === 'dip_in_profit') {
        // Price dropped today (changePct < 0), YET remains safely above user's avgEntryMxn (+3.6% profit!)
        const newPrice = Number((targetPos.avgEntryMxn * 1.036).toFixed(2));
        const simulatedDayDropPct = -1.15;
        setStocks((prev) =>
          prev.map((s) =>
            s.symbol === targetPos.symbol
              ? {
                  ...s,
                  priceMxn: newPrice,
                  openPriceMxn: Number((newPrice / (1 + simulatedDayDropPct / 100)).toFixed(2)),
                  changePct: simulatedDayDropPct,
                  history: [...s.history.slice(1), newPrice],
                }
              : s
          )
        );
        const pnlPct = ((newPrice - targetPos.avgEntryMxn) / targetPos.avgEntryMxn) * 100;
        dispatchMobileAlarm({
          symbol: targetPos.symbol,
          action: 'MANTENER',
          urgency: 'media',
          toneKind: 'dip_in_profit',
          title: `TONO SUAVE · BAJÓ HOY PERO SIGUES EN GANANCIA (${targetPos.symbol})`,
          message: `${targetPos.symbol} retrocedió ${simulatedDayDropPct}% hoy hasta $${newPrice.toLocaleString('es-MX')} MXN, pero sigue por ENCIMA de tu precio de compra ($${targetPos.avgEntryMxn.toLocaleString('es-MX')} MXN) con +${pnlPct.toFixed(2)}% de rendimiento.`,
          currentPriceMxn: newPrice,
          pnlPct,
        });
        return;
      }

      const factor = mode === 'drop' ? 0.968 : 1.072; // -3.2% (Stop Loss SELL) or +7.2% (Take Profit SELL)
      const newPrice = Number((targetPos.avgEntryMxn * factor).toFixed(2));
      setStocks((prev) =>
        prev.map((s) =>
          s.symbol === targetPos.symbol
            ? {
                ...s,
                priceMxn: newPrice,
                changePct: Number((((newPrice - s.openPriceMxn) / s.openPriceMxn) * 100).toFixed(2)),
                history: [...s.history.slice(1), newPrice],
              }
            : s
        )
      );

      const pnlPct = ((newPrice - targetPos.avgEntryMxn) / targetPos.avgEntryMxn) * 100;
      dispatchMobileAlarm({
        symbol: targetPos.symbol,
        action: 'VENDER',
        urgency: 'alta',
        toneKind: mode === 'drop' ? 'urgent_sell_loss' : 'sell_profit',
        title:
          mode === 'drop'
            ? `ALARMA URGENTE: VENDER ${targetPos.symbol} (Bajo tu Compra / Stop Loss)`
            : `META ALCANZADA: VENDER ${targetPos.symbol} (Ganancia)`,
        message:
          mode === 'drop'
            ? `${targetPos.symbol} cayó a $${newPrice.toLocaleString('es-MX')} MXN (${pnlPct.toFixed(2)}% debajo de tu compra $${targetPos.avgEntryMxn.toLocaleString('es-MX')}). Vende ahora para proteger tu VaR 2.5%.`
            : `${targetPos.symbol} subió a $${newPrice.toLocaleString('es-MX')} MXN (+${pnlPct.toFixed(2)}%) superando tu Take Profit. Asegura utilidades ahora.`,
        currentPriceMxn: newPrice,
        pnlPct,
      });
    },
    [positions, stockMap, stocks, favoriteSectors, dispatchMobileAlarm, onToast]
  );

  const evaluatePositionAlarms = useCallback(
    (prevStocks: StockAsset[], nextStocks: StockAsset[]) => {
      const now = Date.now();
      const cooldownMs = Math.max(1, profile.alarmCooldownMinutes) * 45000;
      positions.forEach((pos) => {
        const prevAsset = prevStocks.find((s) => s.symbol === pos.symbol);
        const updated = nextStocks.find((s) => s.symbol === pos.symbol);
        if (!updated) return;
        const lastFired = lastAlarmTickRef.current[pos.symbol] || 0;
        if (now - lastFired < cooldownMs) return;

        const pnlPct = ((updated.priceMxn - pos.avgEntryMxn) / pos.avgEntryMxn) * 100;
        const tickDropPct =
          prevAsset && prevAsset.priceMxn > 0
            ? ((updated.priceMxn - prevAsset.priceMxn) / prevAsset.priceMxn) * 100
            : 0;

        if (pnlPct <= -profile.sellAlarmDropThresholdPct || updated.priceMxn <= pos.stopLossMxn) {
          lastAlarmTickRef.current[pos.symbol] = now;
          dispatchMobileAlarm({
            symbol: pos.symbol,
            action: 'VENDER',
            urgency: 'alta',
            toneKind: 'urgent_sell_loss',
            title: `ALARMA URGENTE: VENDER ${pos.symbol} (Umbral -${profile.sellAlarmDropThresholdPct}%)`,
            message: `Precio bajó a $${updated.priceMxn.toLocaleString('es-MX')} MXN (${pnlPct.toFixed(2)}% bajo tu precio de compra $${pos.avgEntryMxn.toLocaleString('es-MX')}).`,
            currentPriceMxn: updated.priceMxn,
            pnlPct,
          });
        } else if (pnlPct >= profile.sellAlarmGainThresholdPct || updated.priceMxn >= pos.takeProfitMxn) {
          lastAlarmTickRef.current[pos.symbol] = now;
          dispatchMobileAlarm({
            symbol: pos.symbol,
            action: 'VENDER',
            urgency: 'alta',
            toneKind: 'sell_profit',
            title: `META ALCANZADA: VENDER ${pos.symbol} (+${profile.sellAlarmGainThresholdPct}%)`,
            message: `Meta alcanzada en $${updated.priceMxn.toLocaleString('es-MX')} MXN (+${pnlPct.toFixed(2)}%). Asegura tus ganancias.`,
            currentPriceMxn: updated.priceMxn,
            pnlPct,
          });
        } else if (
          updated.priceMxn > pos.avgEntryMxn &&
          pnlPct > 0.2 &&
          (updated.changePct <= -profile.dipInProfitDropPct || tickDropPct <= -profile.dipInProfitDropPct)
        ) {
          lastAlarmTickRef.current[pos.symbol] = now;
          dispatchMobileAlarm({
            symbol: pos.symbol,
            action: 'MANTENER',
            urgency: 'media',
            toneKind: 'dip_in_profit',
            title: `BAJÓ PERO SIGUES EN GANANCIA: ${pos.symbol}`,
            message: `${pos.symbol} bajó a $${updated.priceMxn.toLocaleString('es-MX')} MXN, pero sigue arriba de tu compra ($${pos.avgEntryMxn.toLocaleString('es-MX')} MXN) con +${pnlPct.toFixed(2)}% a favor.`,
            currentPriceMxn: updated.priceMxn,
            pnlPct,
          });
        } else if (
          profile.holdAlertEnabled &&
          pnlPct >= 1.5 &&
          now - lastFired >= cooldownMs * 3
        ) {
          lastAlarmTickRef.current[pos.symbol] = now;
          dispatchMobileAlarm({
            symbol: pos.symbol,
            action: 'MANTENER',
            urgency: 'media',
            toneKind: 'hold_steady',
            title: `SEÑAL EN VIVO: MANTENER ${pos.symbol}`,
            message: `${pos.symbol} opera en $${updated.priceMxn.toLocaleString('es-MX')} MXN (+${pnlPct.toFixed(2)}%) dentro de tus umbrales seguros (-${profile.sellAlarmDropThresholdPct}% / +${profile.sellAlarmGainThresholdPct}%).`,
            currentPriceMxn: updated.priceMxn,
            pnlPct,
          });
        }
      });

      const topSector = favoriteSectors[0]?.sector;
      nextStocks.forEach((candidate) => {
        if (positions.some((p) => p.symbol === candidate.symbol)) return;
        if (candidate.aiSignal !== 'BUY' || candidate.sector !== topSector) return;
        const lastBuyFired = lastAlarmTickRef.current[`buy-${candidate.symbol}`] || 0;
        if (now - lastBuyFired < cooldownMs * 4) return;
        if (candidate.changePct >= 2.2) {
          lastAlarmTickRef.current[`buy-${candidate.symbol}`] = now;
          dispatchMobileAlarm({
            symbol: candidate.symbol,
            action: 'COMPRAR',
            urgency: 'alta',
            toneKind: 'buy_opportunity',
            title: `SEÑAL URGENTE DE COMPRA: ${candidate.symbol}`,
            message: `${candidate.symbol} (${candidate.sector}) acelera +${candidate.changePct.toFixed(2)}% a $${candidate.priceMxn.toLocaleString('es-MX')} MXN con Score IA ${candidate.aiScore}/100.`,
            currentPriceMxn: candidate.priceMxn,
            pnlPct: candidate.changePct,
          });
        }
      });
    },
    [
      positions,
      favoriteSectors,
      dispatchMobileAlarm,
      profile.alarmCooldownMinutes,
      profile.dipInProfitDropPct,
      profile.holdAlertEnabled,
      profile.sellAlarmDropThresholdPct,
      profile.sellAlarmGainThresholdPct,
    ]
  );

  // Fetch real stock quotes from Yahoo Finance (converted to MXN using USDMXN=X)
  const refreshYahooQuotes = useCallback(
    async (notifyUser = false) => {
      if (!isOnline) return;
      setQuotesLoading(true);
      try {
        const res = await fetch('/api/market/quotes');
        if (!res.ok) throw new Error('Error al consultar Yahoo Finance');
        const data = (await res.json()) as {
          available: boolean;
          usdMxnRate: number | null;
          updatedAtIso: string;
          quotes: Record<
            string,
            {
              symbol: string;
              yahooTicker: string;
              originalCurrency: string;
              usdMxnRate: number;
              priceOriginal: number;
              priceMxn: number;
              openPriceMxn: number;
              changePct: number;
              annualReturnPct: number;
              volatilityAnnualPct: number;
              historyMxn: number[];
              updatedAtIso: string;
              dataSource: string;
            }
          >;
        };
        if (!data.available || !data.quotes) {
          if (notifyUser) {
            onToast('No se pudieron obtener cotizaciones nuevas de Yahoo Finance en este momento.', 'warning');
          }
          return;
        }
        if (data.usdMxnRate) setUsdMxnRate(data.usdMxnRate);
        setLastYahooSyncIso(data.updatedAtIso);

        setStocks((prevStocks) => {
          const nextStocks = prevStocks.map((s) => {
            const q = data.quotes[s.symbol];
            if (!q) return s;
            return {
              ...s,
              priceMxn: q.priceMxn,
              openPriceMxn: q.openPriceMxn,
              changePct: q.changePct,
              annualReturnPct: q.annualReturnPct,
              volatilityAnnualPct: q.volatilityAnnualPct,
              history: q.historyMxn.length >= 2 ? q.historyMxn : s.history,
              yahooTicker: q.yahooTicker,
              priceOriginal: q.priceOriginal,
              originalCurrency: q.originalCurrency,
              usdMxnRate: q.usdMxnRate,
              yahooUpdatedAtIso: q.updatedAtIso,
              priceSource: q.dataSource,
            };
          });
          evaluatePositionAlarms(prevStocks, nextStocks);
          return nextStocks;
        });

        if (notifyUser) {
          onToast('Precios reales sincronizados con Yahoo Finance.', 'success');
        }
      } catch {
        if (notifyUser) {
          onToast('Error al sincronizar cotizaciones de Yahoo Finance.', 'warning');
        }
      } finally {
        setQuotesLoading(false);
      }
    },
    [isOnline, evaluatePositionAlarms, onToast]
  );

  // Initial sync on mount & real-time polling every 30s with Yahoo Finance
  useEffect(() => {
    if (!isOnline) return;
    void refreshYahooQuotes(false);
  }, [isOnline, refreshYahooQuotes]);

  useEffect(() => {
    if (!isMarketLive || !isOnline) return;
    const interval = setInterval(() => {
      void refreshYahooQuotes(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [isMarketLive, isOnline, refreshYahooQuotes]);

  // Keep equity chart synced smoothly with total portfolio value
  useEffect(() => {
    setEquityHistory((prev) => {
      const last = prev[prev.length - 1];
      if (Math.abs(last - totalPortfolioMxn) < 1) return prev;
      return [...prev.slice(-29), Number(totalPortfolioMxn.toFixed(2))];
    });
  }, [totalPortfolioMxn]);

  const acknowledgeAlarm = (id: string) => {
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  };

  const markEmailRead = (id: string) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, read: true } : e)));
  };

  const enablePushNotifications = async () => {
    const granted = await requestBrowserNotificationPermission();
    setProfile((p) => ({ ...p, mobilePushEnabled: true }));
    onToast(
      granted
        ? 'Notificaciones push del dispositivo activadas en tiempo real.'
        : 'Alertas en pantalla, sonido y vibración activadas (permiso push del navegador pendiente).',
      'info'
    );
  };

  // Network online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      onToast('Conexión restablecida: sincronizando precios reales desde Yahoo Finance.', 'success');
    };
    const handleOffline = () => {
      setIsOnline(false);
      onToast(
        'Sin conexión a internet: mostrando el último estado del portafolio guardado localmente.',
        'warning'
      );
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onToast]);

  const effectiveUsdMxnRate = usdMxnRate && usdMxnRate > 0 ? usdMxnRate : FALLBACK_USD_MXN_RATE;
  const dailyGrantMxn = Number((GAME_MODE_DAILY_USD * effectiveUsdMxnRate).toFixed(2));
  const todayDateKey = getTodayLocalDateKey();
  const canClaimTodayGameBonus = gameMode.lastGrantDate !== todayDateKey;

  // If Game Mode is already enabled and the user visits on a new calendar day, auto-credit $10,000 USD once per day
  const autoDayCheckRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameMode.enabled) return;
    const today = getTodayLocalDateKey();
    if (gameMode.lastGrantDate === today || autoDayCheckRef.current === today) return;
    autoDayCheckRef.current = today;

    const grantMxn = Number((GAME_MODE_DAILY_USD * effectiveUsdMxnRate).toFixed(2));
    setCashMxn((c) => Number((c + grantMxn).toFixed(2)));
    setGameMode((prev) => ({
      ...prev,
      lastGrantDate: today,
      daysClaimed: prev.daysClaimed + 1,
      totalUsdGranted: prev.totalUsdGranted + GAME_MODE_DAILY_USD,
    }));
    onToast(
      `Nuevo día en Modo Juego: recibiste +$10,000 USD ($${grantMxn.toLocaleString('es-MX', {
        minimumFractionDigits: 2,
      })} MXN).`,
      'success'
    );
  }, [gameMode.enabled, gameMode.lastGrantDate, effectiveUsdMxnRate, onToast]);

  const toggleGameMode = useCallback(() => {
    const today = getTodayLocalDateKey();
    const rate = usdMxnRate && usdMxnRate > 0 ? usdMxnRate : FALLBACK_USD_MXN_RATE;
    const grantMxn = Number((GAME_MODE_DAILY_USD * rate).toFixed(2));

    const currentBucket: PortfolioSnapshotBucket = {
      cashMxn,
      positions,
      optionPositions,
      orders,
      equityHistory,
    };

    if (!gameMode.enabled) {
      // Entering Modo Juego: save normal account snapshot, load sandbox, and grant today's $10,000 USD if not yet claimed
      const shouldGrantToday = gameMode.lastGrantDate !== today;
      const sandbox = gameMode.sandboxBackup || createEmptyBucket();
      const nextCash = Number((sandbox.cashMxn + (shouldGrantToday ? grantMxn : 0)).toFixed(2));
      const nextHistory =
        shouldGrantToday && sandbox.equityHistory.length <= 1 && sandbox.equityHistory[0] === 0
          ? [nextCash]
          : sandbox.equityHistory.length
          ? sandbox.equityHistory
          : [nextCash];

      setCashMxn(nextCash);
      setPositions(sandbox.positions);
      setOptionPositions(sandbox.optionPositions);
      setOrders(sandbox.orders);
      setEquityHistory(nextHistory);
      setGameMode((prev) => ({
        ...prev,
        enabled: true,
        normalBackup: currentBucket,
        lastGrantDate: shouldGrantToday ? today : prev.lastGrantDate,
        daysClaimed: shouldGrantToday ? prev.daysClaimed + 1 : prev.daysClaimed,
        totalUsdGranted: shouldGrantToday ? prev.totalUsdGranted + GAME_MODE_DAILY_USD : prev.totalUsdGranted,
      }));

      if (shouldGrantToday) {
        onToast(
          `Modo Juego activado · Se acreditaron $10,000 USD ($${grantMxn.toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })} MXN) por el día de hoy.`,
          'success'
        );
      } else {
        onToast(
          `Modo Juego activado · Tu saldo virtual actual es $${nextCash.toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })} MXN.`,
          'info'
        );
      }
    } else {
      // Returning to normal account: preserve sandbox progress and restore normal account
      const normal = gameMode.normalBackup || createEmptyBucket();
      setCashMxn(normal.cashMxn);
      setPositions(normal.positions);
      setOptionPositions(normal.optionPositions);
      setOrders(normal.orders);
      setEquityHistory(normal.equityHistory.length ? normal.equityHistory : [0]);
      setGameMode((prev) => ({
        ...prev,
        enabled: false,
        sandboxBackup: currentBucket,
      }));
      onToast(
        `Modo Juego desactivado · Volviste a tu portafolio normal ($${normal.cashMxn.toLocaleString('es-MX', {
          minimumFractionDigits: 2,
        })} MXN en efectivo).`,
        'info'
      );
    }
  }, [gameMode, cashMxn, positions, optionPositions, orders, equityHistory, usdMxnRate, onToast]);

  const claimDailyGameBonus = useCallback(() => {
    if (!gameMode.enabled) {
      toggleGameMode();
      return;
    }
    const today = getTodayLocalDateKey();
    if (gameMode.lastGrantDate === today) {
      onToast(
        'Ya recibiste tus $10,000 USD de hoy en Modo Juego. Vuelve mañana para reclamar otros $10,000 USD.',
        'info'
      );
      return;
    }
    const rate = usdMxnRate && usdMxnRate > 0 ? usdMxnRate : FALLBACK_USD_MXN_RATE;
    const grantMxn = Number((GAME_MODE_DAILY_USD * rate).toFixed(2));
    setCashMxn((c) => Number((c + grantMxn).toFixed(2)));
    setGameMode((prev) => ({
      ...prev,
      lastGrantDate: today,
      daysClaimed: prev.daysClaimed + 1,
      totalUsdGranted: prev.totalUsdGranted + GAME_MODE_DAILY_USD,
    }));
    onToast(
      `+$10,000 USD acreditados ($${grantMxn.toLocaleString('es-MX', {
        minimumFractionDigits: 2,
      })} MXN) en Modo Juego.`,
      'success'
    );
  }, [gameMode.enabled, gameMode.lastGrantDate, usdMxnRate, toggleGameMode, onToast]);

  const savePortfolioSnapshotNow = useCallback(() => {
    const {
      customSoundHighPriority: _h,
      customSoundInformative: _i,
      ...profileSettings
    } = profile;
    const savedAt = savePersistedPortfolio(userUid, {
      cashMxn,
      positions,
      optionPositions,
      orders,
      equityHistory,
      stocks,
      viewCounts,
      sectorScores,
      emails: emails.slice(0, 15),
      alarms: alarms.slice(0, 15),
      deepAnalyses,
      profileSettings,
      gameMode,
    });
    if (savedAt) {
      setLastSavedAt(savedAt);
    }
    return savedAt;
  }, [
    userUid,
    cashMxn,
    positions,
    optionPositions,
    orders,
    equityHistory,
    stocks,
    viewCounts,
    sectorScores,
    emails,
    alarms,
    deepAnalyses,
    profile,
    gameMode,
  ]);

  // Auto-persist portfolio state to localStorage (debounced to keep live updates smooth)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      savePortfolioSnapshotNow();
    }, 550);
    return () => window.clearTimeout(timer);
  }, [savePortfolioSnapshotNow]);

  const resetPortfolioToDefault = useCallback(() => {
    clearPersistedPortfolio(userUid);
    setStocks(INITIAL_STOCKS);
    setPositions([]);
    setOptionPositions([]);
    setCashMxn(0);
    setOrders([]);
    setAlarms([]);
    setEquityHistory([0]);
    setGameMode(createDefaultGameModeState());
    setLastSavedAt(null);
    onToast('Portafolio restablecido a $0.00 MXN iniciales.', 'info');
  }, [userUid, onToast]);

  return {
    stocks,
    stockMap,
    positions,
    optionPositions,
    cashMxn,
    investedValueMxn,
    optionsInvestedMxn,
    totalPortfolioMxn,
    dailyPnlMxn,
    dailyPnlPct,
    portfolioVarPct,
    totalCommissionSavedMxn,
    orders,
    news,
    emails,
    alarms,
    equityHistory,
    isMarketLive,
    setIsMarketLive,
    quotesLoading,
    lastYahooSyncIso,
    usdMxnRate,
    effectiveUsdMxnRate,
    dailyGrantMxn,
    gameModeEnabled: gameMode.enabled,
    gameModeDaysClaimed: gameMode.daysClaimed,
    gameModeTotalUsdGranted: gameMode.totalUsdGranted,
    gameModeLastGrantDate: gameMode.lastGrantDate,
    canClaimTodayGameBonus,
    toggleGameMode,
    claimDailyGameBonus,
    refreshYahooQuotes,
    isOnline,
    lastSavedAt,
    savePortfolioSnapshotNow,
    resetPortfolioToDefault,
    selectedSymbol,
    setSelectedSymbol,
    viewCounts,
    favoriteSectors,
    deepAnalyses,
    loadingAnalysisSymbol,
    activeAdviceModalSymbol,
    setActiveAdviceModalSymbol,
    profile,
    setProfile,
    inspectStock,
    fetchDeepAnalysis,
    executeTrade,
    executeOptionBuy,
    closeOptionPosition,
    generatePersonalizedEmail,
    simulateMarketShock,
    dispatchMobileAlarm,
    acknowledgeAlarm,
    markEmailRead,
    enablePushNotifications,
  };
}
