import { TelnyxBackendService } from '../../server/telnyxBackend.js';
import { authorizeRequest, sendAuthError } from '../../server/_lib/authorizeRequest.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (!['GET', 'POST'].includes(req.method)) { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method Not Allowed' })); return; }

  const auth = await authorizeRequest(req, ['superadmin', 'admin', 'owner']);
  if (!auth.ok) return sendAuthError(res, auth);

  try {
    if (req.method === 'GET') {
      const config = TelnyxBackendService.getConfig();
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(config)); return;
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const updatedConfig = TelnyxBackendService.updateConfig({
      apiKey: body.apiKey, connectionId: body.connectionId, maxConcurrentCalls: body.maxConcurrentCalls,
    });
    await (await import('firebase-admin/firestore')).getFirestore().collection('security_audit').add({
      action: 'telnyx.config.update', actorUid: auth.uid, createdAt: new Date().toISOString(),
      changedFields: Object.keys(body).filter(k => ['apiKey', 'connectionId', 'maxConcurrentCalls'].includes(k)),
    });
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, config: updatedConfig }));
  } catch (error) {
    console.error('[api/telnyx/config] operation failed');
    res.statusCode = 500; res.end(JSON.stringify({ success: false, error: 'Error procesando la configuración Telnyx.' }));
  }
}
