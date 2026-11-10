// Selectores puros de Trace > Generación de Audiencias: espejo de la lógica del backend (trace_service.py).

export const NULL_VALUE = '__NULL__';

// [clave de filtro, columna del dataset, etiqueta] — mismo orden que FILTER_COLUMNS del backend.
export const FILTER_DEFS = [
  ['contact_type', 'contacto', 'Tipo de contacto'],
  ['has_sales', 'tiene_venta_12m', 'Tiene venta'],
  ['seller_segment', 'tipo_seller', 'Segmento del seller'],
  ['has_catalog', 'tiene_catalogo', 'Tiene catálogo'],
  ['seller_status', 'estado_sellers_sx', 'Estado seller'],
  ['held', 'mc_held_status', 'HELD'],
  ['unsubscribed', 'desuscritos_mc', 'Desuscrito'],
  ['seller_delist', 'Seller_Delist', 'Seller delist'],
  ['geography', 'geography', 'Geografía'],
  ['country', 'Pais', 'País'],
  ['operational_exclusion', 'flag_or0_sin_login_3m', 'Exclusión operacional'],
];

export const COMPOSITION_DIMENSIONS = [
  ['country', 'País'],
  ['geography', 'Geografía'],
  ['seller_segment', 'Segmento del seller'],
  ['seller_status', 'Estado seller'],
  ['contact_type', 'Tipo de contacto'],
];

function categoryOf(key, value) {
  if (value === null || value === undefined) return NULL_VALUE;
  if (key === 'operational_exclusion') return String(value) === '1' ? 'EXCLUDE' : 'KEEP';
  return String(value);
}

/** Convierte la respuesta columnar en filas con su categoría de filtro precalculada. */
export function normalizeAudienceDataset(dataset) {
  const { columns, rows } = dataset;
  return rows.map(values => {
    const row = {};
    columns.forEach((column, index) => { row[column] = values[index]; });
    row.cat = {};
    for (const [key, column] of FILTER_DEFS) row.cat[key] = categoryOf(key, row[column]);
    row.hasChannel = Boolean(row.email || row.phone);
    return row;
  });
}

function distinctSellers(rows) {
  const sellers = new Set();
  for (const row of rows) if (row.src_id != null) sellers.add(row.src_id);
  return sellers;
}

export function getSellerIdsWithoutContact(rows) {
  const sellers = distinctSellers(rows);
  const sellersWithContact = new Set(
    rows.filter(row => row.hasChannel && row.src_id != null).map(row => row.src_id),
  );
  return [...sellers].filter(seller => !sellersWithContact.has(seller))
    .sort((left, right) => String(left).localeCompare(String(right)));
}

export function reachesShareThreshold(count, denominator, threshold = 0.2) {
  return denominator > 0 && count / denominator >= threshold;
}

function buildStage(rule, label, before, after) {
  const beforeSellers = distinctSellers(before);
  const afterSellers = distinctSellers(after);
  let excluded = 0;
  for (const seller of beforeSellers) if (!afterSellers.has(seller)) excluded += 1;
  return {
    rule,
    label,
    before_sellers: beforeSellers.size,
    remaining_sellers: afterSellers.size,
    excluded_sellers: excluded,
    variation_percent: beforeSellers.size
      ? Math.round(((afterSellers.size - beforeSellers.size) * 10000) / beforeSellers.size) / 100
      : null,
    before_contacts: before.length,
    remaining_contacts: after.length,
    excluded_contacts: before.length - after.length,
  };
}

/** Funnel único: la tabla, los gráficos, las tarjetas y la descarga consumen este resultado. */
export function calculateFunnel(baseRows, filters = {}) {
  let current = baseRows;
  const stages = [];

  for (const [key, , label] of FILTER_DEFS) {
    const selected = filters[key] ?? [];
    if (!selected.length) continue;
    let next;
    if (key === 'operational_exclusion') {
      next = current.filter(row => row.cat[key] !== 'EXCLUDE');
      next = next.filter(row => selected.includes(row.cat[key]));
    } else {
      next = current.filter(row => selected.includes(row.cat[key]));
    }
    stages.push(buildStage(key, label, current, next));
    current = next;
  }

  const eligibleRows = current;
  const withChannel = current.filter(row => row.hasChannel);
  stages.push(buildStage('contact_channel', 'Sin canal de contacto', current, withChannel));
  return { stages, eligibleRows, rows: withChannel };
}

/** Filas elegibles: AND entre dimensiones, OR dentro de cada una. */
export function applyAudienceFilters(baseRows, filters = {}) {
  return calculateFunnel(baseRows, filters).eligibleRows;
}

export function calculateAudienceMetrics(baseRows, funnel, inputReconciled = true) {
  const foundSellers = distinctSellers(baseRows);
  const eligibleSellers = distinctSellers(funnel.eligibleRows);
  const contactsBySeller = new Map();
  const sellersWithChannel = new Set();
  for (const row of baseRows) {
    if (row.src_id == null) continue;
    contactsBySeller.set(row.src_id, (contactsBySeller.get(row.src_id) ?? 0) + 1);
    if (row.hasChannel) sellersWithChannel.add(row.src_id);
  }
  const excludedSellers = foundSellers.size - eligibleSellers.size;
  let multiple = 0;
  for (const count of contactsBySeller.values()) if (count > 1) multiple += 1;

  return {
    foundSellers: foundSellers.size,
    baseContacts: baseRows.length,
    eligibleSellers: eligibleSellers.size,
    finalContacts: funnel.rows.length,
    excludedSellers,
    sellersWithoutContact: foundSellers.size - sellersWithChannel.size,
    sellersWithMultipleContacts: multiple,
    reconciled: inputReconciled && foundSellers.size === eligibleSellers.size + excludedSellers,
  };
}

export function buildAudienceAlerts({ metrics, baseRows, filters, input, searchType, notFoundCount, threshold }) {
  const alerts = [];
  if (notFoundCount > 0) {
    alerts.push({
      code: 'IDENTIFIERS_NOT_FOUND',
      severity: 'warning',
      requires_confirmation: searchType === 'seller_id' && notFoundCount / input.valid_unique > threshold,
      message: `${notFoundCount} identificadores no aparecen en la base maestra.`,
    });
  }
  const hasNullInRules = Object.entries(filters).some(([key, values]) => (
    values?.length && baseRows.some(row => row.cat[key] === NULL_VALUE)
  ));
  if (hasNullInRules) {
    alerts.push({
      code: 'FILTER_NULLS_PRESENT',
      severity: 'warning',
      requires_confirmation: false,
      message: 'Hay registros con valores sin dato en filtros aplicados.',
    });
  }
  if (!metrics.reconciled) {
    alerts.push({
      code: 'COUNTS_NOT_RECONCILED',
      severity: 'error',
      requires_confirmation: false,
      message: 'Los conteos de sellers no concilian; no se puede descargar.',
    });
  }
  if (metrics.eligibleSellers === 0) {
    alerts.push({
      code: 'EMPTY_AUDIENCE',
      severity: 'error',
      requires_confirmation: false,
      message: 'La audiencia final no contiene sellers elegibles.',
    });
  }
  if (metrics.finalContacts === 0) {
    alerts.push({
      code: 'NO_CONTACTS',
      severity: 'error',
      requires_confirmation: false,
      message: 'La audiencia final no contiene contactos con email o teléfono.',
    });
  }
  return alerts;
}

/** Participación por categoría sobre la audiencia filtrada; los nulos van como Sin dato. */
export function buildAudienceBreakdown(rows, dimension) {
  const groups = new Map();
  for (const row of rows) {
    const value = row.cat[dimension];
    if (!groups.has(value)) groups.set(value, { value, sellerIds: new Set(), contacts: 0 });
    const group = groups.get(value);
    if (row.src_id != null) group.sellerIds.add(row.src_id);
    group.contacts += 1;
  }
  const items = [...groups.values()].map(group => ({
    value: group.value, sellers: group.sellerIds.size, contacts: group.contacts,
  }));
  const totalSellers = items.reduce((sum, item) => sum + item.sellers, 0);
  const totalContacts = items.reduce((sum, item) => sum + item.contacts, 0);
  return items
    .map(item => ({
      ...item,
      pctSellers: totalSellers ? (item.sellers * 100) / totalSellers : 0,
      pctContacts: totalContacts ? (item.contacts * 100) / totalContacts : 0,
    }))
    .sort((a, b) => b.sellers - a.sellers || b.contacts - a.contacts);
}

export function buildImpactFunnel(inputUnique, metrics, stages) {
  if (!inputUnique) return [];

  const data = [{
    key: 'input', name: 'Únicos válidos', remaining: inputUnique,
    reduction: 0, remainingPercent: 100, reductionPercent: 0,
  }];
  let previous = inputUnique;

  if (metrics.foundSellers < previous) {
    data.push({
      key: 'found', name: 'Encontrados', remaining: metrics.foundSellers,
      reduction: previous - metrics.foundSellers,
      remainingPercent: (metrics.foundSellers / inputUnique) * 100,
      reductionPercent: ((previous - metrics.foundSellers) / previous) * 100,
    });
    previous = metrics.foundSellers;
  }

  for (const stage of stages) {
    if (stage.rule === 'contact_channel' || stage.excluded_sellers <= 0) continue;
    const remaining = stage.remaining_sellers;
    if (remaining >= previous) continue;
    data.push({
      key: stage.rule, name: stage.label, remaining,
      reduction: previous - remaining,
      remainingPercent: (remaining / inputUnique) * 100,
      reductionPercent: ((previous - remaining) / previous) * 100,
      stage,
    });
    previous = remaining;
  }

  if (data.length === 1 && metrics.eligibleSellers === inputUnique) {
    data[0].name = 'Sellers elegibles';
  } else if (data.at(-1).remaining === metrics.eligibleSellers) {
    data.at(-1).name = data.at(-1).key === 'found'
      ? 'Encontrados / elegibles'
      : `${data.at(-1).name} · elegibles`;
  } else if (metrics.eligibleSellers < previous) {
    data.push({
      key: 'eligible', name: 'Sellers elegibles', remaining: metrics.eligibleSellers,
      reduction: previous - metrics.eligibleSellers,
      remainingPercent: (metrics.eligibleSellers / inputUnique) * 100,
      reductionPercent: previous ? ((previous - metrics.eligibleSellers) / previous) * 100 : 0,
    });
  }
  return data;
}

/** Proporción elegible respecto de todos los identificadores válidos ingresados. */
export function buildEligibilityBreakdown(metrics, notFoundIdentifiers = 0, inputUnique = metrics.foundSellers) {
  const total = inputUnique;
  const eligible = metrics.eligibleSellers;
  const excluded = Math.max(total - eligible, 0);
  const excludedByFilters = Math.max(metrics.foundSellers - eligible, 0);
  return {
    total,
    eligible,
    excluded,
    pctEligible: total ? (eligible * 100) / total : 0,
    pctExcluded: total ? (excluded * 100) / total : 0,
    notFound: notFoundIdentifiers,
    excludedByFilters,
    sellersWithoutContact: metrics.sellersWithoutContact,
  };
}

/** Sellers distintos por categoría de cada filtro, respetando los demás filtros activos. */
export function buildFacetCounts(baseRows, filters = {}) {
  const selectedSets = {};
  for (const [key] of FILTER_DEFS) {
    selectedSets[key] = filters[key]?.length ? new Set(filters[key]) : null;
  }
  const facets = {};
  for (const [key] of FILTER_DEFS) {
    const groups = new Map();
    for (const row of baseRows) {
      let passes = true;
      for (const [other] of FILTER_DEFS) {
        if (other !== key && selectedSets[other] && !selectedSets[other].has(row.cat[other])) {
          passes = false;
          break;
        }
      }
      if (!passes || row.src_id == null) continue;
      const value = row.cat[key];
      if (!groups.has(value)) groups.set(value, new Set());
      groups.get(value).add(row.src_id);
    }
    facets[key] = new Map([...groups].map(([value, sellers]) => [value, sellers.size]));
  }
  return facets;
}

export function categoryLabel(options, key, value) {
  if (value === NULL_VALUE) return 'Sin dato';
  const option = options?.[key]?.find(item => item.value === value);
  return option?.label ?? value;
}
