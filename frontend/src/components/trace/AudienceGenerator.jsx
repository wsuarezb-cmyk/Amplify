import {
  ArrowDownloadRegular, ArrowTrendingRegular, CheckmarkCircleRegular,
  ChevronDownRegular, DismissCircleRegular, DismissRegular, PersonRegular, WarningRegular,
} from '@fluentui/react-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  exportTraceAudience,
  getTraceDailyVolume,
  getTraceFilterOptions,
  loadTraceAudienceDataset,
} from '../../services/api.js';
import { parseTraceIdentifiers } from '../../utils/trace.js';
import {
  FILTER_DEFS, buildAudienceAlerts, buildFacetCounts, calculateAudienceMetrics,
  calculateFunnel, categoryLabel, getSellerIdsWithoutContact, normalizeAudienceDataset,
  reachesShareThreshold,
} from '../../utils/traceAudience.js';
import AudienceCharts, { ReconciliationCharts } from './AudienceCharts.jsx';
import { Metric, number, percentage } from './traceCommon.jsx';

const SEARCH_TYPES = [
  ['seller_id', 'Seller ID'], ['rut', 'RUT'], ['email', 'Email'],
  ['phone', 'Teléfono'], ['name', 'Nombre exacto'],
];

const FILTER_LABELS = Object.fromEntries(FILTER_DEFS.map(([key, , label]) => [key, label]));
const pctShare = (value, total) => (total ? (value * 100 / total).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0,0');

// Dataset base + filtros en memoria: solo "Consultar base" llama al backend.
export default function AudienceGenerator({ hidden }) {
  const [rawInput, setRawInput] = useState('');
  const [searchType, setSearchType] = useState('seller_id');
  const [filters, setFilters] = useState({});
  const [filterOptions, setFilterOptions] = useState({});
  const [baseRows, setBaseRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [dailyVolume, setDailyVolume] = useState(null);
  const [template, setTemplate] = useState('');
  const [warningConfirmed, setWarningConfirmed] = useState(false);
  const [filtersConfirmed, setFiltersConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openFilter, setOpenFilter] = useState(null);
  const filtersRef = useRef(null);

  const parsedInput = useMemo(
    () => parseTraceIdentifiers(rawInput, { preserveSpaces: searchType === 'name' }),
    [rawInput, searchType],
  );

  useEffect(() => {
    let active = true;
    getTraceFilterOptions()
      .then(result => { if (active) setFilterOptions(result.filters ?? {}); })
      .catch(reason => { if (active) setError(reason.message); });
    getTraceDailyVolume()
      .then(result => { if (active) setDailyVolume(result); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!openFilter) return undefined;
    const closeOnOutside = event => {
      if (!filtersRef.current?.contains(event.target)) setOpenFilter(null);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpenFilter(null);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openFilter]);

  const ready = baseRows !== null;
  const funnel = useMemo(() => (ready ? calculateFunnel(baseRows, filters) : null), [ready, baseRows, filters]);
  const metrics = useMemo(
    () => (ready ? calculateAudienceMetrics(baseRows, funnel, meta.inputReconciled) : null),
    [ready, baseRows, funnel, meta],
  );
  const alerts = useMemo(() => (ready ? buildAudienceAlerts({
    metrics, baseRows, filters, input: meta.input, searchType: meta.searchType,
    notFoundCount: meta.notFound.length, threshold: meta.threshold,
  }) : []), [ready, metrics, baseRows, filters, meta]);
  const facets = useMemo(() => (ready ? buildFacetCounts(baseRows, filters) : null), [ready, baseRows, filters]);
  const sellersWithoutContactIds = useMemo(
    () => (ready ? getSellerIdsWithoutContact(baseRows) : []), [ready, baseRows],
  );
  const [copyFeedback, setCopyFeedback] = useState('');

  const hasActiveFilters = Object.values(filters).some(values => values?.length);
  const hasBlockingAlert = alerts.some(alert => alert.severity === 'error');
  const requiresConfirmation = alerts.some(alert => alert.requires_confirmation);
  const noFoundAlert = ready && reachesShareThreshold(meta.notFound.length, meta.input.valid_unique);
  const noContactAlert = ready && reachesShareThreshold(sellersWithoutContactIds.length, meta.input.valid_unique);
  const canDownload = ready && metrics.reconciled && metrics.finalContacts > 0
    && template.trim().length > 0 && filtersConfirmed && !hasBlockingAlert
    && (!requiresConfirmation || warningConfirmed) && !loading;

  const resetConfirmations = () => {
    setWarningConfirmed(false);
    setFiltersConfirmed(false);
  };

  const resetDataset = () => {
    setBaseRows(null);
    setMeta(null);
    setOpenFilter(null);
    setFilters({});
    resetConfirmations();
  };

  const runQuery = async () => {
    if (!parsedInput.identifiers.length) {
      setError('Ingresa al menos un identificador antes de consultar.');
      return;
    }
    setLoading(true);
    setError('');
    resetDataset();
    try {
      const result = await loadTraceAudienceDataset({ raw_input: rawInput, search_type: searchType, filters: {} });
      setBaseRows(normalizeAudienceDataset(result.dataset));
      setMeta({
        input: result.input,
        searchType: result.search_type,
        notFound: result.matching.not_found_values,
        foundIdentifiers: result.matching.found_identifiers,
        inputReconciled: result.input_reconciled,
        threshold: result.not_found_alert_threshold,
      });
      getTraceDailyVolume().then(setDailyVolume).catch(() => {});
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleFilter = (key, value) => {
    setFilters(current => {
      const selected = current[key] ?? [];
      return {
        ...current,
        [key]: selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value],
      };
    });
    resetConfirmations();
  };

  const clearFilters = () => {
    setFilters({});
    resetConfirmations();
  };

  const clearInput = () => {
    setRawInput('');
    setError('');
    setCopyFeedback('');
    resetDataset();
  };

  const copySellerIds = async (sellerIds, label) => {
    if (!sellerIds.length) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(sellerIds.join('\n'));
      setCopyFeedback(`${sellerIds.length} Seller IDs copiados (${label}).`);
    } catch {
      setCopyFeedback('No se pudo copiar. Revisa los permisos del navegador.');
    }
  };

  const downloadAudience = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await exportTraceAudience({
        raw_input: rawInput, search_type: searchType, filters,
        template: template.trim(), confirm_warnings: warningConfirmed,
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  const optionsFor = key => {
    const catalog = filterOptions[key] ?? [];
    const known = new Set(catalog.map(option => option.value));
    const extras = ready
      ? [...facets[key].keys()].filter(value => !known.has(value)).map(value => ({ value, label: categoryLabel(filterOptions, key, value) }))
      : [];
    return [...catalog, ...extras];
  };

  return (
    <div className="trace-content" hidden={hidden}>
      {error && <div className="trace-error" role="alert">{error}</div>}

      {dailyVolume?.alert && (
        <div className="trace-alert trace-alert--warning" role="status">
          <strong>Disminución de base detectada</strong>
          <span>Sellers: {number(dailyVolume.current?.distinct_sellers)} hoy, frente a {number(dailyVolume.previous?.distinct_sellers)} el día anterior disponible. Contactos: {number(dailyVolume.current?.total_contacts)} frente a {number(dailyVolume.previous?.total_contacts)}.</span>
        </div>
      )}
      {dailyVolume?.available && dailyVolume.current && !dailyVolume.previous && (
        <div className="trace-alert trace-alert--info" role="status">Sin histórico suficiente para comparar la base maestra.</div>
      )}

      <section className="trace-section trace-entry">
        <div className="trace-section-heading">
          <div><span className="trace-step">01</span><h2>Define la búsqueda</h2></div>
          <span className="trace-muted">{number(parsedInput.validUnique)} únicos · {number(parsedInput.invalid.length)} inválidos · {number(parsedInput.duplicates)} duplicados</span>
        </div>
        <div className="trace-search-controls">
          <label className="trace-field"><span>Identificador</span>
            <select value={searchType} onChange={event => { setSearchType(event.target.value); resetDataset(); }}>
              {SEARCH_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="trace-field trace-input-list"><span>{searchType === 'seller_id' ? 'Seller IDs' : 'Valores de búsqueda'}</span>
            <div className="trace-input-control">
              <textarea value={rawInput} onChange={event => { setRawInput(event.target.value); resetDataset(); }} placeholder="Pega valores separados por comas o espacios" rows={1} spellCheck="false" />
              {rawInput && <button className="trace-input-clear" type="button" aria-label="Vaciar identificadores" title="Vaciar identificadores" onClick={clearInput}><DismissRegular aria-hidden="true" /></button>}
            </div>
          </label>
          <button className="trace-button trace-button--primary" type="button" onClick={runQuery} disabled={loading || !parsedInput.identifiers.length}>{loading ? 'Consultando…' : 'Consultar base'}</button>
        </div>
      </section>

      <section className="trace-section">
        <div className="trace-section-heading">
          <div><span className="trace-step">02</span><h2>Reglas de inclusión</h2></div>
          <span className="trace-muted">
            {ready ? 'Se aplican al instante sobre la consulta cargada' : 'Consulta la base para habilitar los filtros'}
            {hasActiveFilters && (
              <button type="button" className="trace-button trace-button--quiet trace-clear-filters" onClick={clearFilters}>Limpiar filtros</button>
            )}
          </span>
        </div>
        <div ref={filtersRef} className={`trace-filter-grid${ready ? '' : ' trace-filter-grid--idle'}`}>
          {FILTER_DEFS.filter(([key]) => filterOptions[key]).map(([key]) => {
            const selected = filters[key] ?? [];
            const summary = selected.length === 0 ? 'Todos'
              : selected.length === 1 ? categoryLabel(filterOptions, key, selected[0])
                : `${selected.length} seleccionados`;
            const isOpen = openFilter === key;
            return (
            <div className={`trace-filter${isOpen ? ' trace-filter--open' : ''}`} key={key}>
              <button
                type="button"
                className="trace-filter-trigger"
                aria-expanded={isOpen}
                aria-controls={`trace-filter-options-${key}`}
                onClick={() => setOpenFilter(current => current === key ? null : key)}
              >
                <span className="trace-filter-name">{FILTER_LABELS[key]}</span>
                <span className="trace-filter-summary">{summary}</span>
                <ChevronDownRegular className="trace-filter-chevron" aria-hidden="true" />
              </button>
              {isOpen && <div className="trace-filter-options" id={`trace-filter-options-${key}`}>
                {optionsFor(key).map(option => (
                <label key={option.value}>
                  <input type="checkbox" disabled={!ready || option.disabled}
                    checked={(filters[key] ?? []).includes(option.value)} onChange={() => toggleFilter(key, option.value)} />
                  <span>{option.label}{ready && <em className="trace-facet-count">{number(facets[key].get(option.value) ?? 0)}</em>}</span>
                </label>
                ))}
              </div>}
            </div>
          );})}
        </div>
      </section>

      <AudienceCharts
        ready={ready}
        rows={ready ? funnel.eligibleRows : []}
        options={filterOptions}
      />

      <section className="trace-section">
        <div className="trace-section-heading"><div><span className="trace-step">03</span><h2>Conciliación</h2></div>
          {ready && <span className={metrics.reconciled ? 'trace-status trace-status--ok' : 'trace-status trace-status--error'}>{metrics.reconciled ? 'Conteos conciliados' : 'Revisar conteos'}</span>}
        </div>
        {ready && <>
          <div className="trace-metrics trace-metrics--audience">
            <Metric icon={ArrowDownloadRegular} label="Valores recibidos" value={meta.input.received}
              detail={`${SEARCH_TYPES.find(([key]) => key === meta.searchType)?.[1] ?? 'Identificadores'} ingresados`} />
            <Metric icon={CheckmarkCircleRegular} label="Únicos válidos" value={meta.input.valid_unique} detail="Identificadores únicos válidos" />
            <Metric icon={PersonRegular} label="Encontrados" value={meta.foundIdentifiers} detail={`${pctShare(meta.foundIdentifiers, meta.input.valid_unique)}% del total`} />
            <Metric icon={WarningRegular} label="No encontrados" value={meta.notFound.length} alert={noFoundAlert}
              detail={`${pctShare(meta.notFound.length, meta.input.valid_unique)}% del total`}
              action={meta.notFound.length > 0 && <button className="trace-metric-copy" type="button" onClick={() => copySellerIds(meta.notFound, 'no encontrados')}>Copiar IDs</button>} />
            <Metric icon={DismissCircleRegular} label="Sellers sin contacto" value={metrics.sellersWithoutContact} alert={noContactAlert}
              detail={`${pctShare(metrics.sellersWithoutContact, meta.input.valid_unique)}% del total`}
              action={sellersWithoutContactIds.length > 0 && <button className="trace-metric-copy" type="button" onClick={() => copySellerIds(sellersWithoutContactIds, 'sin contacto')}>Copiar IDs</button>} />
            <Metric icon={CheckmarkCircleRegular} label="Sellers elegibles" value={metrics.eligibleSellers} strong
              detail={`${pctShare(metrics.eligibleSellers, meta.input.valid_unique)}% del total`} />
            <Metric icon={ArrowTrendingRegular} label="Contactos finales" value={metrics.finalContacts} strong
              detail={`${metrics.eligibleSellers ? (metrics.finalContacts / metrics.eligibleSellers).toFixed(2) : '0,00'} contactos/seller`} />
          </div>
          {copyFeedback && <div className="trace-copy-feedback" role="status">{copyFeedback}</div>}
          {meta.searchType === 'seller_id' && meta.notFound.length > 0 && (
            <div className="trace-missing-sellers" role="status">
              <strong>Seller IDs no encontrados · mostrando {Math.min(meta.notFound.length, 5)} de {meta.notFound.length}</strong>
              <div className="trace-missing-sellers-row trace-missing-sellers-head"><span>Seller ID</span><span>Nombre</span></div>
              {meta.notFound.slice(0, 5).map(sellerId => <div className="trace-missing-sellers-row" key={sellerId}>
                <code>{sellerId}</code><span>Nombre no disponible en la base maestra</span>
              </div>)}
            </div>
          )}
        </>}

        <ReconciliationCharts
          ready={ready}
          funnel={funnel}
          metrics={metrics}
          notFound={ready ? meta.notFound.length : 0}
          inputUnique={ready ? meta.input.valid_unique : 0}
        />

        {ready && <>
        <div className="trace-section-heading trace-funnel-heading"><div><h3>Detalle de la conciliación</h3></div></div>
        <div className="trace-funnel" role="table" aria-label="Detalle de la conciliación">
          <div className="trace-funnel-row trace-funnel-row--head" role="row"><span>Etapa / regla</span><span>Sellers antes</span><span>Excluidos</span><span>Sellers finales</span><span>Variación</span><span>Contactos finales</span></div>
          <div className="trace-funnel-row" role="row"><span>Encontrados en base</span><span>{number(meta.input.valid_unique)}</span><span>{number(meta.notFound.length)} sellers</span><span>{number(metrics.foundSellers)}</span><span>—</span><span>{number(metrics.baseContacts)}</span></div>
          {funnel.stages.map(stage => <div className="trace-funnel-row" role="row" key={stage.rule}>
            <span>{stage.label}</span><span>{number(stage.before_sellers)}</span><span>{number(stage.excluded_sellers)} sellers · {number(stage.excluded_contacts)} contactos</span><span>{number(stage.remaining_sellers)}</span><span>{percentage(stage.variation_percent)}</span><span>{number(stage.remaining_contacts)}</span>
          </div>)}
        </div>
        </>}
      </section>

      {ready && <>
        {alerts.length > 0 && <section className="trace-alert-list" aria-label="Alertas de audiencia">
          {alerts.map(alert => <div key={alert.code} className={`trace-alert trace-alert--${alert.severity}`} role={alert.severity === 'error' ? 'alert' : 'status'}>
            <strong>{alert.severity === 'error' ? 'Descarga bloqueada' : 'Atención'}</strong><span>{alert.message}</span>
          </div>)}
          {requiresConfirmation && <label className="trace-confirm-warning"><input type="checkbox" checked={warningConfirmed} onChange={event => setWarningConfirmed(event.target.checked)} />Confirmo continuar con la advertencia de identificadores no encontrados.</label>}
        </section>}

        <label className="trace-confirm-warning"><input type="checkbox" checked={filtersConfirmed} onChange={event => setFiltersConfirmed(event.target.checked)} />Confirmo los filtros y los conteos de esta audiencia.</label>

        <section className="trace-export-bar">
          <label className="trace-field"><span>Template obligatorio</span><input value={template} onChange={event => setTemplate(event.target.value)} maxLength={256} placeholder="Nombre exacto del template" /></label>
          <div className="trace-export-summary"><span>{number(metrics.eligibleSellers)} sellers / {number(metrics.finalContacts)} contactos</span>
            <button className="trace-button trace-button--primary" type="button" onClick={downloadAudience} disabled={!canDownload}>{loading ? 'Preparando…' : 'Descargar CSV'}</button>
          </div>
        </section>
      </>}
    </div>
  );
}
