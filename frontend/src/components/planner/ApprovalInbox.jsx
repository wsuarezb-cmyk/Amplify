import { useEffect, useMemo, useState } from 'react';
import { createPlannerDecision, getPlannerApprovalFilters, getPlannerApprovalRequests, getPlannerDecisionHistory } from '../../services/api.js';

const STATUS_OPTIONS = [
  { value: 'ATENDER', label: 'Por atender', statuses: ['PENDIENTE', 'MODIFICADA'] },
  { value: 'PENDIENTE', label: 'Pendiente', statuses: ['PENDIENTE'] },
  { value: 'MODIFICADA', label: 'Modificada', statuses: ['MODIFICADA'] },
  { value: 'AUTORIZADA', label: 'Autorizada', statuses: ['AUTORIZADA'] },
  { value: 'REPROGRAMADA', label: 'Reprogramada', statuses: ['REPROGRAMADA'] },
  { value: 'TODAS', label: 'Todas', statuses: ['PENDIENTE', 'MODIFICADA', 'AUTORIZADA', 'REPROGRAMADA'] },
];
const PRIORITIES = [
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'BAJA', label: 'Baja' },
];

function dateKey(date) {
  const now = date || new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function titleFor(request) {
  return request.titulo || request.proyecto || 'Solicitud sin título';
}

function countryCodes(request) {
  return (request.pais_codigo || '').split(',').map(code => code.trim()).filter(Boolean);
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function statusLabel(status) {
  return {
    PENDIENTE: 'Pendiente',
    MODIFICADA: 'Modificada',
    AUTORIZADA: 'Autorizada',
    REPROGRAMADA: 'Reprogramada',
  }[status] || status;
}

function countConflicts(requests, selected, date) {
  const selectedCountries = countryCodes(selected);
  return requests.filter(item => item.sp_item_id !== selected.sp_item_id
    && item.fecha_calendario === date
    && countryCodes(item).some(code => selectedCountries.includes(code))).length;
}

export default function ApprovalInbox() {
  const [requests, setRequests] = useState([]);
  const [filterOptions, setFilterOptions] = useState({});
  const [statusFilter, setStatusFilter] = useState('ATENDER');
  const [countryFilter, setCountryFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [priority, setPriority] = useState('');
  const [reprogramming, setReprogramming] = useState(false);
  const [approvedDate, setApprovedDate] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getPlannerApprovalRequests(), getPlannerApprovalFilters()])
      .then(([rows, filters]) => {
        if (active) {
          setRequests(rows);
          setFilterOptions(filters);
          setError(null);
        }
      })
      .catch(requestError => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setHistory([]);
      return undefined;
    }
    let active = true;
    getPlannerDecisionHistory(selectedId)
      .then(rows => { if (active) setHistory(rows); })
      .catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [selectedId, historyVersion]);

  const selected = requests.find(item => item.sp_item_id === selectedId) || null;
  const statusCounts = useMemo(() => Object.fromEntries(
    STATUS_OPTIONS.map(option => [
      option.value,
      requests.filter(item => option.statuses.includes(item.estado)).length,
    ]),
  ), [requests]);

  const visibleRequests = useMemo(() => {
    const statuses = STATUS_OPTIONS.find(option => option.value === statusFilter)?.statuses || [];
    return requests.filter(item => statuses.includes(item.estado)
      && (!countryFilter || countryCodes(item).includes(countryFilter))
      && (!projectFilter || item.proyecto === projectFilter)
      && (!areaFilter || item.area === areaFilter)
      && (!ownerFilter || item.responsable_nombre === ownerFilter)
      && (!priorityFilter || item.prioridad === priorityFilter));
  }, [requests, statusFilter, countryFilter, projectFilter, areaFilter, ownerFilter, priorityFilter]);

  async function reloadRequests() {
    const rows = await getPlannerApprovalRequests();
    setRequests(rows);
    setHistoryVersion(version => version + 1);
  }

  async function submitDecision(action) {
    if (!selected || !priority) {
      setMessage({ type: 'error', text: 'Selecciona una prioridad antes de decidir.' });
      return;
    }
    if (action === 'REPROGRAMAR' && (!approvedDate || !reason.trim())) {
      setMessage({ type: 'error', text: 'La nueva fecha y el motivo son obligatorios para reprogramar.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await createPlannerDecision(selected.sp_item_id, {
        accion: action,
        prioridad,
        fecha_aprobada: action === 'REPROGRAMAR' ? approvedDate : null,
        motivo: action === 'REPROGRAMAR' ? reason.trim() : null,
        decision_esperada: selected.decision_id,
      });
      await reloadRequests();
      setReprogramming(false);
      setReason('');
      setMessage({ type: 'success', text: action === 'AUTORIZAR' ? 'Solicitud autorizada.' : 'Solicitud reprogramada.' });
    } catch (decisionError) {
      setMessage({ type: 'error', text: decisionError.message || 'No se pudo guardar la decisión.' });
      if (decisionError.message?.includes('recárgala')) {
        try { await reloadRequests(); } catch { /* mantener el error original visible */ }
      }
    } finally {
      setSaving(false);
    }
  }

  const conflictCount = selected && approvedDate
    ? countConflicts(requests, selected, approvedDate)
    : 0;
  const needsDecision = selected && ['PENDIENTE', 'MODIFICADA'].includes(selected.estado);

  return (
    <section className="approval-inbox" aria-label="Lista y aprobaciones">
      <div className="approval-heading">
        <div><h2>Lista y aprobaciones</h2><p>Revisa las solicitudes del formulario externo y define prioridad y fecha.</p></div>
        <span className="approval-total">{requests.length} solicitudes</span>
      </div>

      {error && <p className="planner-message error" role="alert">No se pudieron cargar las solicitudes: {error}</p>}
      {message && <p className={`planner-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

      <div className="approval-status-tabs" role="tablist" aria-label="Filtrar por estado">
        {STATUS_OPTIONS.map(option => <button
          type="button"
          role="tab"
          aria-selected={statusFilter === option.value}
          className={statusFilter === option.value ? 'selected' : ''}
          key={option.value}
          onClick={() => setStatusFilter(option.value)}
        >{option.label}<b>{statusCounts[option.value] || 0}</b></button>)}
      </div>

      <div className="approval-filters" aria-label="Filtros de solicitudes">
        <label>País<select value={countryFilter} onChange={event => setCountryFilter(event.target.value)}>
          <option value="">Todos</option>{(filterOptions.pais_codigo || []).map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Proyecto<select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
          <option value="">Todos</option>{(filterOptions.proyecto || []).map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Área<select value={areaFilter} onChange={event => setAreaFilter(event.target.value)}>
          <option value="">Todas</option>{(filterOptions.area || []).map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Responsable<select value={ownerFilter} onChange={event => setOwnerFilter(event.target.value)}>
          <option value="">Todos</option>{(filterOptions.responsable_nombre || []).map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Prioridad<select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}>
          <option value="">Todas</option>{(filterOptions.prioridad || []).map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button className="approval-clear" type="button" onClick={() => {
          setCountryFilter(''); setProjectFilter(''); setAreaFilter(''); setOwnerFilter(''); setPriorityFilter('');
        }}>Limpiar filtros</button>
      </div>

      <div className="approval-workspace">
        <div className="approval-list" aria-label="Solicitudes">
          {loading && <p className="approval-empty">Cargando solicitudes…</p>}
          {!loading && !error && visibleRequests.length === 0 && <p className="approval-empty">No hay solicitudes en este estado con los filtros seleccionados.</p>}
          {visibleRequests.map(item => <button
            type="button"
            className={`approval-ticket${selectedId === item.sp_item_id ? ' active' : ''}`}
            key={item.sp_item_id}
            onClick={() => {
              setSelectedId(item.sp_item_id);
              setPriority(item.prioridad || '');
              setApprovedDate(item.fecha_aprobada || '');
              setReprogramming(false);
              setReason('');
              setMessage(null);
            }}
          >
            <span className="approval-ticket-top"><b>SOL-{item.sp_item_id}</b><span className={`approval-state state-${item.estado?.toLowerCase()}`}>{statusLabel(item.estado)}</span></span>
            <strong>{titleFor(item)}</strong>
            <span className="approval-ticket-meta">{countryCodes(item).join(', ') || 'Sin país'} · {item.area || 'Sin área'}</span>
            <span className="approval-ticket-date">Solicitada: {formatDate(item.fecha_publicacion)}</span>
          </button>)}
        </div>

        <article className="approval-detail">
          {!selected && <div className="approval-empty approval-detail-empty">Selecciona una solicitud para revisar sus datos y decidir.</div>}
          {selected && <>
            <header className="approval-detail-header">
              <div><span className="approval-detail-id">SOL-{selected.sp_item_id} · {countryCodes(selected).join(', ') || 'Sin país'}</span><h3>{titleFor(selected)}</h3></div>
              <span className={`approval-state state-${selected.estado.toLowerCase()}`}>{statusLabel(selected.estado)}</span>
            </header>
            {selected.estado === 'MODIFICADA' && <p className="approval-modified-alert">La solicitud cambió en el formulario después de la última decisión. Revísala antes de decidir nuevamente.</p>}
            <dl className="approval-facts">
              <div><dt>Proyecto</dt><dd>{selected.proyecto || 'Sin proyecto'}</dd></div>
              <div><dt>Área</dt><dd>{selected.area || 'Sin área'}</dd></div>
              <div><dt>Responsable</dt><dd>{selected.responsable_nombre || 'Sin responsable'}</dd></div>
              <div><dt>Fecha de solicitud</dt><dd>{formatDate(selected.fecha_solicitud)}</dd></div>
              <div><dt>Fecha solicitada</dt><dd>{formatDate(selected.fecha_publicacion)}</dd></div>
              <div><dt>Fecha aprobada</dt><dd>{formatDate(selected.fecha_aprobada)}</dd></div>
              <div><dt>Prioridad actual</dt><dd>{selected.prioridad || 'Sin asignar'}</dd></div>
              <div><dt>Tipo de material</dt><dd>{selected.tipo_comunicado || 'Sin especificar'}</dd></div>
              {selected.descripcion && <div className="approval-fact-wide"><dt>Descripción</dt><dd>{selected.descripcion}</dd></div>}
            </dl>

            {needsDecision && <div className="approval-decision-form">
              <label className="planner-field">Prioridad *<select value={priority} onChange={event => setPriority(event.target.value)} required>
                <option value="">Selecciona prioridad</option>{PRIORITIES.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select></label>
              {!reprogramming ? <div className="approval-actions">
                <button className="planner-primary" type="button" disabled={saving} onClick={() => submitDecision('AUTORIZAR')}>{saving ? 'Guardando…' : 'Autorizar'}</button>
                <button className="planner-secondary" type="button" disabled={saving} onClick={() => setReprogramming(true)}>Modificar fecha</button>
              </div> : <>
                <label className="planner-field">Nueva fecha de publicación *<input type="date" min={dateKey()} value={approvedDate} onChange={event => setApprovedDate(event.target.value)} required /></label>
                <label className="planner-field">Motivo de la reprogramación *<textarea rows="3" value={reason} onChange={event => setReason(event.target.value)} required /></label>
                {conflictCount > 0 && <p className="planner-message warning">Hay {conflictCount} comunicación(es) aprobada(s) para ese país y fecha. Puedes reprogramar igualmente.</p>}
                <div className="approval-actions">
                  <button className="planner-primary" type="button" disabled={saving} onClick={() => submitDecision('REPROGRAMAR')}>{saving ? 'Guardando…' : 'Guardar nueva fecha'}</button>
                  <button className="planner-secondary" type="button" disabled={saving} onClick={() => setReprogramming(false)}>Cancelar</button>
                </div>
              </>}
            </div>}

            <section className="approval-history">
              <h4>Historial de decisiones</h4>
              {history.length === 0 ? <p>Sin decisiones previas.</p> : history.map(item => <div className="approval-history-row" key={item.decision_id}>
                <span>{formatDateTime(item.decidido_at)} · {item.decidido_por}</span>
                <strong>{item.accion === 'AUTORIZAR' ? 'Autorizada' : 'Reprogramada'} · {item.prioridad}</strong>
                <span>Fecha aprobada: {formatDate(item.fecha_aprobada)}</span>
                {item.motivo && <p>{item.motivo}</p>}
              </div>)}
            </section>
          </>}
        </article>
      </div>
    </section>
  );
}