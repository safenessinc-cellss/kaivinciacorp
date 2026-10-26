import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

const ROOT_USER = 'safeness.c.a@gmail.com';
const SUPERADMINS = (process.env.SUPERADMIN_EMAILS || ROOT_USER)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

function normalizeStatus(value: unknown): string {
  const status = String(value || 'pending').trim().toLowerCase();
  if (status === 'active' || status === 'enabled') return 'approved';
  return status;
}

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Role/status remain authoritative in Firestore; permissions are intentionally not copied to claims.
async function syncBaseRoleClaims(uid: string, roleValue: unknown, statusValue: unknown) {
  const roleRaw = String(roleValue || 'none').trim().toLowerCase();
  const role = ({ sales: 'ventas', agent: 'agente', agente_tlmk: 'tlmk' } as Record<string, string>)[roleRaw] || roleRaw;
  const status = normalizeStatus(statusValue);
  const user = await adminAuth.getUser(uid);
  await adminAuth.setCustomUserClaims(uid, { ...(user.customClaims || {}), role, status });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return sendJson(res, 401, { error: 'Missing token' });
  }

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(authHeader.slice(7).trim(), true);
  } catch {
    return sendJson(res, 401, { error: 'Invalid or revoked token' });
  }

  const email = String(decoded.email || '').trim().toLowerCase();
  const userRef = adminDb.collection('users').doc(decoded.uid);
  const snap = await userRef.get();

  if (snap.exists) {
    const existing = snap.data() || {};
    const currentRole = String(existing.role || 'none').trim().toLowerCase();
    const currentStatus = normalizeStatus(existing.status);

    // Configured SuperAdmin emails are the trusted administrator allowlist.
    // Repair legacy profiles so login and RouteGuard use the canonical role/status.
    // Explicitly rejected or suspended accounts remain blocked.
    if (SUPERADMINS.includes(email)) {
      if (['rejected', 'suspended'].includes(currentStatus)) {
        return sendJson(res, 403, {
          error: 'La cuenta administrativa está bloqueada. Un administrador debe revisar su estado.',
          code: 'ADMIN_ACCOUNT_BLOCKED',
        });
      }

      const role = 'superadmin';
      const status = 'approved';
      const repaired = {
        role,
        status,
        email: email || existing.email || null,
        uid: decoded.uid,
        updatedAt: FieldValue.serverTimestamp(),
        lastLogin: FieldValue.serverTimestamp(),
      };
      await userRef.set(repaired, { merge: true });
      await syncBaseRoleClaims(decoded.uid, role, status);
      return sendJson(res, 200, {
        user: { ...existing, ...repaired },
        repaired: currentRole !== role || currentStatus !== status,
      });
    }

    const role = currentRole;
    const status = currentStatus;
    await syncBaseRoleClaims(decoded.uid, role, status);
    await userRef.update({ lastLogin: FieldValue.serverTimestamp() }).catch(() => undefined);
    return sendJson(res, 200, { user: { ...existing, role, status } });
  }

  // Only explicitly configured SuperAdmin emails are provisioned as administrators.
  // All other first-time accounts remain unprivileged and pending.
  const isSuperAdmin = SUPERADMINS.includes(email);
  const profile = {
    uid: decoded.uid,
    name: decoded.name || email.split('@')[0] || 'Usuario',
    email: email || null,
    role: isSuperAdmin ? 'superadmin' : 'none',
    status: isSuperAdmin ? 'approved' : 'pending',
    avatarUrl: decoded.picture || '',
    createdAt: new Date().toISOString(),
    lastLogin: FieldValue.serverTimestamp(),
  };

  try {
    await userRef.create(profile);
    await syncBaseRoleClaims(decoded.uid, profile.role, profile.status);
    return sendJson(res, 201, { user: profile });
  } catch (createError) {
    // Concurrent bootstrap calls are idempotent, but must never overwrite roles.
    const latest = await userRef.get();
    if (!latest.exists) throw createError;
    const existing = latest.data() || {};
    await syncBaseRoleClaims(decoded.uid, existing.role, existing.status);
    return sendJson(res, 200, { user: existing });
  }
}
