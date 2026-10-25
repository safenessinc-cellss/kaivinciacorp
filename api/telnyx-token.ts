import { adminAuth, adminDb } from '../server/_lib/firebaseAdmin.js';
import { hasPermission, json, type VerifiedAppUser } from '../server/_lib/authz.js';
import { TelnyxBackendService } from '../server/telnyxBackend.js';

const CALLER_ID_RE = /^\\+[1-9]\\d{7,14}$/;
const RETRY_DELAYS_MS = [200, 500, 1000];

type TokenRequest = { credentialId?: string };

function parseBody(req: any): TokenRequest {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

async function recordTokenError(input: {
  uid: string;
  credentialId: string;
  status: number;
  telnyxStatus?: number | null;
  body?: string;
  error?: string;
}) {
  const record = {
    uid: input.uid || 'unknown',
    credentialId: input.credentialId || '',
    telnyxStatus: input.telnyxStatus ?? input.status,
    telnyxBody: String(input.body || input.error || '').slice(0, 1500),
    status: input.status,
    error: input.error || '',
    timestamp: new Date().toISOString()
  };
  console.error(`[telnyx-token] uid=${record.uid} credId=${record.credentialId || 'none'} status=${input.status} telnyxStatus=${record.telnyxStatus} error=${record.error || record.telnyxBody}`);
  try {
    await adminDb.collection('telnyx_token_errors').add(record);
  } catch (writeError: any) {
    console.error('[telnyx-token] no se pudo registrar telnyx_token_errors:', writeError?.message || writeError);
  }
}

function respondError(res: any, status: number, error: string, message: string) {
  json(res, status, { error, message });
}

async function getFirebaseUser(req: any, res: any): Promise<VerifiedAppUser | null> {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    respondError(res, 401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
    return null;
  }

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(authHeader.slice(7).trim(), true);
  } catch {
    respondError(res, 401, 'INVALID_TOKEN', 'La sesión expiró. Inicia sesión nuevamente.');
    return null;
  }

  const profileSnap = await adminDb.collection('users').doc(decoded.uid).get();
  if (!profileSnap.exists) {
    respondError(res, 403, 'PROFILE_MISSING', 'Tu cuenta no tiene un perfil habilitado.');
    return null;
  }
  const profile = profileSnap.data() || {};
  const status = String(profile.status || 'pending').toLowerCase();
  if (status !== 'approved') {
    respondError(res, 403, status === 'blocked' ? 'ACCOUNT_BLOCKED' : 'APPROVAL_REQUIRED',
      status === 'blocked' ? 'Tu cuenta está bloqueada.' : 'Tu cuenta está pendiente de aprobación.');
    return null;
  }

  return {
    uid: decoded.uid,
    email: decoded.email || null,
    role: String(profile.role || 'none').toLowerCase(),
    status,
    permissions: profile.permissions && typeof profile.permissions === 'object' ? profile.permissions : {}
  };
}

async function requestTelnyxToken(telnyxCredentialId: string): Promise<{ token: string; status: number }> {
  const apiKey = TelnyxBackendService.getApiKey();
  if (!apiKey) {
    const error: any = new Error('TELNYX_API_KEY no está configurada en Vercel.');
    error.status = 500;
    error.telnyxStatus = 500;
    throw error;
  }

  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let response: Response;
    try {
      response = await fetch(`https://api.telnyx.com/v2/telephony_credentials/${encodeURIComponent(telnyxCredentialId)}/token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      });
    } catch (error: any) {
      const networkError: any = new Error(error?.message || 'No se pudo conectar con la API de Telnyx.');
      networkError.status = 502;
      networkError.telnyxStatus = 502;
      networkError.telnyxBody = networkError.message;
      throw networkError;
    }

    lastStatus = response.status;
    const rawBody = await response.text();
    lastBody = rawBody.slice(0, 1500);

    if (response.ok) {
      let parsed: any = {};
      try { parsed = rawBody ? JSON.parse(rawBody) : {}; } catch {}
      const token = String(parsed?.data?.token || parsed?.token || '').trim();
      if (!token) {
        const error: any = new Error('Telnyx respondió correctamente pero no devolvió data.token.');
        error.status = 502;
        error.telnyxStatus = response.status;
        error.telnyxBody = lastBody;
        throw error;
      }
      return { token, status: response.status };
    }

    // Only retry Telnyx server errors. Never retry authentication/permission/client 4xx.
    if (response.status < 500 || attempt === RETRY_DELAYS_MS.length) {
      const error: any = new Error(`Telnyx rechazó la generación del token (HTTP ${response.status}).`);
      error.status = response.status >= 500 ? 502 : response.status;
      error.telnyxStatus = response.status;
      error.telnyxBody = lastBody;
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }

  const error: any = new Error('No se pudo generar el token después de los reintentos.');
  error.status = 502;
  error.telnyxStatus = lastStatus || 502;
  error.telnyxBody = lastBody;
  throw error;
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  // POST is the supported contract. GET remains temporarily compatible with older clients.
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    respondError(res, 405, 'METHOD_NOT_ALLOWED', 'Método no permitido.');
    return;
  }

  let uid = '';
  let requestedCredentialId = '';
  try {
    const body = parseBody(req);
    requestedCredentialId = String(body.credentialId || req.query?.credentialId || '').trim();

    const user = await getFirebaseUser(req, res);
    if (!user) {
      await recordTokenError({
        uid: '',
        credentialId: requestedCredentialId,
        status: Number(res.statusCode || 401),
        error: 'Firebase authentication or approval failed.'
      });
      return;
    }
    uid = user.uid;

    if (!hasPermission(user, 'dialer')) {
      await recordTokenError({ uid, credentialId: requestedCredentialId, status: 403, error: 'PERMISSION_DENIED' });
      respondError(res, 403, 'PERMISSION_DENIED', 'No tienes permiso para usar el discador.');
      return;
    }

    const profileSnap = await adminDb.collection('users').doc(uid).get();
    const profile = profileSnap.data() || {};
    const assignmentRef = adminDb.collection('telnyx_agent_assignments').doc(uid);
    const assignmentSnap = await assignmentRef.get();
    const assignment = assignmentSnap.exists ? assignmentSnap.data() || {} : null;

    let assignedCredentialId = String(assignment?.telnyxCredentialId || '').trim();
    let assignedCallerId = String(assignment?.defaultCallerId || '').trim();
    const authorizedNumbers = Array.isArray(assignment?.authorizedNumbers)
      ? assignment.authorizedNumbers.map((value: unknown) => String(value || '').trim())
      : [];

    // Compatibility for older profiles, but still require the server-side SIP assignment.
    if (!assignedCredentialId) {
      assignedCredentialId = String(profile.assignedSipCredentialId || '').trim();
      assignedCallerId = String(profile.assignedCallerId || '').trim();
    }

    if (!assignedCredentialId) {
      await recordTokenError({ uid, credentialId: requestedCredentialId, status: 403, error: 'SIP_ASSIGNMENT_REQUIRED' });
      respondError(res, 403, 'SIP_ASSIGNMENT_REQUIRED', 'No tienes una credencial SIP asignada. Contacta al administrador.');
      return;
    }

    if (requestedCredentialId && requestedCredentialId !== assignedCredentialId) {
      await recordTokenError({ uid, credentialId: requestedCredentialId, status: 403, error: 'CREDENTIAL_NOT_ASSIGNED_TO_USER' });
      respondError(res, 403, 'SIP_ASSIGNMENT_INVALID', 'La credencial solicitada no coincide con la asignada a tu usuario.');
      return;
    }

    if (!CALLER_ID_RE.test(assignedCallerId) ||
        (assignment && (!authorizedNumbers.includes(assignedCallerId) || !assignmentSnap.exists))) {
      await recordTokenError({ uid, credentialId: assignedCredentialId, status: 403, error: 'CALLER_ID_NOT_AUTHORIZED' });
      respondError(res, 403, 'SIP_ASSIGNMENT_REQUIRED', 'No tienes un Caller ID autorizado. Contacta al administrador.');
      return;
    }

    const credentialSnap = await adminDb.collection('telnyx_sip_credentials').doc(assignedCredentialId).get();
    if (!credentialSnap.exists) {
      await recordTokenError({ uid, credentialId: assignedCredentialId, status: 403, error: 'SIP_CREDENTIAL_DOCUMENT_MISSING' });
      respondError(res, 403, 'SIP_ASSIGNMENT_INVALID', 'La credencial SIP asignada no existe en Firestore. Pide al administrador que la reasigne.');
      return;
    }

    const credential = credentialSnap.data() || {};
    if (String(credential.assignedTo || '') !== uid) {
      await recordTokenError({ uid, credentialId: assignedCredentialId, status: 403, error: 'SIP_CREDENTIAL_OWNER_MISMATCH' });
      respondError(res, 403, 'SIP_ASSIGNMENT_INVALID', 'La credencial SIP no está asignada a este usuario.');
      return;
    }
    if (credential.status && !['active', 'activo'].includes(String(credential.status).toLowerCase())) {
      await recordTokenError({ uid, credentialId: assignedCredentialId, status: 403, error: 'SIP_CREDENTIAL_INACTIVE' });
      respondError(res, 403, 'SIP_CREDENTIAL_INACTIVE', 'La credencial SIP está inactiva. Contacta al administrador.');
      return;
    }

    const telnyxCredentialId = String(credential.telnyxCredentialId || credential.credentialId || credential.id || credentialSnap.id).trim();
    if (!telnyxCredentialId) {
      await recordTokenError({ uid, credentialId: assignedCredentialId, status: 409, error: 'TELNYX_CREDENTIAL_MISSING' });
      respondError(res, 409, 'TELNYX_CREDENTIAL_MISSING', 'La credencial asignada no contiene el ID de Telnyx necesario para generar el token.');
      return;
    }

    const operatorSnap = await adminDb.collection('operadores').doc(uid).get();
    const operatorData = operatorSnap.exists ? operatorSnap.data() || {} : {};
    if (operatorData.activo === false) {
      await recordTokenError({ uid, credentialId: assignedCredentialId, status: 403, error: 'OPERATOR_DISABLED' });
      respondError(res, 403, 'OPERATOR_DISABLED', 'La cuenta de telefonía está desactivada. Contacta al SuperAdmin.');
      return;
    }
    if (!['superadmin', 'admin', 'supervisor'].includes(user.role) && operatorData.horario && !verificarHorario(operatorData.horario)) {
      await recordTokenError({ uid, credentialId: assignedCredentialId, status: 403, error: 'OUTSIDE_WORKING_HOURS' });
      respondError(res, 403, 'OUTSIDE_WORKING_HOURS', 'Fuera de horario laboral. Contacta a tu supervisor.');
      return;
    }

    const generated = await requestTelnyxToken(telnyxCredentialId);
    const tokenParts = generated.token.split('.');
    let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    if (tokenParts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString('utf8'));
        if (Number.isFinite(payload.exp)) expiresAt = new Date(payload.exp * 1000).toISOString();
      } catch {}
    }

    await adminDb.collection('operadores').doc(uid).set({
      id: uid,
      email: user.email || '',
      nombre: profile.name || profile.displayName || user.email || 'Operador',
      rol: user.role,
      telnyxCredentialId,
      telnyxUsername: credential.sip_username || credential.sipUsername || credential.username || '',
      disponible: true,
      ultimaActividad: new Date().toISOString(),
      activo: true
    }, { merge: true });

    console.log(`[telnyx-token] uid=${uid} credId=${assignedCredentialId} status=200 telnyxStatus=${generated.status} jwtPrefix=${generated.token.slice(0, 20)} jwtLength=${generated.token.length}`);
    json(res, 200, {
      token: generated.token,
      expiresAt,
      credentialId: assignedCredentialId,
      telnyxCredentialId,
      sipUsername: credential.sip_username || credential.sipUsername || credential.username || '',
      connectionId: credential.connectionId || credential.connection_id || process.env.TELNYX_CONNECTION_ID || '',
      assignedCallerId,
      operador: { uid, nombre: profile.name || profile.displayName || user.email, rol: user.role },
      numerosAsignados: [{ id: assignedCredentialId, phoneNumber: assignedCallerId }],
      allowedNumbers: [assignedCallerId]
    });
  } catch (error: any) {
    const status = Number(error?.status || 502);
    await recordTokenError({
      uid,
      credentialId: requestedCredentialId,
      status: status >= 400 && status <= 599 ? status : 502,
      telnyxStatus: Number(error?.telnyxStatus || status),
      body: error?.telnyxBody || '',
      error: error?.message || 'TELNYX_TOKEN_FAILED'
    });
    json(res, status >= 400 && status <= 599 ? status : 502, {
      error: 'TELNYX_TOKEN_FAILED',
      message: error?.message || 'No se pudo generar el token de telefonía. Verifica la configuración de Telnyx.'
    });
  }
}

function verificarHorario(horario: any): boolean {
  if (!horario || !horario.inicio || !horario.fin) return true;
  try {
    const zone = horario.zonaHoraria || 'America/Los_Angeles';
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: zone }));
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = horario.inicio.split(':').map(Number);
    const [endH, endM] = horario.fin.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    if (Array.isArray(horario.diasLaborables)) {
      const days = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
      if (!horario.diasLaborables.includes(days[now.getDay()])) return false;
    }
    if (start <= end) return currentMinutes >= start && currentMinutes <= end;
    return currentMinutes >= start || currentMinutes <= end;
  } catch {
    return true;
  }
}
