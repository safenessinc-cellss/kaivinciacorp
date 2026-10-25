import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';
import { json, requireApprovedUser } from '../../server/_lib/authz.js';

const ALLOWED_ROLES = new Set(['none', 'admin', 'supervisor', 'tlmk', 'agente', 'sales', 'rrhh', 'alumno', 'gestor', 'ceo', 'collaborator', 'user']);

const ALLOWED_PERMISSIONS = new Set([
  'dashboard', 'tlmk_sales', 'dialer', 'collections', 'talent', 'payroll',
  'accounting', 'billing', 'marketing', 'projects', 'reports', 'academy',
  'team_management', 'calendar', 'chat', 'clients', 'operations',
  'call_center', 'integrations', 'documents', 'audits'
]);

export default async function handler(req: any, res: any) {
  const actor = await requireApprovedUser(req, res, true);
  if (!actor) return;

  if (req.method === 'GET') {
    try {
      const snapshot = await adminDb.collection('users').limit(500).get();
      const users = snapshot.docs.map((d) => {
        const u = d.data();
        return {
          uid: d.id, name: u.name || u.displayName || '',
          email: u.email || '', role: u.role || 'none',
          status: u.status || 'pending', permissions: u.permissions || {},
          assignedCallerId: u.assignedCallerId || null,
          assignedSipCredentialId: u.assignedSipCredentialId || null
        };
      });
      json(res, 200, { users, permissionsCatalog: [...ALLOWED_PERMISSIONS] });
    } catch (error) {
      console.error('[admin/users] list failed', error);
      json(res, 500, { error: 'USER_LIST_FAILED', message: 'No se pudo cargar la lista de usuarios.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const { action, uid, status, permissions, role } = req.body || {};
  if (typeof uid !== 'string' || !uid.trim()) {
    json(res, 400, { error: 'INVALID_USER', message: 'Falta el identificador del usuario.' });
    return;
  }
  if (uid === actor.uid) {
    json(res, 400, { error: 'SELF_MODIFICATION_DENIED', message: 'No puedes modificar tu propia aprobación o permisos.' });
    return;
  }

  const userRef = adminDb.collection('users').doc(uid);
  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const targetSnap = await tx.get(userRef);
      if (!targetSnap.exists) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
      const target = targetSnap.data() || {};
      if (target.role === 'superadmin') {
        throw Object.assign(new Error('PROTECTED_SUPERADMIN'), { code: 'PROTECTED_SUPERADMIN' });
      }

      let auditAction = '';
      let patch: Record<string, unknown> = {};
      if (action === 'status') {
        if (!['approved', 'blocked'].includes(status)) {
          throw Object.assign(new Error('INVALID_STATUS'), { code: 'INVALID_STATUS' });
        }
        if (target.status === status) return { status };
        patch = {
          status,
          approvedAt: status === 'approved' ? FieldValue.serverTimestamp() : null,
          approvedBy: status === 'approved' ? actor.uid : null,
          blockedAt: status === 'blocked' ? FieldValue.serverTimestamp() : null,
          blockedBy: status === 'blocked' ? actor.uid : null,
          updatedAt: FieldValue.serverTimestamp()
        };
        auditAction = status === 'approved' ? 'user.approved' : 'user.blocked';
      } else if (action === 'role') {
        if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) throw Object.assign(new Error('INVALID_ROLE'), { code: 'INVALID_ROLE' });
        patch = { role, roleUpdatedAt: FieldValue.serverTimestamp(), roleUpdatedBy: actor.uid };
        auditAction = 'user.role.updated';
      } else if (action === 'permissions') {
        if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
          throw Object.assign(new Error('INVALID_PERMISSIONS'), { code: 'INVALID_PERMISSIONS' });
        }
        const normalized: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(permissions)) {
          if (!ALLOWED_PERMISSIONS.has(key) || typeof value !== 'boolean') {
            throw Object.assign(new Error('INVALID_PERMISSION_KEY'), { code: 'INVALID_PERMISSION_KEY' });
          }
          normalized[key] = value;
        }
        patch = { permissions: normalized, permissionsUpdatedAt: FieldValue.serverTimestamp(), permissionsUpdatedBy: actor.uid };
        auditAction = 'user.permissions.updated';
      } else {
        throw Object.assign(new Error('INVALID_ACTION'), { code: 'INVALID_ACTION' });
      }

      tx.update(userRef, patch);
      const auditRef = adminDb.collection('audit_logs').doc();
      tx.set(auditRef, {
        action: auditAction, actorUid: actor.uid, actorEmail: actor.email,
        targetUid: uid, targetEmail: target.email || null,
        before: action === 'status' ? { status: target.status || 'pending' } : action === 'role' ? { role: target.role || 'none' } : { permissions: target.permissions || {} },
        after: action === 'status' ? { status } : action === 'role' ? { role } : { permissions: patch.permissions },
        createdAt: FieldValue.serverTimestamp()
      });
      return { status: action === 'status' ? status : 'updated', role: action === 'role' ? role : undefined };
    });
    if (action === 'role') {
      // Keep Firebase's role claim synchronized with the authoritative Firestore profile.
      const authRecord = await adminAuth.getUser(uid);
      await adminAuth.setCustomUserClaims(uid, { ...(authRecord.customClaims || {}), role: String(role) });
    }
    json(res, 200, { ok: true, ...result });
  } catch (error: any) {
    const code = error?.code || '';
    const known: Record<string, [number, string]> = {
      USER_NOT_FOUND: [404, 'No se encontró el usuario.'],
      PROTECTED_SUPERADMIN: [403, 'La cuenta SuperAdmin está protegida.'],
      INVALID_STATUS: [400, 'Estado no permitido.'],
      INVALID_ROLE: [400, 'Rol no permitido.'],
      INVALID_PERMISSIONS: [400, 'El mapa de permisos no es válido.'],
      INVALID_PERMISSION_KEY: [400, 'Uno de los permisos no está permitido.'],
      INVALID_ACTION: [400, 'Acción no válida.']
    };
    const [httpStatus, message] = known[code] || [500, 'No se pudo guardar el cambio.'];
    if (httpStatus === 500) console.error('[admin/users] mutation failed', error);
    json(res, httpStatus, { error: code || 'UPDATE_FAILED', message });
  }
}
