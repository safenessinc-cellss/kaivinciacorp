import { timingSafeEqual } from 'node:crypto';
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

function safeSecretMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isCallsEnabled(profile: any): boolean {
  const role = String(profile?.role || '').trim().toLowerCase();
  const permissions = profile?.permissions && typeof profile.permissions === 'object'
    ? profile.permissions
    : {};
  if (typeof permissions.calls === 'boolean') return permissions.calls;
  return ['superadmin', 'admin', 'supervisor', 'agente', 'agent', 'tlmk', 'agente_tlmk', 'ventas', 'sales'].includes(role);
}

async function syncPhoneNumbers(apiKey: string) {
  const allNumbers: TelnyxPhoneNumber[] = [];
  let pageNumber = 1;
  const pageSize = 250;

  while (pageNumber <= 100) {
    const url = new URL('https://api.telnyx.com/v2/phone_numbers');
    url.searchParams.set('page[size]', String(pageSize));
    url.searchParams.set('page[number]', String(pageNumber));
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('[telnyx-sync-numbers] Telnyx API error', response.status, detail.slice(0, 500));
      throw new Error(`Telnyx API respondió ${response.status}`);
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
  let writes: Array<{ ref: any; data: Record<string, any> }> = [];

  for (const [phoneNumber, number] of unique) {
    const existing = await adminDb.collection('telnyx_phone_numbers')
      .where('phoneNumber', '==', phoneNumber).limit(1).get();
    const ref = existing.empty
      ? adminDb.collection('telnyx_phone_numbers').doc(phoneNumber.replace(/\D/g, ''))
      : existing.docs[0].ref;
    const previous = existing.empty ? {} : existing.docs[0].data();
    const telnyxStatus = String(number.status || '').toLowerCase();
    const status = ['deleted', 'deactivated', 'disabled'].includes(telnyxStatus) ? 'disabled' : 'active';

    writes.push({
      ref,
      data: {
        ...previous,
        phoneNumber,
        status,
        telnyxPhoneNumberId: number.id || previous.telnyxPhoneNumberId || null,
        connectionId: number.connection_id || previous.connectionId || null,
        tags: Array.isArray(number.tags) ? number.tags : (previous.tags || []),
        countryCode: number.country_iso_alpha2 || previous.countryCode || 'US',
        numberType: number.phone_number_type || previous.numberType || null,
        inventorySyncedAt: new Date().toISOString(),
        inventorySource: 'telnyx-api'
      }
    });
    if (existing.empty) created += 1;
    else updated += 1;
  }

  // Firestore permits at most 500 writes per batch; use a safety margin.
  for (let i = 0; i < writes.length; i += 400) {
    const firestoreBatch = adminDb.batch();
    for (const write of writes.slice(i, i + 400)) {
      firestoreBatch.set(write.ref, write.data, { merge: true });
    }
    await firestoreBatch.commit();
  }

  return { fetched: allNumbers.length, validUniqueNumbers: unique.size, created, updated };
}

async function syncApprovedOperators() {
  const usersSnap = await adminDb.collection('users').get();
  const now = new Date().toISOString();
  let created = 0;
  let skipped = 0;
  let batch = adminDb.batch();
  let pending = 0;

  for (const userDoc of usersSnap.docs) {
    const profile = userDoc.data();
    if (String(profile.status || '').trim().toLowerCase() !== 'approved' || !isCallsEnabled(profile)) {
      skipped += 1;
      continue;
    }

    const operatorRef = adminDb.collection('operadores').doc(userDoc.id);
    const existing = await operatorRef.get();
    if (existing.exists) continue; // Never overwrite credentials, schedules, caller IDs, or manual assignments.

    const email = String(profile.email || '').trim();
    const displayName = String(profile.displayName || profile.nombre || profile.name || email.split('@')[0] || 'Operador');
    const role = String(profile.role || 'agente').trim().toLowerCase();
    batch.create(operatorRef, {
      id: userDoc.id,
      uid: userDoc.id,
      email,
      nombre: displayName,
      rol: role,
      telnyxCredentialId: null,
      telnyxUsername: null,
      numerosAsignados: [],
      horario: {
        inicio: '00:00',
        fin: '23:59',
        zonaHoraria: 'America/Los_Angeles',
        diasLaborables: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
      },
      disponible: false,
      enLlamada: false,
      permiteSalientes: true,
      permiteEntrantes: true,
      activo: true,
      sincronizadoDesdeUsuario: true,
      creadoEn: now,
      actualizadoEn: now
    });
    created += 1;
    pending += 1;
    if (pending >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      pending = 0;
    }
  }

  if (pending > 0) await batch.commit();
  return { created, skipped, scanned: usersSnap.size };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(204).end();
  }
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = String(req.headers?.authorization || '');
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'Se requiere autorización.' });

    // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Scheduled sync is read-only
    // with respect to existing operator assignments and is safe to rerun.
    const cronSecret = process.env.CRON_SECRET;
    const isCron = req.method === 'GET' && Boolean(cronSecret) && safeSecretMatch(match[1], cronSecret!);

    if (!isCron) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST para sincronización manual.' });
      const decoded = await adminAuth.verifyIdToken(match[1]);
      const profileSnap = await adminDb.collection('users').doc(decoded.uid).get();
      const profile = profileSnap.exists ? profileSnap.data() || {} : null;
      const role = String(profile?.role || '').trim().toLowerCase();
      const status = String(profile?.status || '').trim().toLowerCase();
      if (!profile || status !== 'approved' || !['superadmin', 'admin'].includes(role)) {
        return res.status(403).json({ error: 'Solo un administrador aprobado puede sincronizar Telnyx.' });
      }
    }

    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Falta TELNYX_API_KEY en las variables de entorno.' });

    const numbers = await syncPhoneNumbers(apiKey);
    const operators = await syncApprovedOperators();

    return res.status(200).json({
      success: true,
      trigger: isCron ? 'scheduled' : 'manual',
      numbers,
      operators,
      safety: 'Se preservaron asignaciones y credenciales existentes. Los operadores nuevos se crean sin credencial Telnyx ni Caller ID asignado; la credencial se genera en el flujo de autenticación y los números requieren asignación explícita.'
    });
  } catch (error: any) {
    console.error('[telnyx-sync-numbers] Sync failed', error?.message || error);
    return res.status(500).json({ error: 'No se pudo completar la sincronización de Telnyx.' });
  }
}
