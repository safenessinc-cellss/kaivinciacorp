import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AppPermission, usePermissions } from '../hooks/usePermissions';
import PendingApproval from '../pages/PendingApproval';

const ROUTE_PERMISSIONS: Record<string, AppPermission> = {
  dashboard: 'dashboard', pipeline: 'tlmk_sales', calls: 'dialer',
  cobranza: 'collections', recruitment: 'talent', payroll: 'payroll',
  accounting: 'accounting', billing: 'billing', marketing: 'marketing',
  projects: 'projects', reports: 'reports', 'academy-internal': 'academy',
  team: 'team_management', calendar: 'calendar', chat: 'chat',
  clients: 'clients', operations: 'operations', 'call-center': 'call_center',
  integrations: 'integrations', drive: 'documents', audits: 'audits'
};

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, userData, loading } = useAuth();
  const { hasPermission } = usePermissions();
  const location = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center" role="status">Verificando credenciales...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!userData || String(userData.status || '').toLowerCase() !== 'approved') return <PendingApproval />;

  const path = location.pathname.replace(/^\/crm\//, '');
  if (path === 'access-denied') return <>{children}</>;
  if (path === 'superadmin' || path === 'access-control' || path === 'security') {
    if (String(userData.role || '').toLowerCase() !== 'superadmin') {
      return <Navigate to="/crm/access-denied" state={{ from: location }} replace />;
    }
  }
  const permission = ROUTE_PERMISSIONS[path.split('/')[0]];
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/crm/access-denied" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
