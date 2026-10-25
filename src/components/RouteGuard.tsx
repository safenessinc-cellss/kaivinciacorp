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

  // 1. Auth resolviendo
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-xs font-mono text-gray-700 tracking-widest uppercase">
          Verificando credenciales de acceso...
        </p>
      </div>
    );
  }

  // 2. Sin autenticar
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. La identidad debe haberse confirmado explícitamente en esta pestaña.
  if (typeof sessionStorage === 'undefined' || sessionStorage.getItem('kaivincia_session_confirmed') !== 'true') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 4. Auth OK pero aún sin doc de perfil (bootstrap en curso)
  if (userData === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-xs font-mono text-gray-700 tracking-widest uppercase">
          Cargando perfil...
        </p>
      </div>
    );
  }

  // 5. No inferir aprobación a partir del rol: el estado debe ser explícito.
  const status = String((userData as any)?.status || '').toLowerCase();
  if (status !== 'approved') {
    return <PendingApproval />;
  }

  return <>{children}</>;
}
