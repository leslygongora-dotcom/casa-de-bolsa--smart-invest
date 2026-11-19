import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  HelpCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { InvestorEvaluationResult } from '../utils/investorProfileEngine';

interface InvestorProfileSummaryPanelProps {
  evaluation: InvestorEvaluationResult | null;
  firebaseUserEmail: string | null;
  emailVerified: boolean;
  firebaseSyncedAtIso: string | null;
  firebaseBusy: boolean;
  onRetakeTest: () => void;
  onResendVerification: () => Promise<void>;
  onCheckVerification: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleteFirebaseProfile: () => Promise<void>;
  onOpenTooltip: (key: string) => void;
}

export const InvestorProfileSummaryPanel: React.FC<InvestorProfileSummaryPanelProps> = ({
  evaluation,
  firebaseUserEmail,
  emailVerified,
  firebaseSyncedAtIso,
  firebaseBusy,
  onRetakeTest,
  onResendVerification,
  onCheckVerification,
  onSignOut,
  onDeleteFirebaseProfile,
  onOpenTooltip,
}) => {
  if (!evaluation) {
    return (
      <div className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Perfil de Inversionista pendiente de evaluación
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Responde el cuestionario de 8 preguntas para conocer tu capacidad financiera y activar el semáforo de compatibilidad en cada acción.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetakeTest}
          className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer shrink-0"
        >
          Completar Test de Perfil
        </button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="investor-profile-summary-heading"
      className="p-6 rounded-xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 space-y-5"
    >
      {/* Header + Retake + Firebase Privacy Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Evaluación de Perfil de Inversionista</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h3
              id="investor-profile-summary-heading"
              className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white"
            >
              Perfil {evaluation.profileDisplayName}
            </h3>
            <span className="font-mono tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">
              {evaluation.totalScore} / 32 puntos
            </span>
            {evaluation.wasCappedBySafetyRule && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                (Ajustado por capacidad financiera desde puntaje inicial {evaluation.initialProfileKey})
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
            {evaluation.simpleExplanation}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRetakeTest}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090C11] text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar cuestionario
          </button>
        </div>
      </div>

      {/* 3 Dimensiones Independientes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Tolerancia emocional al riesgo
            </span>
            <button
              type="button"
              onClick={() => onOpenTooltip('tolerancia_riesgo')}
              className="text-slate-400 hover:text-emerald-600 cursor-pointer"
              aria-label="Explicación tolerancia emocional"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white">
              {evaluation.emotionalToleranceScore.toFixed(0)} / 100
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {evaluation.emotionalLabel}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full"
              style={{ width: `${evaluation.emotionalToleranceScore}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Capacidad financiera estimada
            </span>
            <button
              type="button"
              onClick={() => onOpenTooltip('capacidad_financiera')}
              className="text-slate-400 hover:text-emerald-600 cursor-pointer"
              aria-label="Explicación capacidad financiera"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white">
              {evaluation.financialCapacityScore.toFixed(0)} / 100
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {evaluation.capacityLabel}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${evaluation.financialCapacityScore}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Experiencia y conocimiento
            </span>
            <button
              type="button"
              onClick={() => onOpenTooltip('diversificar')}
              className="text-slate-400 hover:text-emerald-600 cursor-pointer"
              aria-label="Explicación conocimiento financiero"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white">
              {evaluation.knowledgeScore.toFixed(0)} / 100
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {evaluation.knowledgeLabel}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${evaluation.knowledgeScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* Reglas de seguridad si aplicaron */}
      {evaluation.safetyNotes.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Reglas de protección financiera aplicadas</span>
          </div>
          {evaluation.safetyNotes.map((note, i) => (
            <p key={i} className="text-slate-700 dark:text-slate-300 leading-relaxed">
              • {note}
            </p>
          ))}
        </div>
      )}

      {/* Instrumentos que podría investigar + Riesgos a considerar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Tipos de instrumentos que podrías investigar
          </h4>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            {evaluation.instrumentsToExplore.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">
            Riesgos clave que debes considerar
          </h4>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            {evaluation.risksToConsider.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Firebase Privacy & Persistence Bar */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          {emailVerified ? (
            <span>
              Respaldo privado en Firebase Firestore para{' '}
              <strong className="text-slate-900 dark:text-white">{firebaseUserEmail || 'tu cuenta'}</strong>
              {firebaseSyncedAtIso
                ? ` · Sincronizado (${new Date(firebaseSyncedAtIso).toLocaleDateString('es-MX')})`
                : ' · Activo'}
            </span>
          ) : (
            <span>
              Cuenta <strong className="text-slate-900 dark:text-white">{firebaseUserEmail}</strong> guardada localmente. Verifica tu correo para activar el respaldo en la nube.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!emailVerified && (
            <>
              <button
                type="button"
                onClick={onResendVerification}
                disabled={firebaseBusy}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 font-semibold cursor-pointer disabled:opacity-50"
              >
                Reenviar correo
              </button>
              <button
                type="button"
                onClick={onCheckVerification}
                disabled={firebaseBusy}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                Ya verifiqué
              </button>
            </>
          )}
          {emailVerified && (
            <button
              type="button"
              onClick={onDeleteFirebaseProfile}
              disabled={firebaseBusy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-semibold cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar de Firebase
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            disabled={firebaseBusy}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </section>
  );
};
