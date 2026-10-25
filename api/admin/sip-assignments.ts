import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../../server/_lib/firebaseAdmin.js';
import { json, requireApprovedUser } from '../../server/_lib/authz.js';

function toE164(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(raw)) return null;
  return raw;
}

export default async function handler(req: any, res: any) {
  const actor = await requireApprovedUser(req, res, true);
  if (!actor) return;

  if (req.method === 'GET') {
    try {
      const [credentialSnap, userSnap, assignmentSnap] = await Promise.all([
        adminDb.collection('telnyx_sip_credentials').limit(500).get(),
        adminDb.collection('users').limit(500).get(),
        adminDb.collection('sip_assignments').limit(500).get()
      ]);
      const users = userSnap.docs.map((d) => {
        const u = d.data();
        return { uid: d.id, name: u.name || u.displayName || u.email || d.id, email: u.email || '', status: u.status || 'pending' };
      });
      const assignments = new Map(assignmentSnap.docs.map((d) => [d.id, d.data()]));
      const credentials = credentialSnap.docs.map((d) => {
        const c = d.data();
        const a: any = assignments.get(d.id) || {};
        return {
          id: d.id,
          label: c.label || c.name || c.username || d.id,
          phoneNumber: c.phoneNumber || c.phone_number || c.callerIdNumber || c.caller_id_number || null,
          assignedTo: a.assignedTo || c.assignedTo || null,
          assignedName: a.assignedName || null
        };
      });
      json(res, 200, { users, credentials });
    } catch (error) {
      console.error('[admin/sip-assignments] list failed', error);
      json(res, 500, { error: 'ASSIGNMENT_LIST_FAILED', message: 'No se pudieron cargar las asignaciones SIP.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const { action, credentialId, uid } = req.body || {};
  if (typeof credentialId !== 'string' || !credentialId.trim()) {
    json(res, 400, { error: 'INVALID_CREDENTIAL', message: 'Selecciona una credencial SIP.' });
    return;
  }
  const credentialRef = adminDb.collection('telnyx_sip_credentials').doc(credentialId);
  const assignmentRef = adminDb.collection('sip_assignments').doc(credentialId);
  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const credentialSnap = await tx.get(credentialRef);
      if (!credentialSnap.exists) throw Object.assign(new Error('CREDENTIAL_NOT_FOUND'), { code: 'CREDENTIAL_NOT_FOUND' });
      const credential = credentialSnap.data() || {};
      const assignmentSnap = await tx.get(assignmentRef);
      const currentAssignment = assignmentSnap.exists ? assignmentSnap.data() || {} : {};
      const currentUid = currentAssignment.assignedTo || credential.assignedTo || null;

      if (action === 'release') {
        if (!currentUid) return { released: true };
        const existingPhone = toE164(currentAssignment.phoneNumber || credential.phoneNumber || credential.phone_number || credential.callerIdNumber || credential.caller_id_number);
        const numberIndexRef = existingPhone ? adminDb.collection('sip_number_index').doc(existingPhone) : null;
        const numberIndexSnap = numberIndexRef ? await tx.get(numberIndexRef) : null;
        const previousUserRef = adminDb.collection('users').doc(String(currentUid));
        const previousUserSnap = await tx.get(previousUserRef);
        tx.delete(assignmentRef);
        if (numberIndexRef && numberIndexSnap?.exists && numberIndexSnap.data()?.credentialId === credentialId) tx.delete(numberIndexRef);
        tx.update(credentialRef, { assignedTo: null, assignmentUpdatedAt: FieldValue.serverTimestamp() });
        if (previousUserSnap.exists) {
          tx.update(previousUserRef, {
            assignedCallerId: FieldValue.delete(),
            assignedSipCredentialId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
          });
        }
        const auditRef = adminDb.collection('audit_logs').doc();
        tx.set(auditRef, {
          action: 'sip.assignment.released', actorUid: actor.uid, actorEmail: actor.email,
          credentialId, previousUid: currentUid, createdAt: FieldValue.serverTimestamp()
        });
        return { released: true };
      }

      if (action !== 'assign' || typeof uid !== 'string' || !uid.trim()) {
        throw Object.assign(new Error('INVALID_ACTION'), { code: 'INVALID_ACTION' });
      }
      if (currentUid && currentUid !== uid) {
        const assignedUserSnap = await tx.get(adminDb.collection('users').doc(String(currentUid)));
        const assignedUser = assignedUserSnap.exists ? assignedUserSnap.data() || {} : {};
        const assignedName = assignedUser.name || assignedUser.displayName || assignedUser.email || currentUid;
        throw Object.assign(new Error('NUMBER_ALREADY_ASSIGNED'), { code: 'NUMBER_ALREADY_ASSIGNED', assignedName });
      }
      const targetUserRef = adminDb.collection('users').doc(uid);
      const targetUserSnap = await tx.get(targetUserRef);
      if (!targetUserSnap.exists) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
      const target = targetUserSnap.data() || {};
      if (String(target.status || '').toLowerCase() !== 'approved') {
        throw Object.assign(new Error('USER_NOT_APPROVED'), { code: 'USER_NOT_APPROVED' });
      }
      const phoneNumber = toE164(
        credential.phoneNumber || credential.phone_number || credential.callerIdNumber || credential.caller_id_number
      );
      if (!phoneNumber) {
        throw Object.assign(new Error('CALLER_ID_NOT_CONFIGURED'), { code: 'CALLER_ID_NOT_CONFIGURED' });
      }
      const numberIndexRef = adminDb.collection('sip_number_index').doc(phoneNumber);
      const numberIndexSnap = await tx.get(numberIndexRef);
      if (numberIndexSnap.exists) {
        const numberIndex = numberIndexSnap.data() || {};
        if (numberIndex.credentialId !== credentialId && numberIndex.assignedTo !== uid) {
          const otherUserSnap = numberIndex.assignedTo ? await tx.get(adminDb.collection('users').doc(String(numberIndex.assignedTo))) : null;
          const otherUser = otherUserSnap?.exists ? otherUserSnap.data() || {} : {};
          throw Object.assign(new Error('NUMBER_ALREADY_ASSIGNED'), { code: 'NUMBER_ALREADY_ASSIGNED', assignedName: otherUser.name || otherUser.email || numberIndex.assignedName || 'otro agente' });
        }
      }
      const assignedName = target.name || target.displayName || target.email || uid;
      tx.set(numberIndexRef, { phoneNumber, credentialId, assignedTo: uid, assignedName, updatedAt: FieldValue.serverTimestamp() });
      tx.set(assignmentRef, {
        credentialId, assignedTo: uid, assignedName, phoneNumber,
        assignedBy: actor.uid, assignedAt: FieldValue.serverTimestamp()
      });
      tx.update(credentialRef, { assignedTo: uid, assignmentUpdatedAt: FieldValue.serverTimestamp() });
      tx.update(targetUserRef, {
        assignedSipCredentialId: credentialId, assignedCallerId: phoneNumber,
        updatedAt: FieldValue.serverTimestamp()
      });
      const auditRef = adminDb.collection('audit_logs').doc();
      tx.set(auditRef, {
        action: 'sip.assignment.created', actorUid: actor.uid, actorEmail: actor.email,
        targetUid: uid, targetEmail: target.email || null, credentialId, phoneNumber,
        previousUid: currentUid, createdAt: FieldValue.serverTimestamp()
      });
      return { assigned: true, uid, phoneNumber };
    });
    json(res, 200, { ok: true, ...result });
  } catch (error: any) {
    const code = error?.code || '';
    const known: Record<string, [number, string]> = {
      CREDENTIAL_NOT_FOUND: [404, 'No se encontró la credencial SIP.'],
      USER_NOT_FOUND: [404, 'No se encontró el usuario.'],
      USER_NOT_APPROVED: [409, 'Solo se puede asignar telefonía a usuarios aprobados.'],
      CALLER_ID_NOT_CONFIGURED: [409, 'La credencial no tiene un Caller ID E.164 válido configurado.'],
      NUMBER_ALREADY_ASSIGNED: [409, `Este número ya está asignado a ${error?.assignedName || 'otro agente'}. No puede reasignarse hasta que se libere.`],
      INVALID_ACTION: [400, 'Acción de asignación no válida.']
    };
    const [httpStatus, message] = known[code] || [500, 'No se pudo guardar la asignación SIP.'];
    if (httpStatus === 500) console.error('[admin/sip-assignments] mutation failed', error);
    json(res, httpStatus, { error: code || 'ASSIGNMENT_FAILED', message });
  }
}
