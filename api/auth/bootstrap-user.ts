import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';

const ROOT_USER = 'safeness.c.a@gmail.com'; // ROOT_USER: cuenta única autorizada para eliminar usuarios.
const SUPERADMINS = (process.env.SUPERADMIN_EMAILS || ROOT_USER)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

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

  const email = String(decoded.email || '').trim().toLowerCase();
  const userRef = adminDb.collection('users').doc(decoded.uid);
  const snap = await userRef.get();
  const configuredSuperAdmin = email === ROOT_USER || SUPERADMINS.includes(email);

  if (snap.exists) {
    const existing = snap.data() || {};
    // Migración acotada: solo una cuenta configurada explícitamente puede conservar el acceso administrativo.
    if (configuredSuperAdmin && (existing.role === 'superadmin' || existing.role === 'admin') && existing.status !== 'approved') {
      await userRef.update({ status: 'approved', lastLogin: FieldValue.serverTimestamp() });
      return sendJson(res, 200, { user: { ...existing, status: 'approved' } });
    }
    await userRef.update({ lastLogin: FieldValue.serverTimestamp() }).catch(() => undefined);
    return sendJson(res, 200, { user: existing });
  }

  if (configuredSuperAdmin) {
    const profile = {
      uid: decoded.uid,
      name: decoded.name || email.split('@')[0] || 'Administrador',
      email,
      role: 'superadmin',
      status: 'approved',
      avatarUrl: decoded.picture || '',
      createdAt: new Date().toISOString(),
      lastLogin: FieldValue.serverTimestamp(),
    };
    await userRef.set(profile);
    return sendJson(res, 201, { user: profile });
  }

  // La plataforma no admite altas mientras no exista un superadmin aprobado.
  const approvedSuperAdmin = await adminDb.collection('users')
    .where('role', '==', 'superadmin')
    .where('status', '==', 'approved')
    .limit(1)
    .get();

  if (approvedSuperAdmin.empty) {
    return sendJson(res, 403, {
      error: 'El sistema no tiene administradores activos. Contacta al equipo de plataforma.',
      code: 'NO_APPROVED_SUPERADMIN',
    });
  }

  const profile = {
    uid: decoded.uid,
    name: decoded.name || email.split('@')[0] || 'Usuario',
    email: email || null,
    role: 'none',
    status: 'pending',
    avatarUrl: decoded.picture || '',
    createdAt: new Date().toISOString(),
    lastLogin: FieldValue.serverTimestamp(),
  };
  await userRef.create(profile);
  return sendJson(res, 201, { user: profile });
}
