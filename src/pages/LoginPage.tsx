import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleAuthProvider, inMemoryPersistence, setPersistence, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { LOGO_FULL } from '../constants/images';
import { ShieldCheck } from 'lucide-react';

const SESSION_CONFIRMED_KEY = 'kaivincia_session_confirmed';
const LOGIN_IN_PROGRESS_KEY = 'kaivincia_login_in_progress';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    sessionStorage.setItem(LOGIN_IN_PROGRESS_KEY, 'true');

    try {
      // No se restaura la sesión de Firebase desde localStorage.
      await setPersistence(auth, inMemoryPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      if (!result.user) throw new Error('No se pudo confirmar la identidad.');

      const token = await result.user.getIdToken(true);
      const response = await fetch('/api/auth/bootstrap-user', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        await signOut(auth);
        throw new Error(payload.error || 'No se pudo verificar la aprobación de la cuenta.');
      }

      sessionStorage.setItem(SESSION_CONFIRMED_KEY, 'true');
      navigate('/crm/dashboard', { replace: true });
    } catch (err: any) {
      sessionStorage.removeItem(SESSION_CONFIRMED_KEY);
      setError(err?.message || 'Error al iniciar sesión con Google.');
    } finally {
      sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-12 relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at top, #dbeafe 0%, #f5f5f7 55%, #e5e7eb 100%)' }}>
      <div className="mx-auto w-full max-w-md relative z-10">
        <div className="flex justify-center mb-5">
          <img src={LOGO_FULL} alt="Kaivincia Corp" className="h-14 object-contain" referrerPolicy="no-referrer" />
        </div>
        <div className="macos-window p-7 sm:p-9">
          <div className="macos-window-titlebar -mx-7 -mt-7 sm:-mx-9 sm:-mt-9 mb-8">
            <span className="macos-traffic-lights" aria-hidden="true"><span /><span /><span /></span>
            <span className="flex-1 text-center text-xs" style={{ color: 'var(--mac-text-secondary)' }}>Inicio de sesión seguro</span>
            <span className="w-[42px]" aria-hidden="true" />
          </div>
          <div className="text-center mb-7">
            <div className="mx-auto mb-3 w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--mac-accent) 12%, white)', color: 'var(--mac-accent)' }}>
              <ShieldCheck className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--mac-text-primary)' }}>Kaivincia Corp</h1>
            <p className="text-sm mt-2" style={{ color: 'var(--mac-text-secondary)' }}>Identifica tu cuenta para solicitar o confirmar acceso.</p>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border rounded-lg shadow-sm text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-60 transition-colors"
            style={{ borderColor: 'var(--mac-border)', color: '#1d1d1f' }}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="h-4 w-4" />
            {loading ? 'Verificando identidad…' : 'Continuar con Google'}
          </button>

          <p className="text-xs leading-5 mt-5 text-center" style={{ color: 'var(--mac-text-secondary)' }}>
            Las cuentas nuevas quedan pendientes hasta que un administrador autorizado las apruebe. No hay acceso operativo directo ni autologin.
          </p>
        </div>
        <p className="text-[11px] text-center mt-4 text-gray-500">Acceso protegido · Kaivincia Corp</p>
      </div>
    </div>
  );
}
