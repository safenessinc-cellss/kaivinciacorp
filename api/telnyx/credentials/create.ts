import { adminDb } from '../../../server/_lib/firebaseAdmin.js';
import { authorizeRequest, sendAuthError } from '../../../server/_lib/authorizeRequest.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method Not Allowed' })); return; }

  const auth = await authorizeRequest(req, ['superadmin', 'admin', 'owner']);
  if (!auth.ok) return sendAuthError(res, auth);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const nombre = String(body.nombre || '').trim();
    const operadorUid = String(body.operadorUid || '').trim();
    const connId = String(body.connectionId || process.env.TELNYX_CONNECTION_ID || '').trim();
    if (!nombre || !operadorUid || !connId) {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Faltan nombre, operadorUid o connectionId.' })); return;
    }
    const operatorRef = adminDb.collection('operadores').doc(operadorUid);
    const operatorSnap = await operatorRef.get();
    if (!operatorSnap.exists) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Operador no encontrado.' })); return; }
    const operator = operatorSnap.data() || {};
    if (operator.telnyxCredentialId) {
      res.statusCode = 409; res.end(JSON.stringify({ error: 'El operador ya tiene una credencial SIP asignada. Revísala antes de crear otra.' })); return;
    }
    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) { res.statusCode = 500; res.end(JSON.stringify({ error: 'TELNYX_API_KEY no configurada.' })); return; }

    const response = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection_id: connId, name: nombre }),
    });
    if (!response.ok) {
      console.error('[telnyx credentials create] upstream status:', response.status);
      res.statusCode = 502; res.end(JSON.stringify({ error: 'Telnyx rechazó la creación de la credencial.' })); return;
    }
    const payload: any = await response.json();
    const credential = payload.data;
    if (!credential?.id || !credential?.sip_username) {
      res.statusCode = 502; res.end(JSON.stringify({ error: 'Respuesta incompleta de Telnyx.' })); return;
    }

    const now = new Date().toISOString();
    await adminDb.collection('telnyx_sip_credentials').doc(credential.id).set({
      id: credential.id, telnyxUsername: credential.sip_username, connectionId: connId,
      operadorUid, activo: true, creadoEn: now, creadoPor: auth.uid,
    });
    await operatorRef.set({ telnyxCredentialId: credential.id, telnyxUsername: credential.sip_username, actualizadoEn: now }, { merge: true });
    await adminDb.collection('security_audit').add({
      action: 'telnyx.sip_credential.assign', actorUid: auth.uid, targetUid: operadorUid,
      credentialId: credential.id, connectionId: connId, createdAt: now,
    });
    res.statusCode = 201; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, credentialId: credential.id, sipUsername: credential.sip_username, message: 'Credencial creada y asignada.' }));
  } catch (error) {
    console.error('[telnyx credentials create] failed');
    res.statusCode = 500; res.end(JSON.stringify({ error: 'Error interno creando credencial SIP.' }));
  }
}
