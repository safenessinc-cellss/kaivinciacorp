import { adminAuth, adminDb } from '../../../server/_lib/firebaseAdmin.js';

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method Not Allowed' });

  try {
    const header = req.headers['authorization'] || req.headers['Authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return sendJson(res, 401, { error: 'Se requiere un token Bearer.' });
    }
    const authUser = await adminAuth.verifyIdToken(header.slice(7).trim(), true);
    const profileSnap = await adminDb.collection('users').doc(authUser.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() || {} : {};
    const role = String(profile.role || '').trim().toLowerCase();
    const status = String(profile.status || '').trim().toLowerCase();
    if (status !== 'approved' || !['admin', 'superadmin'].includes(role)) {
      return sendJson(res, 403, { error: 'Solo un administrador aprobado puede crear o asignar credenciales SIP.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { nombre, operadorUid, connectionId } = body;
    if (typeof nombre !== 'string' || !nombre.trim() || typeof operadorUid !== 'string' || !operadorUid.trim()) {
      return sendJson(res, 400, { error: 'Faltan campos válidos: nombre y operadorUid.' });
    }

    const apiKey = process.env.TELNYX_API_KEY;
    const connId = typeof connectionId === 'string' && connectionId.trim()
      ? connectionId.trim()
      : process.env.TELNYX_CONNECTION_ID;
    if (!apiKey || !connId) return sendJson(res, 503, { error: 'La integración Telnyx no está configurada.' });

    const telnyxRes = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection_id: connId, name: nombre.trim() }),
    });
    if (!telnyxRes.ok) {
      console.error('[telnyx credentials/create] Provider returned status', telnyxRes.status);
      return sendJson(res, 502, { error: 'Telnyx no pudo crear la credencial solicitada.' });
    }

    const telnyxData = await telnyxRes.json();
    const credentialId = telnyxData?.data?.id;
    const sipUsername = telnyxData?.data?.sip_username;
    if (!credentialId || !sipUsername) return sendJson(res, 502, { error: 'Respuesta de credenciales Telnyx incompleta.' });

    await adminDb.collection('telnyx_sip_credentials').doc(credentialId).set({
      id: credentialId,
      telnyxUsername: sipUsername,
      connectionId: connId,
      operadorUid: operadorUid.trim(),
      activo: true,
      creadoEn: new Date().toISOString(),
    });
    await adminDb.collection('operadores').doc(operadorUid.trim()).set({
      telnyxCredentialId: credentialId,
      telnyxUsername: sipUsername,
      actualizadoEn: new Date().toISOString(),
    }, { merge: true });

    return sendJson(res, 200, { success: true, credentialId, sipUsername, message: 'Credencial creada correctamente' });
  } catch (err: any) {
    if (String(err?.code || '').startsWith('auth/')) return sendJson(res, 401, { error: 'Token inválido, expirado o revocado.' });
    console.error('[telnyx credentials/create] Request failed');
    return sendJson(res, 500, { error: 'Error interno al crear la credencial.' });
  }
}
