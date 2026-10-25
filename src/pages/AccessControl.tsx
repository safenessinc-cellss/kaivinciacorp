import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import { ShieldCheck, ShieldX, Save, RefreshCw, Phone, LockKeyhole, Users } from 'lucide-react';

type AdminUser = {
  uid: string; name: string; email: string; role: string; status: string;
  permissions: Record<string, boolean>; assignedCallerId?: string | null;
  assignedSipCredentialId?: string | null;
};
type SipCredential = { id: string; label: string; phoneNumber: string | null; assignedTo: string | null; assignedName: string | null };

const MODULES = [
  ['dashboard','Dashboard'], ['tlmk_sales','TLMK & Ventas'], ['dialer','Discador'],
  ['collections','Cobranza'], ['talent','Talento / RR. HH.'], ['payroll','Nómina'],
  ['accounting','Contabilidad'], ['billing','Facturación'], ['marketing','Marketing'],
  ['projects','Proyectos'], ['reports','Informes'], ['academy','Academia'],
  ['team_management','Gestión de equipo'], ['calendar','Calendario'], ['chat','Chat'],
  ['clients','Clientes'], ['operations','Operaciones'], ['call_center','Administración del call center'],
  ['integrations','Integraciones'], ['documents','Documentos'], ['audits','Auditorías']
] as const;

const DEFAULTS_BY_ROLE: Record<string, string[]> = {
  admin: MODULES.map(([key]) => key), ceo: MODULES.map(([key]) => key),
  gestor: ['dashboard','tlmk_sales','collections','reports','team_management','calendar','chat','clients','operations'],
  supervisor: ['dashboard','tlmk_sales','dialer','collections','calendar','chat','clients','reports','team_management'],
  tlmk: ['dashboard','tlmk_sales','dialer','calendar','chat','clients'],
  agente: ['dashboard','dialer','calendar','chat','clients'],
  sales: ['dashboard','tlmk_sales','dialer','calendar','chat','clients'],
  rrhh: ['dashboard','talent','payroll','calendar','chat'],
  alumno: ['academy','chat']
};

function permissionsForUser(user: AdminUser | null): Record<string, boolean> {
  if (!user) return {};
  const stored = user.permissions || {};
  if (Object.keys(stored).length) return { ...stored };
  return Object.fromEntries((DEFAULTS_BY_ROLE[user.role] || []).map(key => [key, true]));
}

async function authorizedFetch(url: string, body?: unknown) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
  const token = await currentUser.getIdToken();
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No se pudo completar la operación.');
  return data;
}

export default function AccessControl() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [credentials, setCredentials] = useState<SipCredential[]>([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [selectedCredential, setSelectedCredential] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = users.find(u => u.uid === selectedUid) || null;
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [userData, sipData] = await Promise.all([
        authorizedFetch('/api/admin/users'),
        authorizedFetch('/api/admin/sip-assignments')
      ]);
      setUsers(userData.users || []);
      setCredentials(sipData.credentials || []);
      setSelectedUid((current) => current || (userData.users || []).find((u: AdminUser) => u.status === 'pending')?.uid || (userData.users || [])[0]?.uid || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos.');
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPermissions(permissionsForUser(selected)); setSelectedCredential(selected?.assignedSipCredentialId || ''); }, [selectedUid, selected?.uid, selected?.permissions, selected?.role, selected?.assignedSipCredentialId]);

  const availableCredentials = useMemo(() => credentials.filter(c => !c.assignedTo || c.assignedTo === selectedUid), [credentials, selectedUid]);

  const changeStatus = async (status: 'approved' | 'blocked') => {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await authorizedFetch('/api/admin/users', { action: 'status', uid: selected.uid, status });
      setNotice(status === 'approved' ? 'Usuario aprobado.' : 'Usuario bloqueado.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.'); }
    finally { setBusy(false); }
  };

  const savePermissions = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const normalized: Record<string, boolean> = {};
      MODULES.forEach(([key]) => { normalized[key] = permissions[key] === true; });
      await authorizedFetch('/api/admin/users', { action: 'permissions', uid: selected.uid, permissions: normalized });
      setNotice('Permisos guardados y auditados.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron guardar los permisos.'); }
    finally { setBusy(false); }
  };

  const assignCredential = async () => {
    if (!selected || !selectedCredential) { setError('Selecciona un usuario y una credencial SIP.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await authorizedFetch('/api/admin/sip-assignments', { action: 'assign', credentialId: selectedCredential, uid: selected.uid });
      setNotice('Número asignado correctamente.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo asignar el número.'); }
    finally { setBusy(false); }
  };

  const releaseCredential = async () => {
    if (!selected?.assignedSipCredentialId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await authorizedFetch('/api/admin/sip-assignments', { action: 'release', credentialId: selected.assignedSipCredentialId });
      setNotice('Número liberado y disponible para reasignación.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo liberar el número.'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Seguridad · RBAC</p><h1 className="text-2xl font-black">Control de acceso</h1><p className="text-sm text-slate-600">Aprobación de usuarios, permisos individuales y asignación exclusiva de números SIP.</p></div>
        <button onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-bold disabled:opacity-50"><RefreshCw size={16}/> Actualizar</button>
      </header>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      <section className="grid gap-6 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.5fr)]">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-bold"><Users size={18}/> Usuarios ({users.length})</h2>
          <div className="max-h-[65vh] space-y-2 overflow-y-auto">
            {users.map(u => <button key={u.uid} onClick={() => { setSelectedUid(u.uid); setError(''); setNotice(''); }} className={`w-full rounded-xl border p-3 text-left ${selectedUid === u.uid ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <span className="block truncate text-sm font-bold">{u.name || u.email || u.uid}</span><span className="block truncate text-xs text-slate-500">{u.email}</span>
              <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase ${u.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : u.status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{u.status || 'pending'}</span>
            </button>)}
            {!users.length && <p className="text-sm text-slate-500">No hay usuarios disponibles.</p>}
          </div>
        </div>
        <div className="space-y-6">
          {selected ? <>
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="mb-1 text-lg font-black">{selected.name || selected.email}</h2><p className="mb-4 text-sm text-slate-500">{selected.email} · Rol: {selected.role}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void changeStatus('approved')} disabled={busy || selected.status === 'approved' || selected.role === 'superadmin'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><ShieldCheck size={16}/> Aprobar</button>
                <button onClick={() => void changeStatus('blocked')} disabled={busy || selected.status === 'blocked' || selected.role === 'superadmin'} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><ShieldX size={16}/> Bloquear</button>
              </div>
            </section>
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black">Permisos individuales</h2><p className="text-xs text-slate-500">Los cambios se validan en el servidor y se registran en auditoría.</p></div><LockKeyhole size={20} className="text-cyan-700"/></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODULES.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={permissions[key] === true} onChange={e => setPermissions(prev => ({ ...prev, [key]: e.target.checked }))} disabled={busy || selected.role === 'superadmin'} className="h-4 w-4 rounded border-slate-300"/> {label}</label>)}
              </div>
              <button onClick={() => void savePermissions()} disabled={busy || selected.role === 'superadmin'} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Save size={16}/> Guardar permisos</button>
            </section>
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="mb-1 flex items-center gap-2 font-black"><Phone size={18}/> Número SIP exclusivo</h2><p className="mb-4 text-xs text-slate-500">Un recurso no puede pertenecer a dos usuarios a la vez. Caller ID tomado del recurso asignado.</p>
              {selected.assignedSipCredentialId && <p className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Asignado: {selected.assignedCallerId || selected.assignedSipCredentialId}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={selectedCredential} onChange={e => setSelectedCredential(e.target.value)} disabled={busy || selected.status !== 'approved'} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white p-2 text-sm">
                  <option value="">Seleccionar número disponible…</option>
                  {availableCredentials.map(c => <option key={c.id} value={c.id}>{c.phoneNumber || c.label}{c.assignedTo === selectedUid ? ' (asignado a este usuario)' : ''}</option>)}
                  {credentials.filter(c => c.assignedTo && c.assignedTo !== selectedUid).map(c => <option key={c.id} value={c.id} disabled>{c.phoneNumber || c.label} — asignado a {c.assignedName || 'otro agente'}</option>)}
                </select>
                <button onClick={() => void assignCredential()} disabled={busy || !selectedCredential || selected.status !== 'approved'} className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Asignar</button>
                <button onClick={() => void releaseCredential()} disabled={busy || !selected.assignedSipCredentialId} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-40">Liberar</button>
              </div>
            </section>
          </> : <div className="rounded-2xl border bg-white p-8 text-sm text-slate-500">Selecciona un usuario para gestionar su acceso.</div>}
        </div>
      </section>
    </div>
  </main>;
}
