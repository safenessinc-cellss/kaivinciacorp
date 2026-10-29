import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { LOGO_FULL } from '../constants/images';
import { ShieldCheck, LockKeyhole, Cloud, Info } from 'lucide-react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      if (result.user) navigate('/crm/dashboard');
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('El inicio de sesión se canceló. Puedes intentarlo de nuevo.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.');
      } else {
        setError(err?.message || 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="kaivincia-login min-h-screen relative flex flex-col items-center justify-center px-5 py-10 sm:px-8">
      <div className="kaivincia-login-orb kaivincia-login-orb-one" aria-hidden="true" />
      <div className="kaivincia-login-orb kaivincia-login-orb-two" aria-hidden="true" />

      <div className="relative z-10 mb-7 w-full max-w-[440px] text-center sm:mb-8">
        <div className="kaivincia-login-brand mx-auto mb-4 flex items-center justify-center">
          <img
            src={LOGO_FULL}
            alt="Kaivincia Corp"
            className="max-h-[66px] max-w-[260px] object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <p className="kaivincia-login-tagline">Conectando personas, impulsando negocios a nivel global.</p>
      </div>

      <section className="kaivincia-login-window relative z-10 w-full max-w-[440px] overflow-hidden">
        <div className="px-7 py-8 sm:px-10 sm:py-10">
          <div className="text-left">
            <span className="kaivincia-login-eyebrow">ESPACIO DE TRABAJO SEGURO</span>
            <h1 className="mt-3 text-[29px] font-semibold tracking-[-0.04em] text-[#16345c] sm:text-[32px]">
              Te damos la bienvenida
            </h1>
            <p className="mt-3 text-[14px] leading-6 text-[#61738d]">
              Accede a tu espacio de operaciones de Kaivincia Corp con tu cuenta de Google.
            </p>
          </div>

          {error && (
            <div role="alert" className="kaivincia-login-error mt-6 rounded-xl px-4 py-3 text-sm leading-5">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="kaivincia-google-button mt-7 flex w-full items-center justify-center gap-3 rounded-xl px-5 py-[15px] text-[14px] font-semibold disabled:cursor-wait disabled:opacity-65"
          >
            {loading ? (
              <span className="kaivincia-login-spinner" aria-hidden="true" />
            ) : (
              <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[20px] w-[20px] shrink-0">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 4)" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.72 7.18l7.62 5.91c4.45-4.1 7.14-10.15 7.14-17.56Z" />
                <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" transform="translate(0 4)" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.79l-7.62-5.91c-2.12 1.42-4.84 2.27-8.28 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(0 -2)" />
              </svg>
            )}
            <span>{loading ? 'Conectando con Google…' : 'Continuar con Google'}</span>
            {!loading && <span className="ml-auto text-lg font-normal text-white/75" aria-hidden="true">›</span>}
          </button>

          <div className="kaivincia-login-divider mt-7 flex items-center gap-3">
            <span />
            <p>ACCESO SEGURO</p>
            <span />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="kaivincia-login-benefit">
              <ShieldCheck aria-hidden="true" size={20} />
              <span>Autenticación segura</span>
            </div>
            <div className="kaivincia-login-benefit">
              <LockKeyhole aria-hidden="true" size={20} />
              <span>Datos protegidos</span>
            </div>
            <div className="kaivincia-login-benefit">
              <Cloud aria-hidden="true" size={20} />
              <span>Acceso desde cualquier dispositivo</span>
            </div>
          </div>

          <div className="kaivincia-login-notice mt-6 flex items-start gap-2.5 rounded-xl px-3.5 py-3">
            <Info aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
            <p>El acceso al CRM y las funciones disponibles dependen de los permisos asignados a tu usuario.</p>
          </div>
        </div>

        <footer className="kaivincia-login-footer flex items-center justify-center gap-2 px-6 py-4 text-[11px]">
          <LockKeyhole aria-hidden="true" size={13} />
          Conexión protegida · Kaivincia Corp
        </footer>
      </section>

      <footer className="relative z-10 mt-7 text-center">
        <p className="text-[11px] font-medium text-[#5276a6]">KAIVINCIA CORP <span className="mx-1.5 text-[#a6bfdc]">·</span> CRM &amp; CONTACT CENTER</p>
        <p className="mt-2 text-[10px] tracking-[0.18em] text-[#7c9bc4]">MÁS CERCA DE TUS CLIENTES</p>
      </footer>
    </main>
  );
}
