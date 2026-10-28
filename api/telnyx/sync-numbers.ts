import { adminAuth, adminDb } from '../../server/_lib/firebaseAdmin.js';

type TelnyxPhoneNumber = {
  id?: string;
  phone_number?: string;
  status?: string;
  connection_id?: string | null;
  tags?: string[];
  country_iso_alpha2?: string;
  phone_number_type?: string;
};

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = String(req.headers?.authorization || '');
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'Se requiere token de Firebase.' });

    const decoded = await adminAuth.verifyIdToken(match[1]);
    const profileSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() || {} : null;
    const role = String(profile?.role || '').trim().toLowerCase();
    const status = String(profile?.status || '').trim().toLowerCase();
    const isPrivileged = ['superadmin', 'admin'].includes(role);
    if (!profile || status !== 'approved' || !isPrivileged) {
      return res.status(403).json({ error: 'Solo un administrador aprobado puede sincronizar números Telnyx.' });
    }

    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Falta TELNYX_API_KEY en las variables de entorno de producción.' });

    const allNumbers: TelnyxPhoneNumber[] = [];
    let pageNumber = 1;
    const pageSize = 250;
    while (pageNumber <= 20) {
      const url = new URL('https://api.telnyx.com/v2/phone_numbers');
      url.searchParams.set('page[size]', String(pageSize));
      url.searchParams.set('page[number]', String(pageNumber));
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error('[telnyx-sync-numbers] Telnyx API error', response.status, detail.slice(0, 500));
        return res.status(502).json({ error: 'Telnyx no permitió consultar el inventario.', upstreamStatus: response.status });
      }
      const payload = await response.json();
      const batch: TelnyxPhoneNumber[] = Array.isArray(payload?.data) ? payload.data : [];
      allNumbers.push(...batch);
      const next = payload?.meta?.pagination?.next_page;
      if (!batch.length || !next) break;
      pageNumber += 1;
    }

    const unique = new Map<string, TelnyxPhoneNumber>();
    for (const number of allNumbers) {
      const phoneNumber = String(number.phone_number || '').trim();
      if (/^\+[1-9]\d{7,14}$/.test(phoneNumber)) unique.set(phoneNumber, number);
    }

    let created = 0;
    let updated = 0;
    const batch = adminDb.batch();
    for (const [phoneNumber, number] of unique) {
      const existing = await adminDb.collection('telnyx_phone_numbers')
        .where('phoneNumber', '==', phoneNumber).limit(1).get();
      const ref = existing.empty
        ? adminDb.collection('telnyx_phone_numbers').doc(phoneNumber.replace(/\D/g, ''))
        : existing.docs[0].ref;
      const previous = existing.empty ? {} : existing.docs[0].data();
      const telnyxStatus = String(number.status || '').toLowerCase();
      const statusValue = ['deleted', 'deactivated', 'disabled'].includes(telnyxStatus) ? 'disabled' : 'active';
      const record = {
        ...previous,
        phoneNumber,
        status: statusValue,
        telnyxPhoneNumberId: number.id || previous.telnyxPhoneNumberId || null,
        connectionId: number.connection_id || previous.connectionId || null,
        tags: Array.isArray(number.tags) ? number.tags : (previous.tags || []),
        countryCode: number.country_iso_alpha2 || previous.countryCode || 'US',
        numberType: number.phone_number_type || previous.numberType || null,
        inventorySyncedAt: new Date().toISOString(),
        inventorySource: 'telnyx-api'
      };
      batch.set(ref, record, { merge: true });
      if (existing.empty) created += 1;
      else updated += 1;
    }
    await batch.commit();

    return res.status(200).json({
      success: true,
      fetched: allNumbers.length,
      validUniqueNumbers: unique.size,
      created,
      updated,
      note: 'Se conservaron los campos previos, incluidas las asignaciones locales. Revise los números y permisos antes de habilitarlos a agentes.'
    });
  } catch (error: any) {
    console.error('[telnyx-sync-numbers] Sync failed', error?.message || error);
    return res.status(500).json({ error: 'No se pudo sincronizar el inventario Telnyx.' });
  }
}
