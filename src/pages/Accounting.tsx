import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { AlertCircle, Calculator, Calendar, DollarSign, FileText, RefreshCw, TrendingUp } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

type FinancialRecord = Record<string, any> & { id: string };

const getAmount = (record: FinancialRecord) => Number(record.amount ?? record.total ?? record.value ?? 0) || 0;
const getCurrency = (record: FinancialRecord) => String(record.currency ?? record.currencyCode ?? record.moneda ?? '').toUpperCase();
const getStatus = (record: FinancialRecord) => String(record.status ?? record.paymentStatus ?? '').toLowerCase();
const isPaid = (record: FinancialRecord) => ['paid', 'pagada', 'pagado', 'pago', 'pagadas', 'pagados', 'completed', 'settled', 'received', 'recibido', 'recibida'].includes(getStatus(record));
const isCancelled = (record: FinancialRecord) => ['cancelled', 'canceled', 'cancelada', 'cancelado', 'anulada', 'anulado', 'void'].includes(getStatus(record));
const isOpen = (record: FinancialRecord) => ['pending', 'pendiente', 'vencida', 'overdue', 'open', 'unpaid', 'por cobrar', 'por pagar'].includes(getStatus(record)) && !isPaid(record) && !isCancelled(record);
const getDueDate = (record: FinancialRecord) => {
  const raw = record.dueDate ?? record.dueAt ?? record.paymentDueDate ?? record.vencimiento;
  if (!raw) return null;
  const date = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatMoney = (value: number, currency: string) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency, maximumFractionDigits: 2
}).format(value);

export default function Accounting() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('dre');
  const [currency, setCurrency] = useState('BRL');
  const [invoices, setInvoices] = useState<FinancialRecord[]>([]);
  const [expenses, setExpenses] = useState<FinancialRecord[]>([]);
  const [collaborators, setCollaborators] = useState<FinancialRecord[]>([]);
  const [prospects, setProspects] = useState<FinancialRecord[]>([]);
  const [commissionRules, setCommissionRules] = useState<Record<string, any>>({ appointmentBooked: 10, appointmentEffective: 25 });
  const [loading, setLoading] = useState(true);
  const [savingExpense, setSavingExpense] = useState(false);
  const [actionId, setActionId] = useState('');
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [expenseForm, setExpenseForm] = useState({ description: '', vendor: '', amount: '', dueDate: '', currency: 'BRL' });
  const [expenseError, setExpenseError] = useState('');

  const tabs = [
    { id: 'dre', name: 'DRE gerencial' },
    { id: 'ar', name: 'Cuentas por cobrar' },
    { id: 'ap', name: 'Cuentas por pagar' },
    { id: 'diario', name: 'Diario contable' },
    { id: 'impuestos', name: 'Impuestos' },
    { id: 'flujo', name: 'Flujo de caja' }
  ];

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    let ready = 0;
    const sources = ['invoices', 'expenses', 'collaborators', 'prospects', 'settings/payroll'];
    const markReady = (source: string, error?: unknown) => {
      ready += 1;
      setSourceErrors(current => error
        ? [...new Set([...current.filter(x => x !== source), source])]
        : current.filter(x => x !== source));
      if (ready >= sources.length) setLoading(false);
    };
    const unsubs = [
      onSnapshot(collection(db, 'invoices'), snap => {
        setInvoices(snap.docs.map(item => ({ id: item.id, ...item.data() } as FinancialRecord)));
        markReady('invoices');
      }, error => { console.warn('Accounting invoices listener:', error.message); markReady('invoices', error); }),
      onSnapshot(collection(db, 'expenses'), snap => {
        setExpenses(snap.docs.map(item => ({ id: item.id, ...item.data() } as FinancialRecord)));
        markReady('expenses');
      }, error => { console.warn('Accounting expenses listener:', error.message); markReady('expenses', error); }),
      onSnapshot(collection(db, 'collaborators'), snap => {
        setCollaborators(snap.docs.map(item => ({ id: item.id, ...item.data() } as FinancialRecord)));
        markReady('collaborators');
      }, error => { console.warn('Accounting collaborators listener:', error.message); markReady('collaborators', error); }),
      onSnapshot(collection(db, 'prospects'), snap => {
        setProspects(snap.docs.map(item => ({ id: item.id, ...item.data() } as FinancialRecord)));
        markReady('prospects');
      }, error => { console.warn('Accounting prospects listener:', error.message); markReady('prospects', error); }),
      onSnapshot(doc(db, 'settings', 'payroll'), snap => {
        if (snap.exists()) setCommissionRules(current => ({ ...current, ...snap.data() }));
        markReady('settings/payroll');
      }, error => { console.warn('Accounting commission rules listener:', error.message); markReady('settings/payroll', error); })
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [user, authLoading]);

  const invoiceRows = useMemo(() => invoices.filter(row => getCurrency(row) === currency), [invoices, currency]);
  const expenseRows = useMemo(() => expenses.filter(row => getCurrency(row) === currency), [expenses, currency]);
  const currencyUnknown = useMemo(() => [...invoices, ...expenses].filter(row => !getCurrency(row)).length, [invoices, expenses]);
  const receivable = invoiceRows.filter(isOpen);
  const payable = expenseRows.filter(isOpen);
  const commissionCurrency = String(commissionRules.currency ?? commissionRules.currencyCode ?? '').toUpperCase();
  const commissionAmount = collaborators.reduce((sum, collaborator) => {
    const assigned = prospects.filter(p => p.assignedTo === collaborator.id || p.setterName === collaborator.name);
    const booked = assigned.filter(p => ['Cita Agendada', 'Appointment Booked', 'booked'].includes(String(p.status ?? ''))).length;
    const effective = assigned.filter(p => ['Cita Efectiva', 'Effective Appointment', 'effective'].includes(String(p.status ?? ''))).length;
    return sum + booked * Number(commissionRules.appointmentBooked ?? 10) + effective * Number(commissionRules.appointmentEffective ?? 25);
  }, 0);
  const commissionIsClassified = ['BRL', 'USD'].includes(commissionCurrency);
  const overdueReceivables = receivable.filter(row => {
    const due = getDueDate(row);
    return due !== null && due.getTime() < Date.now();
  });
  const revenue = invoiceRows.filter(isPaid).reduce((sum, row) => sum + getAmount(row), 0);
  const expensesPaid = expenseRows.filter(isPaid).reduce((sum, row) => sum + getAmount(row), 0);
  const openReceivables = receivable.reduce((sum, row) => sum + getAmount(row), 0);
  const openPayables = payable.reduce((sum, row) => sum + getAmount(row), 0);
  const netResult = revenue - expensesPaid;
  const pendingSource = sourceErrors.length > 0;
  const updateStatus = async (kind: 'invoice' | 'expense', row: FinancialRecord, status: 'Pagada' | 'Pendiente') => {
    setActionId(row.id);
    try {
      await updateDoc(doc(db, kind === 'invoice' ? 'invoices' : 'expenses', row.id), {
        status,
        paymentStatus: status,
        ...(status === 'Pagada' ? { paidAt: new Date().toISOString() } : {})
      });
    } catch (error) {
      console.error('Accounting status update failed:', error);
      setExpenseError('No se pudo actualizar el estado. Comprueba tus permisos y vuelve a intentarlo.');
    } finally { setActionId(''); }
  };
  const createExpense = async () => {
    const amount = Number(expenseForm.amount);
    if (!expenseForm.description.trim() || !Number.isFinite(amount) || amount <= 0 || !['BRL', 'USD'].includes(expenseForm.currency)) {
      setExpenseError('Indica concepto, importe positivo y moneda válida.');
      return;
    }
    setSavingExpense(true); setExpenseError('');
    try {
      await addDoc(collection(db, 'expenses'), {
        description: expenseForm.description.trim(),
        vendor: expenseForm.vendor.trim(),
        amount,
        currency: expenseForm.currency,
        status: 'Pendiente',
        dueDate: expenseForm.dueDate || null,
        createdAt: new Date().toISOString(),
        createdBy: user?.uid ?? ''
      });
      setExpenseForm({ description: '', vendor: '', amount: '', dueDate: '', currency });
    } catch (error) {
      console.error('Accounting expense create failed:', error);
      setExpenseError('No se pudo guardar el gasto. Comprueba las reglas de Firestore.');
    } finally { setSavingExpense(false); }
  };

  const recordTable = (rows: FinancialRecord[], kind: 'invoice' | 'expense') => {
    if (rows.length === 0) return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No hay registros abiertos en {currency}.</div>;
    return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Concepto</th><th className="px-4 py-3">Cliente / proveedor</th><th className="px-4 py-3">Vencimiento</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Importe</th><th className="px-4 py-3">Acción</th></tr></thead><tbody>{rows.map(row => { const due = getDueDate(row); const status = getStatus(row) || 'sin estado'; return <tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-800">{row.description || row.concept || row.title || (kind === 'invoice' ? 'Factura' : 'Gasto')}</td><td className="px-4 py-3 text-slate-600">{row.client || row.clientName || row.vendor || row.supplier || '—'}</td><td className="px-4 py-3 text-slate-600">{due ? due.toLocaleDateString('pt-BR') : '—'}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{status}</span></td><td className="px-4 py-3 text-right font-semibold text-slate-800">{formatMoney(getAmount(row), currency)}</td><td className="px-4 py-3">{isPaid(row) ? <span className="text-xs text-green-700">Liquidado</span> : <button disabled={actionId === row.id} onClick={() => updateStatus(kind, row, 'Pagada')} className="rounded-lg bg-[#E6F4EA] px-3 py-1.5 text-xs font-semibold text-[#137333] disabled:opacity-50">{actionId === row.id ? 'Guardando…' : 'Marcar pagado'}</button>}</td></tr>; })}</tbody></table></div>;
  };

  return <div className="space-y-6 text-slate-800">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="mb-1 text-xs font-bold uppercase tracking-[.18em] text-[#4285F4]">Kaivincia · Finance</p><h1 className="text-2xl font-bold tracking-tight">Contabilidad y control financiero</h1><p className="mt-1 text-sm text-slate-500">Datos conectados a facturación y gastos registrados. Sin cifras de demostración.</p></div>
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm"><span className="text-slate-500">Moneda</span><select value={currency} onChange={event => setCurrency(event.target.value)} className="bg-transparent font-semibold outline-none"><option value="BRL">BRL · Real</option><option value="USD">USD · Dólar</option></select></label>
    </header>

    {pendingSource && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle className="h-5 w-5 shrink-0" /><div><strong>Conexión financiera incompleta.</strong><p className="mt-1">No se pudieron leer todas las fuentes: {sourceErrors.join(', ')}. Los importes pueden estar incompletos; no se interpretan como cero.</p></div></div>}
    {currencyUnknown > 0 && <p className="text-xs text-slate-500">{currencyUnknown} registro(s) no indican moneda y se excluyen de los totales por divisa. No se aplica una tasa de cambio inventada.</p>}
    {!commissionIsClassified && commissionAmount > 0 && <p className="text-xs text-amber-700">Hay {commissionAmount.toLocaleString('pt-BR',{maximumFractionDigits:2})} en comisiones calculadas, pero no se suman a cuentas por pagar hasta registrar la obligación con una moneda explícita. Así se evita asumir una divisa o duplicar importes.</p>}

    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label:'Por cobrar', value:openReceivables, icon:DollarSign, tone:'text-[#34A853]', detail:receivable.length+' documentos abiertos' },{ label:'Por pagar', value:openPayables, icon:FileText, tone:'text-[#EA4335]', detail:payable.length+' documentos abiertos' },{ label:'Ingresos pagados', value:revenue, icon:TrendingUp, tone:'text-[#4285F4]', detail:'Facturas marcadas como pagadas' },{ label:'Resultado registrado', value:netResult, icon:Calculator, tone:netResult >= 0 ? 'text-[#34A853]' : 'text-[#EA4335]', detail:'Ingresos pagados menos gastos pagados' }].map(card => <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{card.label}</p><card.icon className={'h-5 w-5 '+card.tone}/></div><p className="mt-4 text-2xl font-bold tracking-tight">{loading ? '—' : formatMoney(card.value, currency)}</p><p className="mt-2 text-xs text-slate-500">{card.detail}</p></div>)}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 p-2">{tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={'whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold transition '+(activeTab === tab.id ? 'bg-[#E8F0FE] text-[#1A73E8]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800')}>{tab.name}</button>)}</nav>
      <div className="space-y-5 p-4 sm:p-6">
        {activeTab === 'dre' && <><div><h2 className="text-lg font-semibold">DRE gerencial</h2><p className="mt-1 text-sm text-slate-500">Resumen provisional calculado solo con registros marcados como pagados en {currency}. No sustituye el cierre contable ni el cálculo fiscal.</p></div><div className="max-w-3xl divide-y divide-slate-100 rounded-xl border border-slate-200 p-4 sm:p-6">{[{label:'Receita / ingresos pagados',value:revenue},{label:'(-) Gastos pagados',value:-expensesPaid},{label:'Resultado registrado',value:netResult}].map((row,index)=><div key={row.label} className={'flex justify-between gap-4 py-4 '+(index===2?'text-base font-bold':'text-sm')+(index===2?(row.value>=0?' text-[#188038]':' text-[#D93025]'):'')}><span>{row.label}</span><span>{formatMoney(row.value,currency)}</span></div>)}</div></>}
        {activeTab === 'ar' && <><div><h2 className="text-lg font-semibold">Cuentas por cobrar</h2><p className="mt-1 text-sm text-slate-500">{overdueReceivables.length} factura(s) con vencimiento pasado según los campos disponibles.</p></div>{recordTable(receivable,'invoice')}</>}
        {activeTab === 'ap' && <><div><h2 className="text-lg font-semibold">Cuentas por pagar</h2><p className="mt-1 text-sm text-slate-500">Gastos y obligaciones pendientes registrados en Firestore. Al marcar un gasto como pagado, los totales se actualizan en tiempo real.</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="mb-3 font-semibold">Registrar gasto / obligación</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input value={expenseForm.description} onChange={e=>setExpenseForm({...expenseForm,description:e.target.value})} placeholder="Concepto del gasto" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/><input value={expenseForm.vendor} onChange={e=>setExpenseForm({...expenseForm,vendor:e.target.value})} placeholder="Proveedor" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/><input type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={e=>setExpenseForm({...expenseForm,amount:e.target.value})} placeholder="Importe" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/><select value={expenseForm.currency} onChange={e=>setExpenseForm({...expenseForm,currency:e.target.value})} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="BRL">BRL · Real</option><option value="USD">USD · Dólar</option></select><input type="date" value={expenseForm.dueDate} onChange={e=>setExpenseForm({...expenseForm,dueDate:e.target.value})} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/></div>{expenseError && <p className="mt-2 text-sm text-red-700">{expenseError}</p>}<button onClick={createExpense} disabled={savingExpense} className="mt-3 rounded-lg bg-[#1A73E8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingExpense?'Guardando…':'Guardar gasto'}</button></div>
          {commissionAmount > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold text-amber-900">Comisiones calculadas desde CRM</h3><p className="mt-1 text-sm text-amber-800">Basadas en citas agendadas y efectivas de prospectos asignados. {commissionIsClassified ? 'Se clasifican en la moneda configurada; para que formen parte del total por pagar, registra la obligación una sola vez en gastos.' : 'Se muestran por separado hasta que se configure la moneda; no se agregan a los totales por divisa.'}</p><p className="mt-2 text-xl font-bold text-amber-900">{commissionIsClassified ? formatMoney(commissionAmount, commissionCurrency) : commissionAmount.toLocaleString('pt-BR',{maximumFractionDigits:2})+' (moneda sin configurar)'}</p></div>}
          {recordTable(payable,'expense')}</>}
        {activeTab === 'diario' && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center"><Calculator className="mx-auto mb-3 h-8 w-8 text-slate-300"/><h2 className="font-semibold">Diario contable</h2><p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Pendiente de implementar: catálogo de cuentas, asientos de débito/crédito, validación de balance y trazabilidad de cambios. No se crean asientos automáticos sin reglas contables aprobadas.</p></div>}
        {activeTab === 'impuestos' && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center"><Calendar className="mx-auto mb-3 h-8 w-8 text-slate-300"/><h2 className="font-semibold">Calendario fiscal de Brasil</h2><p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Pendiente de configurar régimen tributario, obligaciones aplicables y fechas oficiales. No se muestran vencimientos ficticios.</p></div>}
        {activeTab === 'flujo' && <><div><h2 className="text-lg font-semibold">Flujo de caja registrado</h2><p className="mt-1 text-sm text-slate-500">Saldo neto calculado de entradas y salidas marcadas como pagadas; no es una previsión bancaria.</p></div><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl bg-blue-50 p-4"><p className="text-sm text-slate-500">Entradas</p><p className="mt-2 text-xl font-bold">{formatMoney(revenue,currency)}</p></div><div className="rounded-xl bg-red-50 p-4"><p className="text-sm text-slate-500">Salidas</p><p className="mt-2 text-xl font-bold">{formatMoney(expensesPaid,currency)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Neto registrado</p><p className="mt-2 text-xl font-bold">{formatMoney(netResult,currency)}</p></div></div></>}
      </div>
    </section>
    <footer className="flex items-center gap-2 text-xs text-slate-400"><RefreshCw className="h-3.5 w-3.5"/> Actualización en tiempo real desde Firestore cuando hay sesión autenticada. Las divisas se calculan por separado, sin conversión automática.</footer>
  </div>;
}
