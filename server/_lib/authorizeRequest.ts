import { adminAuth, adminDb } from './firebaseAdmin.js';

export type AppRole = 'superadmin' | 'admin' | 'owner' | 'supervisor' | 'tlmk' | 'agente' | 'agent' | 'ventas';

const ROLE_ALIASES: Record<string, AppRole> = {
  superadmin: 'superadmin', 'super admin': 'superadmin',
  admin: 'admin', owner: 'owner', supervisor: 'supervisor',
  tlmk: 'tlmk', ventas: 'ventas', agente: 'agente', agent: 'agent',
};

export function normalizeRole(value: unknown): AppRole | null {
  const raw = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return ROLE_ALIASES[raw] ?? null;
}

export function isApprovedStatus(value: unknown): boolean {
  return ['approved', 'active'].includes(String(value ?? '').trim().toLowerCase());
}

export function isPrivilegedRole(role: unknown): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'superadmin' || normalized === 'admin' || normalized === 'owner';
}

export async function authorizeRequest(req: any, allowedRoles: AppRole[]) {
  const raw = req.headers?.authorization ?? req.headers?.Authorization;
  if (typeof raw !== 'string' || !raw.startsWith('Bearer ')) {
    return { ok: false as const, status: 401, error: 'Autenticación requerida.' };
  }

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(raw.slice(7).trim(), true);
  } catch {
    return { ok: false as const, status: 401, error: 'Sesión inválida o expirada.' };
  }

  const snap = await adminDb.collection('users').doc(decoded.uid).get();
  if (!snap.exists) return { ok: false as const, status: 403, error: 'Perfil no aprobado.' };

  const profile = snap.data() ?? {};
  const role = normalizeRole(profile.role);
  const status = String(profile.status ?? '').trim().toLowerCase();

  if (status === 'blocked' || status === 'suspended' || status === 'rejected') {
    return { ok: false as const, status: 403, error: 'Acceso bloqueado. Contacta a un administrador.' };
  }
  // Active is retained only for existing privileged accounts. Sales/agent accounts
  // must be explicitly approved to avoid silently activating legacy profiles.
  const approved = status === 'approved' || (status === 'active' && isPrivilegedRole(role));
  if (!approved) return { ok: false as const, status: 403, error: 'Cuenta pendiente de aprobación.' };
  if (!role || !allowedRoles.includes(role)) {
    return { ok: false as const, status: 403, error: 'No tienes permisos para esta operación.' };
  }

  return { ok: true as const, uid: decoded.uid, email: decoded.email ?? null, role, profile };
}

export function sendAuthError(res: any, result: Exclude<Awaited<ReturnType<typeof authorizeRequest>>, { ok: true }>) {
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: result.error }));
}
