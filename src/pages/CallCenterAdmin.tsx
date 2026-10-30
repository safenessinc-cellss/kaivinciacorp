import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Users, Phone, Key, RefreshCw } from 'lucide-react';

export default function CallCenterAdmin() {
  const [activeTab, setActiveTab] = useState('operadores');
  const [operadores, setOperadores] = useState([]);
  const [numeros, setNumeros] = useState([]);
  const [credenciales, setCredenciales] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [savingAssignment, setSavingAssignment] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'operadores'), (snap) => {
      setOperadores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => { setError(err.message); setLoading(false); });

    const unsub2 = onSnapshot(collection(db, 'telnyx_phone_numbers'), (snap) => {
      setNumeros(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsub3 = onSnapshot(collection(db, 'telnyx_sip_credentials'), (snap) => {
      setCredenciales(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsub4 = onSnapshot(collection(db, 'telnyx_agent_assignments'), (snap) => {
      const next = {};
      snap.docs.forEach((d) => { next[d.id] = d.data(); });
      setAssignments(next);
    }, (err) => setError(err.message));

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  const toggleAssignedNumber = (uid, phoneNumber, checked) => {
    setAssignments((current) => {
      const existing = current[uid] || {};
      const authorizedNumbers = Array.isArray(existing.authorizedNumbers) ? existing.authorizedNumbers : [];
      const nextNumbers = checked
        ? Array.from(new Set([...authorizedNumbers, phoneNumber]))
        : authorizedNumbers.filter((n) => n !== phoneNumber);
      return { ...current, [uid]: { ...existing, authorizedNumbers: nextNumbers,
        defaultCallerId: nextNumbers.includes(existing.defaultCallerId) ? existing.defaultCallerId : (nextNumbers[0] || '') } };
    });
  };

  const saveAssignment = async (op) => {
    setSavingAssignment(op.id);
    setError(null);
    try {
      const assignment = assignments[op.id] || {};
      const authorizedNumbers = Array.isArray(assignment.authorizedNumbers) ? assignment.authorizedNumbers : [];
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('La sesión administrativa ha expirado.');
      await setDoc(doc(db, 'telnyx_agent_assignments', op.id), {
        agentUid: op.id,
        agentEmail: op.email || '',
        authorizedNumbers,
        defaultCallerId: authorizedNumbers.includes(assignment.defaultCallerId)
          ? assignment.defaultCallerId : (authorizedNumbers[0] || ''),
        authorizedZones: Array.isArray(assignment.authorizedZones) ? assignment.authorizedZones : [],
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.uid
      }, { merge: true });
    } catch (err) {
      setError(err?.message || 'No se pudo guardar la asignación. Verifica que tu usuario sea administrador.');
    } finally {
      setSavingAssignment('');
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) { setError('No hay usuario'); return; }
      const token = await user.getIdToken(true);
      const res = await fetch('/api/telnyx/numbers/sync', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || 'Error'); return; }
      console.log('Sincronizados ' + data.total);
    } catch (err) { setError(String(err)); }
    finally { setIsSyncing(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-cyan-500 animate-spin" />
        <span className="ml-2 text-slate-400">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight italic">Centro de Llamadas</h1>
          <p className="text-sm text-slate-500 mt-1">Operadores, numeros y credenciales de Telnyx</p>
        </div>
        <button onClick={handleSync} disabled={isSyncing} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg disabled:opacity-50 cursor-pointer flex items-center gap-2">
          <RefreshCw className={isSyncing ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Telnyx'}</span>
        </button>
      </div>

      {error && <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-sm"><strong>Error:</strong> {error}</div>}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setActiveTab('operadores')} className={'px-4 py-2.5 text-xs font-black uppercase tracking-wider cursor-pointer flex items-center gap-2 ' + (activeTab === 'operadores' ? 'text-cyan-500 border-b-2 border-cyan-500' : 'text-slate-500')}>
          <Users className="w-4 h-4" /> Operadores ({operadores.length})
        </button>
        <button onClick={() => setActiveTab('numeros')} className={'px-4 py-2.5 text-xs font-black uppercase tracking-wider cursor-pointer flex items-center gap-2 ' + (activeTab === 'numeros' ? 'text-cyan-500 border-b-2 border-cyan-500' : 'text-slate-500')}>
          <Phone className="w-4 h-4" /> Numeros ({numeros.length})
        </button>
        <button onClick={() => setActiveTab('credenciales')} className={'px-4 py-2.5 text-xs font-black uppercase tracking-wider cursor-pointer flex items-center gap-2 ' + (activeTab === 'credenciales' ? 'text-cyan-500 border-b-2 border-cyan-500' : 'text-slate-500')}>
          <Key className="w-4 h-4" /> Credenciales ({credenciales.length})
        </button>
      </div>

      {activeTab === 'operadores' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {operadores.length === 0 ? (
            <div className="col-span-full text-center p-12 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-bold">No hay operadores registrados</p>
            </div>
          ) : operadores.map((op) => (
            <div key={op.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold truncate">{op.nombre || 'Sin nombre'}</h3>
                <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ' + (op.disponible ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-200 text-slate-500')}>{op.disponible ? 'Disp.' : 'Offline'}</span>
              </div>
              <p className="text-xs text-slate-500 truncate">{op.email}</p>
              <p className="text-[10px] text-slate-400">Rol: {op.rol || op.role || 'agente'}</p>
              <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Caller IDs autorizados</p>
                {numeros.filter((num) => num.phoneNumber && !['disabled', 'deleted'].includes(String(num.status || '').toLowerCase())).length === 0 ? (
                  <p className="text-xs text-slate-400">Sin números Telnyx sincronizados.</p>
                ) : numeros.filter((num) => num.phoneNumber && !['disabled', 'deleted'].includes(String(num.status || '').toLowerCase())).map((num) => {
                  const assigned = (assignments[op.id]?.authorizedNumbers || []).includes(num.phoneNumber);
                  return <label key={num.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={assigned} onChange={(e) => toggleAssignedNumber(op.id, num.phoneNumber, e.target.checked)} className="accent-cyan-500" />
                    <span className="font-mono">{num.phoneNumber}</span>
                    <span className="text-[10px] text-slate-400 truncate">{num.friendlyName || ''}</span>
                  </label>;
                })}
                <button onClick={() => saveAssignment(op)} disabled={savingAssignment === op.id}
                  className="w-full mt-2 px-3 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-black rounded-lg cursor-pointer">
                  {savingAssignment === op.id ? 'Guardando…' : 'Guardar números asignados'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'numeros' && (
        <div className="space-y-2">
          {numeros.length === 0 ? (
            <div className="text-center p-12 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              <Phone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-bold">No hay numeros</p>
            </div>
          ) : numeros.map((num) => (
            <div key={num.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-cyan-500 font-bold truncate">{num.phoneNumber}</p>
                <p className="text-xs text-slate-400 truncate">{num.friendlyName || 'Sin nombre'}</p>
              </div>
              <span className="text-[10px] font-bold uppercase text-slate-400">{num.status}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'credenciales' && (
        <div className="space-y-2">
          {credenciales.length === 0 ? (
            <div className="text-center p-12 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              <Key className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-bold">No hay credenciales</p>
            </div>
          ) : credenciales.map((cred) => (
            <div key={cred.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold truncate">{cred.telnyxUsername}</p>
                <p className="text-[10px] text-slate-400 truncate">ID: {cred.id}</p>
              </div>
              <span className={'text-[10px] font-bold uppercase ' + (cred.activo ? 'text-emerald-500' : 'text-rose-500')}>{cred.activo ? 'Activa' : 'Inactiva'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}