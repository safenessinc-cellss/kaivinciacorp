import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Check, X, Clock, Mail, User as UserIcon, ShieldCheck } from 'lucide-react';

interface PendingUser {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  createdAt?: any;
  status?: string;
}

export default function PendingUsersPanel() {
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = query(collection(db, 'users'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      setPending(snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingUser)));
      setLoading(false);
    }, (err) => {
      console.warn('pending users query failed:', err.message);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const approve = async (uid: string) => {
    const target = pending.find((item) => item.id === uid);
    const role = selectedRoles[uid] || target?.role || 'none';
    if (!role || role === 'none') {
      alert('Selecciona un rol antes de aprobar la cuenta.');
      return;
    }
    if (!auth.currentUser) {
      alert('La sesión administrativa no está disponible. Inicia sesión de nuevo.');
      return;
    }
    setBusy(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        role,
        status: 'approved',
        approvedBy: auth.currentUser.uid,
        approvedAt: serverTimestamp(),
        rejectionReason: '',
        rejectedBy: '',
        rejectedAt: null,
      });
      await addDoc(collection(db, 'notifications'), {
        ownerId: uid,
        title: 'Cuenta aprobada',
        message: 'Tu acceso a Kaivincia Corp fue aprobado.',
        type: 'account_approval',
        priority: 'medium',
        path: '/crm/dashboard',
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err: any) {
      alert(`Error aprobando: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const reject = async (uid: string) => {
    const reason = prompt('Motivo del rechazo (opcional):') || '';
    setBusy(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'rejected',
        rejectedBy: auth.currentUser?.uid || null,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason || 'La solicitud fue rechazada por un administrador.',
      });
      await addDoc(collection(db, 'notifications'), {
        ownerId: uid,
        title: 'Solicitud rechazada',
        message: reason || 'La solicitud de acceso fue rechazada por un administrador.',
        type: 'account_approval',
        priority: 'high',
        path: '/crm/dashboard',
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err: any) {
      alert(`Error rechazando: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-fg-secondary">Cargando solicitudes…</div>;
  }

  if (pending.length === 0) {
    return (
      <div className="p-6 bg-white border border-separator rounded-lg">
        <div className="flex items-center gap-2 text-green-700 mb-2">
          <ShieldCheck className="w-5 h-5" />
          <h3 className="font-semibold">Sin solicitudes pendientes</h3>
        </div>
        <p className="text-sm text-fg-secondary">No hay usuarios esperando aprobación.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-separator rounded-lg">
      <div className="px-4 py-3 border-b border-separator flex items-center justify-between">
        <h3 className="font-semibold text-fg-primary flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500" />
          Solicitudes pendientes ({pending.length})
        </h3>
      </div>
      <ul className="divide-y divide-gray-200">
        {pending.map(u => (
          <li key={u.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-surface-grouped flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-fg-secondary" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-fg-primary truncate">{u.name || u.email || u.id}</div>
                <div className="text-xs text-fg-secondary flex items-center gap-1 truncate">
                  <Mail className="w-3 h-3" /> {u.email || '—'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="sr-only" htmlFor={`pending-role-${u.id}`}>Rol para {u.name || u.email}</label>
              <select
                id={`pending-role-${u.id}`}
                value={selectedRoles[u.id] || u.role || 'none'}
                onChange={(event) => setSelectedRoles(current => ({ ...current, [u.id]: event.target.value }))}
                disabled={busy === u.id}
                className="border border-separator rounded-md px-2 py-1.5 text-xs bg-white text-fg-primary"
              >
                <option value="none">Seleccionar rol…</option>
                <option value="superadmin">SuperAdmin</option>
                <option value="admin">Administrador</option>
                <option value="ceo">CEO / Director</option>
                <option value="gestor">Gestor</option>
                <option value="sales">Ventas</option>
                <option value="tlmk">Agente TLMK</option>
                <option value="rrhh">Recursos Humanos</option>
                <option value="collaborator">Colaborador</option>
                <option value="tutor">Tutor</option>
                <option value="alumno">Alumno</option>
                <option value="cliente">Cliente</option>
                <option value="user">Usuario básico</option>
              </select>
              <button
                onClick={() => approve(u.id)}
                disabled={busy === u.id}
                className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" /> Aprobar
              </button>
              <button
                onClick={() => reject(u.id)}
                disabled={busy === u.id}
                className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" /> Rechazar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
