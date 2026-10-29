import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { AlertCircle, Calculator, Calendar, DollarSign, FileText, RefreshCw, TrendingUp } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

type FinancialRecord = Record<string, any> & { id: string };

const getAmount = (record: FinancialRecord) => Number(record.amount ?? record.total ?? record.value ?? 0) || 0;
const getCurrency = (record: FinancialRecord) => String(record.currency ?? record.currencyCode ?? record.moneda ?? '').toUpperCase();
const getStatus = (record: FinancialRecord) => String(record.status ?? record.paymentStatus ?? '').toLowerCase();
const isPaid = (record: FinancialRecord) => ['paid', 'pagado', 'pago', 'completed', 'settled', 'received'].includes(getStatus(record));
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
  const [loading, setLoading] = useState(true);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);

  const tabs = [
    { id: 'dre', name: 'DRE gerencial' },
    { id: 'ar', name: 'Cuentas por cobrar' },
    { id: 'ap', name: 'Cuentas por pagar' },
    { id: 'diario', name: 'Diario contable' },
    { id: 'impuestos', name: 'Impuestos' },
    { id: 'flujo', name: 'Flujo de caja' }
  ];

  useEffect(() => {
    if (authLoading || !user) return;
    let ready = 0;
    const markReady = () => { ready += 1; if (ready >= 2) setLoading(false); };
    const unsubs = [
      onSnapshot(collection(db, 'invoices'), snap => {
        setInvoices(snap.docs.map(item => ({ id: item.id, ...item.data() } as FinancialRecord)));
        markReady();
      }, error => {
        console.warn('Accounting invoices listener:', error.message);
        setSourceErrors(current => [...current.filter(x => x !== 'invoices'), 'invoices']);
        markReady();
      }),
      onSnapshot(collection(db, 'expenses'), snap => {
        setExpenses(snap.docs.map(item => ({ id: item.id, ...item.data() } as FinancialRecord)));
        markReady();
      }, error => {
        // A missing/unavailable expenses collection must not be presented as zero spend.
        console.warn('Accounting expenses listener:', error.message);
        setSourceErrors(current => [...current.filter(x => x !== 'expenses'), 'expenses']);
        markReady();
      })
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [user, authLoading]);

  const invoiceRows = useMemo(() => invoices.filter(row => getCurrency(row) === currency), [invoices, currency]);
  const expenseRows = useMemo(() => expenses.filter(row => getCurrency(row) === currency), [expenses, currency]);
  const currencyUnknown = useMemo(() => [...invoices, ...expenses].filter(row => !getCurrency(row)).length, [invoices, expenses]);
  const receivable = invoiceRows.filter(row => !isPaid(row));
  const payable = expenseRows.filter(row => !isPaid(row));
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

  const recordTable = (rows: FinancialRecord[], kind: 'invoice' | 'expense') => {
    if (rows.length === 0) return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No hay registros disponibles para {currency}. Los datos se mostrarán aquí cuando existan documentos con moneda y estado de pago registrados.</div>;
    return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Concepto</th><th className="px-4 py-3">Cliente / proveedor</th><th className="px-4 py-3">Vencimiento</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Importe</th></tr></thead><tbody>{rows.map(row => { const due = getDueDate(row); const status = getStatus(row) || 'sin estado'; return <tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-800">{row.description || row.concept || row.title || (kind === 'invoice' ? 'Factura' : 'Gasto')}</td><td className="px-4 py-3 text-slate-600">{row.client || row.clientName || row.vendor || row.supplier || '—'}</td><td className="px-4 py-3 text-slate-600">{due ? due.toLocaleDateString('pt-BR') : '—'}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{status}</span></td><td className="px-4 py-3 text-right font-semibold text-slate-800">{formatMoney(getAmount(row), currency)}</td></tr>; })}</tbody></table></div>;
  };

  return <div className="space-y-6 text-slate-800">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="mb-1 text-xs font-bold uppercase tracking-[.18em] text-[#4285F4]">Kaivincia · Finance</p><h1 className="text-2xl font-bold tracking-tight">Contabilidad y control financiero</h1><p className="mt-1 text-sm text-slate-500">Datos conectados a facturación y gastos registrados. Sin cifras de demostración.</p></div>
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm"><span className="text-slate-500">Moneda</span><select value={currency} onChange={event => setCurrency(event.target.value)} className="bg-transparent font-semibold outline-none"><option value="BRL">BRL · Real</option><option value="USD">USD · Dólar</option></select></label>
    </header>

    {pendingSource && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle className="h-5 w-5 shrink-0" /><div><strong>Conexión financiera incompleta.</strong><p className="mt-1">No se pudieron leer todas las fuentes: {sourceErrors.join(', ')}. Los importes pueden estar incompletos; no se interpretan como cero.</p></div></div>}
    {currencyUnknown > 0 && <p className="text-xs text-slate-500">{currencyUnknown} registro(s) no indican moneda y se excluyen de los totales por divisa. No se aplica una tasa de cambio inventada.</p>}

    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label:'Por cobrar', value:openReceivables, icon:DollarSign, tone:'text-[#34A853]', detail:receivable.length+' documentos abiertos' },{ label:'Por pagar', value:openPayables, icon:FileText, tone:'text-[#EA4335]', detail:payable.length+' documentos abiertos' },{ label:'Ingresos pagados', value:revenue, icon:TrendingUp, tone:'text-[#4285F4]', detail:'Facturas marcadas como pagadas' },{ label:'Resultado registrado', value:netResult, icon:Calculator, tone:netResult >= 0 ? 'text-[#34A853]' : 'text-[#EA4335]', detail:'Ingresos pagados menos gastos pagados' }].map(card => <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{card.label}</p><card.icon className={'h-5 w-5 '+card.tone}/></div><p className="mt-4 text-2xl font-bold tracking-tight">{loading ? '—' : formatMoney(card.value, currency)}</p><p className="mt-2 text-xs text-slate-500">{card.detail}</p></div>)}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 p-2">{tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={'whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold transition '+(activeTab === tab.id ? 'bg-[#E8F0FE] text-[#1A73E8]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800')}>{tab.name}</button>)}</nav>
      <div className="space-y-5 p-4 sm:p-6">
        {activeTab === 'dre' && <><div><h2 className="text-lg font-semibold">DRE gerencial</h2><p className="mt-1 text-sm text-slate-500">Resumen provisional calculado solo con registros marcados como pagados en {currency}. No sustituye el cierre contable ni el cálculo fiscal.</p></div><div className="max-w-3xl divide-y divide-slate-100 rounded-xl border border-slate-200 p-4 sm:p-6">{[{label:'Receita / ingresos pagados',value:revenue},{label:'(-) Gastos pagados',value:-expensesPaid},{label:'Resultado registrado',value:netResult}].map((row,index)=><div key={row.label} className={'flex justify-between gap-4 py-4 '+(index===2?'text-base font-bold':'text-sm')+(index===2?(row.value>=0?' text-[#188038]':' text-[#D93025]'):'')}><span>{row.label}</span><span>{formatMoney(row.value,currency)}</span></div>)}</div></>}
        {activeTab === 'ar' && <><div><h2 className="text-lg font-semibold">Cuentas por cobrar</h2><p className="mt-1 text-sm text-slate-500">{overdueReceivables.length} factura(s) con vencimiento pasado según los campos disponibles.</p></div>{recordTable(receivable,'invoice')}</>}
        {activeTab === 'ap' && <><div><h2 className="text-lg font-semibold">Cuentas por pagar</h2><p className="mt-1 text-sm text-slate-500">Gastos y obligaciones pendientes que existen en la colección de gastos.</p></div>{recordTable(payable,'expense')}</>}
        {activeTab === 'diario' && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center"><Calculator className="mx-auto mb-3 h-8 w-8 text-slate-300"/><h2 className="font-semibold">Diario contable</h2><p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Pendiente de implementar: catálogo de cuentas, asientos de débito/crédito, validación de balance y trazabilidad de cambios. No se crean asientos automáticos sin reglas contables aprobadas.</p></div>}
        {activeTab === 'impuestos' && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center"><Calendar className="mx-auto mb-3 h-8 w-8 text-slate-300"/><h2 className="font-semibold">Calendario fiscal de Brasil</h2><p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Pendiente de configurar régimen tributario, obligaciones aplicables y fechas oficiales. No se muestran vencimientos ficticios.</p></div>}
        {activeTab === 'flujo' && <><div><h2 className="text-lg font-semibold">Flujo de caja registrado</h2><p className="mt-1 text-sm text-slate-500">Saldo neto calculado de entradas y salidas marcadas como pagadas; no es una previsión bancaria.</p></div><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl bg-blue-50 p-4"><p className="text-sm text-slate-500">Entradas</p><p className="mt-2 text-xl font-bold">{formatMoney(revenue,currency)}</p></div><div className="rounded-xl bg-red-50 p-4"><p className="text-sm text-slate-500">Salidas</p><p className="mt-2 text-xl font-bold">{formatMoney(expensesPaid,currency)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Neto registrado</p><p className="mt-2 text-xl font-bold">{formatMoney(netResult,currency)}</p></div></div></>}
      </div>
    </section>
    <footer className="flex items-center gap-2 text-xs text-slate-400"><RefreshCw className="h-3.5 w-3.5"/> Actualización en tiempo real desde Firestore cuando hay sesión autenticada. Las divisas se calculan por separado, sin conversión automática.</footer>
  </div>;
}
