import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NULL_VALUE, applyAudienceFilters, buildAudienceAlerts, buildAudienceBreakdown,
  buildEligibilityBreakdown, buildFacetCounts, buildImpactFunnel, calculateAudienceMetrics,
  getSellerIdsWithoutContact, reachesShareThreshold,
  calculateFunnel, normalizeAudienceDataset,
} from './traceAudience.js';

const columns = [
  'src_id', 'contacto', 'email', 'phone', 'Pais', 'geography', 'tipo_seller',
  'tiene_venta_12m', 'tiene_catalogo', 'estado_sellers_sx', 'mc_held_status',
  'desuscritos_mc', 'Seller_Delist', 'flag_or0_sin_login_3m',
];

function row(seller, overrides = {}) {
  const base = {
    src_id: seller, contacto: 'Comercial', email: `${seller}@x.com`, phone: null,
    Pais: 'Chile', geography: 'National', tipo_seller: 'Autogestionado',
    tiene_venta_12m: 1, tiene_catalogo: 1, estado_sellers_sx: 'Activo',
    mc_held_status: null, desuscritos_mc: 'activo_mc', Seller_Delist: 'Seller OK',
    flag_or0_sin_login_3m: 0, ...overrides,
  };
  return columns.map(column => base[column]);
}

const dataset = () => normalizeAudienceDataset({
  columns,
  rows: [
    row('S1'),
    row('S1', { contacto: 'Seller Full Access', email: null, phone: '123' }),
    row('S2', { Pais: 'Perú', tipo_seller: 'Híbrido', tiene_venta_12m: 0 }),
    row('S3', { Pais: null, flag_or0_sin_login_3m: 1 }),
    row('S4', { Pais: 'Chile', flag_or0_sin_login_3m: null }),
    row('S5', { email: null, phone: null }),
  ],
});

test('sin filtros mantiene los sellers encontrados y separa los contactos sin canal', () => {
  const funnel = calculateFunnel(dataset(), {});
  const eligible = new Set(funnel.eligibleRows.map(item => item.src_id));
  const contacts = new Set(funnel.rows.map(item => item.src_id));
  assert.deepEqual([...eligible].sort(), ['S1', 'S2', 'S3', 'S4', 'S5']);
  assert.deepEqual([...contacts].sort(), ['S1', 'S2', 'S3', 'S4']);
  assert.equal(funnel.rows.length, 5);
  assert.deepEqual(funnel.stages.map(stage => stage.rule), ['contact_channel']);
});

test('un filtro individual', () => {
  const rows = applyAudienceFilters(dataset(), { country: ['Chile'] });
  assert.deepEqual([...new Set(rows.map(item => item.src_id))].sort(), ['S1', 'S4', 'S5']);
});

test('varios filtros se combinan con AND', () => {
  const rows = applyAudienceFilters(dataset(), { country: ['Chile', 'Perú'], has_sales: ['1'] });
  assert.deepEqual([...new Set(rows.map(item => item.src_id))].sort(), ['S1', 'S4', 'S5']);
});

test('selección múltiple dentro de una dimensión usa OR', () => {
  const rows = applyAudienceFilters(dataset(), { country: ['Chile', 'Perú'] });
  assert.deepEqual([...new Set(rows.map(item => item.src_id))].sort(), ['S1', 'S2', 'S4', 'S5']);
});

test('los nulos se filtran como Sin dato cuando el usuario selecciona el valor', () => {
  const nullCountry = applyAudienceFilters(dataset(), { country: [NULL_VALUE] });
  assert.deepEqual(nullCountry.map(item => item.src_id), ['S3']);
  const pending = applyAudienceFilters(dataset(), { operational_exclusion: [NULL_VALUE] });
  assert.deepEqual(pending.map(item => item.src_id), ['S4']);
});

test('limpiar filtros restaura la audiencia', () => {
  const base = dataset();
  assert.equal(applyAudienceFilters(base, { country: ['Perú'] }).length, 1);
  assert.equal(applyAudienceFilters(base, {}).length, 6);
});

test('una combinación sin resultados deja cero y conserva el dataset base', () => {
  const base = dataset();
  const funnel = calculateFunnel(base, { country: ['Colombia'] });
  assert.equal(funnel.rows.length, 0);
  assert.equal(base.length, 6);
});

test('elegibles únicos son independientes de exclusión por defecto y canal', () => {
  const base = dataset();
  const metrics = calculateAudienceMetrics(base, calculateFunnel(base, {}));
  assert.equal(metrics.foundSellers, 5);
  assert.equal(metrics.eligibleSellers, 5);
  assert.equal(metrics.finalContacts, 5);
  assert.equal(metrics.sellersWithMultipleContacts, 1);
  assert.equal(metrics.sellersWithoutContact, 1);
  assert.equal(metrics.excludedSellers, 0);
  assert.equal(metrics.reconciled, true);
});

test('copia sellers sin contacto únicos aunque tengan varias filas', () => {
  const rows = dataset();
  rows.push({ ...rows[5] });
  assert.deepEqual(getSellerIdsWithoutContact(rows), ['S5']);
});

test('alerta al alcanzar 20 por ciento de únicos válidos', () => {
  assert.equal(reachesShareThreshold(2, 10), true);
  assert.equal(reachesShareThreshold(1, 10), false);
  assert.equal(reachesShareThreshold(0, 0), false);
});

test('el funnel concilia: elegibles + excluidos = encontrados con cualquier filtro', () => {
  const base = dataset();
  for (const filters of [{}, { country: ['Chile'] }, { tipo: [], seller_segment: ['Híbrido'] }, { country: ['Colombia'] }]) {
    const metrics = calculateAudienceMetrics(base, calculateFunnel(base, filters));
    assert.equal(metrics.foundSellers, metrics.eligibleSellers + metrics.excludedSellers);
    assert.equal(metrics.reconciled, true);
  }
});

test('desglose por dimensión: nulos como Sin dato y porcentajes suman 100', () => {
  const base = dataset();
  const rows = calculateFunnel(base, {}).rows;
  for (const dimension of ['country', 'geography', 'seller_segment', 'seller_status', 'contact_type']) {
    const items = buildAudienceBreakdown(rows, dimension);
    const total = items.reduce((sum, item) => sum + item.pctSellers, 0);
    assert.ok(Math.abs(total - 100) < 1e-9, dimension);
  }
  const byCountry = buildAudienceBreakdown(rows, 'country');
  assert.equal(byCountry[0].value, 'Chile');
  assert.equal(byCountry[0].sellers, 2);
  assert.equal(byCountry[0].contacts, 3);
});

test('elegibles vs excluidos concilia con el universo encontrado', () => {
  const base = dataset();
  const metrics = calculateAudienceMetrics(base, calculateFunnel(base, { country: ['Chile'] }));
  const breakdown = buildEligibilityBreakdown(metrics, 2);
  assert.equal(breakdown.eligible + breakdown.excluded, breakdown.total);
  assert.equal(breakdown.notFound, 2);
  assert.ok(Math.abs(breakdown.pctEligible + breakdown.pctExcluded - 100) < 1e-9);
});

test('funnel secuencial incluye no encontrados y solo filtros con reducción', () => {
  const stages = [
    { rule: 'country', label: 'País', excluded_sellers: 2, remaining_sellers: 6 },
    { rule: 'seller_status', label: 'Estado seller', excluded_sellers: 0, remaining_sellers: 6 },
    { rule: 'contact_channel', label: 'Sin canal', excluded_sellers: 1, remaining_sellers: 5 },
    { rule: 'seller_segment', label: 'Segmento', excluded_sellers: 1, remaining_sellers: 5 },
  ];
  const rows = buildImpactFunnel(10, { foundSellers: 8, eligibleSellers: 5 }, stages);

  assert.deepEqual(rows.map(item => item.key), ['input', 'found', 'country', 'seller_segment']);
  assert.deepEqual(rows.map(item => item.remaining), [10, 8, 6, 5]);
  assert.equal(rows[1].reduction, 2);
  assert.equal(rows[1].remainingPercent, 80);
  assert.equal(buildImpactFunnel(10, { foundSellers: 10, eligibleSellers: 10 }, [])[0].name, 'Sellers elegibles');
  assert.deepEqual(buildImpactFunnel(0, { foundSellers: 0, eligibleSellers: 0 }, []), []);
});

test('gauge usa únicos válidos y mantiene los componentes del desglose', () => {
  const breakdown = buildEligibilityBreakdown({
    foundSellers: 8, eligibleSellers: 5, sellersWithoutContact: 1,
  }, 2, 10);

  assert.equal(breakdown.total, 10);
  assert.equal(breakdown.pctEligible, 50);
  assert.equal(breakdown.notFound, 2);
  assert.equal(breakdown.excludedByFilters, 3);
  assert.equal(breakdown.sellersWithoutContact, 1);
});

test('facetas: cuentan sellers distintos y respetan los demás filtros', () => {
  const facets = buildFacetCounts(dataset(), { country: ['Chile'] });
  assert.equal(facets.country.get('Perú'), 1);
  assert.equal(facets.seller_segment.get('Híbrido'), undefined);
  assert.equal(facets.seller_segment.get('Autogestionado'), 3);
});

test('alertas: no encontrados sobre el umbral y bloqueo por audiencia vacía', () => {
  const base = dataset();
  const metrics = calculateAudienceMetrics(base, calculateFunnel(base, { country: ['Colombia'] }));
  const alerts = buildAudienceAlerts({
    metrics, baseRows: base, filters: { country: ['Colombia'] },
    input: { valid_unique: 5 }, searchType: 'seller_id', notFoundCount: 2, threshold: 0.2,
  });
  assert.ok(alerts.find(alert => alert.code === 'IDENTIFIERS_NOT_FOUND').requires_confirmation);
  assert.ok(alerts.some(alert => alert.code === 'EMPTY_AUDIENCE' && alert.severity === 'error'));
});

test('cero requests: filtrar, combinar y limpiar no usa la red', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls += 1; return Promise.resolve(); };
  try {
    const base = dataset();
    applyAudienceFilters(base, { country: ['Chile'] });
    applyAudienceFilters(base, { country: ['Chile'], seller_segment: ['Híbrido'] });
    applyAudienceFilters(base, { country: ['Chile', 'Perú'] });
    buildFacetCounts(base, { country: ['Chile'] });
    applyAudienceFilters(base, {});
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
