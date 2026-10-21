import { useMemo, useState } from 'react';
import {
  CalendarLtrRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DismissRegular,
  AddRegular,
} from '@fluentui/react-icons';
import './Planner.css';

const COUNTRIES = ['CL', 'CO', 'PE'];
const CHANNELS = ['Email', 'WhatsApp', 'Seller Center', 'SMS'];
const OWNERS = ['Ana María L.', 'Camila F.', 'Kristel Z.', 'Steffano Q.', 'Jair G.', 'William S.'];
const COUNTRY_COLORS = { CL: '#E97132', CO: '#3B5BA5', PE: '#2E8B62' };
const INITIAL_REQUESTS = [
  { id: 'COM-1040', title: 'Cyber Day: preparación de stock', country: 'CL', channel: 'Email', date: '2026-10-05', status: 'Enviado', priority: 'Alta', audience: 'Sellers FBF activos', owner: 'Ana María L.' },
  { id: 'COM-1041', title: 'Nueva política de devoluciones', country: 'CO', channel: 'Email', date: '2026-10-07', status: 'Enviado', priority: 'Alta', audience: 'Todos activos CO', owner: 'Camila F.' },
  { id: 'COM-1042', title: 'Trigger F.media: 5 SKUs', country: 'CL', channel: 'Email', date: '2026-10-09', status: 'Enviado', priority: 'Media', audience: 'Nuevos con 5 SKUs', owner: 'Kristel Z.' },
  { id: 'COM-1043', title: 'Webinar Promociones Q4', country: 'PE', channel: 'Email', date: '2026-10-14', status: 'Programado', priority: 'Media', audience: 'Sellers con Promos', owner: 'Steffano Q.' },
  { id: 'COM-1044', title: 'Recordatorio facturación', country: 'CO', channel: 'WhatsApp', date: '2026-10-14', status: 'Aprobado', priority: 'Alta', audience: 'Todos activos CO', owner: 'Jair G.' },
  { id: 'COM-1045', title: 'Incidentes: monto a regularizar', country: 'CL', channel: 'Email', date: '2026-10-15', status: 'En revisión', priority: 'Alta', audience: 'Sellers con incidente', owner: 'William S.' },
  { id: 'COM-1046', title: 'Actualización datos legales', country: 'CO', channel: 'Email', date: '2026-10-15', status: 'En revisión', priority: 'Media', audience: 'Todos activos CO', owner: 'Ana María L.' },
  { id: 'COM-1047', title: 'F.boost: lanzamiento', country: 'CL', channel: 'Email', date: '2026-10-20', status: 'Borrador', priority: 'Media', audience: 'Alta adopción', owner: 'Camila F.' },
  { id: 'COM-1048', title: 'Black Friday: calendario', country: 'PE', channel: 'Seller Center', date: '2026-10-22', status: 'Borrador', priority: 'Alta', audience: 'Todos activos PE', owner: 'Kristel Z.' },
  { id: 'COM-1049', title: 'Encuesta NPS sellers', country: 'CL', channel: 'Email', date: '2026-10-27', status: 'Aprobado', priority: 'Baja', audience: 'Muestra NPS', owner: 'Steffano Q.' },
  { id: 'COM-1050', title: 'Cambio horario despacho', country: 'PE', channel: 'WhatsApp', date: '2026-10-28', status: 'Borrador', priority: 'Alta', audience: 'Sellers FBS PE', owner: 'Jair G.' },
  { id: 'COM-1051', title: 'Onboarding nuevos sellers', country: 'CO', channel: 'Email', date: '2026-10-30', status: 'Programado', priority: 'Media', audience: 'Nuevos 30 días', owner: 'William S.' },
];

const EMPTY_FORM = {
  title: '', country: 'CL', channel: 'Email', priority: 'Media', date: '',
  owner: OWNERS[0], audience: '', goal: '', notify: true,
};

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(date);
}

function conflictList(request, requests) {
  return requests.filter(item => item.date === request.date && item.country === request.country
    && (item.audience === request.audience || item.channel === request.channel));
}

export default function Planner() {
  const [view, setView] = useState('calendar');
  const [month, setMonth] = useState(() => new Date(2026, 9, 1));
  const [country, setCountry] = useState('Todos');
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, date: dateKey(2026, 9, 21) });
  const [message, setMessage] = useState(null);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const visibleRequests = useMemo(
    () => requests.filter(item => country === 'Todos' || item.country === country),
    [country, requests],
  );
  const monthEvents = visibleRequests.filter(item => {
    const date = new Date(`${item.date}T12:00:00`);
    return date.getFullYear() === year && date.getMonth() === monthIndex;
  });
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const calendarCells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  while (calendarCells.length % 7) calendarCells.push(null);

  function updateForm(event) {
    const { name, value, type, checked } = event.target;
    setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setMessage(null);
  }

  function verifyConflicts(event) {
    event.preventDefault();
    if (!form.date || !form.audience || !form.channel || !form.country) {
      setMessage({ type: 'error', text: 'Completa fecha, país, canal y audiencia para verificar.' });
      return;
    }
    const conflicts = conflictList(form, requests);
    setMessage(conflicts.length
      ? { type: 'warning', text: `Hay ${conflicts.length} posible(s) conflicto(s): ${conflicts.map(item => item.title).join(', ')}.` }
      : { type: 'success', text: 'Sin conflictos para esa fecha, país y audiencia.' });
  }

  function createRequest(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.date || !form.audience.trim() || !form.goal.trim()) {
      setMessage({ type: 'error', text: 'Completa los campos obligatorios antes de crear la solicitud.' });
      return;
    }
    const request = {
      ...form,
      id: `COM-${1040 + requests.length}`,
      title: form.title.trim(),
      audience: form.audience.trim(),
      status: 'Borrador',
    };
    setRequests(current => [...current, request]);
    setMonth(new Date(`${request.date}T12:00:00`));
    setCountry('Todos');
    setSelected(request);
    setForm({ ...EMPTY_FORM, date: request.date });
    setMessage({ type: 'success', text: `Solicitud ${request.id} creada como borrador.` });
    setView('calendar');
  }

  return (
    <section className="planner-page">
      <div className="planner-heading">
        <div>
          <div className="planner-eyebrow"><CalendarLtrRegular /> OPERACIÓN DE COMUNICACIONES</div>
          <h1>Planner</h1>
          <p>Organiza las comunicaciones y revisa su calendario de ejecución.</p>
        </div>
        <button className="planner-primary" onClick={() => { setView('request'); setMessage(null); }}>
          <AddRegular /> Nueva solicitud
        </button>
      </div>

      <div className="planner-tabs" role="tablist" aria-label="Vistas de Planner">
        <button className={view === 'calendar' ? 'active' : ''} role="tab" aria-selected={view === 'calendar'} onClick={() => setView('calendar')}>Calendario</button>
        <button className={view === 'request' ? 'active' : ''} role="tab" aria-selected={view === 'request'} onClick={() => { setView('request'); setMessage(null); }}>Nueva solicitud</button>
      </div>
      {view === 'calendar' && message?.type === 'success' && <p className="planner-message success" role="status">{message.text}</p>}

      {view === 'calendar' ? (
        <>
          <div className="planner-summary" aria-label="Resumen de solicitudes">
            {['Borrador', 'En revisión', 'Aprobado', 'Programado'].map(status => (
              <div className="planner-stat" key={status}>
                <span>{status}</span><strong>{visibleRequests.filter(item => item.status === status).length}</strong>
              </div>
            ))}
            <div className="planner-stat"><span>Conflictos</span><strong className="planner-alert">{monthEvents.filter(item => conflictList(item, monthEvents).length).length}</strong></div>
          </div>

          <div className="planner-calendar-toolbar">
            <div className="planner-month-controls">
              <button aria-label="Mes anterior" title="Mes anterior" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeftRegular /></button>
              <h2>{monthLabel(month)}</h2>
              <button aria-label="Mes siguiente" title="Mes siguiente" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRightRegular /></button>
            </div>
            <div className="planner-country-filter" aria-label="Filtrar por país">
              {['Todos', ...COUNTRIES].map(option => <button key={option} className={country === option ? 'selected' : ''} onClick={() => setCountry(option)}>{option}</button>)}
            </div>
          </div>

          <div className="planner-calendar" role="grid" aria-label={`Calendario de ${monthLabel(month)}`}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <div className="planner-weekday" role="columnheader" key={day}>{day}</div>)}
            {calendarCells.map((day, index) => {
              const key = day ? dateKey(year, monthIndex, day) : null;
              const dayEvents = key ? monthEvents.filter(item => item.date === key) : [];
              const isToday = key === todayKey;
              return (
                <div className={`planner-day${day ? '' : ' empty'}${isToday ? ' today' : ''}`} role="gridcell" key={key || `empty-${index}`}>
                  {day && <><span className="planner-day-number">{day}{isToday && <small>Hoy</small>}</span>
                    <div className="planner-day-events">
                      {dayEvents.map(item => <button key={item.id} className={`planner-event${conflictList(item, monthEvents).length ? ' conflict' : ''}`} style={{ '--event-color': COUNTRY_COLORS[item.country] }} onClick={() => setSelected(item)} title={`${item.country} · ${item.title}`}>
                        <span>{item.country}</span>{item.title}
                      </button>)}
                    </div>
                  </>}
                </div>
              );
            })}
          </div>
          <div className="planner-legend">
            {COUNTRIES.map(code => <span key={code}><i style={{ background: COUNTRY_COLORS[code] }} />{code}</span>)}
            <span className="planner-conflict-key"><i />Conflicto de fecha/canal/audiencia</span>
          </div>
          {selected && <aside className="planner-detail" aria-live="polite">
            <div><span className="planner-detail-id">{selected.id} · {selected.country} · {selected.channel}</span><h3>{selected.title}</h3>
              <p>{selected.date} <span>·</span> {selected.audience} <span>·</span> Responsable: {selected.owner}</p></div>
            <span className={`planner-status status-${selected.status.replaceAll(' ', '-').toLowerCase()}`}>{selected.status}</span>
            <button className="planner-icon-button" aria-label="Cerrar detalle" onClick={() => setSelected(null)}><DismissRegular /></button>
          </aside>}
        </>
      ) : (
        <div className="planner-request-layout">
          <form className="planner-form" onSubmit={createRequest}>
            <div className="planner-form-title"><div><h2>Plantilla de solicitud</h2><p>Los campos con * son obligatorios.</p></div></div>
            <label className="planner-field planner-field-full">Nombre de la comunicación *<input name="title" value={form.title} onChange={updateForm} placeholder="Ej. Recordatorio de cierre de facturación" required /></label>
            <div className="planner-fields-three">
              <label className="planner-field">País *<select name="country" value={form.country} onChange={updateForm}>{COUNTRIES.map(code => <option key={code}>{code}</option>)}</select></label>
              <label className="planner-field">Canal *<select name="channel" value={form.channel} onChange={updateForm}>{CHANNELS.map(channel => <option key={channel}>{channel}</option>)}</select></label>
              <label className="planner-field">Prioridad *<select name="priority" value={form.priority} onChange={updateForm}>{['Alta', 'Media', 'Baja'].map(value => <option key={value}>{value}</option>)}</select></label>
            </div>
            <div className="planner-fields-two">
              <label className="planner-field">Fecha de envío *<input type="date" name="date" value={form.date} onChange={updateForm} required /></label>
              <label className="planner-field">Responsable *<select name="owner" value={form.owner} onChange={updateForm}>{OWNERS.map(owner => <option key={owner}>{owner}</option>)}</select></label>
            </div>
            <label className="planner-field planner-field-full">Audiencia *<input name="audience" value={form.audience} onChange={updateForm} placeholder="Ej. Sellers activos de CL" required /></label>
            <label className="planner-field planner-field-full">Objetivo y criterio de aceptación *<textarea name="goal" value={form.goal} onChange={updateForm} rows="4" placeholder="¿Qué debe hacer el seller después de recibir la comunicación?" required /></label>
            <label className="planner-notify"><input type="checkbox" name="notify" checked={form.notify} onChange={updateForm} /> Avisar automáticamente a Soporte y Operaciones al confirmar</label>
            {message && <p className={`planner-message ${message.type}`} role="status">{message.text}</p>}
            <div className="planner-form-actions">
              <button className="planner-secondary" type="button" onClick={verifyConflicts}>Verificar conflictos</button>
              <button className="planner-primary" type="submit">Crear solicitud</button>
            </div>
          </form>
          <aside className="planner-process">
            <h2>Flujo de solicitud</h2>
            <ol>
              <li><span>1</span><div><b>Borrador</b><p>Solicitud creada con los campos requeridos.</p></div></li>
              <li><span>2</span><div><b>En revisión</b><p>Validación de contenido, audiencia y fecha.</p></div></li>
              <li><span>3</span><div><b>Aprobado</b><p>Aprobación humana antes de programar.</p></div></li>
              <li><span>4</span><div><b>Programado</b><p>Preparado para ejecutar en el canal correspondiente.</p></div></li>
              <li><span>5</span><div><b>Enviado</b><p>Confirmación y trazabilidad de la comunicación.</p></div></li>
            </ol>
            <div className="planner-rule"><b>Regla de conflicto</b><p>Misma fecha y país, con la misma audiencia o canal, requiere revisión antes de confirmar.</p></div>
          </aside>
        </div>
      )}
    </section>
  );
}
