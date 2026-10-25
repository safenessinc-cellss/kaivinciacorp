import { adminDb } from '../../../server/_lib/firebaseAdmin.js';
import { authorizeRequest, sendAuthError } from '../../../server/_lib/authorizeRequest.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method Not Allowed' })); return; }
  const auth = await authorizeRequest(req, ['superadmin', 'admin', 'owner']);
  if (!auth.ok) return sendAuthError(res, auth);
  try {
    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) { res.statusCode = 500; res.end(JSON.stringify({ error: 'TELNYX_API_KEY no configurada.' })); return; }
    const response = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=250', { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) {
      console.error('[telnyx numbers sync] upstream status:', response.status);
      res.statusCode = 502; res.end(JSON.stringify({ error: 'Telnyx rechazó la sincronización de números.' })); return;
    }
    const payload: any = await response.json();
    const numbers = (payload.data || []).map((n: any) => ({ id: n.id, phoneNumber: n.phone_number, status: n.status, connectionId: n.connection_id }));
    const batch = adminDb.batch();
    const now = new Date().toISOString();
    for (const number of numbers) {
      if (!number.phoneNumber) continue;
      const docId = `num_${number.phoneNumber.replace(/\D/g, '')}`;
      batch.set(adminDb.collection('telnyx_phone_numbers').doc(docId), {
        id: docId, phoneNumber: number.phoneNumber, status: number.status,
        connectionId: number.connectionId, updatedAt: now, updatedBy: auth.uid,
      }, { merge: true });
    }
    await batch.commit();
    await adminDb.collection('security_audit').add({ action: 'telnyx.numbers.sync', actorUid: auth.uid, total: numbers.length, createdAt: now });
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, total: numbers.length, numbers: numbers.map((n: any) => n.phoneNumber) }));
  } catch {
    console.error('[telnyx numbers sync] failed');
    res.statusCode = 500; res.end(JSON.stringify({ error: 'Error interno sincronizando números.' }));
  }
}
