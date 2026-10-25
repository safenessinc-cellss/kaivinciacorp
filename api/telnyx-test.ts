import { TelnyxBackendService } from '../server/telnyxBackend.js';
import { json, requireApprovedUser } from '../server/_lib/authz.js';

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
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId : process.env.TELNYX_CONNECTION_ID || '';
    const result = await TelnyxBackendService.testConnection(connectionId);
    json(res, result.httpStatus >= 200 && result.httpStatus < 300 ? 200 : result.httpStatus, result);
  } catch (error: any) {
    console.error('[api/telnyx-test] request failed', error);
    json(res, 500, { success: false, httpStatus: 500, message: 'Error interno al probar la conexión Telnyx.' });
  }
}
