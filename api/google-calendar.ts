import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminAuth, adminDb } from '../server/_lib/firebaseAdmin.js';

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
const collection = 'userIntegrations';
const redirectUri = () => process.env.GOOGLE_REDIRECT_URI || 'https://www.kaivinciacorp.com/api/google-calendar?action=callback';
const required = (key: string) => { const value = process.env[key]; if (!value) throw new Error(`Falta configurar ${key}`); return value; };
const encryptionKey = () => Buffer.from(required('GOOGLE_TOKEN_ENCRYPTION_KEY'), 'base64');
function encrypt(value: string) {
  const key = encryptionKey();
  if (key.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY debe ser una clave base64 de 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
function signState(payload: string) { return createHmac('sha256', required('GOOGLE_OAUTH_STATE_SECRET')).update(payload).digest('base64url'); }
function verifyState(state: string) {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) throw new Error('Estado OAuth inválido');
  const expected = Buffer.from(signState(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('Firma OAuth inválida');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!data.uid || !data.email || data.exp < Date.now()) throw new Error('Estado OAuth caducado');
  return data as { uid: string; email: string; exp: number; nonce: string };
}
async function authenticatedUser(req: VercelRequest) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Se requiere sesión'), { status: 401 });
  const decoded = await adminAuth.verifyIdToken(header.slice(7));
  if (!decoded.uid || !decoded.email || !decoded.email_verified) throw Object.assign(new Error('Se requiere un email verificado'), { status: 403 });
  return { uid: decoded.uid, email: decoded.email.toLowerCase() };
}
async function oauthTokens(code: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), redirect_uri: redirectUri(), grant_type: 'authorization_code' }) });
  const body = await response.json() as any;
  if (!response.ok) throw new Error(body.error_description || body.error || 'No se pudo intercambiar el código OAuth');
  return body;
}
async function googleUserInfo(accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json() as any;
  if (!response.ok || !body.email_verified || !body.email) throw new Error('Google no devolvió un email verificado');
  return { email: String(body.email).toLowerCase(), sub: String(body.sub || '') };
}
async function accessToken(uid: string) {
  const ref = adminDb.collection(collection).doc(uid);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.provider !== 'google-calendar' || !snap.data()?.refreshTokenEncrypted) throw Object.assign(new Error('Google Calendar no está conectado'), { status: 409 });
  const data = snap.data()!;
  const token = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), refresh_token: decrypt(data.refreshTokenEncrypted), grant_type: 'refresh_token' }) });
  const result = await token.json() as any;
  if (!token.ok) throw new Error(result.error_description || 'No se pudo renovar el acceso a Google Calendar');
  return { token: result.access_token as string, email: data.googleEmail as string, ref, data };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String(req.query.action || (req.method === 'GET' ? 'status' : ''));
  try {
    if (action === 'callback' && req.method === 'GET') {
      const state = verifyState(String(req.query.state || ''));
      if (req.query.error) return res.redirect(302, '/calendar?googleCalendar=denied');
      const tokens = await oauthTokens(String(req.query.code || ''));
      const identity = await googleUserInfo(tokens.access_token);
      if (identity.email !== state.email) return res.redirect(302, '/calendar?googleCalendar=email_mismatch');
      if (!tokens.refresh_token) throw new Error('Google no entregó refresh token. Desconecta el acceso anterior y vuelve a autorizar.');
      await adminDb.collection(collection).doc(state.uid).set({ provider: 'google-calendar', uid: state.uid, loginEmail: state.email, googleEmail: identity.email, googleSub: identity.sub, refreshTokenEncrypted: encrypt(tokens.refresh_token), scopes: SCOPES, connectedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      return res.redirect(302, '/calendar?googleCalendar=connected');
    }
    const user = await authenticatedUser(req);
    const ref = adminDb.collection(collection).doc(user.uid);
    if (action === 'status' && req.method === 'GET') {
      const snap = await ref.get();
      const data = snap.data();
      return res.status(200).json({ connected: data?.provider === 'google-calendar' && !!data?.refreshTokenEncrypted, email: data?.googleEmail || null, loginEmail: user.email });
    }
    if (action === 'start' && req.method === 'POST') {
      const payload = Buffer.from(JSON.stringify({ uid: user.uid, email: user.email, exp: Date.now() + 10 * 60 * 1000, nonce: randomBytes(18).toString('hex') })).toString('base64url');
      const state = `${payload}.${signState(payload)}`;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: required('GOOGLE_CLIENT_ID'), redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state }).toString();
      return res.status(200).json({ url: url.toString() });
    }
    if (action === 'disconnect' && req.method === 'POST') {
      const snap = await ref.get();
      if (snap.exists) await ref.delete();
      return res.status(200).json({ disconnected: true });
    }
    if (action === 'create-event' && req.method === 'POST') {
      const { token } = await accessToken(user.uid);
      const body = req.body || {};
      const title = String(body.title || '').trim();
      const start = new Date(body.start);
      const end = new Date(body.end);
      if (!title || title.length > 200 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return res.status(400).json({ error: 'Título, inicio y fin válidos son obligatorios' });
      const sourceId = String(body.sourceId || '').trim();
      if (!sourceId) return res.status(400).json({ error: 'sourceId es obligatorio para garantizar sincronización idempotente' });
      const { ref: integrationRef } = await accessToken(user.uid);
      const mappingRef = integrationRef.collection('syncedEvents').doc(sourceId);
      const mapping = await mappingRef.get();
      const existingGoogleId = mapping.data()?.googleEventId;
      const eventPayload = { summary: title, description: String(body.description || '').slice(0, 4000), start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() }, extendedProperties: { private: { kaivinciaUserId: user.uid, kaivinciaSource: 'kaivincia', kaivinciaSourceId: sourceId } } };
      const eventUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events' + (existingGoogleId ? '/' + encodeURIComponent(String(existingGoogleId)) : '');
      const eventResponse = await fetch(eventUrl, { method: existingGoogleId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventPayload) });
      const event = await eventResponse.json() as any;
      if (!eventResponse.ok) return res.status(502).json({ error: event.error?.message || 'Google Calendar rechazó el evento' });
      await mappingRef.set({ googleEventId: event.id, sourceId, title, start: start.toISOString(), end: end.toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      return res.status(existingGoogleId ? 200 : 201).json({ id: event.id, htmlLink: event.htmlLink });
    }
    return res.status(405).json({ error: 'Método o acción no admitidos' });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    console.error('[google-calendar]', action, error?.message || error);
    return res.status(status).json({ error: status >= 500 ? 'No se pudo completar la operación de Google Calendar' : error.message });
  }
}
