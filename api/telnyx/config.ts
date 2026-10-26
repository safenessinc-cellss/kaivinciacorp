import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';
import { TelnyxBackendService } from '../../server/telnyxBackend.js';

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function requireAdmin(req: any, res: any) {
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Se requiere un token Bearer.' });
    return false;
  }
  try {
    const token = await adminAuth.verifyIdToken(header.slice(7).trim(), true);
    const snap = await adminDb.collection('users').doc(token.uid).get();
    const profile = snap.exists ? snap.data() || {} : {};
    const role = String(profile.role || '').trim().toLowerCase();
    const status = String(profile.status || '').trim().toLowerCase();
    if (status !== 'approved' || !['admin', 'superadmin'].includes(role)) {
      sendJson(res, 403, { error: 'Solo un administrador aprobado puede consultar o cambiar la configuración de telefonía.' });
      return false;
    }
    return true;
  } catch {
    sendJson(res, 401, { error: 'Token inválido, expirado o revocado.' });
    return false;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'Method Not Allowed' });

  if (!(await requireAdmin(req, res))) return;

  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, TelnyxBackendService.getConfig());
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const updatedConfig = TelnyxBackendService.updateConfig({
      apiKey: body.apiKey,
      connectionId: body.connectionId,
      maxConcurrentCalls: body.maxConcurrentCalls,
    });
    return sendJson(res, 200, { success: true, config: updatedConfig });
  } catch {
    return sendJson(res, 500, { success: false, error: 'Error interno al procesar la configuración de Telnyx.' });
  }
}
