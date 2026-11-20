import React, { useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import {
  registerWithEmailPassword,
  sendPasswordReset,
  signInWithEmailPassword,
  signInWithGooglePopup,
} from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';

interface AuthGateViewProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

type AuthMode = 'login' | 'register' | 'reset';

const FIREBASE_PROVIDERS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

interface MappedAuthError {
  message: string;
  isEmailProviderDisabled?: boolean;
}

function mapFirebaseAuthError(error: unknown): MappedAuthError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const msg = error instanceof Error ? error.message : String(error || '');

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return {
      message: 'Correo o contraseña incorrectos. Verifica tus datos o crea una cuenta nueva.',
    };
  }
  if (code === 'auth/email-already-in-use') {
    return {
      message: 'Este correo ya tiene una cuenta registrada. Inicia sesión o recupera tu contraseña.',
    };
  }
  if (code === 'auth/weak-password') {
    return { message: 'La contraseña debe tener al menos 6 caracteres.' };
  }
  if (code === 'auth/invalid-email') {
    return { message: 'El formato del correo electrónico no es válido.' };
  }
  if (code === 'auth/too-many-requests') {
    return {
      message: 'Demasiados intentos seguidos. Espera un momento antes de volver a intentarlo.',
    };
  }
  if (code === 'auth/popup-closed-by-user') {
    return {
      message: 'Se cerró la ventana de acceso antes de completar el inicio de sesión.',
    };
  }
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
    return {
      message:
        'El acceso con correo y contraseña aún no está habilitado en Firebase Authentication Console. El administrador del proyecto debe activarlo en Authentication → Sign-in method → Correo electrónico/contraseña.',
      isEmailProviderDisabled: true,
    };
  }
  return {
    message: msg || 'No fue posible completar la autenticación. Intenta de nuevo.',
  };
}

export const AuthGateView: React.FC<AuthGateViewProps> = ({ darkMode, onToggleDarkMode }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emailProviderDisabled, setEmailProviderDisabled] = useState<boolean>(false);
  const [copiedConsoleUrl, setCopiedConsoleUrl] = useState<boolean>(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setEmailProviderDisabled(false);
    setInfoMsg(null);
  };

  const applyMappedError = (err: unknown) => {
    const mapped = mapFirebaseAuthError(err);
    setErrorMsg(mapped.message);
    setEmailProviderDisabled(Boolean(mapped.isEmailProviderDisabled));
  };

  const handleCopyConsoleUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(FIREBASE_PROVIDERS_URL);
        setCopiedConsoleUrl(true);
        setTimeout(() => setCopiedConsoleUrl(false), 2500);
      }
    } catch {
      // Ignore clipboard permission errors in restricted contexts
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setEmailProviderDisabled(false);
    setInfoMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMsg('Ingresa un correo electrónico válido.');
      return;
    }

    if (mode === 'reset') {
      setBusy(true);
      try {
        await sendPasswordReset(trimmedEmail);
        setInfoMsg(
          `Enviamos un enlace de recuperación a ${trimmedEmail}. Revisa tu bandeja de entrada o spam.`
        );
      } catch (err) {
        applyMappedError(err);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailPassword(trimmedEmail, password);
      } else {
        await registerWithEmailPassword(trimmedEmail, password, displayName);
      }
    } catch (err) {
      applyMappedError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setEmailProviderDisabled(false);
    setInfoMsg(null);
    setBusy(true);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      applyMappedError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8] dark:bg-[#090C11] text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-8 transition-colors">
      {/* Top Bar */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-slate-900 dark:bg-emerald-500/15 border border-slate-800 dark:border-emerald-500/30 text-white dark:text-emerald-400 flex items-center justify-center">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white block">
              Smart Invest
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Casa de Bolsa Cuantitativa · Perfiles Individuales
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleDarkMode}
          className="p-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131B] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Cambiar entre modo claro y oscuro"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Auth Container */}
      <div className="max-w-5xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Value Proposition Column */}
        <div className="lg:col-span-6 space-y-5">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Cuenta Personal Protegida</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            Tu propio portafolio, perfil de inversionista y análisis de riesgo en un espacio único
          </h1>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Inicia sesión o crea tu cuenta con tu correo y contraseña. Cada usuario tiene su propio cuestionario de perfil de riesgo, semáforo de compatibilidad (ISS), portafolio independiente y respaldo privado.
          </p>

          <ul className="space-y-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Perfil aislado por usuario:</strong> tus posiciones, respuestas del test y alertas son exclusivamente tuyas.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Precios reales de Yahoo Finance:</strong> valuación en MXN con métricas VaR 99%, CVaR, Beta, Sharpe, Sortino y Drawdown.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Comisión competitiva de 0.10%:</strong> simulador Monte Carlo, opciones Black-Scholes y exportación fiscal CSV.
              </span>
            </li>
          </ul>
        </div>

        {/* Auth Card */}
        <div className="lg:col-span-6">
          <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#0E131B] border border-slate-200 dark:border-slate-800 shadow-xl space-y-5">
            {mode !== 'reset' && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#090C11] border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white dark:bg-[#161E2B] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Iniciar Sesión
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white dark:bg-[#161E2B] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Crear Cuenta
                </button>
              </div>
            )}

            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {mode === 'login'
                  ? 'Accede a tu cuenta'
                  : mode === 'register'
                  ? 'Crea tu perfil de inversionista'
                  : 'Recuperar contraseña'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {mode === 'login'
                  ? 'Ingresa el correo y contraseña de tu cuenta para cargar tu portafolio.'
                  : mode === 'register'
                  ? 'Al entrar por primera vez responderás un breve cuestionario de 8 preguntas para personalizar tu riesgo.'
                  : 'Te enviaremos un enlace a tu correo para establecer una nueva contraseña.'}
              </p>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2.5 text-xs text-rose-800 dark:text-rose-200"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>

                {emailProviderDisabled && (
                  <div className="pl-6 space-y-2.5 pt-1.5 border-t border-rose-200/70 dark:border-rose-800/60">
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
                      Por defecto el entorno solo activa Google Login. Para activar <strong>Correo y contraseña</strong> (toma 15 segundos):
                    </p>
                    <ol className="list-decimal pl-4 space-y-0.5 text-[11px] text-rose-800 dark:text-rose-200">
                      <li>Haz clic en <strong>Abrir Firebase Console</strong> abajo.</li>
                      <li>Entra a <strong>Authentication → Sign-in method → Agregar proveedor nuevo</strong>.</li>
                      <li>Elige <strong>Correo electrónico/contraseña</strong>, activa <strong>Habilitar</strong> y guarda.</li>
                    </ol>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Entrar ahora con Google (ya activo)
                      </button>
                      <a
                        href={FIREBASE_PROVIDERS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-white/80 dark:bg-[#0E131B] text-rose-900 dark:text-rose-100 text-[11px] font-semibold hover:bg-white dark:hover:bg-slate-800 transition-colors"
                      >
                        <span>Abrir Firebase Console</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={handleCopyConsoleUrl}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-white/60 dark:bg-[#0E131B]/70 text-rose-900 dark:text-rose-100 text-[11px] font-semibold hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        {copiedConsoleUrl ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Enlace copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copiar enlace</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {infoMsg && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-200"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{infoMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-display-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Nombre completo (opcional)
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="auth-display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ej. Ana Martínez"
                      autoComplete="name"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090C11] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu.correo@ejemplo.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090C11] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {mode !== 'reset' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="auth-password"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Contraseña
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => switchMode('reset')}
                        className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090C11] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'register' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-confirm-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite tu contraseña"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090C11] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy
                  ? 'Procesando...'
                  : mode === 'login'
                  ? 'Entrar a mi portafolio'
                  : mode === 'register'
                  ? 'Crear mi cuenta única'
                  : 'Enviar enlace de recuperación'}
              </button>

              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Volver a Iniciar Sesión
                </button>
              )}
            </form>

            {mode !== 'reset' && (
              <>
                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                  <span className="shrink mx-3 text-[11px] font-medium text-slate-400">o también</span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={busy}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090C11] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Continuar con Google
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="max-w-5xl w-full mx-auto text-center text-[11px] text-slate-500 dark:text-slate-400">
        Smart Invest · Cada cuenta se aísla por identificador único (UID) en Firebase Authentication y almacenamiento local.
      </div>
    </div>
  );
};
