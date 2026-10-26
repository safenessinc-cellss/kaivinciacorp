import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Clock, LogOut, ShieldAlert, Mail, ShieldCheck, Ban } from 'lucide-react';

export default function PendingApproval() {
  const { userData, signOut, user } = useAuth();
  const status = String((userData as any)?.status || 'pending').trim().toLowerCase();
  const rejectionReason = String((userData as any)?.rejectionReason || (userData as any)?.blockReason || '').trim();
  const blocked = ['blocked', 'disabled', 'suspended'].includes(status);
  const rejected = status === 'rejected';
  const approvedButInvalidRole = status === 'approved' && ['none', ''].includes(String((userData as any)?.role || '').trim().toLowerCase());
  const title = blocked ? 'Acceso bloqueado' : rejected ? 'Solicitud rechazada' : approvedButInvalidRole ? 'Rol no asignado' : 'Cuenta pendiente de aprobación';
  const description = blocked
    ? 'Un administrador ha bloqueado esta cuenta. No se ha concedido acceso operativo al CRM.'
    : rejected
      ? 'Un administrador ha rechazado tu solicitud de acceso.'
      : approvedButInvalidRole
        ? 'Tu cuenta no tiene un rol operativo válido. Contacta con un administrador para revisar tu perfil.'
        : 'El acceso al CRM requiere aprobación explícita de safeness.c.a@gmail.com. Los estados active/enabled no sustituyen esa aprobación.';

  const Icon = blocked || rejected ? Ban : approvedButInvalidRole ? ShieldAlert : status === 'approved' ? ShieldCheck : Clock;
  const tone = blocked || rejected
    ? { icon: 'text-semantic-danger', iconBg: 'bg-semantic-danger-bg', border: 'border-semantic-danger/30', label: 'text-semantic-danger' }
    : { icon: 'text-semantic-warning', iconBg: 'bg-semantic-warning-bg', border: 'border-semantic-warning/30', label: 'text-semantic-warning' };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface-page text-fg-primary">
      <section className="max-w-md w-full bg-surface-elevated border border-separator rounded-3xl p-8 shadow-xl">
        <div className="flex items-center justify-center mb-6">
          <div className={`w-16 h-16 rounded-2xl border ${tone.border} ${tone.iconBg} flex items-center justify-center`}>
            <Icon className={`w-8 h-8 ${tone.icon}`} aria-hidden="true" />
          </div>
        </div>

        <h1 className="text-xl font-bold text-fg-primary text-center mb-2">{title}</h1>
        <p className="text-sm text-fg-secondary text-center mb-6">
          Cuenta: <span className="font-mono text-accent break-all">{user?.email || 'sin correo'}</span>
          <span className="block mt-2">{description}</span>
        </p>

        {(rejected || blocked) && rejectionReason && (
          <div role="alert" className="bg-semantic-danger-bg border border-semantic-danger/30 rounded-xl p-4 mb-5">
            <p className="text-xs font-bold text-semantic-danger mb-1">Detalle del acceso</p>
            <p className="text-sm text-fg-primary">{rejectionReason}</p>
          </div>
        )}

        <div className="bg-surface-grouped border border-separator rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-start gap-2 text-sm text-fg-secondary">
            <ShieldAlert className={`w-4 h-4 mt-0.5 shrink-0 ${tone.icon}`} />
            <span><strong className="text-fg-primary">Acceso restringido:</strong> no se muestra el dashboard mientras la cuenta no esté aprobada y tenga un rol válido.</span>
          </div>
          <div className="flex items-start gap-2 text-sm text-fg-secondary">
            <Mail className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <span><strong className="text-fg-primary">¿Qué hacer?</strong> Tu solicitud está registrada. Espera la decisión de safeness.c.a@gmail.com; cambiar tu rol o permisos no activa el acceso.</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-fg-secondary pt-3 border-t border-separator">
            <Clock className="w-3.5 h-3.5" />
            <span>Estado: <span className={`font-bold uppercase ${tone.label}`}>{status}</span></span>
          </div>
        </div>

        <p className="text-[11px] text-fg-tertiary text-center mb-4">
          Soporte: <span className="font-mono text-fg-secondary">safeness.c.a@gmail.com</span>
        </p>

        <button
          type="button"
          onClick={() => signOut()}
          className="w-full px-4 py-3 rounded-xl bg-accent hover:bg-accent-hover text-fg-inverse font-semibold text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
