import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PendingApproval from '../pages/PendingApproval';

interface RouteGuardProps {
  children: React.ReactNode;
}

export default function RouteGuard({ children }: RouteGuardProps) {
  const { user, userData, loading: authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface-page text-fg-primary">
        <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-label="Verificando acceso" />
        <p className="mt-4 text-xs font-medium text-fg-secondary tracking-wide">Verificando autorización…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (typeof sessionStorage === 'undefined' || sessionStorage.getItem('kaivincia_session_confirmed') !== 'true') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Missing profile, unknown role, and non-approved statuses always fail closed.
  if (!userData) return <PendingApproval />;

  // Only an explicit backend-approved status grants access. Legacy active/enabled
  // values are not approval and must remain blocked until the root approver confirms.
  const status = String(userData.status || '').trim().toLowerCase();
  const rawRole = String(userData.role || 'none').trim().toLowerCase();
  const role = ({ sales: 'ventas', agent: 'agente', agente_tlmk: 'tlmk', professor: 'tutor', mkt: 'tlmk', operador: 'agente' } as Record<string, string>)[rawRole] || rawRole;
  const knownRoles = new Set(['superadmin', 'admin', 'supervisor', 'agente', 'tlmk', 'ventas', 'ceo', 'gestor', 'alumno', 'rrhh', 'collaborator', 'tutor', 'cliente', 'user']);
  if (status !== 'approved' || !knownRoles.has(role) || role === 'none') {
    return <PendingApproval />;
  }

  return <>{children}</>;
}
