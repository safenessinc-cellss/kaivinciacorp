import { adminDb } from '../server/_lib/firebaseAdmin.js';
import { authorizeRequest, sendAuthError } from '../server/_lib/authorizeRequest.js';
import { TelnyxBackendService } from '../server/telnyxBackend.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method Not Allowed' })); return; }

  const auth = await authorizeRequest(req, ['superadmin', 'admin', 'owner', 'supervisor', 'tlmk', 'ventas', 'agente', 'agent']);
  if (!auth.ok) return sendAuthError(res, auth);

  try {
    const operatorRef = adminDb.collection('operadores').doc(auth.uid);
    const operatorSnap = await operatorRef.get();
    if (!operatorSnap.exists) {
      res.statusCode = 403; res.end(JSON.stringify({ error: 'No existe una asignación de telefonía para este usuario. Solicita al administrador que la configure.' })); return;
    }
    const operator: any = operatorSnap.data() || {};
    if (operator.activo === false || operator.permiteSalientes === false) {
      res.statusCode = 403; res.end(JSON.stringify({ error: 'Tu cuenta no tiene habilitadas las llamadas salientes.' })); return;
    }
    if (operator.horario && !verificarHorario(operator.horario)) {
      res.statusCode = 403; res.end(JSON.stringify({ error: 'Fuera del horario laboral autorizado.' })); return;
    }
    if (!operator.telnyxCredentialId) {
      res.statusCode = 409; res.end(JSON.stringify({ error: 'No hay una credencial SIP asignada. Solicita una asignación al administrador.' })); return;
    }

    const credentialId = String(operator.telnyxCredentialId);
    const connectionId = String(operator.connectionId || process.env.TELNYX_CONNECTION_ID || '');
    const sipUsername = String(operator.telnyxUsername || '');
    if (!connectionId || !sipUsername) {
      res.statusCode = 409; res.end(JSON.stringify({ error: 'La asignación SIP está incompleta; verifica conexión y usuario SIP.' })); return;
    }

    const token = await TelnyxBackendService.generateAgentJwt(credentialId);
    const numbers: any[] = [];
    for (const numberId of (Array.isArray(operator.numerosAsignados) ? operator.numerosAsignados : [])) {
      const numberSnap = await adminDb.collection('telnyx_phone_numbers').doc(String(numberId)).get();
      if (numberSnap.exists) {
        const number: any = numberSnap.data() || {};
        if (number.status !== 'disabled' && number.phoneNumber) numbers.push({ id: numberSnap.id, ...number });
      }
    }

    const now = new Date().toISOString();
    await operatorRef.set({ disponible: true, ultimaActividad: now }, { merge: true });
    await adminDb.collection('security_audit').add({
      action: 'telnyx.webrtc_token.issued', actorUid: auth.uid, role: auth.role,
      credentialId, connectionId, createdAt: now,
    });

    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      token, sipUsername, credentialId, connectionId,
      operador: { uid: auth.uid, nombre: operator.nombre || auth.profile.name || '', rol: auth.role, horario: operator.horario || null },
      numerosAsignados: numbers, allowedNumbers: numbers.map(n => n.phoneNumber),
    }));
  } catch (error) {
    console.error('[api/telnyx-token] token generation failed');
    res.statusCode = 500; res.end(JSON.stringify({ error: 'No se pudo generar la sesión de telefonía.' }));
  }
}

function verificarHorario(horario: any): boolean {
  try {
    if (!horario?.inicio || !horario?.fin) return true;
    const zone = horario.zonaHoraria || 'America/Sao_Paulo';
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date());
    const value = (type: string) => parts.find(p => p.type === type)?.value || '';
    const minutes = Number(value('hour')) * 60 + Number(value('minute'));
    const [sh, sm] = String(horario.inicio).split(':').map(Number);
    const [eh, em] = String(horario.fin).split(':').map(Number);
    const start = sh * 60 + sm, end = eh * 60 + em;
    if (Array.isArray(horario.diasLaborables)) {
      const days: Record<string, string> = { Sun: 'dom', Mon: 'lun', Tue: 'mar', Wed: 'mie', Thu: 'jue', Fri: 'vie', Sat: 'sab' };
      if (!horario.diasLaborables.includes(days[value('weekday')])) return false;
    }
    return end < start ? minutes >= start || minutes <= end : minutes >= start && minutes <= end;
  } catch { return false; }
}
