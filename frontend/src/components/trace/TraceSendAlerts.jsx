import { useState } from 'react';
import {
  ArrowDownloadRegular, ArrowTrendingRegular, CheckmarkCircleRegular,
  DismissCircleRegular, EyeRegular, PersonRegular,
} from '@fluentui/react-icons';
import {
  getTraceAudiences, reconcileTraceSendCsv, sendTraceTeamsNotification, validateTraceSendCsv,
} from '../../services/api.js';
import { addTraceAlertRecipients } from '../../utils/traceSendAlerts.js';
import { Metric, number } from './traceCommon.jsx';

const PAGE_SIZE = 50;
const MAX_RECIPIENTS = 20;
const DETAIL_TABS = [
  ['missing', 'Ausentes'], ['present', 'Presentes'], ['unexpected', 'No esperados'],
  ['duplicates', 'Duplicados'], ['invalid', 'Inválidos'],
];
const rateLabel = (numerator, denominator) => denominator
  ? `${(numerator * 100 / denominator).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`
  : '—';
const formatDate = value => value ? new Date(value).toLocaleDateString('es-CL') : '—';

function quoteCsv(value) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadRows(rows, filename) {
  const csv = [
    ['Seller ID', 'Email', 'Estado de conciliación', 'Audiencia', 'Template', 'Observación'],
    ...rows.map(row => [row.seller_id, row.email, row.status, row.audience_id, row.template, row.observation]),
  ].map(row => row.map(quoteCsv).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TraceSendAlerts() {
  const [audiences, setAudiences] = useState({ items: [], page: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [audience, setAudience] = useState(null);
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [emailColumn, setEmailColumn] = useState('');
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('missing');
  const [detailSearch, setDetailSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortAscending, setSortAscending] = useState(true);
  const [recipientDraft, setRecipientDraft] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [recipientError, setRecipientError] = useState('');
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationFeedback, setNotificationFeedback] = useState(null);

  const addRecipients = text => {
    const result = addTraceAlertRecipients(recipients, text, MAX_RECIPIENTS);
    setRecipients(result.recipients);
    setRecipientError(result.error);
    setNotificationFeedback(null);
  };

  const loadAudiences = async (targetPage = 1) => {
    setLoadingAudiences(true);
    setError('');
    try {
      setAudiences(await getTraceAudiences({
        search: search.trim(), created_by: createdBy.trim(), created_from: createdFrom,
        created_to: createdTo, page: targetPage, page_size: 20, members_only: false,
      }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoadingAudiences(false);
    }
  };

  const selectAudience = event => {
    const selected = audiences.items.find(item => item.audience_id === event.target.value);
    setAudience(selected ?? null);
    setSelectedFile(null);
    setEmailColumn('');
    setValidation(null);
    setResult(null);
    setRecipients([]);
    setRecipientDraft('');
    setRecipientError('');
    setNotificationFeedback(null);
  };

  const validateFile = async () => {
    if (!audience || !selectedFile) return;
    setLoading(true);
    setError('');
    setNotificationFeedback(null);
    setResult(null);
    try {
      const validated = await validateTraceSendCsv(selectedFile, audience.audience_id, emailColumn);
      setValidation(validated);
      if (!emailColumn && validated.preferred_email_column) setEmailColumn(validated.preferred_email_column);
    } catch (reason) {
      setValidation(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = async () => {
    if (!result || !recipients.length || recipientError || notificationLoading) return;
    setNotificationLoading(true);
    setNotificationFeedback(null);
    try {
      const response = await sendTraceTeamsNotification(
        result.reconciliation_id,
        recipients.map(email => email.trim().toLowerCase()),
      );
      setNotificationFeedback({
        type: 'success',
        message: `Power Automate aceptó la solicitud. Confirma la publicación en Teams. Referencia: ${response.request_id}`,
      });
    } catch (reason) {
      setNotificationFeedback({ type: 'error', message: reason.message || 'No fue posible enviar la notificación. Intenta nuevamente.' });
    } finally {
      setNotificationLoading(false);
    }
  };

  const reconcile = async () => {
    if (!audience || !selectedFile || !emailColumn || !validation?.email_quality) return;
    setLoading(true);
    setError('');
    setNotificationFeedback(null);
    try {
      setResult(await reconcileTraceSendCsv(
        selectedFile, audience.audience_id, emailColumn, true,
      ));
      setActiveTab('missing');
      setPage(1);
      setDetailSearch('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  const detailRows = result?.details?.[activeTab] ?? [];
  const filteredRows = detailRows.filter(row => (
    `${row.seller_id ?? ''} ${row.email ?? ''}`.toLowerCase().includes(detailSearch.trim().toLowerCase())
  )).sort((left, right) => {
    const comparison = String(left.seller_id ?? left.email ?? '').localeCompare(String(right.seller_id ?? right.email ?? ''), 'es');
    return sortAscending ? comparison : -comparison;
  });
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const differences = result ? [
    ...result.details.missing,
    ...result.details.unexpected,
    ...result.details.duplicates,
    ...result.details.invalid,
  ].map(row => ({ ...row, audience_id: result.audience_id, template: result.template })) : [];
  const metrics = result ? [
    [PersonRegular, 'Sellers esperados', result.expected_sellers, 'Audiencia persistida'],
    [CheckmarkCircleRegular, 'Sellers presentes', result.present_sellers, rateLabel(result.present_sellers, result.expected_sellers)],
    [DismissCircleRegular, 'Sellers ausentes', result.missing_sellers, rateLabel(result.missing_sellers, result.expected_sellers)],
    [ArrowTrendingRegular, 'Contactos esperados', result.expected_contacts, 'Filas de audiencia'],
    [EyeRegular, 'Contactos presentes', result.present_contacts, rateLabel(result.present_contacts, result.expected_contacts)],
    [DismissCircleRegular, 'Contactos ausentes', result.missing_contacts, rateLabel(result.missing_contacts, result.expected_contacts)],
  ] : [];

  return <div className="trace-alerts">
    <section className="trace-section">
      <div className="trace-section-heading"><div><span className="trace-step">01</span><h2>Selecciona una audiencia</h2></div></div>
      <div className="trace-alert-audience-filters">
        <label className="trace-field"><span>Buscar por ID o template</span><input value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="trace-field"><span>Usuario creador</span><input value={createdBy} onChange={event => setCreatedBy(event.target.value)} /></label>
        <label className="trace-field"><span>Desde</span><input type="date" value={createdFrom} onChange={event => setCreatedFrom(event.target.value)} /></label>
        <label className="trace-field"><span>Hasta</span><input type="date" value={createdTo} onChange={event => setCreatedTo(event.target.value)} /></label>
        <button className="trace-button trace-button--quiet" type="button" onClick={() => loadAudiences(1)} disabled={loadingAudiences}>
          {loadingAudiences ? 'Buscando…' : 'Buscar audiencias'}
        </button>
      </div>
      <label className="trace-field trace-alert-audience-select"><span>Audiencia generada</span><select value={audience?.audience_id ?? ''} onChange={selectAudience}>
        <option value="">Selecciona una audiencia</option>
        {audiences.items.map(item => <option value={item.audience_id} key={item.audience_id} disabled={!item.has_members}>
          {item.audience_id} · {item.template} · {formatDate(item.created_at)} · {item.created_by} · {number(item.final_sellers)} sellers / {number(item.final_contacts)} contactos{item.has_members ? '' : ' · Sin detalle persistido'}
        </option>)}
      </select></label>
      {audiences.total > 20 && <div className="trace-pagination"><span>{number(audiences.total)} audiencias · página {audiences.page}</span><div>
        <button className="trace-button trace-button--quiet" onClick={() => loadAudiences(audiences.page - 1)} disabled={loadingAudiences || audiences.page <= 1}>Anterior</button>
        <button className="trace-button trace-button--quiet" onClick={() => loadAudiences(audiences.page + 1)} disabled={loadingAudiences || audiences.page * 20 >= audiences.total}>Siguiente</button>
      </div></div>}
      {audience && <div className="trace-alert-audience-summary">
        <span><strong>Audience ID</strong>{audience.audience_id}</span><span><strong>Template</strong>{audience.template}</span>
        <span><strong>Generada</strong>{formatDate(audience.created_at)}</span><span><strong>Creada por</strong>{audience.created_by}</span>
        <span><strong>Sellers</strong>{number(audience.final_sellers)}</span><span><strong>Contactos</strong>{number(audience.final_contacts)}</span>
      </div>}
      {audiences.items.length > 0 && !audiences.items.some(item => item.has_members) && <p className="trace-alert-note">Esta audiencia no tiene detalle persistido y no puede conciliarse contra un archivo de envío.</p>}
    </section>

    <section className="trace-section">
      <div className="trace-section-heading"><div><span className="trace-step">02</span><h2>Carga y valida el CSV de Marketing Cloud</h2></div></div>
      <div className="trace-alert-upload-row">
        <label className="trace-field"><span>Archivo CSV</span><input type="file" accept=".csv,text/csv" onChange={event => {
          setSelectedFile(event.target.files?.[0] ?? null);
          setEmailColumn(''); setValidation(null); setResult(null);
          setRecipients([]); setRecipientDraft(''); setRecipientError(''); setNotificationFeedback(null);
        }} disabled={!audience || !audience.has_members} /></label>
        <button className="trace-button trace-button--primary" type="button" onClick={validateFile}
          disabled={loading || !audience?.has_members || !selectedFile}>{loading ? 'Validando…' : 'Validar archivo'}</button>
      </div>
      {selectedFile && <p className="trace-alert-file-meta">{selectedFile.name} · {(selectedFile.size / 1024).toLocaleString('es-CL', { maximumFractionDigits: 0 })} KB · {selectedFile.type || 'tipo no informado'}</p>}
      {validation && <>
        <div className="trace-alert-validation-meta"><span>{number(validation.file_rows)} filas</span><span>{validation.file_size.toLocaleString('es-CL')} bytes</span><span>Columnas: {validation.columns.join(', ')}</span></div>
        <div className="trace-alert-column-select">
          <label className="trace-field"><span>Columna de email</span><select value={emailColumn} onChange={event => {
            setEmailColumn(event.target.value);
            setValidation(current => current ? { ...current, email_quality: null } : current);
            setResult(null);
          }}>
            <option value="">Selecciona una columna</option>{validation.columns.map(column => <option key={column}>{column}</option>)}
          </select></label>
          {emailColumn && !validation.email_quality && <button className="trace-button trace-button--quiet" type="button" onClick={validateFile} disabled={loading}>Calcular calidad</button>}
        </div>
        {validation.email_quality && <div className="trace-alert-validation-meta">
          <span>Columna confirmada: <strong>{emailColumn}</strong></span>
          <span>Emails válidos: {number(validation.email_quality.valid_emails)}</span>
          <span>Inválidos: {number(validation.email_quality.invalid_emails)}</span>
          <span>Vacíos: {number(validation.email_quality.empty_emails)}</span>
          <span>Duplicados: {number(validation.email_quality.duplicate_emails)}</span>
        </div>}
        <button className="trace-button trace-button--primary" type="button" onClick={reconcile}
          disabled={loading || !validation.email_quality || !emailColumn}>
          {loading ? 'Conciliando…' : 'Conciliar archivo'}
        </button>
      </>}
      {!audience && <p className="trace-alert-help">Selecciona una audiencia con miembros persistidos para habilitar la validación.</p>}
      {audience && !audience.has_members && <p className="trace-alert-note">Esta audiencia no tiene detalle persistido y no puede conciliarse contra un archivo de envío.</p>}
    </section>

    {error && <div className="trace-error" role="alert">{error}</div>}

    {result && <section className="trace-section">
      <div className="trace-section-heading"><div><span className="trace-step">03</span><h2>Resultado inmediato</h2></div><button className="trace-button trace-button--quiet" onClick={() => downloadRows(differences, `trace_diferencias_${result.reconciliation_id.slice(0, 8)}.csv`)}>
        <ArrowDownloadRegular aria-hidden="true" /> Descargar diferencias CSV
      </button></div>
      <p className="trace-alert-source">Fuente: archivo cargado manualmente · confirma presencia en el archivo, no entrega, apertura ni clic.</p>
      <div className="trace-metrics trace-metrics--audience trace-metrics--sends trace-alert-metrics">
        {metrics.map(([icon, label, value, detail]) => <Metric key={label} icon={icon} label={label} value={value} detail={detail} />)}
      </div>
      <div className="trace-alert-bars">
        <CoverageBar label="Cobertura de sellers" present={result.present_sellers} expected={result.expected_sellers} />
        <CoverageBar label="Cobertura de contactos" present={result.present_contacts} expected={result.expected_contacts} />
      </div>
      <div className="trace-alert-notify" aria-label="Notificación por Teams">
        <label className="trace-field" htmlFor="trace-teams-recipients">
          <span>Destinatarios</span>
          <input
            id="trace-teams-recipients"
            type="text"
            inputMode="email"
            maxLength={254}
            value={recipientDraft}
            onChange={event => {
              const value = event.target.value;
              const parts = value.split(/[,;]/u);
              if (parts.length > 1) {
                addRecipients(parts.slice(0, -1).join(','));
                setRecipientDraft(parts.at(-1));
              } else {
                setRecipientDraft(value);
              }
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
                event.preventDefault();
                addRecipients(recipientDraft);
                setRecipientDraft('');
              }
            }}
            onPaste={event => {
              const pasted = event.clipboardData.getData('text');
              if (/[,;\n]/u.test(pasted)) {
                event.preventDefault();
                addRecipients(pasted);
                setRecipientDraft('');
              }
            }}
            placeholder="correo@empresa.com"
            aria-describedby="trace-teams-recipient-help"
          />
        </label>
        <p id="trace-teams-recipient-help" className="trace-alert-help">Agrega cada correo con Enter, coma o punto y coma. Máximo {MAX_RECIPIENTS} destinatarios.</p>
        {recipients.length > 0 && <div className="trace-alert-recipient-list" aria-label="Destinatarios agregados">
          {recipients.map(email => <span className="trace-alert-recipient" key={email.toLowerCase()}>
            {email}
            <button type="button" aria-label={`Quitar ${email}`} onClick={() => {
              setRecipients(current => current.filter(value => value.toLowerCase() !== email.toLowerCase()));
              setRecipientError('');
              setNotificationFeedback(null);
            }}>×</button>
          </span>)}
        </div>}
        {recipientError && <p className="trace-error" role="alert">{recipientError}</p>}
        <button
          className="trace-button trace-button--primary"
          type="button"
          onClick={sendNotification}
          disabled={notificationLoading || recipients.length === 0 || Boolean(recipientDraft.trim()) || Boolean(recipientError)}
        >{notificationLoading ? 'Enviando…' : 'Enviar mensaje'}</button>
        {notificationFeedback && <p className={notificationFeedback.type === 'success' ? 'trace-alert-notify-success' : 'trace-error'} role={notificationFeedback.type === 'error' ? 'alert' : 'status'}>
          {notificationFeedback.message}
        </p>}
      </div>
      <div className="trace-alert-message-list" aria-live="polite">{result.alerts.map((alert, index) => <p className={`trace-alert-message trace-alert-message--${alert.severity}`} key={`${alert.severity}-${index}`}>{alert.message}</p>)}</div>
      <p className="trace-alert-quality">Archivo · {number(result.file_rows)} filas · {number(result.valid_emails)} emails válidos · {number(result.invalid_emails)} inválidos · {number(result.empty_emails)} vacíos · {number(result.duplicate_emails)} duplicados · {number(result.unexpected_contacts)} extras</p>
      {result.details.partial_sellers.length > 0 && <p className="trace-alert-note">{number(result.details.partial_sellers.length)} sellers tienen cobertura parcial de sus contactos.</p>}
      <div className="trace-alert-detail-controls">
        <nav className="trace-alert-detail-tabs" aria-label="Categorías de conciliación">{DETAIL_TABS.map(([id, label]) => <button key={id} type="button" aria-pressed={activeTab === id} onClick={() => { setActiveTab(id); setPage(1); }}>
          {label} <span>{number(result.details[id].length)}</span>
        </button>)}</nav>
        <div className="trace-alert-detail-search">
          <label className="trace-field"><span>Buscar por Seller ID o email</span><input value={detailSearch} onChange={event => { setDetailSearch(event.target.value); setPage(1); }} /></label>
          <button className="trace-button trace-button--quiet" onClick={() => {
            const ids = [...new Set(filteredRows.map(row => row.seller_id).filter(Boolean))];
            navigator.clipboard?.writeText(ids.join('\n')).catch(() => {});
          }}>Copiar Seller IDs</button>
        </div>
      </div>
      <div className="trace-table-wrap"><table className="trace-table"><thead><tr>
        <th><button className="trace-alert-sort" onClick={() => setSortAscending(value => !value)}>Seller ID / Email {sortAscending ? '↑' : '↓'}</button></th>
        <th>Estado de conciliación</th><th>Observación</th>
      </tr></thead><tbody>{visibleRows.map((row, index) => <tr key={`${row.seller_id}-${row.email}-${index}`}>
        <td>{row.seller_id || '—'}{row.email ? ` · ${row.email}` : ''}</td><td>{row.status}</td><td>{row.observation}</td>
      </tr>)}</tbody></table>{!visibleRows.length && <p className="trace-empty">No hay filas para esta categoría y búsqueda.</p>}</div>
      <div className="trace-pagination"><span>{number(filteredRows.length)} registros · página {page}</span><div>
        <button className="trace-button trace-button--quiet" onClick={() => setPage(current => current - 1)} disabled={page <= 1}>Anterior</button>
        <button className="trace-button trace-button--quiet" onClick={() => setPage(current => current + 1)} disabled={page * PAGE_SIZE >= filteredRows.length}>Siguiente</button>
      </div></div>
    </section>}
  </div>;
}

function CoverageBar({ label, present, expected }) {
  const percentage = expected ? present * 100 / expected : 0;
  return <div className="trace-alert-coverage">
    <div><strong>{label}</strong><span>{number(present)} de {number(expected)} · {rateLabel(present, expected)}</span></div>
    <div className="trace-alert-coverage-track" role="img" aria-label={`${label}: ${number(present)} de ${number(expected)} (${rateLabel(present, expected)})`}>
      <span style={{ width: `${percentage}%` }} />
    </div>
  </div>;
}