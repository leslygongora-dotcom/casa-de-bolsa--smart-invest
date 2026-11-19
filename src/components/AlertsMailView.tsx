import React, { useMemo, useState } from 'react';
import { BellRing, FileDown, Mail, Send, Smartphone, Sparkles, Volume2 } from 'lucide-react';
import {
  DeepAnalysisResult,
  EmailMessage,
  InvestorProfile,
  MobileAlarm,
  PortfolioPosition,
  Sector,
  StockAsset,
} from '../types';
import { playAlarmSound, TONE_PRESET_OPTIONS } from '../utils/audioAlarm';
import {
  computeBlackScholesSnapshot,
  computeMarkowitzPortfolioMetrics,
  downloadWeeklyExecutivePdf,
} from '../utils/weeklyReportPdf';
import { AlarmSoundStyleSection } from './AlarmSoundStyleSection';

interface AlertsMailViewProps {
  emails: EmailMessage[];
  alarms: MobileAlarm[];
  profile: InvestorProfile;
  positions: PortfolioPosition[];
  stockMap: Record<string, StockAsset>;
  favoriteSectors: { sector: Sector; score: number }[];
  deepAnalyses: Record<string, DeepAnalysisResult>;
  totalPortfolioMxn: number;
  cashMxn: number;
  dailyPnlMxn: number;
  dailyPnlPct: number;
  portfolioVarPct: number;
  totalCommissionSavedMxn: number;
  onGenerateEmail: (type: 'news_digest' | 'offer') => Promise<void>;
  onMarkEmailRead: (id: string) => void;
  onAcknowledgeAlarm: (id: string) => void;
  onQuickSell: (symbol: string, shares: number) => void;
  onSimulateShock: (mode: 'drop' | 'rally' | 'dip_in_profit' | 'buy') => void;
  onEnablePush: () => Promise<void>;
  onToggleSound: () => void;
  onUpdateProfile: (updater: (prev: InvestorProfile) => InvestorProfile) => void;
  onInspectStock: (symbol: string) => void;
  onNotifyToast: (msg: string, tone?: 'success' | 'warning' | 'info') => void;
}

export const AlertsMailView: React.FC<AlertsMailViewProps> = ({
  emails,
  alarms,
  profile,
  positions,
  stockMap,
  favoriteSectors,
  deepAnalyses,
  totalPortfolioMxn,
  cashMxn,
  dailyPnlMxn,
  dailyPnlPct,
  portfolioVarPct,
  totalCommissionSavedMxn,
  onGenerateEmail,
  onMarkEmailRead,
  onAcknowledgeAlarm,
  onQuickSell,
  onSimulateShock,
  onEnablePush,
  onToggleSound,
  onUpdateProfile,
  onInspectStock,
  onNotifyToast,
}) => {
  const [selectedEmailId, setSelectedEmailId] = useState<string>(emails[0]?.id || '');
  const [sendingType, setSendingType] = useState<'news_digest' | 'offer' | null>(null);

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || emails[0] || null;

  const markowitz = useMemo(
    () => computeMarkowitzPortfolioMetrics(positions, stockMap, cashMxn, totalPortfolioMxn),
    [positions, stockMap, cashMxn, totalPortfolioMxn]
  );

  const primaryAsset = useMemo(() => {
    if (positions[0] && stockMap[positions[0].symbol]) return stockMap[positions[0].symbol];
    return Object.values(stockMap)[0];
  }, [positions, stockMap]);

  const blackScholes = useMemo(
    () => (primaryAsset ? computeBlackScholesSnapshot(primaryAsset) : null),
    [primaryAsset]
  );

  const handleGenerate = async (type: 'news_digest' | 'offer') => {
    setSendingType(type);
    await onGenerateEmail(type);
    setSendingType(null);
  };

  const handleDownloadWeeklyPdf = () => {
    const fileName = downloadWeeklyExecutivePdf({
      profile,
      totalPortfolioMxn,
      cashMxn,
      dailyPnlMxn,
      dailyPnlPct,
      portfolioVarPct,
      totalCommissionSavedMxn,
      positions,
      stockMap,
      favoriteSectors,
      deepAnalyses,
      emails,
      alarms,
    });
    onNotifyToast(`Resumen ejecutivo semanal descargado: ${fileName}`, 'success');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Correos Inteligentes y Alarmas al Celular
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Recibe noticias de tus acciones, ofertas para tu sector favorito ({favoriteSectors[0]?.sector}), alertas push y tu reporte ejecutivo semanal en PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadWeeklyPdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileDown className="w-4 h-4" />
            Descargar Resumen Semanal (PDF)
          </button>
          <button
            onClick={() => handleGenerate('news_digest')}
            disabled={sendingType !== null}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            <Mail className="w-3.5 h-3.5" />
            {sendingType === 'news_digest' ? 'Enviando...' : 'Enviar Mail Noticias'}
          </button>
          <button
            onClick={() => handleGenerate('offer')}
            disabled={sendingType !== null}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            {sendingType === 'offer' ? 'Generando...' : 'Generar Oferta por Sector'}
          </button>
        </div>
      </div>

      {/* Vista Previa Cuantitativa del Resumen Semanal (Markowitz & Black-Scholes) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Modelo de Markowitz (Media-Varianza y Sharpe)
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-500">
              Sharpe: {markowitz.sharpeRatio}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs pt-1">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Retorno Esperado</div>
              <div className="font-mono font-bold text-base text-emerald-500 mt-0.5">
                +{markowitz.expectedAnnualReturnPct}%
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Volatilidad Anual</div>
              <div className="font-mono font-bold text-base text-slate-900 dark:text-white mt-0.5">
                {markowitz.portfolioVolatilityPct}%
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Diversificación</div>
              <div className="font-mono font-bold text-base text-indigo-400 mt-0.5">
                {markowitz.diversificationScore}/100
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {markowitz.recommendation}
          </p>
        </div>

        {blackScholes && (
          <div className="p-5 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Modelo Black-Scholes ({blackScholes.symbol} · 30 días)
              </h3>
              <span className="text-xs font-mono font-bold text-indigo-400">
                Delta {blackScholes.delta}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs pt-1">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
                <div className="text-slate-500 dark:text-slate-400">Prima Call / Put</div>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                  ${blackScholes.callFairMxn.toFixed(0)} / ${blackScholes.putFairMxn.toFixed(0)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
                <div className="text-slate-500 dark:text-slate-400">Prob. Subida (GBM)</div>
                <div className="font-mono font-bold text-base text-emerald-500 mt-0.5">
                  {blackScholes.probUpsidePct}%
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
                <div className="text-slate-500 dark:text-slate-400">Ganancia Neta</div>
                <div className="font-mono font-bold text-base text-amber-400 mt-0.5">
                  {blackScholes.probNetProfitPct}%
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Griegas incluidas en el PDF semanal: Gamma {blackScholes.gamma}, Theta ${blackScholes.thetaDailyMxn} MXN/día y Vega ${blackScholes.vega}.
            </p>
          </div>
        )}
      </div>

      {/* Sección 1: Monitor de Alarmas Móviles en Tiempo Real */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-indigo-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Configuración de Alarma Celular
              </h3>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Cuando tus posiciones activas tocan tu cinturón de seguridad (Stop Loss), alcanzan tu meta (Take Profit) o requieren decisión de mantener/vender, activamos notificación push, sonido de alarma y vibración.
          </p>

          <div className="space-y-3 pt-2">
            <button
              onClick={onEnablePush}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
            >
              <BellRing className="w-4 h-4" />
              Activar Notificaciones Push en Dispositivo
            </button>

            <button
              onClick={onToggleSound}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-semibold flex items-center justify-between text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Tono audible y vibración de alarma
              </span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {profile.soundAlarmEnabled ? 'ACTIVO' : 'SILENCIADO'}
              </span>
            </button>
          </div>

          <AlarmSoundStyleSection
            highPriorityTone={profile.toneSellLoss}
            informativeTone={profile.informativeTonePreset}
            customHighPriority={profile.customSoundHighPriority}
            customInformative={profile.customSoundInformative}
            onChangeHighPriorityTone={(tone) =>
              onUpdateProfile((p) => ({ ...p, toneSellLoss: tone }))
            }
            onChangeInformativeTone={(tone) =>
              onUpdateProfile((p) => ({
                ...p,
                informativeTonePreset: tone,
                toneDipInProfit: tone,
              }))
            }
            onChangeCustomHighPriority={(clip) =>
              onUpdateProfile((p) => ({ ...p, customSoundHighPriority: clip }))
            }
            onChangeCustomInformative={(clip) =>
              onUpdateProfile((p) => ({ ...p, customSoundInformative: clip }))
            }
            onNotifyToast={onNotifyToast}
          />

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Probar los tonos diferenciados en tiempo real:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => onSimulateShock('drop')}
                className="py-2 px-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-950/50 cursor-pointer text-left"
              >
                Urgente Vender (Bajo Compra)
              </button>
              <button
                onClick={() => onSimulateShock('buy')}
                className="py-2 px-3 rounded-lg border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-950/50 cursor-pointer text-left"
              >
                Oportunidad Urgente Compra
              </button>
              <button
                onClick={() => onSimulateShock('dip_in_profit')}
                className="py-2 px-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer text-left"
              >
                Bajó hoy, pero en Ganancia
              </button>
              <button
                onClick={() => onSimulateShock('rally')}
                className="py-2 px-3 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950/50 cursor-pointer text-left"
              >
                Meta Ganancia (Take Profit)
              </button>
            </div>
          </div>
        </div>

        {/* Feed de Notificaciones Push Celular */}
        <div className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
            Historial de Alarmas Enviadas a tu Celular
          </h3>
          {alarms.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Sin alarmas emitidas aún. Activa una simulación para probar el flujo en tiempo real.
            </p>
          ) : (
            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {alarms.map((alarm) => {
                const pos = positions.find((p) => p.symbol === alarm.symbol);
                const presetLabel =
                  TONE_PRESET_OPTIONS.find((t) => t.value === alarm.tonePreset)?.label ||
                  'Tono personalizado';
                return (
                  <div
                    key={alarm.id}
                    className={`p-4 rounded-xl border ${
                      alarm.acknowledged
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
                        : 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-bold ${
                          alarm.action === 'VENDER'
                            ? 'text-rose-600 dark:text-rose-400'
                            : alarm.action === 'COMPRAR'
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {alarm.title}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {alarm.triggeredAt} · ${alarm.currentPriceMxn.toLocaleString('es-MX')} MXN ({alarm.pnlPct >= 0 ? '+' : ''}
                        {alarm.pnlPct.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
                      Tono asignado: <span className="text-slate-700 dark:text-slate-200">{presetLabel}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1.5 leading-relaxed">
                      {alarm.message}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          playAlarmSound(alarm.toneKind || 'hold_steady', alarm.tonePreset)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        Escuchar tono
                      </button>
                      {pos && alarm.action === 'VENDER' && (
                        <button
                          onClick={() => {
                            onQuickSell(pos.symbol, pos.shares);
                            onAcknowledgeAlarm(alarm.id);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Vender {pos.shares} {pos.symbol} ahora
                        </button>
                      )}
                      {alarm.action === 'COMPRAR' && (
                        <button
                          onClick={() => {
                            onInspectStock(alarm.symbol);
                            onAcknowledgeAlarm(alarm.id);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Ir a Comprar {alarm.symbol}
                        </button>
                      )}
                      {!alarm.acknowledged && (
                        <button
                          onClick={() => onAcknowledgeAlarm(alarm.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Confirmar Mantener / Leído
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sección 2: Bandeja de Correos Inteligentes */}
      <div className="rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Bandeja de Correos Enviados a {profile.email}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Resúmenes automáticos de noticias de tus acciones y ofertas de compra filtradas por sector y riesgo
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {emails.filter((e) => !e.read).length} sin leer · {emails.length} totales
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[380px]">
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-[440px] overflow-y-auto">
            {emails.map((mail) => {
              const active = selectedEmail?.id === mail.id;
              return (
                <button
                  key={mail.id}
                  onClick={() => {
                    setSelectedEmailId(mail.id);
                    onMarkEmailRead(mail.id);
                  }}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    active
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {mail.type === 'offer' ? 'Oferta de Compra' : 'Noticias de Portafolio'}
                    </span>
                    <span>{mail.sentAt}</span>
                  </div>
                  <div
                    className={`mt-1 text-sm leading-snug ${
                      mail.read
                        ? 'font-medium text-slate-700 dark:text-slate-300'
                        : 'font-bold text-slate-900 dark:text-white'
                    }`}
                  >
                    {mail.subject}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {mail.preview}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7 p-6 flex flex-col justify-between gap-6">
            {selectedEmail ? (
              <>
                <div className="space-y-4">
                  <div className="pb-4 border-b border-slate-100 dark:border-slate-800 space-y-1">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Para: <span className="font-mono text-slate-700 dark:text-slate-300">{selectedEmail.to}</span> ·{' '}
                      {selectedEmail.sentAt}
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">{selectedEmail.subject}</h4>
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                    {selectedEmail.body}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  {selectedEmail.relatedSymbol && (
                    <button
                      onClick={() => onInspectStock(selectedEmail.relatedSymbol!)}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Operar {selectedEmail.relatedSymbol} en Casa de Bolsa
                    </button>
                  )}
                  <a
                    href={`mailto:${encodeURIComponent(selectedEmail.to)}?subject=${encodeURIComponent(
                      selectedEmail.subject
                    )}&body=${encodeURIComponent(selectedEmail.body)}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Abrir en mi app de correo
                  </a>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500">Selecciona un correo para leerlo.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
