import { MetaBackendService } from '../server/metaBackend.js';
import { json, requireApprovedUser } from '../server/_lib/authz.js';
import type { MetaChannel } from '../src/types/meta.js';

export default async function handler(req: any, res: any) {
  // Configuración de encabezados CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Dev-UID');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: `Method ${req.method} Not Allowed. Use POST.` }));
    return;
  }

  try {
    const authUser = await requireApprovedUser(req, res, true);
    if (!authUser) return;

    // 2. Parseo del cuerpo de la petición
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    } else if (!body && typeof req.on === 'function') {
      const buffers: any[] = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const dataStr = Buffer.concat(buffers).toString();
      body = dataStr ? JSON.parse(dataStr) : {};
    }

    const channel = body?.channel as MetaChannel | undefined;

    if (channel && !['whatsapp', 'facebook', 'instagram'].includes(channel)) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        success: false,
        error: "Canal inválido. Los canales permitidos son 'whatsapp', 'facebook' o 'instagram'."
      }));
      return;
    }

    // 3. Ejecutar diagnóstico contra Meta Graph API
    const result = await MetaBackendService.testConnection(channel);

    console.log(`[AUDIT] Action: META_CONNECTION_TEST | Channel: ${channel || 'all'} | Success: ${result.success} | User: ${authUser.email || 'diagnostic'}`);

    res.statusCode = 200;
    res.end(JSON.stringify({
      success: result.success,
      results: result.results
    }));
    return;
  } catch (err: any) {
    console.error('[API /api/meta-test] Error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({
      success: false,
      error: err.message || 'Error al ejecutar test de conexión con Meta Graph API'
    }));
    return;
  }
}
