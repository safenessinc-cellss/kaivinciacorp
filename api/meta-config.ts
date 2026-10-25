import { MetaBackendService } from '../server/metaBackend.js';
import { json, requireApprovedUser } from '../server/_lib/authz.js';

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
    try { json(res, 200, MetaBackendService.getConfig()); }
    catch (error) {
      console.error('[meta-config] read failed', error);
      json(res, 500, { error: 'META_CONFIG_READ_FAILED', message: 'No se pudo leer la configuración de Meta.' });
    }
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const config = MetaBackendService.updateConfig({
      appId: body.appId, appSecret: body.appSecret, verifyToken: body.verifyToken,
      whatsappPhoneNumberId: body.whatsappPhoneNumberId, whatsappBusinessAccountId: body.whatsappBusinessAccountId,
      whatsappAccessToken: body.whatsappAccessToken, facebookPageId: body.facebookPageId,
      facebookPageAccessToken: body.facebookPageAccessToken, instagramAccountId: body.instagramAccountId,
      instagramAccessToken: body.instagramAccessToken
    });
    console.log(`[AUDIT] META_CONFIGURED actor=${actor.uid} at=${new Date().toISOString()}`);
    json(res, 200, { success: true, config, message: 'Configuración de Meta actualizada correctamente.' });
  } catch (error) {
    console.error('[meta-config] update failed', error);
    json(res, 400, { success: false, error: 'INVALID_META_CONFIG', message: 'La configuración de Meta no es válida.' });
  }
}
