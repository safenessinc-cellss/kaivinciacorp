import { adminDb } from '../server/_lib/firebaseAdmin.js';
import { hasPermission, json, requireApprovedUser } from '../server/_lib/authz.js';
import { TelnyxBackendService } from '../server/telnyxBackend.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    json(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' });
    return;
  }

  try {
    const user = await requireApprovedUser(req, res);
    if (!user) return;
    if (!hasPermission(user, 'dialer')) {
      json(res, 403, { error: 'PERMISSION_DENIED', message: 'No tienes permiso para usar el discador.' });
      return;
    }

    const userRef = adminDb.collection('users').doc(user.uid);
    const userSnap = await userRef.get();
    const profile = userSnap.data() || {};

    // Prefer the authoritative Admin Hub assignment whenever it is complete.
    // Profile fields can be stale after an administrator changes an assignment;
    // choosing them first may validate against the wrong collection.
    let credentialIdForAssignment = '';
    let assignedCallerId = '';
    let usesAdminHubAssignment = false;
    let canAutoProvisionCredential = false;

    const agentAssignmentSnap = await adminDb.collection('telnyx_agent_assignments').doc(user.uid).get();
    const agentAssignment = agentAssignmentSnap.exists ? agentAssignmentSnap.data() || {} : null;
    const authorizedNumbers = Array.isArray(agentAssignment?.authorizedNumbers)
      ? agentAssignment.authorizedNumbers.map((value: unknown) => String(value || '').trim())
      : [];
    const defaultCallerId = String(agentAssignment?.defaultCallerId || '').trim();
    const adminCredentialId = String(agentAssignment?.telnyxCredentialId || '').trim();

    if (adminCredentialId && /^\+[1-9]\d{7,14}$/.test(defaultCallerId) && authorizedNumbers.includes(defaultCallerId)) {
      credentialIdForAssignment = adminCredentialId;
      assignedCallerId = defaultCallerId;
      usesAdminHubAssignment = true;
    } else {
      // Backward compatibility for accounts still managed by the legacy schema.
      credentialIdForAssignment = String(profile.assignedSipCredentialId || '').trim();
      assignedCallerId = String(profile.assignedCallerId || '').trim();
    }

    if (!credentialIdForAssignment || !/^\+[1-9]\d{7,14}$/.test(assignedCallerId)) {
      const agentAssignmentSnap = await adminDb.collection('telnyx_agent_assignments').doc(user.uid).get();
      const agentAssignment = agentAssignmentSnap.exists ? agentAssignmentSnap.data() || {} : null;
      const authorizedNumbers = Array.isArray(agentAssignment?.authorizedNumbers)
        ? agentAssignment.authorizedNumbers.map((value: unknown) => String(value || '').trim())
        : [];
      const defaultCallerId = String(agentAssignment?.defaultCallerId || '');
      credentialIdForAssignment = String(agentAssignment?.telnyxCredentialId || '');
      assignedCallerId = defaultCallerId && authorizedNumbers.includes(defaultCallerId)
        ? defaultCallerId
        : '';
      usesAdminHubAssignment = Boolean(credentialIdForAssignment && assignedCallerId);
      canAutoProvisionCredential = Boolean(
        agentAssignmentSnap.exists &&
        /^\+[1-9]\d{7,14}$/.test(defaultCallerId) &&
        authorizedNumbers.includes(defaultCallerId)
      );
    }

    if (!/^\+[1-9]\d{7,14}$/.test(assignedCallerId)) {
      json(res, 403, { error: 'SIP_ASSIGNMENT_REQUIRED', message: 'Falta un Caller ID autorizado. En Telnyx Admin Hub, asigna un número al usuario y guárdalo como predeterminado.' });
      return;
    }

    // The softphone may provision the per-agent Telnyx credential itself, but
    // only after an administrator has explicitly allow-listed the caller ID.
    // The Telnyx API key remains server-side; the browser receives only the JWT.
    if (!credentialIdForAssignment && canAutoProvisionCredential) {
      const connectionId = String(
        agentAssignment?.connectionId ||
        agentAssignment?.connection_id ||
        TelnyxBackendService.getDefaultConnectionId() ||
        ''
      ).trim();
      const provisioned = await TelnyxBackendService.getOrCreateTelephonyCredential(user.uid, connectionId || undefined);
      credentialIdForAssignment = provisioned.id;
      usesAdminHubAssignment = true;
      const credentialRecord = {
        id: provisioned.id,
        telnyxCredentialId: provisioned.id,
        credentialId: provisioned.id,
        sip_username: provisioned.sip_username || '',
        connectionId: connectionId || TelnyxBackendService.getDefaultConnectionId(),
        connection_id: connectionId || TelnyxBackendService.getDefaultConnectionId(),
        assignedTo: user.uid,
        source: 'softphone-auto-provision',
        updatedAt: new Date().toISOString()
      };
      await Promise.all([
        adminDb.collection('telnyx_sip_credentials').doc(provisioned.id).set(credentialRecord, { merge: true }),
        adminDb.collection('telnyx_agent_assignments').doc(user.uid).set({
          telnyxCredentialId: provisioned.id,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      ]);
    }

    if (!credentialIdForAssignment) {
      json(res, 403, { error: 'SIP_ASSIGNMENT_REQUIRED', message: 'No hay credencial SIP asignada. Verifica la asignación autorizada en Telnyx Admin Hub.' });
      return;
    }

    const credentialSnap = await adminDb.collection('telnyx_sip_credentials').doc(credentialIdForAssignment).get();
    const credential = credentialSnap.exists ? credentialSnap.data() || {} : {};
    if (!credentialSnap.exists) {
      json(res, 403, { error: 'SIP_ASSIGNMENT_INVALID', message: 'La credencial SIP asignada no existe en telnyx_sip_credentials. Revisa la asignación del SuperAdmin.' });
      return;
    }

    if (usesAdminHubAssignment) {
      // The Admin Hub schema requires both a per-user allow-list and a credential
      // explicitly assigned to the same authenticated user.
      if (credential.assignedTo !== user.uid) {
        json(res, 403, { error: 'SIP_ASSIGNMENT_INVALID', message: 'La credencial SIP no está asignada a este usuario. Corrige la asignación en Telnyx Admin Hub.' });
        return;
      }
    } else {
      const assignmentSnap = await adminDb.collection('sip_assignments').doc(credentialIdForAssignment).get();
      const assignment = assignmentSnap.exists ? assignmentSnap.data() || {} : {};
      if (!assignmentSnap.exists || assignment.assignedTo !== user.uid || assignment.phoneNumber !== assignedCallerId) {
        json(res, 403, { error: 'SIP_ASSIGNMENT_INVALID', message: 'La asignación SIP no coincide con tu perfil. Contacta al SuperAdmin.' });
        return;
      }
    }

    // Only use credentials provisioned by an administrator; never mint one for
    // an arbitrary authenticated user.
    const telnyxCredentialId = String(credential.telnyxCredentialId || credential.credentialId || credential.id || credentialSnap.id || '');
    if (!telnyxCredentialId) {
      json(res, 409, { error: 'TELNYX_CREDENTIAL_MISSING', message: 'La credencial asignada no está vinculada a una credencial Telnyx válida.' });
      return;
    }

    const operatorRef = adminDb.collection('operadores').doc(user.uid);
    const operatorSnap = await operatorRef.get();
    const operatorData = operatorSnap.exists ? operatorSnap.data() || {} : {};
    if (operatorData.activo === false) {
      json(res, 403, { error: 'OPERATOR_DISABLED', message: 'La cuenta de telefonía está desactivada. Contacta al SuperAdmin.' });
      return;
    }
    if (!['superadmin', 'admin', 'supervisor'].includes(user.role) && operatorData.horario && !verificarHorario(operatorData.horario)) {
      json(res, 403, { error: 'OUTSIDE_WORKING_HOURS', message: 'Fuera de horario laboral. Contacta a tu supervisor.' });
      return;
    }

    const token = await TelnyxBackendService.generateAgentJwt(telnyxCredentialId);
    await operatorRef.set({
      id: user.uid, email: user.email || '',
      nombre: profile.name || profile.displayName || user.email || 'Operador',
      rol: user.role, telnyxCredentialId, telnyxUsername: credential.sip_username || credential.sipUsername || credential.username || '',
      disponible: true, ultimaActividad: new Date().toISOString(), activo: true
    }, { merge: true });

    json(res, 200, {
      token,
      sipUsername: credential.sip_username || credential.sipUsername || credential.username || '',
      credentialId: credentialIdForAssignment,
      connectionId: credential.connectionId || credential.connection_id || process.env.TELNYX_CONNECTION_ID || '',
      assignedCallerId,
      operador: { uid: user.uid, nombre: profile.name || profile.displayName || user.email, rol: user.role },
      numerosAsignados: [{ id: credentialIdForAssignment, phoneNumber: assignedCallerId }],
      allowedNumbers: [assignedCallerId]
    });
  } catch (error: any) {
    console.error('[api/telnyx-token] request failed', error);
    json(res, 500, { error: 'TELNYX_TOKEN_FAILED', message: 'No se pudo generar el token de telefonía. Verifica la configuración de Telnyx.' });
  }
}

function verificarHorario(horario: any): boolean {
  if (!horario || !horario.inicio || !horario.fin) return true;
  try {
    const zone = horario.zonaHoraria || 'America/Los_Angeles';
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: zone }));
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = horario.inicio.split(':').map(Number);
    const [endH, endM] = horario.fin.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    if (Array.isArray(horario.diasLaborables)) {
      const days = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
      if (!horario.diasLaborables.includes(days[now.getDay()])) return false;
    }
    return end < start ? currentMinutes >= start || currentMinutes <= end : currentMinutes >= start && currentMinutes <= end;
  } catch { return false; }
}
