import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';

const send = (res: any, status: number, body: Record<string, unknown>) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') return send(res, 405, { authorized: false, error: 'Method Not Allowed' });

  try {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) return send(res, 401, { authorized: false, error: 'Sesión no autenticada.' });
    const decoded = await adminAuth.verifyIdToken(header.slice(7), true);
    const callerId = String(req.body?.callerId || '').trim();
    if (!/^\+[1-9]\d{7,14}$/.test(callerId)) return send(res, 400, { authorized: false, error: 'Caller ID inválido.' });

    const operatorRef = adminDb.collection('operadores').doc(decoded.uid);
    const operatorSnap = await operatorRef.get();
    if (!operatorSnap.exists) return send(res, 403, { authorized: false, error: 'No existe un perfil de operador activo.' });
    const operator = operatorSnap.data() || {};
    const role = String(operator.rol || operator.role || '').toLowerCase();
    const privileged = ['superadmin', 'admin', 'owner', 'ceo', 'gestor'].includes(role);
    if (operator.activo === false) return send(res, 403, { authorized: false, error: 'Cuenta desactivada.' });
    if (operator.permiteSalientes === false) return send(res, 403, { authorized: false, error: 'Tu perfil no tiene permiso para llamadas salientes.' });

    const numbersSnap = await adminDb.collection('telnyx_phone_numbers').where('phoneNumber', '==', callerId).limit(1).get();
    if (numbersSnap.empty) return send(res, 403, { authorized: false, error: 'El Caller ID no pertenece a los números Telnyx sincronizados.' });
    const numberDoc = numbersSnap.docs[0];
    const number = numberDoc.data();
    if (String(number.status || '').toLowerCase() === 'disabled' || String(number.status || '').toLowerCase() === 'deleted') {
      return send(res, 403, { authorized: false, error: 'Este número Telnyx está deshabilitado.' });
    }

    if (!privileged) {
      const assignmentSnap = await adminDb.collection('telnyx_agent_assignments').doc(decoded.uid).get();
      const assignment = assignmentSnap.data() || {};
      const allowed = Array.isArray(assignment.authorizedNumbers) ? assignment.authorizedNumbers : [];
      if (!assignmentSnap.exists || !allowed.includes(callerId)) {
        return send(res, 403, { authorized: false, error: 'No tienes asignado este Caller ID. Solicita autorización a un administrador.' });
      }
    }

    return send(res, 200, { authorized: true, callerId, numberId: numberDoc.id });
  } catch (error: any) {
    console.error('[telnyx/authorize-call] Authorization failed:', error?.message || error);
    return send(res, 401, { authorized: false, error: 'No se pudo validar la autorización de llamada.' });
  }
}
