import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  evaluateInvestorProfile,
  INVESTOR_QUESTIONS,
  type InvestorEvaluationResult,
} from '../utils/investorProfileEngine';

interface InvestorProfileTestModalProps {
  isOpen: boolean;
  isFirstTimeOnboarding: boolean;
  initialAnswers?: number[];
  firebaseUserEmail?: string | null;
  emailVerified?: boolean;
  savingToFirebase: boolean;
  onComplete: (result: InvestorEvaluationResult) => Promise<void> | void;
  onClose?: () => void;
}

function buildInitialAnswers(initialAnswers?: number[]): Array<number | null> {
  return INVESTOR_QUESTIONS.map((_, idx) =>
    initialAnswers && initialAnswers[idx] >= 1 && initialAnswers[idx] <= 4
      ? initialAnswers[idx]
      : null
  );
}

export const InvestorProfileTestModal: React.FC<InvestorProfileTestModalProps> = ({
  isOpen,
  isFirstTimeOnboarding,
  initialAnswers,
  firebaseUserEmail,
  emailVerified = true,
  savingToFirebase,
  onComplete,
  onClose,
}) => {
  const [stepIndex, setStepIndex] = useState<number>(0); // 0..7 questions, 8 = safety clarification review
  const [answers, setAnswers] = useState<Array<number | null>>(() =>
    buildInitialAnswers(initialAnswers)
  );
  const [showConceptHelp, setShowConceptHelp] = useState<boolean>(false);
  const [validationHint, setValidationHint] = useState<string | null>(null);
  const [submittingLocal, setSubmittingLocal] = useState<boolean>(false);
  const wasOpenRef = useRef<boolean>(isOpen);

  // Reset modal cleanly ONLY when transitioning from closed -> open
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setStepIndex(0);
      setAnswers(buildInitialAnswers(initialAnswers));
      setShowConceptHelp(false);
      setValidationHint(null);
      setSubmittingLocal(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialAnswers]);

  const allAnswered = answers.every((a) => a !== null && a >= 1 && a <= 4);

  const previewEvaluation = useMemo(() => {
    if (!allAnswered) return null;
    return evaluateInvestorProfile(answers.map((a) => a || 1));
  }, [answers, allAnswered]);

  if (!isOpen) return null;

  const isReviewStep = stepIndex === INVESTOR_QUESTIONS.length;
  const currentQuestion = INVESTOR_QUESTIONS[Math.min(stepIndex, INVESTOR_QUESTIONS.length - 1)];
  const selectedScore = !isReviewStep ? (answers[stepIndex] ?? null) : null;
  const answeredCount = answers.filter((a) => a !== null).length;
  const progressPct = isReviewStep
    ? 100
    : Math.round(((stepIndex + (selectedScore ? 1 : 0)) / INVESTOR_QUESTIONS.length) * 100);
  const isFinalSubmitting = submittingLocal || savingToFirebase;

  const handleSelectOption = (score: number) => {
    setValidationHint(null);
    setAnswers((prev) => {
      const next = [...prev];
      next[stepIndex] = score;
      return next;
    });
  };

  const handleNext = async () => {
    if (selectedScore === null) {
      setValidationHint('Elige una de las 4 opciones arriba para poder avanzar a la siguiente pregunta.');
      return;
    }
    setValidationHint(null);
    setShowConceptHelp(false);

    if (stepIndex < INVESTOR_QUESTIONS.length - 1) {
      setStepIndex((s) => s + 1);
      return;
    }

    // Question 8: ensure all 8 questions are answered before evaluating/finishing
    const firstMissingIdx = answers.findIndex((a) => a === null || a < 1 || a > 4);
    if (firstMissingIdx !== -1) {
      setStepIndex(firstMissingIdx);
      setValidationHint(
        `Falta contestar la pregunta ${firstMissingIdx + 1} antes de finalizar la evaluación.`
      );
      return;
    }

    const evaluation = evaluateInvestorProfile(answers.map((a) => a || 1));
    if (evaluation.contradictions.length > 0 || evaluation.wasCappedBySafetyRule) {
      setStepIndex(INVESTOR_QUESTIONS.length);
    } else {
      setSubmittingLocal(true);
      try {
        await onComplete(evaluation);
      } finally {
        setSubmittingLocal(false);
      }
    }
  };

  const handleConfirmReview = async () => {
    if (!previewEvaluation || isFinalSubmitting) return;
    setSubmittingLocal(true);
    try {
      await onComplete(previewEvaluation);
    } finally {
      setSubmittingLocal(false);
    }
  };

  const handlePrev = () => {
    setShowConceptHelp(false);
    setValidationHint(null);
    setStepIndex((s) => Math.max(0, s - 1));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="investor-test-title"
    >
      <div className="w-full max-w-2xl max-h-[92vh] rounded-2xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Onboarding Header */}
        <div className="shrink-0 px-5 sm:px-7 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090C11] flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                {isFirstTimeOnboarding
                  ? 'Primer Ingreso · Guía Personalizada de Inversión'
                  : 'Actualización de Perfil de Inversionista'}
              </span>
            </div>
            <h2
              id="investor-test-title"
              className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug"
            >
              Conoce tu perfil antes de invertir en bolsa
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              No es un examen ni necesitas experiencia previa. Responde 8 preguntas sencillas para cuidar tu dinero.
            </p>
          </div>

          {!isFirstTimeOnboarding && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              aria-label="Cerrar cuestionario"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Progress Bar & Firebase Sync Status */}
        <div className="shrink-0 px-5 sm:px-7 pt-4 pb-2 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {isReviewStep
                ? 'Revisión final y reglas de seguridad'
                : `Pregunta ${stepIndex + 1} de ${INVESTOR_QUESTIONS.length}`}
            </span>
            <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
              {answeredCount}/8 respondidas · {progressPct}%
            </span>
          </div>

          <div
            className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Account Link Banner */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {firebaseUserEmail ? (
              <span>
                Perfil personal para{' '}
                <strong className="text-slate-900 dark:text-white">{firebaseUserEmail}</strong>{' '}
                {emailVerified
                  ? '(se guardará solo esta primera vez en Firebase automáticamente).'
                  : '(guardado localmente; verifica tu correo para respaldarlo en la nube).'}
              </span>
            ) : (
              <span>
                Este cuestionario personaliza las recomendaciones exclusivamente para tu cuenta.
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Question Body OR Safety/Contradiction Review */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-4">
          {!isReviewStep ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white leading-snug">
                  {currentQuestion.id}. {currentQuestion.title}
                </h3>

                <button
                  type="button"
                  onClick={() => setShowConceptHelp((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090C11] text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-emerald-500 shrink-0 cursor-pointer"
                  aria-expanded={showConceptHelp}
                  aria-label={`Explicación sobre ${currentQuestion.helpConcept}`}
                >
                  <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>¿Qué significa?</span>
                </button>
              </div>

              {showConceptHelp && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-1 text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300">
                    {currentQuestion.helpConcept}
                  </div>
                  <p className="leading-relaxed">{currentQuestion.helpExplanation}</p>
                </div>
              )}

              {validationHint && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-700 flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200"
                >
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>{validationHint}</span>
                </div>
              )}

              {/* Large, Accessible Answer Buttons */}
              <div className="space-y-3">
                {currentQuestion.options.map((opt) => {
                  const isSelected = selectedScore === opt.score;
                  return (
                    <button
                      key={opt.score}
                      type="button"
                      onClick={() => handleSelectOption(opt.score)}
                      aria-pressed={isSelected}
                      className={`w-full min-h-[56px] p-4 rounded-xl border-2 text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-600 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-950/35 text-slate-900 dark:text-white shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090C11] text-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
                      }`}
                    >
                      <span className="text-sm sm:text-base font-medium leading-snug">
                        {opt.label}
                      </span>
                      <span
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'border-emerald-600 dark:border-emerald-400 bg-emerald-600 dark:bg-emerald-500 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-4 h-4" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Safety Rules & Contradictions Clarification Step */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>Revisión de Seguridad y Capacidad Financiera</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  Tus respuestas emocionales y tu capacidad financiera recibieron ajustes automáticos para proteger tu dinero. Revisa estos puntos antes de confirmar:
                </p>
              </div>

              {previewEvaluation?.contradictions.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl bg-white dark:bg-[#090C11] border border-rose-300 dark:border-rose-800/80 space-y-1.5"
                >
                  <div className="text-sm font-bold text-rose-700 dark:text-rose-400">{c.title}</div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{c.explanation}</p>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Sugerencia: {c.clarificationPrompt}
                  </p>
                </div>
              ))}

              {previewEvaluation && previewEvaluation.safetyNotes.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Reglas aplicadas automáticamente
                  </div>
                  <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                    {previewEvaluation.safetyNotes.map((note, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {previewEvaluation && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Perfil recomendado definitivo</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                      {previewEvaluation.profileDisplayName} ({previewEvaluation.totalScore}/32 pts)
                    </div>
                  </div>
                  <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Footer Controls */}
        <div className="shrink-0 px-5 sm:px-7 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090C11] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrev}
            disabled={stepIndex === 0 || (isReviewStep && isFinalSubmitting)}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isReviewStep ? 'Revisar respuestas' : 'Anterior'}</span>
          </button>

          {!isReviewStep ? (
            <button
              type="button"
              onClick={() => void handleNext()}
              disabled={stepIndex === INVESTOR_QUESTIONS.length - 1 && isFinalSubmitting}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                selectedScore !== null
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
              } disabled:opacity-50`}
            >
              <span>
                {stepIndex === INVESTOR_QUESTIONS.length - 1
                  ? isFinalSubmitting
                    ? 'Guardando...'
                    : 'Finalizar Evaluación'
                  : 'Siguiente'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleConfirmReview()}
              disabled={!previewEvaluation || isFinalSubmitting}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-40 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isFinalSubmitting ? 'Guardando...' : 'Confirmar y Guardar Perfil'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
