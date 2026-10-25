import { TelnyxBackendService } from '../../server/telnyxBackend.js';
import { json, requireApprovedUser } from '../../server/_lib/authz.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const actor = await requireApprovedUser(req, res, true);
  if (!actor) return;

  if (req.method === 'GET') {
    json(res, 200, TelnyxBackendService.getConfig());
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const updatedConfig = TelnyxBackendService.updateConfig({
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      connectionId: typeof body.connectionId === 'string' ? body.connectionId : undefined,
      maxConcurrentCalls: typeof body.maxConcurrentCalls === 'number' ? body.maxConcurrentCalls : undefined
    });
    json(res, 200, { success: true, config: updatedConfig });
  } catch (error) {
    console.error('[api/telnyx/config] update failed', error);
    json(res, 400, { success: false, error: 'INVALID_CONFIG', message: 'La configuración de Telnyx no es válida.' });
  }
}
