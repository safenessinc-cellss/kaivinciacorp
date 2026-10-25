import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '../../../server/_lib/firebaseAdmin.js';
import { json, requireApprovedUser } from '../../../server/_lib/authz.js';
import { TelnyxBackendService } from '../../../server/telnyxBackend.js';

const E164 = /^\+[1-9]\d{7,14}$/;

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const actor = await requireApprovedUser(req, res, true);
  if (!actor) return;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const nombre = String(body.nombre || '').trim();
    const operadorUid = String(body.operadorUid || '').trim();
    const connectionId = String(body.connectionId || process.env.TELNYX_CONNECTION_ID || '').trim();
    const phoneNumber = String(body.phoneNumber || '').trim();
    if (!nombre || !operadorUid || !connectionId || !E164.test(phoneNumber)) {
      json(res, 400, { error: 'INVALID_INPUT', message: 'Indica nombre, usuario destino, conexión y Caller ID E.164 válido.' });
      return;
    }

    const [targetSnap, inventory] = await Promise.all([
      adminDb.collection('users').doc(operadorUid).get(),
      TelnyxBackendService.getAccountPhoneNumbers()
    ]);
    if (!targetSnap.exists || String(targetSnap.data()?.status || '').toLowerCase() !== 'approved') {
      json(res, 409, { error: 'USER_NOT_APPROVED', message: 'Solo puedes preparar telefonía para un usuario aprobado.' });
      return;
    }
    if (!inventory.success || !inventory.numbers.some(n => n.phone_number === phoneNumber && (!n.connection_id || n.connection_id === connectionId))) {
      json(res, 409, { error: 'CALLER_ID_NOT_AUTHORIZED', message: 'El número debe estar activo en tu cuenta Telnyx y asociado a la conexión seleccionada.' });
      return;
    }
    const apiKey = TelnyxBackendService.getApiKey();
    if (!apiKey) {
      json(res, 503, { error: 'TELNYX_NOT_CONFIGURED', message: 'TELNYX_API_KEY no está configurada en el servidor.' });
      return;
    }

    const telnyxRes = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection_id: connectionId, name: nombre })
    });
    if (!telnyxRes.ok) {
      const status = telnyxRes.status;
      await telnyxRes.text();
      json(res, 502, { error: 'TELNYX_CREDENTIAL_CREATE_FAILED', message: `Telnyx no pudo crear la credencial (HTTP ${status}). Verifica la conexión y los permisos de la API key.` });
      return;
    }

    const data = await telnyxRes.json();
    const id = String(data?.data?.id || '');
    const sipUsername = String(data?.data?.sip_username || '');
    if (!id || !sipUsername) {
      json(res, 502, { error: 'TELNYX_INVALID_RESPONSE', message: 'Telnyx no devolvió una credencial SIP válida.' });
      return;
    }

    await adminDb.collection('telnyx_sip_credentials').doc(id).set({
      id, telnyxCredentialId: id, telnyxUsername: sipUsername,
      sip_username: sipUsername, connectionId, phoneNumber,
      assignedTo: null, createdForUid: operadorUid, activo: true,
      creadoPor: actor.uid, creadoEn: FieldValue.serverTimestamp()
    }, { merge: false });
    await adminDb.collection('audit_logs').add({
      action: 'sip.credential.created', actorUid: actor.uid, actorEmail: actor.email,
      targetUid: operadorUid, credentialId: id, phoneNumber,
      createdAt: FieldValue.serverTimestamp()
    });
    json(res, 201, { success: true, credentialId: id, sipUsername, phoneNumber, message: 'Credencial creada. Asigna el número desde Control de acceso.' });
  } catch (error: any) {
    console.error('[telnyx/credentials/create] failed', error);
    json(res, 500, { error: 'CREDENTIAL_CREATE_FAILED', message: 'No se pudo crear la credencial SIP.' });
  }
}
