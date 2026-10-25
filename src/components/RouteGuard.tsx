import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PendingApproval from '../pages/PendingApproval';

interface RouteGuardProps { children: React.ReactNode; }

export default function RouteGuard({ children }: RouteGuardProps) {
  const { user, userData, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center" role="status">Verificando credenciales...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!userData || String(userData.status || '').toLowerCase() !== 'approved') return <PendingApproval />;
  return <>{children}</>;
}
