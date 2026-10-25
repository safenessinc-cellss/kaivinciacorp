import { useMemo } from 'react';
import { useAuth } from './useAuth';

export type AppPermission =
  | 'dashboard' | 'tlmk_sales' | 'dialer' | 'collections' | 'talent' | 'payroll'
  | 'accounting' | 'billing' | 'marketing' | 'projects' | 'reports' | 'academy'
  | 'team_management' | 'calendar' | 'chat' | 'clients' | 'operations'
  | 'call_center' | 'integrations' | 'documents' | 'audits';

const ROLE_DEFAULTS: Record<string, AppPermission[]> = {
  superadmin: ['dashboard','tlmk_sales','dialer','collections','talent','payroll','accounting','billing','marketing','projects','reports','academy','team_management','calendar','chat','clients','operations','call_center','integrations','documents','audits'],
  admin: ['dashboard','tlmk_sales','dialer','collections','talent','payroll','accounting','billing','marketing','projects','reports','academy','team_management','calendar','chat','clients','operations','call_center','integrations','documents','audits'],
  supervisor: ['dashboard','tlmk_sales','dialer','collections','calendar','chat','clients','reports','team_management'],
  tlmk: ['dashboard','tlmk_sales','dialer','calendar','chat','clients'],
  agente: ['dashboard','dialer','calendar','chat','clients'],
  sales: ['dashboard','tlmk_sales','dialer','calendar','chat','clients'],
  gestor: ['dashboard','tlmk_sales','collections','reports','team_management','calendar','chat','clients','operations'],
  rrhh: ['dashboard','talent','payroll','calendar','chat'],
  collaborator: ['dashboard','operations','calendar','chat','documents'],
  cliente: ['academy','billing','clients','chat'],
  alumno: ['academy','chat']
};

export function usePermissions() {
  const { userData, loading } = useAuth();
  return useMemo(() => {
    const role = String(userData?.role || 'none').toLowerCase();
    const permissions = (userData?.permissions || {}) as Partial<Record<AppPermission, boolean>>;
    const approved = String(userData?.status || '').toLowerCase() === 'approved';
    const hasPermission = (permission: AppPermission) => {
      if (!approved) return false;
      if (role === 'superadmin') return true;
      if (typeof permissions[permission] === 'boolean') return permissions[permission] === true;
      return (ROLE_DEFAULTS[role] || []).includes(permission);
    };
    return { loading, approved, role, permissions, hasPermission };
  }, [userData, loading]);
}
