import { adminDb } from '../../../server/_lib/firebaseAdmin.js';
import { json, requireApprovedUser } from '../../../server/_lib/authz.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const actor = await requireApprovedUser(req, res, true);
  if (!actor) return;
  try {
    const snapshot = await adminDb.collection('telnyx_sip_credentials').limit(500).get();
    const credentials = snapshot.docs.map(d => {
      const c = d.data();
      return { id: d.id, name: c.name || c.label || c.telnyxUsername || c.sip_username || d.id, sipUsername: c.telnyxUsername || c.sip_username || '', connectionId: c.connectionId || c.connection_id || '', phoneNumber: c.phoneNumber || c.phone_number || null, assignedTo: c.assignedTo || null, createdAt: c.creadoEn || c.createdAt || null };
    });
    json(res, 200, { success: true, total: credentials.length, credentials });
  } catch (error) {
    console.error('[telnyx/credentials/list] failed', error);
    json(res, 500, { success: false, error: 'CREDENTIAL_LIST_FAILED', message: 'No se pudieron listar las credenciales SIP.' });
  }
}
