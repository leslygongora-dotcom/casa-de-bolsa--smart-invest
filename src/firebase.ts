import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Startup connection check required by Firebase integration reference
export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export type DefinitiveProfileKey = 'conservador' | 'moderado' | 'crecimiento' | 'agresivo';

export interface IssWeights {
  v: number;
  c: number;
  b: number;
  d: number;
  s: number;
}

export interface TastingSnapshot {
  initialCapitalMxn: number;
  currency: string;
  firstSavedVersion: number;
}

export interface FirestoreInvestorProfileDoc {
  uid: string;
  onboardingCompleted: boolean;
  riskProfileKey: DefinitiveProfileKey;
  initialProfileKey: DefinitiveProfileKey;
  totalScore: number;
  emotionalToleranceScore: number;
  financialCapacityScore: number;
  knowledgeScore: number;
  answers: number[];
  safetyNotes: string[];
  issWeights: IssWeights;
  tastingSnapshot: TastingSnapshot;
  createdAtIso?: string;
  updatedAtIso?: string;
}

function sanitizeAnswers(answers: number[]): number[] {
  return answers
    .slice(0, 8)
    .map((n) => Math.min(4, Math.max(1, Math.round(Number(n) || 1))));
}

function sanitizeSafetyNotes(notes: string[]): string[] {
  return notes
    .filter((n) => typeof n === 'string' && n.trim().length > 0)
    .slice(0, 6)
    .map((n) => n.trim().slice(0, 300));
}

function sanitizeWeights(weights: IssWeights): IssWeights {
  const clamp = (v: number) => Math.min(1, Math.max(0, Number(v.toFixed(4))));
  return {
    v: clamp(weights.v),
    c: clamp(weights.c),
    b: clamp(weights.b),
    d: clamp(weights.d),
    s: clamp(weights.s),
  };
}

function timestampToIso(val: unknown): string | undefined {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return undefined;
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function registerWithEmailPassword(
  email: string,
  password: string,
  displayName?: string
): Promise<{ user: User; verificationEmailSent: boolean }> {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const trimmedName = displayName?.trim();
  if (trimmedName) {
    try {
      await updateProfile(result.user, { displayName: trimmedName.slice(0, 80) });
    } catch {
      // non-fatal if displayName update fails
    }
  }
  let verificationEmailSent = false;
  try {
    await sendEmailVerification(result.user);
    verificationEmailSent = true;
  } catch {
    verificationEmailSent = false;
  }
  return { user: result.user, verificationEmailSent };
}

export async function resendVerificationEmail(): Promise<boolean> {
  if (!auth.currentUser) return false;
  await sendEmailVerification(auth.currentUser);
  return true;
}

export async function reloadCurrentFirebaseUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutFirebaseUser(): Promise<void> {
  await signOut(auth);
}

export async function loadInvestorOnboardingProfile(
  uid: string
): Promise<FirestoreInvestorProfileDoc | null> {
  const docPath = `investorProfiles/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'investorProfiles', uid));
    if (!snap.exists()) return null;
    const raw = snap.data();
    return {
      uid: String(raw.uid || uid),
      onboardingCompleted: Boolean(raw.onboardingCompleted),
      riskProfileKey: raw.riskProfileKey as DefinitiveProfileKey,
      initialProfileKey: raw.initialProfileKey as DefinitiveProfileKey,
      totalScore: Number(raw.totalScore),
      emotionalToleranceScore: Number(raw.emotionalToleranceScore),
      financialCapacityScore: Number(raw.financialCapacityScore),
      knowledgeScore: Number(raw.knowledgeScore),
      answers: Array.isArray(raw.answers) ? raw.answers.map(Number) : [],
      safetyNotes: Array.isArray(raw.safetyNotes) ? raw.safetyNotes.map(String) : [],
      issWeights: raw.issWeights as IssWeights,
      tastingSnapshot: raw.tastingSnapshot as TastingSnapshot,
      createdAtIso: timestampToIso(raw.createdAt),
      updatedAtIso: timestampToIso(raw.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function saveInvestorOnboardingFirstTime(
  uid: string,
  payload: Omit<FirestoreInvestorProfileDoc, 'uid' | 'createdAtIso' | 'updatedAtIso'>
): Promise<void> {
  const docPath = `investorProfiles/${uid}`;
  try {
    const existingSnap = await getDoc(doc(db, 'investorProfiles', uid));
    const safeAnswers = sanitizeAnswers(payload.answers);
    if (safeAnswers.length !== 8) {
      throw new Error('Se requieren exactamente 8 respuestas para guardar el perfil.');
    }

    const safeNotes = sanitizeSafetyNotes(payload.safetyNotes);
    const safeWeights = sanitizeWeights(payload.issWeights);

    if (!existingSnap.exists()) {
      await setDoc(doc(db, 'investorProfiles', uid), {
        uid,
        onboardingCompleted: Boolean(payload.onboardingCompleted),
        riskProfileKey: payload.riskProfileKey,
        initialProfileKey: payload.initialProfileKey,
        totalScore: Math.round(payload.totalScore),
        emotionalToleranceScore: Number(payload.emotionalToleranceScore.toFixed(2)),
        financialCapacityScore: Number(payload.financialCapacityScore.toFixed(2)),
        knowledgeScore: Number(payload.knowledgeScore.toFixed(2)),
        answers: safeAnswers,
        safetyNotes: safeNotes,
        issWeights: safeWeights,
        tastingSnapshot: {
          initialCapitalMxn: Math.min(
            1000000000,
            Math.max(
              0,
              Number.isFinite(Number(payload.tastingSnapshot.initialCapitalMxn))
                ? Number(payload.tastingSnapshot.initialCapitalMxn)
                : 0
            )
          ),
          currency: String(payload.tastingSnapshot.currency || 'MXN').slice(0, 12),
          firstSavedVersion: Math.max(1, Math.min(100, Math.round(payload.tastingSnapshot.firstSavedVersion || 1))),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateInvestorOnboardingProfile(
  uid: string,
  payload: Partial<
    Pick<
      FirestoreInvestorProfileDoc,
      | 'onboardingCompleted'
      | 'riskProfileKey'
      | 'initialProfileKey'
      | 'totalScore'
      | 'emotionalToleranceScore'
      | 'financialCapacityScore'
      | 'knowledgeScore'
      | 'answers'
      | 'safetyNotes'
      | 'issWeights'
    >
  >
): Promise<void> {
  const docPath = `investorProfiles/${uid}`;
  try {
    const updateBody: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (payload.onboardingCompleted !== undefined) {
      updateBody.onboardingCompleted = Boolean(payload.onboardingCompleted);
    }
    if (payload.riskProfileKey) updateBody.riskProfileKey = payload.riskProfileKey;
    if (payload.initialProfileKey) updateBody.initialProfileKey = payload.initialProfileKey;
    if (payload.totalScore !== undefined) updateBody.totalScore = Math.round(payload.totalScore);
    if (payload.emotionalToleranceScore !== undefined) {
      updateBody.emotionalToleranceScore = Number(payload.emotionalToleranceScore.toFixed(2));
    }
    if (payload.financialCapacityScore !== undefined) {
      updateBody.financialCapacityScore = Number(payload.financialCapacityScore.toFixed(2));
    }
    if (payload.knowledgeScore !== undefined) {
      updateBody.knowledgeScore = Number(payload.knowledgeScore.toFixed(2));
    }
    if (payload.answers) {
      updateBody.answers = sanitizeAnswers(payload.answers);
    }
    if (payload.safetyNotes) {
      updateBody.safetyNotes = sanitizeSafetyNotes(payload.safetyNotes);
    }
    if (payload.issWeights) {
      updateBody.issWeights = sanitizeWeights(payload.issWeights);
    }
    await updateDoc(doc(db, 'investorProfiles', uid), updateBody);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteInvestorOnboardingProfile(uid: string): Promise<void> {
  const docPath = `investorProfiles/${uid}`;
  try {
    await deleteDoc(doc(db, 'investorProfiles', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
