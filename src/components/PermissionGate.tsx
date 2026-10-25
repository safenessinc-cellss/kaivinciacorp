import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AppPermission, usePermissions } from '../hooks/usePermissions';

export default function PermissionGate({ permission, children, fallback }: {
  permission: AppPermission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { loading, hasPermission } = usePermissions();
  const location = useLocation();
  if (loading) return <div className="p-6 text-sm text-slate-600" role="status">Verificando permisos...</div>;
  if (!hasPermission(permission)) {
    return fallback ? <>{fallback}</> : <Navigate to="/crm/access-denied" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
