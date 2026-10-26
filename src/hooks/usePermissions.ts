import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
export const PERMISSION_MODULES = [
{key:'dashboard',label:'Dashboard',group:'General'},{key:'clients',label:'Clientes',group:'Ventas y CRM'},{key:'clientsCreate',label:'Crear clientes',group:'Acciones: CRM'},{key:'clientsEdit',label:'Editar clientes',group:'Acciones: CRM'},{key:'clientsDelete',label:'Eliminar clientes',group:'Acciones: CRM'},{key:'marketing',label:'Marketing / Oportunidades',group:'Ventas y CRM'},{key:'marketingCreate',label:'Crear oportunidades',group:'Acciones: CRM'},{key:'marketingEdit',label:'Editar oportunidades',group:'Acciones: CRM'},{key:'marketingDelete',label:'Eliminar oportunidades',group:'Acciones: CRM'},{key:'calls',label:'Discador / VoIP',group:'Ventas y CRM'},{key:'calendar',label:'Agenda',group:'Ventas y CRM'},{key:'cobranza',label:'Cobranza',group:'Finanzas'},{key:'billing',label:'Facturación',group:'Finanzas'},{key:'billingWrite',label:'Crear / editar facturación',group:'Acciones: Finanzas'},{key:'accounting',label:'Contabilidad',group:'Finanzas'},{key:'payroll',label:'Nómina',group:'Talento'},{key:'payrollWrite',label:'Modificar nómina',group:'Acciones: Talento'},{key:'team',label:'Gestión de equipo',group:'Talento'},{key:'recruitment',label:'Reclutamiento',group:'Talento'},{key:'tasks',label:'Tareas',group:'Operaciones'},{key:'tasksManage',label:'Crear / editar tareas',group:'Acciones: Operaciones'},{key:'projects',label:'Proyectos',group:'Operaciones'},{key:'projectsWrite',label:'Crear / editar proyectos',group:'Acciones: Operaciones'},{key:'operations',label:'Operaciones',group:'Operaciones'},{key:'reports',label:'Informes / KPIs',group:'Analítica'},{key:'strategicReport',label:'Informe estratégico',group:'Analítica'},{key:'chat',label:'Chat',group:'Colaboración'},{key:'helpdesk',label:'Helpdesk',group:'Colaboración'},{key:'drive',label:'Drive documental',group:'Operaciones'},{key:'academy',label:'Academia',group:'Formación'},{key:'integrations',label:'Integraciones',group:'Administración'},{key:'integrationsManage',label:'Modificar integraciones',group:'Acciones: Administración'},{key:'automations',label:'Automatizaciones',group:'Administración'},{key:'automationsManage',label:'Modificar automatizaciones',group:'Acciones: Administración'},{key:'formTemplates',label:'Plantillas',group:'Administración'},{key:'appearance',label:'Personalización visual',group:'Administración'},{key:'security',label:'Centro de seguridad',group:'Administración'},{key:'superadmin',label:'SuperAdmin',group:'Administración'}
] as const;
export type PermissionKey = typeof PERMISSION_MODULES[number]['key'];
const DEFAULTS: Record<string, Partial<Record<PermissionKey, boolean>>> = {
superadmin:Object.fromEntries(PERMISSION_MODULES.map(m=>[m.key,true])) as Record<PermissionKey,boolean>,
admin:{dashboard:true,clients:true,clientsCreate:true,clientsEdit:true,clientsDelete:true,marketing:true,marketingCreate:true,marketingEdit:true,marketingDelete:true,calls:true,calendar:true,cobranza:true,billing:true,billingWrite:true,accounting:true,payroll:true,payrollWrite:true,team:true,recruitment:true,tasks:true,tasksManage:true,projects:true,projectsWrite:true,operations:true,reports:true,strategicReport:true,chat:true,helpdesk:true,drive:true,academy:true,integrations:true,integrationsManage:true,automations:true,automationsManage:true,formTemplates:true,appearance:true,security:true},
supervisor:{dashboard:true,clients:true,clientsCreate:true,clientsEdit:true,marketing:true,marketingCreate:true,marketingEdit:true,calls:true,calendar:true,cobranza:true,tasks:true,tasksManage:true,projects:true,projectsWrite:true,reports:true,chat:true,helpdesk:true,drive:true,academy:true},
tlmk:{dashboard:true,clients:true,clientsCreate:true,clientsEdit:true,marketing:true,marketingCreate:true,marketingEdit:true,calls:true,calendar:true,chat:true,helpdesk:true},
ventas:{dashboard:true,clients:true,clientsCreate:true,clientsEdit:true,marketing:true,marketingCreate:true,marketingEdit:true,calls:true,calendar:true,chat:true,helpdesk:true},
agente:{dashboard:true,clients:true,clientsCreate:true,clientsEdit:true,calls:true,calendar:true,tasks:true,tasksManage:true,chat:true,helpdesk:true}
};
export function resolvePermissions(roleValue:unknown, customValue:unknown):Record<PermissionKey,boolean>{
const rawRole=String(roleValue||'none').trim().toLowerCase();
const role=({sales:'ventas',agent:'agente',agente_tlmk:'tlmk',professor:'tutor',mkt:'tlmk',operador:'agente'} as Record<string,string>)[rawRole]||rawRole;
const custom=customValue&&typeof customValue==='object'?customValue as Record<string,unknown>:{};
const defaults=DEFAULTS[role]||{};
return Object.fromEntries(PERMISSION_MODULES.map(({key})=>[key,key==='superadmin'?role==='superadmin':(role==='superadmin'?true:(typeof custom[key]==='boolean'?custom[key]:defaults[key]===true))])) as Record<PermissionKey,boolean>;
}
export function usePermissions(profileOverride?: {role?:unknown;permissions?:unknown}){
const {userData:contextUserData}=useAuth();
const userData=profileOverride||contextUserData;
const permissions=useMemo(()=>resolvePermissions(userData?.role,userData?.permissions),[userData?.role,userData?.permissions]);
const isSuperAdmin=String(userData?.role||'').trim().toLowerCase()==='superadmin';
const can=useCallback((key:PermissionKey)=>isSuperAdmin||permissions[key]===true,[isSuperAdmin,permissions]);
return {permissions,can,isSuperAdmin};
}