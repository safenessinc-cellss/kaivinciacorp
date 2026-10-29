import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { KeyRound, Layers3, Plus, Save, Search, ShieldCheck, Users } from 'lucide-react';
import { auth, db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

const MODULES = [
 {id:'dashboard',label:'Dashboard y panel principal',actions:['read','configure','export']},
 {id:'clients',label:'Clientes y contactos',actions:['read','create','update','delete','assign','export','import']},
 {id:'leads',label:'Leads y oportunidades',actions:['read','create','update','delete','assign','convert','export','import']},
 {id:'pipeline',label:'Pipeline comercial / Marketing',actions:['read','create','update','delete','assign','close','export']},
 {id:'tasks',label:'Tareas y actividades',actions:['read','create','update','delete','assign','complete','export']},
 {id:'chat',label:'Chat y comunicaciones',actions:['read','create','update','delete','moderate']},
 {id:'calls',label:'Telefonía / Telnyx',actions:['read','call','recordings.read','recordings.download','configure','assign','export']},
 {id:'data',label:'Data / Carteras TLMK',actions:['read','import','assign','update_status','call','export','delete']},
 {id:'recruitment',label:'Reclutamiento y selección',actions:['read','create','update','delete','hire','documents.read','documents.download','export']},
 {id:'team',label:'Colaboradoras y equipo',actions:['read','create','update','deactivate','assign_role','export']},
 {id:'users',label:'Usuarios y cuentas',actions:['read','create','update','deactivate','assign_role','reset_access','delete']},
 {id:'roles',label:'Roles y permisos',actions:['read','create','update','delete','assign','manage_roles']},
 {id:'payroll',label:'Nómina',actions:['read','create','update','approve','export']},
 {id:'commissions',label:'Comisiones',actions:['read','calculate','approve','update','export']},
 {id:'sales',label:'Ventas',actions:['read','create','update','close','approve','export']},
 {id:'collections',label:'Cobros y cobranza',actions:['read','create','update','reconcile','approve','export']},
 {id:'finance',label:'Finanzas y contabilidad',actions:['read','create','update','approve','reconcile','export']},
 {id:'billing',label:'Facturación',actions:['read','create','update','approve','export']},
 {id:'reports',label:'Reportes y KPIs',actions:['read','create','configure','export']},
 {id:'projects',label:'Proyectos y operaciones',actions:['read','create','update','delete','assign','export']},
 {id:'calendar',label:'Agenda y reuniones',actions:['read','create','update','delete','assign']},
 {id:'automations',label:'Automatizaciones y workflows',actions:['read','create','update','delete','run','configure']},
 {id:'academy',label:'Academia y formación',actions:['read','create','update','delete','assign','export']},
 {id:'helpdesk',label:'Helpdesk y soporte',actions:['read','create','update','delete','assign','close']},
 {id:'documents',label:'Documentos y archivos',actions:['read','create','update','delete','download','export']},
 {id:'integrations',label:'Integraciones externas',actions:['read','configure','manage_integrations','audit.read']},
 {id:'security',label:'Seguridad y auditoría',actions:['read','configure','audit.read','export']},
 {id:'portals',label:'Portales de usuario y cliente',actions:['read','configure','manage_access']},
 {id:'settings',label:'Configuración del sistema',actions:['read','update','configure','manage_roles','manage_integrations']}
];
type Permission = Record<string,boolean>;
type CustomRole = {id:string;name:string;description?:string;permissions:Permission;scope?:string};
type UserRow = {uid:string;name?:string;email?:string;role?:string;status?:string;customRoleId?:string;customRoleName?:string;permissions?:Permission};
const actionLabel=(s:string)=>({read:'Ver',create:'Crear',update:'Editar',delete:'Eliminar',hire:'Contratar','documents.read':'Ver documentos','documents.download':'Descargar documentos',export:'Exportar',import:'Importar',assign:'Asignar cartera',update_status:'Cambiar estado',call:'Llamar',deactivate:'Desactivar',assign_role:'Asignar roles',approve:'Aprobar',calculate:'Calcular',close:'Cerrar venta',reconcile:'Conciliar','recordings.read':'Escuchar grabaciones','recordings.download':'Descargar grabaciones',configure:'Configurar',manage_roles:'Administrar roles',manage_integrations:'Administrar integraciones','audit.read':'Ver auditoría'} as Record<string,string>)[s]||s;
export default function AccessControlCenter(){
 const {user,userData}=useAuth();
 const [users,setUsers]=useState<UserRow[]>([]),[roles,setRoles]=useState<CustomRole[]>([]);
 const [tab,setTab]=useState<'users'|'roles'>('roles'),[search,setSearch]=useState('');
 const [editing,setEditing]=useState<CustomRole|null>(null),[name,setName]=useState(''),[description,setDescription]=useState('');
 const [permissions,setPermissions]=useState<Permission>({}),[selectedUser,setSelectedUser]=useState(''),[selectedRole,setSelectedRole]=useState('');
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const isAdmin=['superadmin','admin'].includes(userData?.role||'');
 useEffect(()=>{
  const a=onSnapshot(collection(db,'users'),s=>setUsers(s.docs.map(d=>({uid:d.id,...d.data()} as UserRow))),e=>setNotice('No se pudieron cargar usuarios: '+e.message));
  const b=onSnapshot(collection(db,'customRoles'),s=>setRoles(s.docs.map(d=>({id:d.id,...d.data()} as CustomRole))),e=>setNotice('No se pudieron cargar roles: '+e.message));
  return ()=>{a();b();};
 },[]);
 const filteredUsers=useMemo(()=>users.filter(u=>!search||[u.name,u.email,u.role,u.customRoleName].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))),[users,search]);
 const startNew=()=>{setEditing(null);setName('');setDescription('');setPermissions({});setTab('roles');};
 const editRole=(r:CustomRole)=>{setEditing(r);setName(r.name);setDescription(r.description||'');setPermissions(r.permissions||{});setTab('roles');};
 const toggle=(key:string)=>setPermissions(p=>({...p,[key]:!p[key]}));
 const saveRole=async()=>{if(!isAdmin||!name.trim()){setNotice('Se requiere un nombre de rol y privilegios administrativos.');return;}setBusy(true);try{
  const payload={name:name.trim(),description:description.trim(),permissions,scope:'explicit',updatedAt:serverTimestamp(),updatedBy:user?.uid||auth.currentUser?.uid||''};
  if(editing)await updateDoc(doc(db,'customRoles',editing.id),payload);else await addDoc(collection(db,'customRoles'),{...payload,createdAt:serverTimestamp(),createdBy:user?.uid||''});
  setNotice('Rol guardado. Antes de usarlo con datos reales, aplica la misma matriz en las reglas de Firestore y los endpoints.');setEditing(null);setName('');setDescription('');setPermissions({});
 }catch(e){setNotice('No se pudo guardar el rol: '+(e instanceof Error?e.message:'error'));}finally{setBusy(false);}};
 const assignRole=async()=>{if(!isAdmin||!selectedUser||!selectedRole){setNotice('Selecciona usuario y rol.');return;}setBusy(true);try{
  const role=roles.find(r=>r.id===selectedRole);if(!role)throw new Error('El rol no existe.');
  await updateDoc(doc(db,'users',selectedUser),{customRoleId:role.id,customRoleName:role.name,permissions:role.permissions,roleAssignedBy:user?.uid||'',roleAssignedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  setNotice('Rol asignado. La autorización efectiva debe aplicarse también en backend/Firestore.');setSelectedUser('');setSelectedRole('');
 }catch(e){setNotice('No se pudo asignar el rol: '+(e instanceof Error?e.message:'error'));}finally{setBusy(false);}};
 return <main className="min-h-full p-4 sm:p-6 lg:p-8 space-y-6">
 <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"><div><div className="flex items-center gap-2 text-xs uppercase tracking-[.2em] text-blue-500 font-bold"><ShieldCheck size={15}/> Centro de configuración</div><h1 className="text-3xl font-semibold tracking-tight mt-2">Usuarios, roles y permisos</h1><p className="text-sm opacity-70 mt-2 max-w-2xl">Crea roles específicos y asigna permisos por módulo, submódulo y acción. El alcance territorial se gestiona por separado.</p></div><button onClick={startNew} className="kai-button-primary px-4 py-2 inline-flex items-center gap-2"><Plus size={16}/>Crear rol</button></header>
 {notice&&<div role="status" className="kai-card p-3 text-sm">{notice}<button className="ml-3 opacity-60" onClick={()=>setNotice('')}>Cerrar</button></div>}
 <div className="flex flex-wrap gap-2"><button onClick={()=>setTab('roles')} className={'px-4 py-2 rounded-xl '+(tab==='roles'?'bg-blue-600 text-white':'kai-control')}><Layers3 size={15} className="inline mr-2"/>Roles y permisos</button><button onClick={()=>setTab('users')} className={'px-4 py-2 rounded-xl '+(tab==='users'?'bg-blue-600 text-white':'kai-control')}><Users size={15} className="inline mr-2"/>Asignar a usuarios</button></div>
 {tab==='roles'?<div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(320px,.9fr)] gap-5"><section className="kai-card p-4 sm:p-5"><h2 className="font-semibold mb-3">Tipos de usuario del sistema</h2><p className="text-xs opacity-65 mb-3">Roles base reconocidos por Kaivincia. Los permisos detallados de cada módulo se configuran en la matriz de roles personalizados de abajo.</p><div className="grid sm:grid-cols-2 gap-2 mb-5">{[
 {id:'superadmin',label:'Superadministrador',desc:'Control total del sistema y seguridad'},
 {id:'admin',label:'Administrador',desc:'Administración general y usuarios'},
 {id:'ceo',label:'CEO / Dirección',desc:'Visión ejecutiva y módulos estratégicos'},
 {id:'gestor',label:'Gestor',desc:'Supervisión de operaciones y equipos'},
 {id:'supervisor',label:'Supervisor',desc:'Seguimiento de equipo y resultados'},
 {id:'rrhh',label:'Recursos Humanos',desc:'Reclutamiento y gestión de talento'},
 {id:'tlmk',label:'Telemarketing (TLMK)',desc:'Carteras, llamadas y actividad asignada'},
 {id:'telemarketing',label:'Telemarketing',desc:'Operación comercial y llamadas'},
 {id:'ventas',label:'Ventas',desc:'Gestión comercial y oportunidades'},
 {id:'setter',label:'Setter',desc:'Prospección y cualificación'},
 {id:'closer',label:'Closer',desc:'Cierre de oportunidades y ventas'},
 {id:'agent',label:'Agente',desc:'Trabajo operativo según permisos'},
 {id:'collaborator',label:'Colaboradora',desc:'Tareas y módulos asignados'},
 {id:'billing',label:'Facturación',desc:'Facturación y cobros autorizados'},
 {id:'accounting',label:'Contabilidad',desc:'Contabilidad y reportes financieros'},
 {id:'alumno',label:'Alumno',desc:'Academia y portal de formación'},
 {id:'user',label:'Usuario estándar',desc:'Acceso limitado según permisos'}
].map(r=><div key={r.id} className="kai-control rounded-xl p-3"><div className="flex items-center justify-between gap-2"><span className="font-medium text-sm">{r.label}</span><code className="text-[10px] opacity-60">{r.id}</code></div><p className="text-xs opacity-65 mt-1">{r.desc}</p></div>)}</div><div className="border-t border-black/10 dark:border-white/10 pt-4"><h2 className="font-semibold mb-3">Roles personalizados</h2>{roles.length===0?<p className="text-sm opacity-65 py-6">Todavía no hay roles personalizados. Crea uno para definir permisos.</p>:<div className="space-y-2">{roles.map(r=><button key={r.id} onClick={()=>editRole(r)} className={'w-full text-left kai-control p-3 rounded-xl '+(editing?.id===r.id?'ring-2 ring-blue-500':'')}><div className="font-medium">{r.name}</div><div className="text-xs opacity-65 mt-1">{r.description||'Sin descripción'} · {Object.values(r.permissions||{}).filter(Boolean).length} permisos activos</div></button>)}</div>}</div></section>
 <section className="kai-card p-4 sm:p-5 space-y-4"><div className="flex items-center justify-between"><h2 className="font-semibold">{editing?'Editar rol':'Nuevo rol'}</h2>{editing&&<button onClick={startNew} aria-label="Nuevo rol"><Plus size={16}/></button>}</div><label className="block text-sm">Nombre<input value={name} onChange={e=>setName(e.target.value)} className="kai-control w-full mt-1 px-3 py-2" placeholder="Ej. Supervisor regional Data"/></label><label className="block text-sm">Descripción<textarea value={description} onChange={e=>setDescription(e.target.value)} className="kai-control w-full mt-1 px-3 py-2" rows={2}/></label><div className="max-h-[430px] overflow-y-auto space-y-4 pr-1">{MODULES.map(m=><fieldset key={m.id} className="border border-black/10 dark:border-white/10 rounded-xl p-3"><legend className="px-1 text-sm font-semibold">{m.label}</legend><div className="grid sm:grid-cols-2 gap-2">{m.actions.map(a=>{const key=m.id+':'+a;return <label key={key} className="flex items-center gap-2 text-xs py-1"><input type="checkbox" checked={!!permissions[key]} onChange={()=>toggle(key)} className="accent-blue-600"/>{actionLabel(a)}</label>})}</div></fieldset>)}</div><button disabled={busy||!name.trim()} onClick={()=>void saveRole()} className="kai-button-primary w-full py-2.5 inline-flex justify-center items-center gap-2"><Save size={16}/>{busy?'Guardando…':'Guardar rol'}</button></section></div>
 :<section className="kai-card p-4 sm:p-5 space-y-4"><div className="grid md:grid-cols-3 gap-3"><label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"/><input className="kai-control w-full pl-9 pr-3 py-2" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar usuario"/></label><select className="kai-control px-3 py-2" value={selectedUser} onChange={e=>setSelectedUser(e.target.value)}><option value="">Seleccionar usuario</option>{filteredUsers.map(u=><option key={u.uid} value={u.uid}>{u.name||u.email||u.uid} · {u.role||'sin rol'}</option>)}</select><select className="kai-control px-3 py-2" value={selectedRole} onChange={e=>setSelectedRole(e.target.value)}><option value="">Seleccionar rol personalizado</option>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div><button disabled={busy||!selectedUser||!selectedRole} onClick={()=>void assignRole()} className="kai-button-primary px-4 py-2 inline-flex items-center gap-2"><KeyRound size={16}/>Asignar rol seleccionado</button><div className="overflow-x-auto"><table className="kai-table w-full"><thead><tr><th>Usuario</th><th>Rol base</th><th>Rol personalizado</th><th>Estado</th></tr></thead><tbody>{filteredUsers.map(u=><tr key={u.uid}><td><div className="font-medium">{u.name||'Sin nombre'}</div><div className="text-xs opacity-60">{u.email}</div></td><td>{u.role||'—'}</td><td>{u.customRoleName||'—'}</td><td>{u.status||'—'}</td></tr>)}</tbody></table></div></section>}
 <p className="text-xs opacity-65">Principio de mínimo privilegio: un permiso de exportación no concede acceso global. Ocultar controles no es seguridad; deben aplicarse reglas equivalentes en Firestore y en los endpoints.</p>
 </main>;
}
