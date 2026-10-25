import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { LOGO_FULL } from '../constants/images';
import { ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        navigate('/crm/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión con Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090E] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-[#00F0FF]/10 via-transparent to-transparent pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <img 
            src={LOGO_FULL} 
            alt="Kaivincia Corp Logo" 
            className="h-16 object-contain drop-shadow-[0_0_20px_rgba(0,240,255,0.3)]"
            referrerPolicy="no-referrer"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-black text-white italic tracking-tighter uppercase">
          Ingreso Kaivincia Corp
        </h2>
        <p className="text-center text-xs font-mono text-[#00F0FF] uppercase tracking-widest mt-1">
          Plataforma de Operaciones & Telemarketing
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-[#0D121D]/90 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-3xl sm:px-10 border border-slate-800 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-mono">
              {error}
            </div>
          )}
          
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center py-3.5 px-4 border border-slate-700 rounded-2xl shadow-sm text-xs font-black uppercase tracking-widest text-white bg-slate-800/80 hover:bg-slate-700 transition-all cursor-pointer"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-4 w-4 mr-3" />
            Continuar con Google
          </button>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-100">
            <strong>Acceso protegido.</strong> El acceso directo por nombre y el botón que simulaba el rol SuperAdmin se han retirado. Inicia sesión con tu cuenta de Firebase; las cuentas nuevas quedan pendientes hasta que el SuperAdmin las apruebe.
          </div>
        </div>
      </div>
    </div>
  );
}