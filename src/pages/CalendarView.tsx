import { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { X, CalendarDays, Link2, Unlink } from 'lucide-react';
import { KaiCard } from '../components/design-system/NativeUI';

const locales = {
  'es': es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: 'task' | 'interaction' | 'appointment';
  allDay?: boolean;
}

export default function CalendarView() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '' });
  const [googleCalendar, setGoogleCalendar] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null });
  const [calendarNotice, setCalendarNotice] = useState('');
  const [calendarBusy, setCalendarBusy] = useState(false);

  const refreshGoogleCalendarStatus = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/google-calendar?action=status', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) return;
      const status = await response.json();
      setGoogleCalendar({ connected: Boolean(status.connected), email: status.email || null });
    } catch (error) { console.error('No se pudo consultar Google Calendar', error); }
  };

  useEffect(() => { if (!authLoading && user) void refreshGoogleCalendarStatus(); }, [user, authLoading]);

  const connectGoogleCalendar = async () => {
    setCalendarBusy(true); setCalendarNotice('');
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Inicia sesión para conectar Google Calendar.');
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/google-calendar?action=start', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || 'No se pudo iniciar la conexión.');
      window.location.assign(result.url);
    } catch (error) { setCalendarNotice(error instanceof Error ? error.message : 'Error de conexión'); setCalendarBusy(false); }
  };

  const disconnectGoogleCalendar = async () => {
    if (!window.confirm('¿Desconectar Google Calendar de esta cuenta?')) return;
    setCalendarBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/google-calendar?action=disconnect', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
      if (!response.ok) throw new Error('No se pudo desconectar Google Calendar.');
      setGoogleCalendar({ connected: false, email: null }); setCalendarNotice('Google Calendar desconectado.');
    } catch (error) { setCalendarNotice(error instanceof Error ? error.message : 'Error al desconectar'); }
    finally { setCalendarBusy(false); }
  };

  useEffect(() => {
    if (authLoading || !user) return;

    let taskEvents: CalendarEvent[] = [];
    let clientEvents: CalendarEvent[] = [];
    let appointmentEvents: CalendarEvent[] = [];

    const syncEvents = () => {
      setEvents([...taskEvents, ...clientEvents, ...appointmentEvents]);
    };

    // Fetch Tasks
    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      taskEvents = snapshot.docs.map(doc => {
        const data = doc.data();
        const date = data.dueDate ? new Date(data.dueDate) : new Date();
        return {
          id: doc.id,
          title: `[Tarea] ${data.title}`,
          start: date,
          end: date,
          type: 'task' as const,
          allDay: true
        };
      });
      syncEvents();
    }, (error) => handleFirestoreError(error, OperationType.GET, 'tasks'));

    // Fetch Interactions/Clients
    const unsubClients = onSnapshot(collection(db, 'clients'), (clientSnap) => {
      clientEvents = clientSnap.docs
        .filter(doc => doc.data().contactDate)
        .map(doc => {
          const data = doc.data();
          const date = new Date(data.contactDate);
          return {
            id: `client-${doc.id}`,
            title: `[Contacto] ${data.name}`,
            start: date,
            end: date,
            type: 'interaction' as const,
            allDay: true
          };
        });
      syncEvents();
    }, (error) => handleFirestoreError(error, OperationType.GET, 'clients'));

    // Fetch Appointments (Agenda & Reuniones)
    const unsubAppointments = onSnapshot(collection(db, 'appointments'), (apptSnap) => {
      appointmentEvents = apptSnap.docs.map(doc => {
        const data = doc.data();
        let startDate = new Date();
        if (data.date) {
          startDate = new Date(`${data.date}T${data.time || '10:00'}`);
        }
        const endDate = new Date(startDate.getTime() + (data.durationMinutes || 45) * 60000);
        return {
          id: `appt-${doc.id}`,
          title: `📅 [Cita] ${data.leadName || data.title || 'Reunión'} (${data.assignedAgent || 'TLMK'})`,
          start: startDate,
          end: endDate,
          type: 'appointment' as const,
          allDay: false
        };
      });
      syncEvents();
      if (googleCalendar.connected && auth.currentUser) {
        void auth.currentUser.getIdToken().then(token => Promise.all(apptSnap.docs.map(async appointment => {
          const data = appointment.data();
          if (!data.date) return;
          const start = new Date(`${data.date}T${data.time || '10:00'}`);
          if (!Number.isFinite(start.getTime())) return;
          const end = new Date(start.getTime() + Number(data.durationMinutes || 45) * 60000);
          const response = await fetch('/api/google-calendar?action=create-event', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'Kaivincia: ' + String(data.leadName || data.title || 'Reunión'),
              description: 'Cita de Kaivincia. Agente asignado: ' + String(data.assignedAgent || 'No asignado'),
              start: start.toISOString(), end: end.toISOString(), sourceId: 'appointment-' + appointment.id
            })
          });
          if (!response.ok) console.warn('No se pudo sincronizar cita con Google Calendar', appointment.id);
        }))).catch(error => console.warn('Error sincronizando citas con Google Calendar', error));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'appointments'));

    return () => {
      unsubTasks();
      unsubClients();
      unsubAppointments();
    };
  }, [user, authLoading, googleCalendar.connected]);

  const handleSelectSlot = (slotInfo: { start: Date }) => {
    setSelectedDate(slotInfo.start);
    setIsModalOpen(true);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !newTask.title) return;

    try {
      const taskRef = await addDoc(collection(db, 'tasks'), {
        title: newTask.title,
        description: newTask.description,
        dueDate: selectedDate.toISOString(),
        status: 'pending',
        assignedTo: auth.currentUser?.uid || 'unassigned',
        createdAt: new Date().toISOString()
      });
      if (googleCalendar.connected && auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          const start = new Date(selectedDate); start.setHours(9, 0, 0, 0);
          const end = new Date(start.getTime() + 30 * 60000);
          const response = await fetch('/api/google-calendar?action=create-event', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Kaivincia: ' + newTask.title, description: newTask.description, start: start.toISOString(), end: end.toISOString(), sourceId: taskRef.id }) });
          if (!response.ok) setCalendarNotice('La tarea se guardó en Kaivincia, pero no se pudo copiar a Google Calendar.');
          else setCalendarNotice('Tarea guardada en Kaivincia y Google Calendar.');
        } catch { setCalendarNotice('La tarea se guardó en Kaivincia; la sincronización con Google Calendar falló.'); }
      }
      setIsModalOpen(false);
      setNewTask({ title: '', description: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const eventStyleGetter = (event: CalendarEvent) => {
    let backgroundColor = '#3b82f6'; // blue for tasks
    if (event.type === 'interaction') {
      backgroundColor = '#10b981'; // green for interactions
    } else if (event.type === 'appointment') {
      backgroundColor = '#06b6d4'; // cyan for appointments & meetings
    }
    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        opacity: 0.9,
        color: 'white',
        border: '0px',
        display: 'block',
        fontWeight: 'bold',
        fontSize: '11px'
      }
    };
  };

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)]">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Agenda & Reuniones</h2><p className="mt-1 text-sm text-gray-500">Conecta tu calendario personal con la agenda de Kaivincia.</p></div>
        {googleCalendar.connected ? <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CalendarDays size={17}/><span>Conectado: {googleCalendar.email}</span><button type="button" disabled={calendarBusy} onClick={disconnectGoogleCalendar} aria-label="Desconectar Google Calendar" className="rounded-lg p-1 hover:bg-emerald-100"><Unlink size={16}/></button></div> : <button type="button" disabled={calendarBusy} onClick={connectGoogleCalendar} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><Link2 size={16}/>{calendarBusy ? 'Conectando…' : 'Conectar Google Calendar'}</button>}
      </div>
      {calendarNotice && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{calendarNotice}</div>}
      {new URLSearchParams(window.location.search).get('googleCalendar') === 'connected' && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Google Calendar conectado a tu cuenta. Ya puedes sincronizar las nuevas tareas.</div>}
      {new URLSearchParams(window.location.search).get('googleCalendar') === 'email_mismatch' && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">El correo de Google debe coincidir con el correo verificado con el que iniciaste sesión en Kaivincia.</div>}

      <KaiCard className="h-full">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          culture="es"
          selectable
          onSelectSlot={handleSelectSlot}
          eventPropGetter={eventStyleGetter}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          messages={{
            next: "Siguiente",
            previous: "Anterior",
            today: "Hoy",
            month: "Mes",
            week: "Semana",
            day: "Día",
            agenda: "Agenda",
            date: "Fecha",
            time: "Hora",
            event: "Evento",
            noEventsInRange: "No hay eventos en este rango."
          }}
        />
      </KaiCard>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Nueva Tarea para {selectedDate && format(selectedDate, 'dd/MM/yyyy')}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Título</label>
                <input
                  required
                  type="text"
                  value={newTask.title}
                  onChange={e => setNewTask({...newTask, title: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#00F0FF] focus:ring-[#00F0FF] sm:text-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                <textarea
                  value={newTask.description}
                  onChange={e => setNewTask({...newTask, description: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#00F0FF] focus:ring-[#00F0FF] sm:text-sm p-2 border"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-black bg-[#00F0FF] border border-transparent rounded-md hover:bg-[#00BFFF]"
                >
                  Guardar Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
