import { authorizeRequest, sendAuthError } from '../server/_lib/authorizeRequest.js';
import { TelnyxBackendService } from '../server/telnyxBackend.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method Not Allowed' })); return; }
  const auth = await authorizeRequest(req, ['superadmin', 'admin', 'owner']);
  if (!auth.ok) return sendAuthError(res, auth);
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const connectionId = String(body.connectionId || process.env.TELNYX_CONNECTION_ID || '');
    if (!connectionId) { res.statusCode = 400; res.end(JSON.stringify({ success: false, error: 'Falta TELNYX_CONNECTION_ID.' })); return; }
    const result = await TelnyxBackendService.testConnection(connectionId);
    res.statusCode = result.httpStatus >= 200 && result.httpStatus < 300 ? 200 : result.httpStatus;
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
  } catch {
    console.error('[api/telnyx-test] connection test failed');
    res.statusCode = 500; res.end(JSON.stringify({ success: false, error: 'Error interno probando Telnyx.' }));
  }
}
