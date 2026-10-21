import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_GROUPS, seccionesVisibles } from './reporteriaSections.js';

test('Trace ya no forma parte de la navegación de Reportería', () => {
  const ids = NAV_GROUPS.flatMap(group => group.sections.map(section => section.id));
  assert.ok(!ids.includes('sec-trace'));
});

test('la Vista Ejecutiva muestra sus secciones en ambas vistas', () => {
  assert.deepEqual(
    seccionesVisibles('ejecutiva').map(section => section.id),
    NAV_GROUPS[0].sections.map(section => section.id),
  );
});

test('las secciones ejecutivas comunes siguen visibles en ambas vistas', () => {
  assert.ok(seccionesVisibles('ejecutiva').some(section => section.id === 'sec-kpis'));
  assert.ok(seccionesVisibles('operativa').some(section => section.id === 'sec-kpis'));
});
