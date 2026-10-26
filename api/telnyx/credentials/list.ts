import { adminAuth, adminDb } from '../../../server/_lib/firebaseAdmin.js';

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  // Same-origin by default: do not advertise a wildcard CORS policy for admin credentials.
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });

  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return sendJson(res, 401, { error: 'Falta un token Bearer válido.' });
    }

    const authUser = await adminAuth.verifyIdToken(authHeader.slice(7).trim(), true);
    if (!authUser?.uid) return sendJson(res, 401, { error: 'Token inválido o revocado.' });

    const profileSnap = await adminDb.collection('users').doc(authUser.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() || {} : null;
    const role = String(profile?.role || '').trim().toLowerCase();
    const status = String(profile?.status || '').trim().toLowerCase();
    if (!profile || status !== 'approved' || !['admin', 'superadmin'].includes(role)) {
      return sendJson(res, 403, { error: 'Solo un administrador aprobado puede listar credenciales SIP.' });
    }

    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) return sendJson(res, 500, { success: false, error: 'TELNYX_API_KEY no configurada' });

    const telnyxRes = await fetch('https://api.telnyx.com/v2/telephony_credentials?page[size]=250', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!telnyxRes.ok) {
      // Do not disclose upstream response bodies which can contain sensitive metadata.
      return sendJson(res, 502, { success: false, error: `Telnyx devolvió HTTP ${telnyxRes.status}.` });
    }

    const data = await telnyxRes.json();
    const credentials = (data.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      sipUsername: c.sip_username,
      connectionId: c.connection_id,
      createdAt: c.created_at,
    }));
    return sendJson(res, 200, { success: true, total: credentials.length, credentials });
  } catch (err: any) {
    if (err?.code === 'auth/id-token-revoked' || err?.code === 'auth/id-token-expired' || err?.code === 'auth/argument-error') {
      return sendJson(res, 401, { error: 'Token inválido, expirado o revocado.' });
    }
    console.error('[telnyx credentials/list] Request failed');
    return sendJson(res, 500, { error: 'Error interno al consultar credenciales.' });
  }
}
