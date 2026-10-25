import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

const SUPERADMINS = (process.env.SUPERADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing token' }));
    return;
  }

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(authHeader.slice(7).trim());
  } catch {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid token' }));
    return;
  }

  const userRef = adminDb.collection('users').doc(decoded.uid);
  const snap = await userRef.get();
  if (snap.exists) {
    const existing = snap.data() || {};
    const allowlistedSuperAdmin = SUPERADMINS.includes(String(decoded.email || '').toLowerCase());
    // Legacy active accounts are not approval evidence. Only an explicitly configured
    // SuperAdmin may be repaired to approved; everyone else is moved to pending.
    if (allowlistedSuperAdmin && (existing.status !== 'approved' || existing.role !== 'superadmin')) {
      await userRef.set({ role: 'superadmin', status: 'approved', permissions: existing.permissions || {}, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminAuth.setCustomUserClaims(decoded.uid, { role: 'superadmin' });
      await adminDb.collection('audit_logs').add({
        action: 'user.superadmin.bootstrap_repaired', actorUid: 'system-bootstrap',
        targetUid: decoded.uid, targetEmail: decoded.email || null,
        before: { role: existing.role || null, status: existing.status || null },
        after: { role: 'superadmin', status: 'approved' }, createdAt: FieldValue.serverTimestamp()
      });
      existing.role = 'superadmin'; existing.status = 'approved';
    } else if (!allowlistedSuperAdmin && (existing.status === 'active' || existing.role === 'superadmin')) {
      const before = { status: existing.status || null, role: existing.role || null };
      await userRef.set({ status: 'pending', ...((existing.status === 'active' || existing.role === 'superadmin') ? { role: 'none' } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminDb.collection('audit_logs').add({
        action: 'user.legacy_access_locked', actorUid: 'system-bootstrap',
        targetUid: decoded.uid, targetEmail: decoded.email || null,
        before, after: { status: 'pending', role: (existing.status === 'active' || existing.role === 'superadmin') ? 'none' : existing.role || 'none' },
        createdAt: FieldValue.serverTimestamp()
      });
      existing.status = 'pending';
      if (existing.status === 'active' || existing.role === 'superadmin') existing.role = 'none';
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ user: existing }));
    return;
  }

  const isSuperAdmin = SUPERADMINS.includes(String(decoded.email || '').toLowerCase());
  const profile = {
    uid: decoded.uid,
    name: decoded.name || (decoded.email || '').split('@')[0] || 'Usuario',
    email: decoded.email || null,
    role: isSuperAdmin ? 'superadmin' : 'none',
    status: isSuperAdmin ? 'approved' : 'pending',
    permissions: {},
    avatarUrl: decoded.picture || '',
    createdAt: new Date().toISOString(),
    lastLogin: FieldValue.serverTimestamp(),
  };

  await userRef.set(profile, { merge: false });
  if (isSuperAdmin) {
    await adminAuth.setCustomUserClaims(decoded.uid, { role: 'superadmin' });
  }
  res.statusCode = 201;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ user: profile }));
}
