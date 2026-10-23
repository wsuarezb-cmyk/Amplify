import { useEffect, useMemo, useState } from 'react';
import {
  CalendarLtrRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  ChevronDownRegular,
  DismissRegular,
  AddRegular,
} from '@fluentui/react-icons';
import './Planner.css';
import { createPlannerManualRequest, getPlannerManualRequests } from '../services/api.js';
import ApprovalInbox from '../components/planner/ApprovalInbox.jsx';

const COUNTRIES = ['CL', 'CO', 'PE'];
const COUNTRY_COLORS = { CL: '#E97132', CO: '#3B5BA5', PE: '#2E8B62' };
const COUNTRY_OPTIONS = [
  { label: 'Chile', code: 'CL' },
  { label: 'Perú', code: 'PE' },
  { label: 'Colombia', code: 'CO' },
];
const AUDIENCE_OPTIONS = [
  'Base segmentada de sellers',
  'Base completa de sellers',
  'Sellers internacionales',
];
const AREA_OPTIONS = [
  'Seller Experience', 'VAS', 'Home Delivery', 'Comercial', 'Finanzas', 'Producto', 'Otras',
];
const ACTION_OPTIONS = ['Nuevo', 'Modificación', 'Replicar envío'];
const MATERIAL_OPTIONS = ['Mail', 'Popup', 'Infografía', 'Template de soporte', 'Otras'];
const EMPTY_FORM = {
  area: '', areaOtra: '', pais: [], proyecto: '', accion: '', tipo_comunicado: [],
  tipoComunicadoOtra: '', fecha_envio: '', audiencia: '', url_sellers: '', descripcion: '',
};

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(date);
}

function countryCode(value) {
  const pais = value.trim().toLocaleLowerCase('es');
  if (pais.includes('chile') || pais === 'cl') return 'CL';
  if (pais.includes('colombia') || pais === 'co') return 'CO';
  if (pais.includes('perú') || pais.includes('peru') || pais === 'pe') return 'PE';
  return null;
}

function countriesFor(request) {
  return request.countries || [request.country || 'OT'];
}

function conflictList(request, requests) {
  const requestCountries = countriesFor(request);
  return requests.filter(item => item.id !== request.id
    && item.date === request.date
    && countriesFor(item).some(code => requestCountries.includes(code)));
}

function toCalendarEvent(request) {
  const countries = (request.pais || '').split(',').map(countryCode).filter(Boolean);
  return {
    id: `MAN-${request.manual_solicitud_id}`,
    title: request.proyecto || request.accion || 'Solicitud manual',
    country: countries.length === 1 ? countries[0] : countries.length ? 'MULTI' : 'OT',
    countries: countries.length ? countries : ['OT'],
    countryLabel: countries.length ? countries.join(', ') : 'OT',
    date: request.fecha_envio,
    status: 'Programado',
    priority: '',
    audience: request.audiencia || '',
    channel: request.tipo_comunicado || '',
    request,
  };
}

export default function Planner() {
  const [view, setView] = useState('calendar');
  const [requestType, setRequestType] = useState(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [country, setCountry] = useState('Todos');
  const [requests, setRequests] = useState([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, fecha_envio: dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) });
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;
    setManualLoading(true);
    getPlannerManualRequests()
      .then(rows => { if (active) setRequests(rows.map(toCalendarEvent)); })
      .catch(error => { if (active) setManualError(error.message); })
      .finally(() => { if (active) setManualLoading(false); });
    return () => { active = false; };
  }, []);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const visibleRequests = useMemo(
    () => requests.filter(item => country === 'Todos' || countriesFor(item).includes(country)),
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
    if (!form.fecha_envio || form.pais.length === 0) {
      setMessage({ type: 'error', text: 'Completa país y fecha de envío para verificar.' });
      return;
    }
    const eventDraft = {
      id: 'draft',
      date: form.fecha_envio,
      countries: form.pais.map(option => COUNTRY_OPTIONS.find(item => item.label === option)?.code).filter(Boolean),
    };
    const conflicts = conflictList(eventDraft, requests);
    setMessage(conflicts.length
      ? { type: 'warning', text: `Hay ${conflicts.length} comunicación(es) programada(s) del mismo país en esa fecha.` }
      : { type: 'success', text: 'Sin comunicaciones del mismo país y fecha.' });
  }

  async function createRequest(event) {
    event.preventDefault();
    const otherMaterialMissing = form.tipo_comunicado.includes('Otras') && !form.tipoComunicadoOtra.trim();
    if (!form.fecha_envio || form.pais.length === 0 || !form.audiencia || !form.area
      || (form.area === 'Otras' && !form.areaOtra.trim()) || !form.accion
      || form.tipo_comunicado.length === 0 || otherMaterialMissing) {
      setMessage({ type: 'error', text: 'Completa los campos obligatorios y especifica las opciones “Otras” seleccionadas.' });
      return;
    }
    setManualLoading(true);
    setMessage(null);
    try {
      const created = await createPlannerManualRequest({
        area: form.area === 'Otras' ? `Otras: ${form.areaOtra.trim()}` : form.area,
        pais: form.pais.join(', '),
        proyecto: form.proyecto.trim() || null,
        accion: form.accion,
        tipo_comunicado: [
          ...form.tipo_comunicado.filter(option => option !== 'Otras'),
          ...(form.tipo_comunicado.includes('Otras') ? [`Otras: ${form.tipoComunicadoOtra.trim()}`] : []),
        ].join(', '),
        fecha_envio: form.fecha_envio,
        audiencia: form.audiencia,
        url_sellers: form.url_sellers.trim() || null,
        descripcion: form.descripcion.trim() || null,
      });
      const request = toCalendarEvent(created);
      setRequests(current => [...current, request]);
      setMonth(new Date(`${request.date}T12:00:00`));
      setCountry('Todos');
      setSelected(request);
      setForm({ ...EMPTY_FORM, fecha_envio: request.date });
      setMessage({ type: 'success', text: 'Solicitud manual creada y programada en el calendario.' });
      setRequestType(null);
      setView('calendar');
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo crear la solicitud.' });
    } finally {
      setManualLoading(false);
    }
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
        <button className={view === 'approvals' ? 'active' : ''} role="tab" aria-selected={view === 'approvals'} onClick={() => { setView('approvals'); setRequestType(null); setMessage(null); }}>Lista y aprobaciones</button>
        <button className={view === 'request' ? 'active' : ''} role="tab" aria-selected={view === 'request'} onClick={() => { setView('request'); setMessage(null); }}>Nueva solicitud</button>
      </div>
      {view === 'calendar' && message?.type === 'success' && <p className="planner-message success" role="status">{message.text}</p>}

      {view === 'approvals' ? <ApprovalInbox /> : view === 'calendar' ? (
        <>
          <div className="planner-summary" aria-label="Resumen de solicitudes">
            <div className="planner-stat"><span>Solicitudes manuales</span><strong>{visibleRequests.length}</strong></div>
            <div className="planner-stat"><span>En este mes</span><strong>{monthEvents.length}</strong></div>
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
                      {dayEvents.map(item => <button key={item.id} className={`planner-event${conflictList(item, monthEvents).length ? ' conflict' : ''}`} style={{ '--event-color': COUNTRY_COLORS[item.country] || '#667085' }} onClick={() => setSelected(item)} title={`${item.countryLabel} · ${item.title}`}>
                        <span>{item.countryLabel}</span>{item.title}
                      </button>)}
                    </div>
                  </>}
                </div>
              );
            })}
          </div>
          <div className="planner-legend">
            {COUNTRIES.map(code => <span key={code}><i style={{ background: COUNTRY_COLORS[code] }} />{code}</span>)}
            {monthEvents.some(item => item.countries.includes('OT')) && <span><i style={{ background: '#667085' }} />Otros</span>}
            <span className="planner-conflict-key"><i />Otras comunicaciones el mismo día y país</span>
          </div>
          {manualError && <p className="planner-message error" role="alert">No se pudieron cargar las solicitudes manuales: {manualError}</p>}
          {selected && <aside className="planner-detail" aria-live="polite">
            <div><span className="planner-detail-id">{selected.id} · {selected.countryLabel}{selected.channel && ` · ${selected.channel}`}</span><h3>{selected.title}</h3>
              <p>{selected.date} <span>·</span> {selected.audience || 'Sin audiencia'} <span>·</span> Responsable: {selected.request?.responsable || selected.owner || 'Sin responsable'}</p></div>
            <span className={`planner-status status-${selected.status.replaceAll(' ', '-').toLowerCase()}`}>{selected.status}</span>
            <button className="planner-icon-button" aria-label="Cerrar detalle" onClick={() => setSelected(null)}><DismissRegular /></button>
          </aside>}
        </>
      ) : !requestType ? (
        <div className="planner-request-options">
          <div className="planner-form-title"><div><h2>¿Qué deseas programar?</h2><p>Elige el tipo de elemento que quieres agregar al calendario.</p></div></div>
          <div className="planner-option-grid">
            <button className="planner-option" onClick={() => setRequestType('plan')}>
              <span className="planner-option-mark">P</span>
              <span><b>Plan</b><small>Organizar una iniciativa o conjunto de comunicaciones.</small></span>
              <ChevronRightRegular />
            </button>
            <button className="planner-option" onClick={() => setRequestType('manual')}>
              <span className="planner-option-mark manual">+</span>
              <span><b>Solicitud manual</b><small>Programar una comunicación con los datos disponibles.</small></span>
              <ChevronRightRegular />
            </button>
          </div>
        </div>
      ) : requestType === 'plan' ? (
        <div className="planner-plan-placeholder">
          <button className="planner-back" onClick={() => setRequestType(null)}><ChevronLeftRegular /> Tipos de solicitud</button>
          <h2>Plan</h2>
          <p>La creación de planes estará disponible cuando estén definidos sus campos.</p>
        </div>
      ) : (
        <div className="planner-request-layout">
          <form className="planner-form" onSubmit={createRequest}>
            <div className="planner-form-title planner-form-title-row">
              <div><h2>Solicitud manual</h2><p>Completa fecha, países, área, acción, tipo de material y audiencia. Los demás campos son opcionales.</p></div>
              <button className="planner-back" type="button" onClick={() => { setRequestType(null); setMessage(null); }}><ChevronLeftRegular /> Cambiar tipo</button>
            </div>
            <div className="planner-fields-two">
              <div className="planner-field">
                <span className="planner-field-label">Países a los que aplica la solicitud *</span>
                <details className="planner-multi-dropdown">
                  <summary><span>{form.pais.length ? form.pais.join(', ') : 'Selecciona países'}</span><ChevronDownRegular /></summary>
                  <div className="planner-multi-menu">
                    {COUNTRY_OPTIONS.map(option => <label className="planner-multi-option" key={option.code}>
                      <input type="checkbox" checked={form.pais.includes(option.label)} onChange={() => {
                    setForm(current => ({
                      ...current,
                      pais: current.pais.includes(option.label)
                        ? current.pais.filter(value => value !== option.label)
                        : [...current.pais, option.label],
                    }));
                    setMessage(null);
                      }} />
                      <span>{option.label}</span>
                    </label>)}
                  </div>
                </details>
              </div>
              <label className="planner-field">Fecha de envío *<input type="date" name="fecha_envio" min={todayKey} value={form.fecha_envio} onChange={updateForm} required /></label>
            </div>
            <div className="planner-fields-two">
              <div className="planner-field">
                <label className="planner-field-label" htmlFor="planner-area">¿En qué área trabajas? *</label>
                <select id="planner-area" name="area" value={form.area} onChange={updateForm} required>
                  <option value="">Selecciona un área</option>
                  {AREA_OPTIONS.map(option => <option value={option} key={option}>{option}</option>)}
                </select>
                {form.area === 'Otras' && <label className="planner-other-field">Especifica el área
                  <input name="areaOtra" value={form.areaOtra} onChange={updateForm} required />
                </label>}
              </div>
              <label className="planner-field">Proyecto<input name="proyecto" value={form.proyecto} onChange={updateForm} /></label>
            </div>
            <div className="planner-fields-two">
              <label className="planner-field">Acción *<select name="accion" value={form.accion} onChange={updateForm} required>
                <option value="">Selecciona una acción</option>
                {ACTION_OPTIONS.map(option => <option value={option} key={option}>{option}</option>)}
              </select></label>
              <div className="planner-field">
                <span className="planner-field-label">Tipo de material *</span>
                <details className="planner-multi-dropdown">
                  <summary><span>{form.tipo_comunicado.length ? form.tipo_comunicado.join(', ') : 'Selecciona materiales'}</span><ChevronDownRegular /></summary>
                  <div className="planner-multi-menu">
                    {MATERIAL_OPTIONS.map(option => <label className="planner-multi-option" key={option}>
                      <input type="checkbox" checked={form.tipo_comunicado.includes(option)} onChange={() => {
                  setForm(current => ({
                    ...current,
                    tipo_comunicado: current.tipo_comunicado.includes(option)
                      ? current.tipo_comunicado.filter(value => value !== option)
                      : [...current.tipo_comunicado, option],
                  }));
                  setMessage(null);
                      }} />
                      <span>{option}</span>
                    </label>)}
                  </div>
                </details>
                {form.tipo_comunicado.includes('Otras') && <label className="planner-other-field">Especifica el tipo de material
                  <input name="tipoComunicadoOtra" value={form.tipoComunicadoOtra} onChange={updateForm} required />
                </label>}
              </div>
            </div>
            <label className="planner-field">¿Cuál es la audiencia del envío? *<select name="audiencia" value={form.audiencia} onChange={updateForm} required>
              <option value="">Selecciona una audiencia</option>
              {AUDIENCE_OPTIONS.map(option => <option value={option} key={option}>{option}</option>)}
            </select></label>
            <label className="planner-field planner-field-full">URL de sellers<input type="url" name="url_sellers" value={form.url_sellers} onChange={updateForm} placeholder="https://..." /></label>
            <label className="planner-field planner-field-full">Descripción<textarea name="descripcion" value={form.descripcion} onChange={updateForm} rows="4" /></label>
            {message && <p className={`planner-message ${message.type}`} role="status">{message.text}</p>}
            {manualError && <p className="planner-message error" role="alert">No se pudieron cargar las solicitudes anteriores: {manualError}</p>}
            <div className="planner-form-actions">
              <button className="planner-secondary" type="button" onClick={verifyConflicts}>Verificar conflictos</button>
              <button className="planner-primary" type="submit" disabled={manualLoading}>{manualLoading ? 'Guardando…' : 'Crear y programar'}</button>
            </div>
          </form>
          <aside className="planner-process">
            <h2>Programación</h2>
            <p className="planner-process-intro">La solicitud manual se guarda y aparece directamente en el calendario para la fecha seleccionada. No pasa por aprobación.</p>
            <div className="planner-rule"><b>Conflictos</b><p>La verificación informa cuántas comunicaciones del mismo país ya están programadas para esa fecha. No bloquea el registro.</p></div>
          </aside>
        </div>
      )}
    </section>
  );
}
