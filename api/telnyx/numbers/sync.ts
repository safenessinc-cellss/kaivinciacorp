import { adminDb } from '../../../server/_lib/firebaseAdmin.js';
import { json, requireApprovedUser } from '../../../server/_lib/authz.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    const authUser = await requireApprovedUser(req, res, true);
    if (!authUser) return;

    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) {
      json(res, 500, { success: false, error: 'TELNYX_API_KEY no configurada' });
      return;
    }

    const telnyxRes = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=250', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!telnyxRes.ok) {
      const errText = await telnyxRes.text();
      json(res, 502, { success: false, error: `Telnyx rechazó la sincronización (${telnyxRes.status}). Verifica la conexión y la API key.` });
      return;
    }

    const data = await telnyxRes.json();
    const numbers = (data.data || []).map((n: any) => ({
      id: n.id,
      phoneNumber: n.phone_number,
      status: n.status,
      connectionId: n.connection_id,
    }));

    const db = adminDb;

    for (const num of numbers) {
      const docId = `num_${num.phoneNumber.replace(/\D/g, '')}`;
      await db.collection('telnyx_phone_numbers').doc(docId).set({
        id: docId,
        phoneNumber: num.phoneNumber,
        status: num.status,
        connectionId: num.connectionId,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    json(res, 200, { success: true, total: numbers.length, numbers: numbers.map((n: any) => n.phoneNumber) });
    return;
  } catch (err: any) {
    console.error('[telnyx] Error:', err);
    json(res, 500, { error: 'TELNYX_SYNC_FAILED', message: 'No se pudo sincronizar los números de Telnyx.' });
  }
}
