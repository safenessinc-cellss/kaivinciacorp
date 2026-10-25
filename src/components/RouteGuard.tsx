import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PendingApproval from '../pages/PendingApproval';

interface RouteGuardProps { children: React.ReactNode; }
const PRIVILEGED_ROLES = ['admin', 'superadmin', 'owner'];

export default function RouteGuard({ children }: RouteGuardProps) {
  const { user, userData, loading: authLoading } = useAuth();
  const location = useLocation();
  if (authLoading) return <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6"><div className="w-12 h-12 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" /><p className="mt-4 text-xs font-mono text-gray-700 tracking-widest uppercase">Verificando credenciales de acceso...</p></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (userData === null) return <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6"><div className="w-12 h-12 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" /><p className="mt-4 text-xs font-mono text-gray-700 tracking-widest uppercase">Cargando perfil...</p></div>;

  const status = String(userData.status ?? '').trim().toLowerCase();
  const role = String(userData.role ?? '').trim().toLowerCase();
  if (['blocked', 'rejected', 'suspended'].includes(status)) return <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6"><div className="max-w-md text-center"><h1 className="text-xl font-bold">Acceso denegado</h1><p className="mt-2">Tu cuenta está bloqueada o fue rechazada. Contacta a un administrador.</p></div></div>;

  // Preserve legacy privileged accounts, but require explicit approval for other roles.
  const privilegedLegacy = PRIVILEGED_ROLES.includes(role) && status === 'active';
  if (status !== 'approved' && !privilegedLegacy) return <PendingApproval />;
  if (!role || role === 'none') return <PendingApproval />;
  return <>{children}</>;
}
