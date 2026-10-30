import { adminDb } from '../server/_lib/firebaseAdmin.js';
import { TelnyxBackendService } from '../server/telnyxBackend.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  // Validate the selected outbound Caller ID without creating an additional serverless function.
  if (req.method === 'POST') {
    try {
      const authHeader = req.headers['authorization'] || req.headers['Authorization'];
      const authUser = await TelnyxBackendService.verifyAuthToken(authHeader);
      if (!authUser?.uid) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ authorized: false, error: 'Sesión no autenticada.' }));
        return;
      }
      const callerId = String(req.body?.callerId || '').trim();
      if (!/^\+[1-9]\d{7,14}$/.test(callerId)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ authorized: false, error: 'Caller ID inválido.' }));
        return;
      }
      const operatorSnap = await adminDb.collection('operadores').doc(authUser.uid).get();
      if (!operatorSnap.exists) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ authorized: false, error: 'No existe un perfil de operador activo.' }));
        return;
      }
      const operator = operatorSnap.data() || {};
      const userSnap = await adminDb.collection('users').doc(authUser.uid).get();
      const userProfile = userSnap.data() || {};
      const role = String(userProfile.role || operator.rol || operator.role || '').toLowerCase();
      const privileged = ['superadmin', 'admin', 'ceo', 'gestor'].includes(role);
      if (operator.activo === false || operator.permiteSalientes === false) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ authorized: false, error: operator.activo === false ? 'Cuenta desactivada.' : 'Tu perfil no tiene permiso para llamadas salientes.' }));
        return;
      }
      const numbersSnap = await adminDb.collection('telnyx_phone_numbers').where('phoneNumber', '==', callerId).limit(1).get();
      if (numbersSnap.empty) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ authorized: false, error: 'El Caller ID no pertenece a los números Telnyx sincronizados.' }));
        return;
      }
      const numberDoc = numbersSnap.docs[0];
      const number = numberDoc.data();
      if (['disabled', 'deleted'].includes(String(number.status || '').toLowerCase())) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ authorized: false, error: 'Este número Telnyx está deshabilitado.' }));
        return;
      }
      if (!privileged) {
        const assignmentSnap = await adminDb.collection('telnyx_agent_assignments').doc(authUser.uid).get();
        const allowed = assignmentSnap.exists && Array.isArray(assignmentSnap.data()?.authorizedNumbers)
          ? assignmentSnap.data()!.authorizedNumbers : [];
        if (!allowed.includes(callerId)) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ authorized: false, error: 'No tienes asignado este Caller ID. Solicita autorización a un administrador.' }));
          return;
        }
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ authorized: true, callerId, numberId: numberDoc.id }));
      return;
    } catch (error: any) {
      console.error('[telnyx-token] Caller ID authorization failed:', error?.message || error);
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ authorized: false, error: 'No se pudo validar la autorización de llamada.' }));
      return;
    }
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const authUser = await TelnyxBackendService.verifyAuthToken(authHeader);

    if (!authUser?.uid) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere token de Firebase.' }));
      return;
    }

    console.log('[telnyx-token] Usuario autenticado:', authUser.uid, authUser.email);

    const db = adminDb;
    const operadorDoc = await db.collection('operadores').doc(authUser.uid).get();

    let operadorData: any;
    let credentialId: string;
    let sipUsername: string;

    if (!operadorDoc.exists) {
      console.log('[telnyx-token] Operador no existe, creando...');
      const connectionId = (req.query?.connectionId as string) || process.env.TELNYX_CONNECTION_ID || '';
      const credential = await TelnyxBackendService.getOrCreateTelephonyCredential(authUser.uid, connectionId);

      operadorData = {
        id: authUser.uid,
        email: authUser.email || '',
        nombre: authUser.email?.split('@')[0] || 'Operador',
        rol: 'agente',
        telnyxCredentialId: credential.id,
        telnyxUsername: credential.sip_username,
        numerosAsignados: [],
        horario: {
          inicio: '00:00',
          fin: '23:59',
          zonaHoraria: 'America/Los_Angeles',
          diasLaborables: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'],
        },
        disponible: false,
        enLlamada: false,
        permiteSalientes: true,
        permiteEntrantes: true,
        activo: true,
        creadoEn: new Date().toISOString(),
      };

      await db.collection('operadores').doc(authUser.uid).set(operadorData);
      credentialId = credential.id;
      sipUsername = credential.sip_username;
    } else {
      operadorData = operadorDoc.data();
      credentialId = operadorData.telnyxCredentialId;
      sipUsername = operadorData.telnyxUsername;

      if (!credentialId) {
        console.log('[telnyx-token] Operador sin credencial, creando...');
        const connectionId = (req.query?.connectionId as string) || process.env.TELNYX_CONNECTION_ID || '';
        const credential = await TelnyxBackendService.getOrCreateTelephonyCredential(authUser.uid, connectionId);
        credentialId = credential.id;
        sipUsername = credential.sip_username;

        await db.collection('operadores').doc(authUser.uid).update({
          telnyxCredentialId: credentialId,
          telnyxUsername: sipUsername,
          actualizadoEn: new Date().toISOString(),
        });
      }
    }

    if (operadorData.rol !== 'admin' && operadorData.rol !== 'supervisor') {
      const enHorario = verificarHorario(operadorData.horario);
      if (!enHorario) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'Fuera de horario laboral. Contacta a tu supervisor.',
          horario: operadorData.horario,
        }));
        return;
      }
    }

    if (operadorData.activo === false) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Cuenta desactivada. Contacta al administrador.' }));
      return;
    }

    console.log('[telnyx-token] Generando JWT para credencial:', credentialId);
    const token = await TelnyxBackendService.generateAgentJwt(credentialId);

    await db.collection('operadores').doc(authUser.uid).update({
      disponible: true,
      ultimaActividad: new Date().toISOString(),
    });

    const role = String(operadorData.rol || operadorData.role || '').toLowerCase();
    const privileged = ['superadmin', 'admin', 'owner', 'ceo', 'gestor'].includes(role);
    const numerosAsignados: any[] = [];
    if (privileged) {
      const allNumbers = await db.collection('telnyx_phone_numbers').get();
      allNumbers.forEach((numDoc) => {
        const number = numDoc.data();
        if (number.phoneNumber && !['disabled', 'deleted'].includes(String(number.status || '').toLowerCase())) {
          numerosAsignados.push({ id: numDoc.id, ...number });
        }
      });
    } else {
      const assignmentDoc = await db.collection('telnyx_agent_assignments').doc(authUser.uid).get();
      const allowedNumbers: string[] = assignmentDoc.exists && Array.isArray(assignmentDoc.data()?.authorizedNumbers)
        ? assignmentDoc.data()!.authorizedNumbers : [];
      for (const phoneNumber of allowedNumbers) {
        const matches = await db.collection('telnyx_phone_numbers').where('phoneNumber', '==', phoneNumber).limit(1).get();
        matches.forEach((numDoc) => numerosAsignados.push({ id: numDoc.id, ...numDoc.data() }));
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      token,
      sipUsername,
      credentialId,
      connectionId: process.env.TELNYX_CONNECTION_ID || '',
      operador: {
        uid: authUser.uid,
        nombre: operadorData.nombre,
        rol: operadorData.rol,
        horario: operadorData.horario,
      },
      numerosAsignados,
      allowedNumbers: numerosAsignados.map((n) => n.phoneNumber),
    }));
  } catch (err: any) {
    console.error('[API /api/telnyx-token] Error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Error interno al generar credenciales de Telnyx' }));
  }
}

function verificarHorario(horario: any): boolean {
  if (!horario || !horario.inicio || !horario.fin) return true;
  try {
    const zonaHoraria = horario.zonaHoraria || 'America/Los_Angeles';
    const ahora = new Date().toLocaleString('en-US', { timeZone: zonaHoraria });
    const fecha = new Date(ahora);
    const horaActual = fecha.getHours() * 60 + fecha.getMinutes();
    const [inicioH, inicioM] = horario.inicio.split(':').map(Number);
    const [finH, finM] = horario.fin.split(':').map(Number);
    const horaInicio = inicioH * 60 + inicioM;
    const horaFin = finH * 60 + finM;

    if (horario.diasLaborables && Array.isArray(horario.diasLaborables)) {
      const diasMap = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
      const diaActual = diasMap[fecha.getDay()];
      if (!horario.diasLaborables.includes(diaActual)) return false;
    }

    if (horaFin < horaInicio) return horaActual >= horaInicio || horaActual <= horaFin;
    return horaActual >= horaInicio && horaActual <= horaFin;
  } catch (err) {
    console.error('[verificarHorario] Error:', err);
    return true;
  }
}
