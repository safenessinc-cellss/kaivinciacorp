import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';

const ROOT_USER = 'safeness.c.a@gmail.com';

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

  const callerEmail = String(decoded.email || '').trim().toLowerCase();
  const callerRef = adminDb.collection('users').doc(String(decoded.uid));
  const callerSnap = await callerRef.get();
  const callerProfile = callerSnap.data() || {};
  const isRoot = callerEmail === ROOT_USER;
  const isApprovedSuperAdmin = String(callerProfile.role || '').trim().toLowerCase() === 'superadmin' && String(callerProfile.status || '').trim().toLowerCase() === 'approved';
  if (!isRoot && !isApprovedSuperAdmin) {
    return sendJson(res, 403, { error: 'Solo una cuenta SuperAdmin aprobada puede eliminar usuarios' });
  }

  const targetUid = String(req.body?.userId || '').trim();
  if (!targetUid) return sendJson(res, 400, { error: 'userId es obligatorio' });
  if (targetUid === decoded.uid) return sendJson(res, 400, { error: 'La cuenta root no puede eliminarse a sí misma' });

  const targetRef = adminDb.collection('users').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) return sendJson(res, 404, { error: 'El usuario no existe' });
  const targetProfile = targetSnap.data() || {};
  const targetIsSuperAdmin = String(targetProfile.role || '').trim().toLowerCase() === 'superadmin';
  if (String(targetProfile.email || '').trim().toLowerCase() === ROOT_USER) {
    return sendJson(res, 403, { error: 'La cuenta root está protegida y no puede eliminarse' });
  }
  if (targetIsSuperAdmin && !isRoot) {
    return sendJson(res, 403, { error: 'Solo safeness.c.a@gmail.com puede eliminar una cuenta SuperAdmin' });
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
