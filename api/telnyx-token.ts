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
    const credentialIdForAssignment = String(profile.assignedSipCredentialId || '');
    const assignedCallerId = String(profile.assignedCallerId || '');
    if (!credentialIdForAssignment || !/^\+[1-9]\d{7,14}$/.test(assignedCallerId)) {
      json(res, 403, { error: 'SIP_ASSIGNMENT_REQUIRED', message: 'No tienes un número SIP E.164 asignado. Solicita la asignación al SuperAdmin.' });
      return;
    }

    const [assignmentSnap, credentialSnap] = await Promise.all([
      adminDb.collection('sip_assignments').doc(credentialIdForAssignment).get(),
      adminDb.collection('telnyx_sip_credentials').doc(credentialIdForAssignment).get()
    ]);
    const assignment = assignmentSnap.exists ? assignmentSnap.data() || {} : {};
    const credential = credentialSnap.exists ? credentialSnap.data() || {} : {};
    if (!assignmentSnap.exists || assignment.assignedTo !== user.uid || assignment.phoneNumber !== assignedCallerId) {
      json(res, 403, { error: 'SIP_ASSIGNMENT_INVALID', message: 'La asignación SIP no coincide con tu perfil. Contacta al SuperAdmin.' });
      return;
    }

    // The assignment's credential is provisioned by an administrator; never create
    // an independent Telnyx credential on demand for an arbitrary authenticated user.
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
