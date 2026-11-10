import { useState } from 'react';
import TraceEmbed from './TraceEmbed.jsx';
import AudienceGenerator from './AudienceGenerator.jsx';
import { Metric, number } from './traceCommon.jsx';
import {
  getTraceAudienceHistory,
  getTraceSendDetail,
  getTraceSendSummary,
} from '../../services/api.js';
import './TraceWorkspace.css';

const MODULES = [
  ['audiences', 'Generación de audiencias'],
  ['history', 'Historial'],
  ['sends', 'Seguimiento de envíos'],
  ['looker', 'Looker Studio'],
];
const PAGE_SIZE = 50;

function dateLabel(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  return value ? new Date(value).toLocaleDateString('es-CL') : 'Sin dato';
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

function ErrorMessage({ children }) {
  return children ? <div className="trace-error" role="alert">{children}</div> : null;
}

function TraceWorkspace() {
  const [module, setModule] = useState('audiences');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sendTemplate, setSendTemplate] = useState('');
  const [sendSummary, setSendSummary] = useState(null);
  const [sendDetail, setSendDetail] = useState(null);
  const [sendSeller, setSendSeller] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [sendPage, setSendPage] = useState(1);
  const [historyTemplate, setHistoryTemplate] = useState('');
  const [historyUser, setHistoryUser] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [history, setHistory] = useState(null);

  const loadSends = async (page = 1) => {
    if (!sendTemplate.trim()) return;
    setLoading(true);
    setError('');
    setSendSummary(null);
    setSendDetail(null);
    try {
      const [summary, detail] = await Promise.all([
        getTraceSendSummary({ template: sendTemplate.trim(), seller_id: sendSeller.trim(), status: sendStatus }),
        getTraceSendDetail({ template: sendTemplate.trim(), seller_id: sendSeller.trim(), status: sendStatus, page, page_size: PAGE_SIZE }),
      ]);
      setSendSummary(summary);
      setSendDetail(detail);
      setSendPage(page);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
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
          <div className="trace-search-controls trace-send-search">
            <label className="trace-field"><span>Template exacto</span><input value={sendTemplate} onChange={event => setSendTemplate(event.target.value)} /></label>
            <label className="trace-field"><span>Seller ID (opcional)</span><input value={sendSeller} onChange={event => setSendSeller(event.target.value)} /></label>
            <label className="trace-field"><span>Estado</span><select value={sendStatus} onChange={event => setSendStatus(event.target.value)}><option value="">Todos</option><option value="ENVIADO">Enviado</option><option value="NO_ENVIADO">No enviado</option></select></label>
            <button className="trace-button trace-button--primary" type="button" onClick={() => loadSends(1)} disabled={loading || !sendTemplate.trim()}>{loading ? 'Buscando…' : 'Buscar'}</button>
          </div>
        </section>
        {sendSummary && <SendResults summary={sendSummary} detail={sendDetail} page={sendPage} loading={loading} onPage={loadSends} />}
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

      {module === 'looker' && <div className="trace-legacy"><p>Dashboard anterior · disponible durante la validación de la experiencia nativa.</p><TraceEmbed /></div>}
    </div>
  );
}

function SendResults({ summary, detail, page, loading, onPage }) {
  const values = summary.summary ?? {};
  const cards = [['Sellers procesados', values.sellers_processed], ['Sellers enviados', values.sellers_sent], ['Sellers no enviados', values.sellers_not_sent], ['Contactos', values.contacts_processed], ['Aperturas', values.opens], ['Clics', values.clicks]];
  return <section className="trace-section">
    <div className="trace-section-heading"><div><span className="trace-step">02</span><h2>{summary.template}</h2></div><span className="trace-muted">{dateLabel(values.first_date)} – {dateLabel(values.last_date)}</span></div>
    <div className="trace-metrics">{cards.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>
    {summary.not_sent_causes?.length > 0 && <p className="trace-cause-line">No enviados: {summary.not_sent_causes.map(row => `${row.cause} (${number(row.contacts)})`).join(' · ')}</p>}
    <div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>Seller ID</th><th>Email</th><th>Estado</th><th>Causa</th><th>Fecha</th><th>Apertura</th><th>Clic</th></tr></thead>
      <tbody>{detail?.items?.map((row, index) => <tr key={`${row.id_seller}-${row.email}-${index}`}><td>{row.id_seller ?? '—'}</td><td>{row.email ?? '—'}</td><td><span className="trace-state">{row.normalized_status}</span></td><td>{row.causa ?? 'Sin causa'}</td><td>{dateLabel(row.fecha)}</td><td>{row.open === 'Open' ? 'Abierto' : 'No abierto'}</td><td>{row.clic === 'Clic' ? 'Clic' : 'Sin clic'}</td></tr>)}</tbody>
    </table>{!detail?.items?.length && <p className="trace-empty">No hay resultados para este template y filtros.</p>}</div>
    {detail?.total > PAGE_SIZE && <div className="trace-pagination"><span>{number(detail.total)} registros · página {page}</span><div>
      <button className="trace-button trace-button--quiet" onClick={() => onPage(page - 1)} disabled={loading || page <= 1}>Anterior</button>
      <button className="trace-button trace-button--quiet" onClick={() => onPage(page + 1)} disabled={loading || page * PAGE_SIZE >= detail.total}>Siguiente</button>
    </div></div>}
  </section>;
}

function HistoryResults({ result }) {
  return <section className="trace-section"><div className="trace-section-heading"><h2>{number(result.total)} audiencias</h2></div>
    <div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>Fecha</th><th>Creada por</th><th>Template</th><th>Seller IDs iniciales</th><th>Encontrados</th><th>Elegibles</th><th>Contactos</th><th>Filtros aplicados</th><th>Estado</th><th>Detalle</th></tr></thead>
      <tbody>{result.items.map(item => {
        const filters = historyFilters(item);
        return <tr key={item.audience_id}>
          <td>{item.created_at ? dateLabel(item.created_at) : '—'}</td><td>{item.created_by || '—'}</td><td>{item.template || '—'}</td>
          <td>{item.initial_sellers == null ? '—' : number(item.initial_sellers)}</td>
          <td>{item.found_sellers == null ? '—' : number(item.found_sellers)}</td>
          <td>{item.final_sellers == null ? '—' : number(item.final_sellers)}</td>
          <td>{item.final_contacts == null ? '—' : number(item.final_contacts)}</td>
          <td className="trace-history-filter-summary">{filters.length ? filters.map(filter => `${filter.label}: ${filter.value}`).join(' · ') : '—'}</td>
          <td>{item.status || '—'}</td><td><HistoryDetail item={item} /></td>
        </tr>;
      })}</tbody>
    </table>{!result.items.length && <p className="trace-empty">No hay audiencias para estos criterios.</p>}</div>
  </section>;
}

export default TraceWorkspace;
