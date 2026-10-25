import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

// The primary owner is always a SuperAdmin. Additional owners can be configured
// without a code change through SUPERADMIN_EMAILS (comma-separated).
const SUPERADMINS = new Set([
  'safeness.c.a@gmail.com',
  ...(process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
]);

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

  const email = String(decoded.email || '').trim().toLowerCase();
  const allowlistedSuperAdmin = SUPERADMINS.has(email);
  // Preserve existing Firebase Auth superadmins even if their Firestore profile is stale.
  const authRecord = await adminAuth.getUser(decoded.uid);
  const authRole = String(authRecord.customClaims?.role || '').toLowerCase();
  const authAlreadySuperAdmin = authRole === 'superadmin' || authRole === 'superuser' || authRecord.customClaims?.isSuperAdmin === true;
  const userRef = adminDb.collection('users').doc(decoded.uid);
  const snap = await userRef.get();

  if (snap.exists) {
    const existing = snap.data() || {};
    // Existing SuperAdmin roles are server-managed records, not user-editable
    // profile fields. Preserve and repair these accounts instead of demoting them.
    const firestoreRole = String(existing.role || '').toLowerCase();
    const registeredSuperAdmin = firestoreRole === 'superadmin' || firestoreRole === 'superuser';
    const shouldBeSuperAdmin = allowlistedSuperAdmin || registeredSuperAdmin || authAlreadySuperAdmin;

    if (shouldBeSuperAdmin && (existing.status !== 'approved' || existing.role !== 'superadmin' || decoded.role !== 'superadmin')) {
      await userRef.set({
        role: 'superadmin',
        status: 'approved',
        permissions: existing.permissions || {},
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      await adminAuth.setCustomUserClaims(decoded.uid, {
        ...(authRecord.customClaims || {}),
        role: 'superadmin',
      });

      await adminDb.collection('audit_logs').add({
        action: 'user.superadmin.bootstrap_repaired',
        actorUid: 'system-bootstrap',
        targetUid: decoded.uid,
        targetEmail: email || null,
        before: { role: existing.role || null, status: existing.status || null },
        after: { role: 'superadmin', status: 'approved' },
        createdAt: FieldValue.serverTimestamp(),
      });

      existing.role = 'superadmin';
      existing.status = 'approved';
      existing.permissions = existing.permissions || {};
    } else if (!shouldBeSuperAdmin && existing.status === 'active') {
      const before = { status: existing.status || null, role: existing.role || null };
      await userRef.set({
        status: 'pending',
        role: 'none',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      await adminDb.collection('audit_logs').add({
        action: 'user.legacy_access_locked',
        actorUid: 'system-bootstrap',
        targetUid: decoded.uid,
        targetEmail: email || null,
        before,
        after: { status: 'pending', role: 'none' },
        createdAt: FieldValue.serverTimestamp(),
      });

      existing.status = 'pending';
      existing.role = 'none';
      if (decoded.role === 'superadmin') {
        const authRecord = await adminAuth.getUser(decoded.uid);
        const { role: _removedRole, ...otherClaims } = authRecord.customClaims || {};
        await adminAuth.setCustomUserClaims(decoded.uid, otherClaims);
        await adminAuth.revokeRefreshTokens(decoded.uid);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ user: existing }));
    return;
  }

  const isSuperAdmin = allowlistedSuperAdmin || authAlreadySuperAdmin;
  const profile = {
    uid: decoded.uid,
    name: decoded.name || email.split('@')[0] || 'Usuario',
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
    await adminAuth.setCustomUserClaims(decoded.uid, {
      ...(authRecord.customClaims || {}),
      role: 'superadmin',
    });
    await adminDb.collection('audit_logs').add({
      action: 'user.superadmin.bootstrap_created',
      actorUid: 'system-bootstrap',
      targetUid: decoded.uid,
      targetEmail: email || null,
      after: { role: 'superadmin', status: 'approved' },
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  res.statusCode = 201;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ user: profile }));
}
