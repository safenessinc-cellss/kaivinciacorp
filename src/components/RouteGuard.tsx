import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AppPermission, usePermissions } from '../hooks/usePermissions';
import PendingApproval from '../pages/PendingApproval';

const ROUTE_PERMISSIONS: Record<string, AppPermission> = {
  dashboard: 'dashboard', 'strategic-report': 'reports', clients: 'clients',
  pipeline: 'tlmk_sales', tasks: 'operations', calendar: 'calendar', chat: 'chat',
  cobranza: 'collections', 'call-center': 'call_center', automations: 'operations',
  'form-templates': 'operations', integrations: 'integrations',
  'academy-internal': 'academy', 'academy-external': 'academy',
  'digital-products': 'academy', calls: 'dialer', recruitment: 'talent',
  team: 'team_management', payroll: 'payroll', accounting: 'accounting',
  'client-management': 'clients', billing: 'billing', operations: 'operations',
  marketing: 'marketing', projects: 'projects', reports: 'reports',
  commissions: 'billing', tactical: 'operations', manuales: 'documents',
  turs: 'operations', helpdesk: 'chat', drive: 'documents', audits: 'audits',
  nervous: 'dashboard', 'strategy-blog': 'reports', 'client-portal': 'clients',
  'user-portal': 'academy'
};

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, userData, loading } = useAuth();
  const { hasPermission } = usePermissions();
  const location = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center" role="status">Verificando credenciales...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!userData || String(userData.status || '').toLowerCase() !== 'approved') return <PendingApproval />;

  const path = location.pathname.replace(/^\/crm\//, '');
  if (path === '' || path === 'access-denied') return <>{children}</>;

  const role = String(userData.role || '').trim().toLowerCase();
  const isSuperAdmin =
    role === 'superadmin' ||
    role === 'superuser' ||
    userData.isSuperAdmin === true ||
    userData.isSuperadmin === true;

  // These are privileged routes with no ordinary AppPermission mapping.
  // Authorize them explicitly and return immediately; otherwise the generic
  // permission check below rejects them because permission is undefined.
  if (['superadmin', 'access-control', 'security'].includes(path)) {
    return isSuperAdmin
      ? <>{children}</>
      : <Navigate to="/crm/access-denied" state={{ from: location }} replace />;
  }

  if (path === 'appearance') {
    const isAdmin = role === 'admin' || isSuperAdmin;
    return isAdmin
      ? <>{children}</>
      : <Navigate to="/crm/access-denied" state={{ from: location }} replace />;
  }

  // SuperAdmins must not be blocked by per-module permission configuration.
  if (isSuperAdmin) return <>{children}</>;

  const permission = ROUTE_PERMISSIONS[path.split('/')[0]];
  if (!permission || !hasPermission(permission)) {
    return <Navigate to="/crm/access-denied" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
