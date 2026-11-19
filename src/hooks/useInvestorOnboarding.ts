import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  deleteInvestorOnboardingProfile,
  type IssWeights,
  loadInvestorOnboardingProfile,
  reloadCurrentFirebaseUser,
  resendVerificationEmail,
  saveInvestorOnboardingFirstTime,
  signOutFirebaseUser,
  updateInvestorOnboardingProfile,
} from '../firebase';
import { DEFAULT_ISS_WEIGHTS } from '../utils/historicalRiskModel';
import {
  evaluateInvestorProfile,
  type InvestorEvaluationResult,
} from '../utils/investorProfileEngine';

const ONBOARDING_STORAGE_PREFIX = 'smart_invest_investor_onboarding_v2_';

interface LocalOnboardingRecord {
  onboardingCompleted: boolean;
  answers: number[];
  issWeights: IssWeights;
  savedAtIso: string;
}

function getOnboardingStorageKey(uid: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${ONBOARDING_STORAGE_PREFIX}${safeUid || 'anon'}`;
}

function loadLocalOnboarding(uid: string): LocalOnboardingRecord | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(getOnboardingStorageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalOnboardingRecord>;
    if (!parsed || !Array.isArray(parsed.answers) || parsed.answers.length !== 8) return null;
    return {
      onboardingCompleted: Boolean(parsed.onboardingCompleted),
      answers: parsed.answers.map(Number),
      issWeights: parsed.issWeights || { ...DEFAULT_ISS_WEIGHTS },
      savedAtIso: parsed.savedAtIso || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function saveLocalOnboarding(uid: string, record: LocalOnboardingRecord): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(getOnboardingStorageKey(uid), JSON.stringify(record));
  } catch {
    // ignore storage errors
  }
}

export function useInvestorOnboarding(params: {
  firebaseUser: User;
  initialPortfolioMxn: number;
  onSyncEngineRiskLevel: (risk: 'conservador' | 'moderado' | 'agresivo') => void;
  onUserReloaded: (user: User) => void;
  onToast: (msg: string, tone?: 'success' | 'warning' | 'info') => void;
}) {
  const { firebaseUser, initialPortfolioMxn, onSyncEngineRiskLevel, onUserReloaded, onToast } = params;
  const uid = firebaseUser.uid;
  const emailVerified = Boolean(firebaseUser.emailVerified);

  // Keep volatile props in refs so background market ticks never re-trigger Firestore sync loops
  const initialPortfolioMxnRef = useRef<number>(initialPortfolioMxn);
  initialPortfolioMxnRef.current = initialPortfolioMxn;
  const onSyncEngineRiskLevelRef = useRef(onSyncEngineRiskLevel);
  onSyncEngineRiskLevelRef.current = onSyncEngineRiskLevel;
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;

  const initialLocal = useMemo(() => loadLocalOnboarding(uid), [uid]);

  const [hasFirestoreDoc, setHasFirestoreDoc] = useState<boolean>(false);
  const [firebaseSyncedAtIso, setFirebaseSyncedAtIso] = useState<string | null>(null);
  const [firebaseBusy, setFirebaseBusy] = useState<boolean>(false);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(
    Boolean(initialLocal?.onboardingCompleted)
  );
  const [answers, setAnswers] = useState<number[] | null>(initialLocal?.answers ?? null);
  const [issWeights, setIssWeights] = useState<IssWeights>(
    initialLocal?.issWeights ?? { ...DEFAULT_ISS_WEIGHTS }
  );

  // Automatic modal ONLY on first visit for this UID when onboarding hasn't been completed yet
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(
    !initialLocal?.onboardingCompleted
  );

  const evaluation: InvestorEvaluationResult | null = useMemo(() => {
    if (!answers || answers.length !== 8) return null;
    return evaluateInvestorProfile(answers);
  }, [answers]);

  const syncWithFirestore = useCallback(async () => {
    // firestore.rules enforces email_verified == true; skip Firestore calls until verified
    if (!emailVerified) {
      setHasFirestoreDoc(false);
      return;
    }

    setFirebaseBusy(true);
    try {
      const remote = await loadInvestorOnboardingProfile(uid);
      if (remote && remote.onboardingCompleted && remote.answers.length === 8) {
        // Returning user: restore from Firestore and do NOT repeat first-time test
        setHasFirestoreDoc(true);
        setOnboardingCompleted(true);
        setAnswers(remote.answers);
        setIssWeights(remote.issWeights || { ...DEFAULT_ISS_WEIGHTS });
        setFirebaseSyncedAtIso(remote.updatedAtIso || remote.createdAtIso || new Date().toISOString());
        setIsTestModalOpen(false);

        const evalRemote = evaluateInvestorProfile(remote.answers);
        onSyncEngineRiskLevelRef.current(evalRemote.mappedEngineRiskLevel);
        saveLocalOnboarding(uid, {
          onboardingCompleted: true,
          answers: remote.answers,
          issWeights: remote.issWeights || { ...DEFAULT_ISS_WEIGHTS },
          savedAtIso: remote.updatedAtIso || new Date().toISOString(),
        });
      } else {
        setHasFirestoreDoc(false);
        // Verified user who already answered locally for this UID -> save first-time tasting automatically
        const localNow = loadLocalOnboarding(uid);
        if (localNow && localNow.onboardingCompleted && localNow.answers.length === 8) {
          const evalLocal = evaluateInvestorProfile(localNow.answers);
          await saveInvestorOnboardingFirstTime(uid, {
            onboardingCompleted: true,
            riskProfileKey: evalLocal.definitiveProfileKey,
            initialProfileKey: evalLocal.initialProfileKey,
            totalScore: evalLocal.totalScore,
            emotionalToleranceScore: evalLocal.emotionalToleranceScore,
            financialCapacityScore: evalLocal.financialCapacityScore,
            knowledgeScore: evalLocal.knowledgeScore,
            answers: evalLocal.answers,
            safetyNotes: evalLocal.safetyNotes,
            issWeights: localNow.issWeights,
            tastingSnapshot: {
              initialCapitalMxn: initialPortfolioMxnRef.current,
              currency: 'MXN',
              firstSavedVersion: 1,
            },
          });
          setHasFirestoreDoc(true);
          setFirebaseSyncedAtIso(new Date().toISOString());
          onToastRef.current(
            'Perfil inicial y tasting de inversión guardados por primera vez en Firebase.',
            'success'
          );
        }
      }
    } catch (err) {
      console.error('Error sincronizando con Firebase:', err);
      onToastRef.current(
        'No se pudo sincronizar con Firebase en este instante; tu perfil sigue respaldado localmente.',
        'warning'
      );
    } finally {
      setFirebaseBusy(false);
    }
  }, [uid, emailVerified]);

  useEffect(() => {
    void syncWithFirestore();
  }, [syncWithFirestore]);

  const resendVerification = useCallback(async () => {
    setFirebaseBusy(true);
    try {
      await resendVerificationEmail();
      onToastRef.current(
        `Enlace de verificación reenviado a ${firebaseUser.email || 'tu correo'}. Revisa tu bandeja o spam.`,
        'success'
      );
    } catch (err) {
      console.error('Error resending verification:', err);
      onToastRef.current('Espera unos segundos antes de solicitar otro correo de verificación.', 'warning');
    } finally {
      setFirebaseBusy(false);
    }
  }, [firebaseUser.email]);

  const verifyEmailStatus = useCallback(async () => {
    setFirebaseBusy(true);
    try {
      const updated = await reloadCurrentFirebaseUser();
      if (updated && updated.emailVerified) {
        onUserReloaded(updated);
        onToastRef.current('¡Correo verificado! Sincronizando respaldo privado en Firebase...', 'success');
      } else {
        onToastRef.current(
          'Tu correo aún aparece pendiente de verificación. Abre el enlace que enviamos a tu bandeja.',
          'warning'
        );
      }
    } catch (err) {
      console.error('Error reloading user:', err);
      onToastRef.current('No se pudo verificar el estado en este momento.', 'warning');
    } finally {
      setFirebaseBusy(false);
    }
  }, [onUserReloaded]);

  const signOutAccount = useCallback(async () => {
    setFirebaseBusy(true);
    try {
      await signOutFirebaseUser();
      setHasFirestoreDoc(false);
      setFirebaseSyncedAtIso(null);
      onToastRef.current('Sesión cerrada correctamente.', 'info');
    } finally {
      setFirebaseBusy(false);
    }
  }, []);

  const completeTest = useCallback(
    async (result: InvestorEvaluationResult) => {
      const nowIso = new Date().toISOString();
      setAnswers(result.answers);
      setOnboardingCompleted(true);
      setIsTestModalOpen(false);
      onSyncEngineRiskLevelRef.current(result.mappedEngineRiskLevel);

      saveLocalOnboarding(uid, {
        onboardingCompleted: true,
        answers: result.answers,
        issWeights,
        savedAtIso: nowIso,
      });

      if (!emailVerified) {
        onToastRef.current(
          `Perfil ${result.profileDisplayName} (${result.totalScore}/32 pts) guardado en tu cuenta local. Verifica tu correo para activar el respaldo en Firebase.`,
          'info'
        );
        return;
      }

      setIsSavingProfile(true);
      setFirebaseBusy(true);
      try {
        if (!hasFirestoreDoc) {
          await saveInvestorOnboardingFirstTime(uid, {
            onboardingCompleted: true,
            riskProfileKey: result.definitiveProfileKey,
            initialProfileKey: result.initialProfileKey,
            totalScore: result.totalScore,
            emotionalToleranceScore: result.emotionalToleranceScore,
            financialCapacityScore: result.financialCapacityScore,
            knowledgeScore: result.knowledgeScore,
            answers: result.answers,
            safetyNotes: result.safetyNotes,
            issWeights,
            tastingSnapshot: {
              initialCapitalMxn: initialPortfolioMxnRef.current,
              currency: 'MXN',
              firstSavedVersion: 1,
            },
          });
          setHasFirestoreDoc(true);
          setFirebaseSyncedAtIso(nowIso);
          onToastRef.current(
            `Perfil ${result.profileDisplayName} y tasting guardados por primera vez en Firebase.`,
            'success'
          );
        } else {
          await updateInvestorOnboardingProfile(uid, {
            onboardingCompleted: true,
            riskProfileKey: result.definitiveProfileKey,
            initialProfileKey: result.initialProfileKey,
            totalScore: result.totalScore,
            emotionalToleranceScore: result.emotionalToleranceScore,
            financialCapacityScore: result.financialCapacityScore,
            knowledgeScore: result.knowledgeScore,
            answers: result.answers,
            safetyNotes: result.safetyNotes,
            issWeights,
          });
          setFirebaseSyncedAtIso(nowIso);
          onToastRef.current(
            `Cuestionario actualizado en Firebase: Perfil ${result.profileDisplayName}.`,
            'success'
          );
        }
      } catch (err) {
        console.error('Error guardando perfil en Firebase:', err);
        onToastRef.current(
          'Perfil guardado localmente, pero falló la escritura en Firebase.',
          'warning'
        );
      } finally {
        setIsSavingProfile(false);
        setFirebaseBusy(false);
      }
    },
    [uid, emailVerified, hasFirestoreDoc, issWeights]
  );

  const updateWeights = useCallback(
    async (nextWeights: IssWeights) => {
      setIssWeights(nextWeights);
      if (answers && answers.length === 8) {
        saveLocalOnboarding(uid, {
          onboardingCompleted,
          answers,
          issWeights: nextWeights,
          savedAtIso: new Date().toISOString(),
        });
      }
      if (emailVerified && hasFirestoreDoc) {
        try {
          await updateInvestorOnboardingProfile(uid, {
            issWeights: nextWeights,
          });
          setFirebaseSyncedAtIso(new Date().toISOString());
        } catch {
          // keep local state silently
        }
      }
    },
    [uid, answers, emailVerified, hasFirestoreDoc, onboardingCompleted]
  );

  const deleteFirebaseProfile = useCallback(async () => {
    if (!emailVerified) return;
    setFirebaseBusy(true);
    try {
      await deleteInvestorOnboardingProfile(uid);
      setHasFirestoreDoc(false);
      setFirebaseSyncedAtIso(null);
      onToastRef.current('Tu perfil fue eliminado de Firebase Firestore.', 'info');
    } catch (err) {
      console.error('Error deleting profile:', err);
      onToastRef.current('No se pudo eliminar el documento en Firebase.', 'warning');
    } finally {
      setFirebaseBusy(false);
    }
  }, [uid, emailVerified]);

  return {
    firebaseUser,
    emailVerified,
    needsEmailVerification: !emailVerified,
    hasFirestoreDoc,
    firebaseSyncedAtIso,
    firebaseBusy,
    isSavingProfile,
    onboardingCompleted,
    isTestModalOpen,
    setIsTestModalOpen,
    answers,
    evaluation,
    issWeights,
    resendVerification,
    verifyEmailStatus,
    signOutAccount,
    completeTest,
    updateWeights,
    deleteFirebaseProfile,
  };
}
