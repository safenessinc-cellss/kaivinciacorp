import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

const ROOT_USER = 'safeness.c.a@gmail.com';
const SUPERADMINS = (process.env.SUPERADMIN_EMAILS || ROOT_USER)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Role/status remain authoritative in Firestore; permissions are intentionally not copied to claims.
async function syncBaseRoleClaims(uid: string, roleValue: unknown, statusValue: unknown) {
  const roleRaw = String(roleValue || 'none').trim().toLowerCase();
  const role = ({ sales: 'ventas', agent: 'agente', agente_tlmk: 'tlmk' } as Record<string, string>)[roleRaw] || roleRaw;
  const status = String(statusValue || 'pending').trim().toLowerCase();
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
    const role = String(existing.role || 'none').trim().toLowerCase();
    const status = String(existing.status || '').trim().toLowerCase();

    // Allowlist membership is not an approval mechanism. Never elevate or activate
    // an existing account from a login/bootstrap request.
    if (SUPERADMINS.includes(email) && !(['superadmin', 'admin'].includes(role) && status === 'approved')) {
      return sendJson(res, 403, {
        error: 'La cuenta administrativa requiere provisión y aprobación explícitas.',
        code: 'ADMIN_APPROVAL_REQUIRED',
      });
    }

    await syncBaseRoleClaims(decoded.uid, role, status);
    await userRef.update({ lastLogin: FieldValue.serverTimestamp() }).catch(() => undefined);
    return sendJson(res, 200, { user: { ...existing, role, status } });
  }

  // Every first-time account starts unprivileged and pending. Even a configured
  // admin email must be provisioned by an authorized administrator out of band.
  const profile = {
    uid: decoded.uid,
    name: decoded.name || email.split('@')[0] || 'Usuario',
    email: email || null,
    role: 'none',
    status: 'pending',
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
