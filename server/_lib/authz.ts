import { adminAuth, adminDb } from './firebaseAdmin.js';

export type VerifiedAppUser = {
  uid: string;
  email: string | null;
  role: string;
  status: string;
  permissions: Record<string, boolean>;
};

export function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function requireApprovedUser(req: any, res: any, superadminOnly = false): Promise<VerifiedAppUser | null> {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    json(res, 401, { error: 'UNAUTHENTICATED', message: 'Inicia sesión para continuar.' });
    return null;
  }

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(header.slice(7).trim(), true);
  } catch {
    json(res, 401, { error: 'INVALID_TOKEN', message: 'La sesión expiró. Inicia sesión nuevamente.' });
    return null;
  }

  const snap = await adminDb.collection('users').doc(decoded.uid).get();
  if (!snap.exists) {
    json(res, 403, { error: 'PROFILE_MISSING', message: 'Tu cuenta no tiene un perfil habilitado.' });
    return null;
  }
  const data = snap.data() || {};
  const status = String(data.status || 'pending').toLowerCase();
  if (status !== 'approved') {
    json(res, 403, {
      error: status === 'blocked' ? 'ACCOUNT_BLOCKED' : 'APPROVAL_REQUIRED',
      message: status === 'blocked' ? 'Tu cuenta está bloqueada.' : 'Tu cuenta está pendiente de aprobación.'
    });
    return null;
  }

  const role = String(data.role || decoded.role || 'none').toLowerCase();
  const isSuperAdmin = role === 'superadmin' || decoded.role === 'superadmin';
  if (superadminOnly && !isSuperAdmin) {
    json(res, 403, { error: 'SUPERADMIN_REQUIRED', message: 'Solo el SuperAdmin puede realizar esta operación.' });
    return null;
  }

  return {
    uid: decoded.uid,
    email: decoded.email || null,
    role,
    status,
    permissions: data.permissions && typeof data.permissions === 'object' ? data.permissions : {}
  };
}

export function hasPermission(user: VerifiedAppUser, permission: string): boolean {
  return user.role === 'superadmin' || user.permissions[permission] === true;
}
