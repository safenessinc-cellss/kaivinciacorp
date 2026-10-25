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

  // Prefer the authoritative Firebase Auth user record over token claims, which may be stale.
  const authRecord = await adminAuth.getUser(decoded.uid);
  const email = String(authRecord.email || decoded.email || '').trim().toLowerCase();
  const allowlistedSuperAdmin = SUPERADMINS.has(email);
  const authRole = String(authRecord.customClaims?.role || '').toLowerCase();
  const authAlreadySuperAdmin = authRole === 'superadmin' || authRole === 'superuser' || authRecord.customClaims?.isSuperAdmin === true;
  const userRef = adminDb.collection('users').doc(decoded.uid);
  const snap = await userRef.get();

  // Emit a minimal decision trace to diagnose approval mismatches without logging tokens or secrets.
  console.info('[bootstrap-user] access decision', {
    uid: decoded.uid,
    email,
    allowlistedSuperAdmin,
    profileExists: snap.exists,
    profileRole: snap.exists ? String(snap.data()?.role || '') : null,
    profileStatus: snap.exists ? String(snap.data()?.status || '') : null,
    authRole: authRole || null,
    firebaseProject: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'service-account-configured',
  });

  if (snap.exists) {
    const existing = snap.data() || {};
    // Existing SuperAdmin roles are server-managed records, not user-editable
    // profile fields. Preserve and repair these accounts instead of demoting them.
    const firestoreRole = String(existing.role || '').trim().toLowerCase();
    // Honor every already-registered SuperAdmin marker in the trusted profile,
    // even when status is pending/active or Auth custom claims have gone stale.
    const registeredSuperAdmin =
      firestoreRole === 'superadmin' ||
      firestoreRole === 'superuser' ||
      existing.isSuperAdmin === true ||
      existing.isSuperadmin === true;
    const shouldBeSuperAdmin = allowlistedSuperAdmin || registeredSuperAdmin || authAlreadySuperAdmin;

    if (shouldBeSuperAdmin) {
      const profileNeedsRepair = existing.status !== 'approved' || existing.role !== 'superadmin';
      const claimsNeedRepair = authRole !== 'superadmin' || authRecord.customClaims?.isSuperAdmin === true;

      // Always reconcile both authoritative stores for the allowlisted owner. Do not
      // rely on the browser's possibly stale token claim to decide whether to repair.
      if (profileNeedsRepair) {
        await userRef.set({
          role: 'superadmin',
          status: 'approved',
          permissions: existing.permissions || {},
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      if (claimsNeedRepair) {
        await adminAuth.setCustomUserClaims(decoded.uid, {
          ...(authRecord.customClaims || {}),
          role: 'superadmin',
        });
      }

      if (profileNeedsRepair || claimsNeedRepair) {
        await adminDb.collection('audit_logs').add({
          action: 'user.superadmin.bootstrap_repaired',
          actorUid: 'system-bootstrap',
          targetUid: decoded.uid,
          targetEmail: email || null,
          before: { role: existing.role || null, status: existing.status || null, authRole: authRole || null },
          after: { role: 'superadmin', status: 'approved', authRole: 'superadmin' },
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      existing.role = 'superadmin';
      existing.status = 'approved';
      existing.permissions = existing.permissions || {};

      // Return the persisted server-side profile, not only the in-memory repaired object.
      const verifiedProfile = await userRef.get();
      if (!verifiedProfile.exists || verifiedProfile.data()?.status !== 'approved' || verifiedProfile.data()?.role !== 'superadmin') {
        console.error('[bootstrap-user] owner profile repair verification failed', {
          uid: decoded.uid,
          email,
          profileExists: verifiedProfile.exists,
          profileRole: verifiedProfile.data()?.role || null,
          profileStatus: verifiedProfile.data()?.status || null,
        });
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'No se pudo verificar la reparación del perfil SuperAdmin.' }));
        return;
      }
      Object.assign(existing, verifiedProfile.data());
    } else if (String(existing.status || '').toLowerCase() === 'active') {
      // Legacy accounts marked "active" were previously authorized. Migrate the
      // old state to the canonical approval state without stripping their role.
      const migratedRole = String(existing.role || '').trim().toLowerCase();
      const safeRole = migratedRole && migratedRole !== 'none' ? migratedRole : 'agent';
      await userRef.set({
        status: 'approved',
        role: safeRole,
        approvedBy: existing.approvedBy || 'system-bootstrap-migration',
        approvedAt: existing.approvedAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      await adminDb.collection('audit_logs').add({
        action: 'user.legacy_access_migrated',
        actorUid: 'system-bootstrap',
        targetUid: decoded.uid,
        targetEmail: email || null,
        before: { status: existing.status || null, role: existing.role || null },
        after: { status: 'approved', role: safeRole },
        createdAt: FieldValue.serverTimestamp(),
      });

      existing.status = 'approved';
      existing.role = safeRole;
      existing.approvedBy = existing.approvedBy || 'system-bootstrap-migration';
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
