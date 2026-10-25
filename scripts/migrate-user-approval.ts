/**
 * One-time migration for legacy users and SIP assignments.
 * Dry-run by default. Apply changes only with --apply after setting
 * FIREBASE_SERVICE_ACCOUNT_KEY and SUPERADMIN_EMAILS in the execution environment.
 */
import { adminAuth, adminDb } from '../server/_lib/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const SUPERADMINS = new Set((process.env.SUPERADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const E164 = /^\+[1-9]\d{7,14}$/;

async function main() {
  if (!SUPERADMINS.size) throw new Error('Configura SUPERADMIN_EMAILS antes de ejecutar la migración.');
  const usersSnap = await adminDb.collection('users').get();
  let usersChanged = 0;
  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    const email = String(user.email || '').toLowerCase();
    let nextStatus = String(user.status || '').toLowerCase();
    let nextRole = String(user.role || 'none').toLowerCase();
    if (SUPERADMINS.has(email)) { nextStatus = 'approved'; nextRole = 'superadmin'; }
    else {
      if (nextStatus !== 'approved' || user.role === 'superadmin') nextStatus = 'pending';
      if (user.status === 'active' || nextRole === 'superadmin') nextRole = 'none';
    }
    const changed = user.status !== nextStatus || user.role !== nextRole;
    if (!changed) continue;
    console.log(`user ${userDoc.id}: ${user.status || '(missing)'} -> ${nextStatus}`);
    if (APPLY) {
      await userDoc.ref.set({ status: nextStatus, role: nextRole, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      const authRecord = await adminAuth.getUser(userDoc.id);
      await adminAuth.setCustomUserClaims(userDoc.id, { ...(authRecord.customClaims || {}), role: nextRole });
      if (!SUPERADMINS.has(email) && user.role === 'superadmin') await adminAuth.revokeRefreshTokens(userDoc.id);
      await adminDb.collection('audit_logs').add({
        action: 'migration.user_status', actorUid: 'migration-script', targetUid: userDoc.id,
        targetEmail: email || null, before: { status: user.status || null, role: user.role || null },
        after: { status: nextStatus, role: nextRole }, createdAt: FieldValue.serverTimestamp()
      });
    }
    usersChanged++;
  }

  const credsSnap = await adminDb.collection('telnyx_sip_credentials').get();
  let assignmentsCreated = 0;
  for (const credentialDoc of credsSnap.docs) {
    const credential = credentialDoc.data();
    const uid = credential.assignedTo;
    const phone = String(credential.phoneNumber || credential.phone_number || credential.callerIdNumber || credential.caller_id_number || '').trim();
    if (!uid || !E164.test(phone)) continue;
    const assignmentRef = adminDb.collection('sip_assignments').doc(credentialDoc.id);
    const indexRef = adminDb.collection('sip_number_index').doc(phone);
    const [assignment, index, target] = await Promise.all([
      assignmentRef.get(), indexRef.get(), adminDb.collection('users').doc(String(uid)).get()
    ]);
    if (assignment.exists) continue;
    if (index.exists && index.data()?.assignedTo !== uid) {
      console.warn(`CONFLICT: ${phone} appears assigned to multiple users; manual review required. Credential ${credentialDoc.id} skipped.`);
      continue;
    }
    const user = target.exists ? target.data() || {} : {};
    const assignedName = user.name || user.email || String(uid);
    console.log(`sip ${credentialDoc.id}: ${phone} -> ${uid}`);
    if (APPLY) {
      const batch = adminDb.batch();
      batch.set(assignmentRef, { credentialId: credentialDoc.id, assignedTo: uid, assignedName, phoneNumber: phone, assignedBy: 'migration-script', assignedAt: FieldValue.serverTimestamp() });
      batch.set(indexRef, { phoneNumber: phone, credentialId: credentialDoc.id, assignedTo: uid, assignedName, updatedAt: FieldValue.serverTimestamp() });
      if (target.exists) batch.set(target.ref, { assignedSipCredentialId: credentialDoc.id, assignedCallerId: phone }, { merge: true });
      batch.set(adminDb.collection('audit_logs').doc(), { action: 'migration.sip_assignment', actorUid: 'migration-script', targetUid: uid, credentialId: credentialDoc.id, phoneNumber: phone, createdAt: FieldValue.serverTimestamp() });
      await batch.commit();
    }
    assignmentsCreated++;
  }
  console.log(JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY_RUN', usersChanged, assignmentsCreated }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
