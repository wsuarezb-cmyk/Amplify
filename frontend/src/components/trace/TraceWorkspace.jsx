import { useState } from 'react';
import {
  ArrowDownloadRegular, ArrowTrendingRegular, CheckmarkCircleRegular, CursorClickRegular,
  DismissCircleRegular, EyeRegular, PersonRegular,
} from '@fluentui/react-icons';
import TraceEmbed from './TraceEmbed.jsx';
import AudienceGenerator from './AudienceGenerator.jsx';
import TraceSendReporting from './TraceSendReporting.jsx';
import TraceSendAlerts from './TraceSendAlerts.jsx';
import { Metric, number } from './traceCommon.jsx';
import {
  getTraceAudienceHistory,
  getTraceAudiences,
  getTraceSendDetail,
  getTraceSendSummary,
  exportTraceSendDetail,
} from '../../services/api.js';
import './TraceWorkspace.css';

const MODULES = [
  ['audiences', 'Generación de audiencias'],
  ['history', 'Historial'],
  ['sends', 'Seguimiento de envíos'],
  ['alerts', 'Alertas de envío'],
  ['looker', 'Looker Studio'],
];
const PAGE_SIZE = 50;
const SEND_COUNTRIES = [
  ['CL_Sellers', 'Chile'], ['PE_Sellers', 'Perú'], ['CO_Sellers', 'Colombia'],
];

function dateLabel(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  return value ? new Date(value).toLocaleDateString('es-CL') : 'Sin dato';
}

function rateLabel(value, denominator) {
  return denominator
    ? `${(value * 100 / denominator).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : '—';
}

function parseHistoryValue(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

const HISTORY_FILTER_LABELS = {
  contact_type: 'Tipo de contacto', has_sales: 'Tiene venta', seller_segment: 'Segmento',
  has_catalog: 'Tiene catálogo', seller_status: 'Estado seller', held: 'HELD',
  unsubscribed: 'Desuscrito', seller_delist: 'Seller delist', geography: 'Geografía',
  country: 'País', operational_exclusion: 'Exclusión operacional',
};

const HISTORY_VALUE_LABELS = {
  __NULL__: 'Sin dato', '1': 'Sí', '0': 'No', EXCLUDE: 'Excluir', KEEP: 'Mantener',
};

function historyFilters(item) {
  const filters = parseHistoryValue(item.filters_json, {});
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return [];
  return Object.entries(filters).filter(([, values]) => Array.isArray(values) && values.length)
    .map(([key, values]) => ({
      label: HISTORY_FILTER_LABELS[key] ?? key.replaceAll('_', ' '),
      value: values.map(value => value == null || value === '' ? '—' : HISTORY_VALUE_LABELS[value] ?? value).join(', '),
    }));
}

function HistoryDetail({ item }) {
  const filters = historyFilters(item);
  const exclusions = parseHistoryValue(item.exclusions_json, []);
  const warnings = parseHistoryValue(item.warnings_json, []);
  const exclusionItems = Array.isArray(exclusions) ? exclusions : [];
  const warningItems = Array.isArray(warnings) ? warnings : [];
  const searchLabels = { seller_id: 'Seller ID', rut: 'RUT', email: 'Email', phone: 'Teléfono', name: 'Nombre exacto' };

  return (
    <details className="trace-history-detail">
      <summary>Ver detalle</summary>
      <div className="trace-history-detail-panel">
        <section><strong>Filtros aplicados</strong>
          {filters.length ? <ul>{filters.map(filter => <li key={filter.label}><span>{filter.label}</span><span>{filter.value}</span></li>)}</ul> : <p>—</p>}
        </section>
        <section><strong>Exclusiones</strong>
          {exclusionItems.length ? <ul>{exclusionItems.map((stage, index) => (
            <li key={`${stage.rule ?? stage.label ?? 'stage'}-${index}`}>
              <span>{stage.label || 'Regla'}</span>
              <span>{stage.excluded_sellers == null ? '—' : `${stage.excluded_sellers} de ${stage.before_sellers ?? '—'} sellers excluidos`}
                {stage.remaining_sellers == null ? '' : ` · ${stage.remaining_sellers} restantes`}
                {stage.excluded_contacts == null ? '' : ` · ${stage.excluded_contacts} de ${stage.before_contacts ?? '—'} contactos excluidos`}
                {stage.variation_percent == null ? '' : ` · ${Number(stage.variation_percent).toFixed(2)}%`}</span>
            </li>
          ))}</ul> : <p>—</p>}
        </section>
        <section><strong>Advertencias</strong>
          {warningItems.length ? <ul>{warningItems.map((warning, index) => <li key={`${warning.code ?? 'warning'}-${index}`}>
            <span>{warning.message || warning.code || 'Advertencia'}{warning.severity ? ` · ${warning.severity}` : ''}{warning.requires_confirmation ? ' · requiere confirmación' : ''}</span>
          </li>)}</ul> : <p>—</p>}
        </section>
        <section className="trace-history-metadata"><span>Búsqueda: {searchLabels[item.search_type] || '—'}</span>
          <span>ID: {item.audience_id || '—'}</span><span>Archivo: {item.export_file_name || '—'}</span>
        </section>
      </div>
    </details>
  );
}

function HistoryFilterSummary({ filters }) {
  if (!filters.length) return <span className="trace-history-no-filters">—</span>;
  const visible = filters.slice(0, 2);
  return <div className="trace-history-filter-list">
    {visible.map(filter => <span key={filter.label}><strong>{filter.label}</strong>{filter.value}</span>)}
    {filters.length > visible.length && <span className="trace-history-filter-more">+{filters.length - visible.length} filtros</span>}
  </div>;
}

function HistoryVolume({ item }) {
  const values = [item.initial_sellers, item.found_sellers, item.final_sellers];
  const labels = ['Iniciales', 'Encontrados', 'Elegibles'];
  return <div className="trace-history-volume" aria-label={labels.map((label, index) => `${label}: ${values[index] == null ? 'sin dato' : number(values[index])}`).join('; ')}>
    {values.map((value, index) => <span key={labels[index]}><small>{labels[index]}</small><strong>{value == null ? '—' : number(value)}</strong></span>)}
  </div>;
}

function ErrorMessage({ children }) {
  return children ? <div className="trace-error" role="alert">{children}</div> : null;
}

function TraceWorkspace() {
  const [module, setModule] = useState('audiences');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sendTemplate, setSendTemplate] = useState('');
  const [sendMode, setSendMode] = useState('historical');
  const [sendAudiences, setSendAudiences] = useState({ items: [], page: 1, total: 0 });
  const [sendAudienceQuery, setSendAudienceQuery] = useState('');
  const [sendAudienceFrom, setSendAudienceFrom] = useState('');
  const [sendAudienceTo, setSendAudienceTo] = useState('');
  const [sendAudienceId, setSendAudienceId] = useState('');
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  const [sendSummary, setSendSummary] = useState(null);
  const [sendDetail, setSendDetail] = useState(null);
  const [sendAppliedFilters, setSendAppliedFilters] = useState(null);
  const [sendExporting, setSendExporting] = useState(false);
  const [sendSeller, setSendSeller] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [sendCountries, setSendCountries] = useState([]);
  const [sendDateFrom, setSendDateFrom] = useState('');
  const [sendDateTo, setSendDateTo] = useState('');
  const [sendJobId, setSendJobId] = useState('');
  const [sendJobs, setSendJobs] = useState([]);
  const [sendPage, setSendPage] = useState(1);
  const [historyTemplate, setHistoryTemplate] = useState('');
  const [historyUser, setHistoryUser] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [history, setHistory] = useState(null);

  const loadSends = async (page = 1, selectedJobId = sendJobId) => {
    if (!sendTemplate.trim()) return;
    setSendSummary(null);
    setSendDetail(null);
    setSendAppliedFilters(null);
    setError('');
    if (Boolean(sendDateFrom) !== Boolean(sendDateTo)) {
      setError('Selecciona ambas fechas para definir el rango. Para consultar un solo día, usa la misma fecha en Desde y Hasta.');
      return;
    }
    if (sendDateFrom && sendDateFrom > sendDateTo) {
      setError('La fecha Desde no puede ser posterior a la fecha Hasta.');
      return;
    }
    setLoading(true);
    try {
      const filters = {
        template: sendTemplate.trim(), countries: sendCountries,
        date_from: sendDateFrom, date_to: sendDateTo,
        seller_id: sendSeller.trim(), status: sendStatus, job_id: selectedJobId,
      };
      const [summary, detail] = await Promise.all([
        getTraceSendSummary({
          ...filters, audience_id: sendMode === 'audience' ? sendAudienceId : '',
        }),
        getTraceSendDetail({ ...filters, page, page_size: PAGE_SIZE }),
      ]);
      setSendJobs(summary.jobs ?? []);
      setSendSummary(summary);
      setSendDetail(detail);
      setSendAppliedFilters(filters);
      setSendPage(page);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadSendDetail = async () => {
    if (!sendAppliedFilters) return;
    setSendExporting(true);
    setError('');
    try {
      const file = await exportTraceSendDetail(sendAppliedFilters);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSendExporting(false);
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    setError('');
    setHistory(null);
    try {
      setHistory(await getTraceAudienceHistory({
        template: historyTemplate.trim(), created_by: historyUser.trim(),
        created_from: historyFrom, created_to: historyTo, page: 1, page_size: PAGE_SIZE,
      }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSendAudiences = async (page = 1) => {
    setLoadingAudiences(true);
    setError('');
    try {
      setSendAudiences(await getTraceAudiences({
        search: sendAudienceQuery.trim(), created_from: sendAudienceFrom,
        created_to: sendAudienceTo, page, page_size: 20,
      }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoadingAudiences(false);
    }
  };

  return (
    <div className="trace-workspace">
      <nav className="trace-module-tabs" aria-label="Módulos de Trace">
        {MODULES.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={module === id}
            className={module === id ? 'active' : ''} onClick={() => { setModule(id); setError(''); }}>
            {label}
          </button>
        ))}
      </nav>
      <ErrorMessage>{error}</ErrorMessage>

      <AudienceGenerator hidden={module !== 'audiences'} />

      {module === 'sends' && <div className="trace-content">
        <section className="trace-section"><div className="trace-section-heading"><div><span className="trace-step">01</span><h2>Busca un envío</h2></div></div>
          <fieldset className="trace-send-origin">
            <legend>Origen del seguimiento</legend>
            <label><input type="radio" name="send-origin" checked={sendMode === 'historical'} onChange={() => { setSendMode('historical'); setSendAudienceId(''); }} />Sin audiencia / envío histórico</label>
            <label><input type="radio" name="send-origin" checked={sendMode === 'audience'} onChange={() => setSendMode('audience')} />Con audiencia de Amplify</label>
          </fieldset>
          {sendMode === 'audience' && <div className="trace-send-audience-picker">
            <div className="trace-send-audience-search">
              <label className="trace-field"><span>Buscar audiencia, template o usuario</span><input value={sendAudienceQuery} onChange={event => setSendAudienceQuery(event.target.value)} /></label>
              <label className="trace-field"><span>Generada desde</span><input type="date" value={sendAudienceFrom} onChange={event => setSendAudienceFrom(event.target.value)} /></label>
              <label className="trace-field"><span>Generada hasta</span><input type="date" value={sendAudienceTo} onChange={event => setSendAudienceTo(event.target.value)} /></label>
              <button className="trace-button trace-button--quiet" type="button" onClick={() => loadSendAudiences(1)} disabled={loadingAudiences}>{loadingAudiences ? 'Buscando…' : 'Buscar audiencia'}</button>
            </div>
            <label className="trace-field"><span>Audiencia generada</span><select value={sendAudienceId} onChange={event => {
              const selected = sendAudiences.items.find(item => item.audience_id === event.target.value);
              setSendAudienceId(event.target.value);
              if (selected) setSendTemplate(selected.template);
            }}>
              <option value="">Selecciona una audiencia con miembros</option>
              {sendAudiences.items.map(item => <option value={item.audience_id} key={item.audience_id}>
                {item.audience_id} · {item.template} · {dateLabel(item.created_at)} · {item.created_by} · {number(item.member_sellers)} sellers / {number(item.member_contacts)} contactos
              </option>)}
            </select></label>
            {sendAudiences.total > 20 && <div className="trace-pagination"><span>{number(sendAudiences.total)} audiencias · página {sendAudiences.page}</span><div>
              <button className="trace-button trace-button--quiet" type="button" onClick={() => loadSendAudiences(sendAudiences.page - 1)} disabled={loadingAudiences || sendAudiences.page <= 1}>Anterior</button>
              <button className="trace-button trace-button--quiet" type="button" onClick={() => loadSendAudiences(sendAudiences.page + 1)} disabled={loadingAudiences || sendAudiences.page * 20 >= sendAudiences.total}>Siguiente</button>
            </div></div>}
          </div>}
          <div className="trace-search-controls trace-send-search">
            <label className="trace-field"><span>Template exacto</span><input value={sendTemplate} readOnly={sendMode === 'audience' && Boolean(sendAudienceId)} onChange={event => setSendTemplate(event.target.value)} /></label>
            <div className="trace-field"><span>País</span>
              <details className="trace-country-picker">
                <summary>{sendCountries.length ? `${sendCountries.length} seleccionados` : 'Todos'}</summary>
                <div className="trace-country-options">
                  {SEND_COUNTRIES.map(([value, label]) => <label key={value}>
                    <input type="checkbox" checked={sendCountries.includes(value)} onChange={() => setSendCountries(current => current.includes(value) ? current.filter(country => country !== value) : [...current, value])} />
                    {label}
                  </label>)}
                </div>
              </details>
            </div>
            <label className="trace-field"><span>Fecha desde</span><input type="date" value={sendDateFrom} onChange={event => setSendDateFrom(event.target.value)} /></label>
            <label className="trace-field"><span>Fecha hasta</span><input type="date" value={sendDateTo} onChange={event => setSendDateTo(event.target.value)} /></label>
            <label className="trace-field"><span>Seller ID (opcional)</span><input value={sendSeller} onChange={event => setSendSeller(event.target.value)} /></label>
            <label className="trace-field"><span>Estado</span><select value={sendStatus} onChange={event => setSendStatus(event.target.value)}><option value="">Todos</option><option value="ENVIADO">Enviado</option><option value="NO_ENVIADO">No enviado</option></select></label>
            <button className="trace-button trace-button--primary" type="button" onClick={() => { setSendJobId(''); loadSends(1, ''); }} disabled={loading || !sendTemplate.trim() || (sendMode === 'audience' && !sendAudienceId)}>{loading ? 'Buscando…' : 'Buscar'}</button>
          </div>
        </section>
        {sendSummary && <SendResults summary={sendSummary} detail={sendDetail} jobs={sendJobs} selectedJobId={sendJobId}
          page={sendPage} loading={loading} exporting={sendExporting} onExport={downloadSendDetail}
          onJobChange={jobId => { setSendJobId(jobId); loadSends(1, jobId); }} onPage={loadSends} />}
      </div>}

      {module === 'history' && <div className="trace-content">
        <section className="trace-section"><div className="trace-section-heading"><div><span className="trace-step">01</span><h2>Historial de audiencias</h2></div></div>
          <div className="trace-search-controls trace-history-search">
            <label className="trace-field"><span>Template</span><input value={historyTemplate} onChange={event => setHistoryTemplate(event.target.value)} /></label>
            <label className="trace-field"><span>Usuario (email)</span><input value={historyUser} onChange={event => setHistoryUser(event.target.value)} /></label>
            <label className="trace-field"><span>Desde</span><input type="date" value={historyFrom} onChange={event => setHistoryFrom(event.target.value)} /></label>
            <label className="trace-field"><span>Hasta</span><input type="date" value={historyTo} onChange={event => setHistoryTo(event.target.value)} /></label>
            <button className="trace-button trace-button--primary" type="button" onClick={loadHistory} disabled={loading}>{loading ? 'Buscando…' : 'Buscar historial'}</button>
          </div>
        </section>
        {history && <HistoryResults result={history} />}
      </div>}

      {module === 'alerts' && <div className="trace-content"><TraceSendAlerts /></div>}

      {module === 'looker' && <div className="trace-legacy"><p>Dashboard anterior · disponible durante la validación de la experiencia nativa.</p><TraceEmbed /></div>}
    </div>
  );
}

function SendResults({ summary, detail, jobs, selectedJobId, page, loading, exporting, onExport, onPage, onJobChange }) {
  const values = summary.summary ?? {};
  const processed = values.sellers_processed ?? 0;
  const sent = values.sellers_sent ?? 0;
  const hasResults = values.contacts_processed > 0;
  const cards = [
    [PersonRegular, 'Sellers procesados', processed, processed ? '100% del universo consultado' : '—'],
    [CheckmarkCircleRegular, 'Sellers enviados', sent, rateLabel(sent, processed)],
    [DismissCircleRegular, 'Sellers no enviados', values.sellers_not_sent, rateLabel(values.sellers_not_sent, processed)],
    [EyeRegular, 'Sellers con apertura', values.sellers_with_open, rateLabel(values.sellers_with_open, sent)],
    [CursorClickRegular, 'Sellers con clic', values.sellers_with_click, rateLabel(values.sellers_with_click, sent)],
    [ArrowTrendingRegular, 'Contactos procesados', values.contacts_processed,
      processed ? `${(values.contacts_processed / processed).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} contactos/seller` : '—'],
  ];
  return <section className="trace-section">
    <div className="trace-section-heading"><div><span className="trace-step">02</span><h2>{summary.template}</h2></div><span className="trace-muted">{dateLabel(values.first_date)} – {dateLabel(values.last_date)}</span></div>
    {jobs.length > 0 && <label className="trace-field trace-job-select"><span>Job de envío</span><select value={selectedJobId} onChange={event => onJobChange(event.target.value)}>
      <option value="">Todos los jobs</option>{jobs.map(job => <option value={job.job_id} key={job.job_id}>{job.job_id} · {dateLabel(job.job_date)}</option>)}
    </select></label>}
    {!hasResults ? <p className="trace-empty">No encontramos registros para el template y los filtros seleccionados.</p> : <>
    <div className="trace-metrics trace-metrics--audience trace-metrics--sends">{cards.map(([icon, label, value, detail]) => <Metric key={label} icon={icon} label={label} value={value} detail={detail} />)}</div>
    {(!values.reconciliation_ok || values.contacts_without_seller > 0 || values.unclassified_contacts > 0) && <div className="trace-send-data-quality" role="alert">
      {!values.reconciliation_ok ? 'Los conteos a nivel seller no concilian. Revisa registros sin Seller ID o estados de envío no reconocidos.' : `La consulta contiene ${number(values.contacts_without_seller)} contactos sin Seller ID y ${number(values.unclassified_contacts)} con estado no reconocido; no participan en la clasificación seller.`}
    </div>}
    <TraceSendReporting report={summary} />
    <div className="trace-section-heading trace-send-detail-heading"><div><span className="trace-step">04</span><h2>Detalle seller-contacto</h2></div>
      <button className="trace-button trace-button--quiet" type="button" onClick={onExport} disabled={loading || exporting} aria-label="Descargar el detalle completo en CSV">
        <ArrowDownloadRegular aria-hidden="true" />{exporting ? 'Preparando…' : 'Descargar CSV'}
      </button>
    </div>
    <p className="trace-detail-grain">La reportería resume sellers únicos. La tabla muestra el detalle por seller-contacto.</p>
    <div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>Job ID</th><th>Seller ID</th><th>Email</th><th>Estado</th><th>Causa</th><th>Fecha</th><th>Apertura</th><th>Clic</th></tr></thead>
      <tbody>{detail?.items?.map((row, index) => <tr key={`${row.job_id}-${row.id_seller}-${row.email}-${index}`}><td>{row.job_id ?? '—'}</td><td>{row.id_seller ?? '—'}</td><td>{row.email ?? '—'}</td><td><span className="trace-state">{row.normalized_status}</span></td><td>{row.causa ?? 'Sin causa'}</td><td>{dateLabel(row.fecha)}</td><td>{row.open === 'Open' ? 'Abierto' : 'No abierto'}</td><td>{row.clic === 'Clic' ? 'Clic' : 'Sin clic'}</td></tr>)}</tbody>
    </table>{!detail?.items?.length && <p className="trace-empty">No hay resultados para este template y filtros.</p>}</div>
    {detail?.total > PAGE_SIZE && <div className="trace-pagination"><span>{number(detail.total)} registros · página {page}</span><div>
      <button className="trace-button trace-button--quiet" onClick={() => onPage(page - 1)} disabled={loading || page <= 1}>Anterior</button>
      <button className="trace-button trace-button--quiet" onClick={() => onPage(page + 1)} disabled={loading || page * PAGE_SIZE >= detail.total}>Siguiente</button>
    </div></div>}
    </>}
  </section>;
}

function HistoryResults({ result }) {
  return <section className="trace-section"><div className="trace-section-heading"><h2>{number(result.total)} audiencias</h2></div>
    <div className="trace-table-wrap"><table className="trace-table trace-history-table"><thead><tr><th>Fecha</th><th>Template / audiencia</th><th>Creada por</th><th>Progresión de sellers</th><th>Contactos</th><th>Filtros aplicados</th><th>Estado</th><th>Auditoría</th></tr></thead>
      <tbody>{result.items.map(item => {
        const filters = historyFilters(item);
        return <tr key={item.audience_id}>
          <td>{item.created_at ? dateLabel(item.created_at) : '—'}</td>
          <td><div className="trace-history-template"><strong>{item.template || '—'}</strong><small>{item.audience_id || '—'}</small></div></td>
          <td>{item.created_by || '—'}</td><td><HistoryVolume item={item} /></td>
          <td>{item.final_contacts == null ? '—' : number(item.final_contacts)}</td>
          <td><HistoryFilterSummary filters={filters} /></td>
          <td>{item.status || '—'}</td><td><HistoryDetail item={item} /></td>
        </tr>;
      })}</tbody>
    </table>{!result.items.length && <p className="trace-empty">No hay audiencias para estos criterios.</p>}</div>
  </section>;
}

export default TraceWorkspace;
