import { authorizeRequest, sendAuthError } from '../../../server/_lib/authorizeRequest.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method Not Allowed' })); return; }

  const auth = await authorizeRequest(req, ['superadmin', 'admin', 'owner']);
  if (!auth.ok) return sendAuthError(res, auth);

  try {
    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) { res.statusCode = 500; res.end(JSON.stringify({ error: 'TELNYX_API_KEY no configurada' })); return; }
    const response = await fetch('https://api.telnyx.com/v2/telephony_credentials?page[size]=250', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      console.error('[telnyx credentials list] upstream status:', response.status);
      res.statusCode = 502; res.end(JSON.stringify({ error: 'No se pudieron consultar las credenciales de Telnyx.' })); return;
    }
    const data: any = await response.json();
    const credentials = (data.data || []).map((c: any) => ({
      id: c.id, name: c.name, sipUsername: c.sip_username,
      connectionId: c.connection_id, createdAt: c.created_at,
    }));
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, total: credentials.length, credentials }));
  } catch (error) {
    console.error('[telnyx credentials list] failed');
    res.statusCode = 500; res.end(JSON.stringify({ error: 'Error interno consultando credenciales.' }));
  }
}
