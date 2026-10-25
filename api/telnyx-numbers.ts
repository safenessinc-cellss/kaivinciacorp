import { TelnyxBackendService } from '../server/telnyxBackend.js';
import { json, requireApprovedUser } from '../server/_lib/authz.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const user = await requireApprovedUser(req, res, true);
  if (!user) return;
  try {
    const result = await TelnyxBackendService.getAccountPhoneNumbers();
    json(res, result.success ? 200 : 502, result);
  } catch (error: any) {
    console.error('[telnyx-numbers] request failed', error);
    json(res, 500, { success: false, numbers: [], error: 'TELNYX_NUMBERS_FAILED', message: 'No se pudieron consultar los números de Telnyx.' });
  }
}
