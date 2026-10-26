import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';

const ROOT_USER = 'safeness.c.a@gmail.com'; // ROOT_USER: cuenta única autorizada para eliminar usuarios.

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendJson(res, 401, { error: 'Missing token' });
  }

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(authHeader.slice(7).trim());
  } catch {
    return sendJson(res, 401, { error: 'Invalid token' });
  }

  // ROOT_USER: cuenta única autorizada para eliminar usuarios.
  if (String(decoded.email || '').toLowerCase() !== ROOT_USER) {
    return sendJson(res, 403, { error: 'Solo la cuenta root puede eliminar usuarios' });
  }

  const targetUid = String(req.body?.userId || '').trim();
  if (!targetUid) return sendJson(res, 400, { error: 'userId es obligatorio' });
  if (targetUid === decoded.uid) return sendJson(res, 400, { error: 'La cuenta root no puede eliminarse a sí misma' });

  const targetRef = adminDb.collection('users').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) return sendJson(res, 404, { error: 'El usuario no existe' });
  if (String(targetSnap.data()?.email || '').toLowerCase() === ROOT_USER) {
    return sendJson(res, 403, { error: 'La cuenta root está protegida y no puede eliminarse' });
  }

  try {
    await adminAuth.deleteUser(targetUid).catch((error: any) => {
      if (error?.code !== 'auth/user-not-found') throw error;
    });
    await targetRef.delete();
    return sendJson(res, 200, { ok: true, deletedUid: targetUid });
  } catch (error) {
    console.error('[auth/delete-user] deletion failed:', error);
    return sendJson(res, 500, { error: 'No se pudo completar la eliminación del usuario' });
  }
}
