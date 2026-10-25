import { adminDb } from '../server/_lib/firebaseAdmin.js';
import { json, requireApprovedUser } from '../server/_lib/authz.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    json(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' });
    return;
  }

  try {
    const user = await requireApprovedUser(req, res);
    if (!user) return;
    if (!['superadmin', 'admin', 'ceo', 'gestor'].includes(user.role)) {
      json(res, 403, { error: 'ADMIN_REQUIRED', message: 'Solo administradores pueden consultar los errores de tokens.' });
      return;
    }

    const snapshot = await adminDb.collection('telnyx_token_errors')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    const errors = snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() }));
    json(res, 200, { errors });
  } catch (error: any) {
    console.error('[telnyx-token-errors] failed', error?.message || error);
    json(res, 500, { error: 'TOKEN_DIAGNOSTICS_FAILED', message: 'No se pudieron cargar los errores de tokens.' });
  }
}
