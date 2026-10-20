import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_GROUPS, seccionesVisibles } from './reporteriaSections.js';

test('Trace pertenece a la navegación de Vista Ejecutiva', () => {
  assert.ok(NAV_GROUPS[0].sections.some(section => section.id === 'sec-trace'));
});

test('Trace solo está visible en la Vista Ejecutiva', () => {
  assert.ok(seccionesVisibles('ejecutiva').some(section => section.id === 'sec-trace'));
  assert.ok(!seccionesVisibles('operativa').some(section => section.id === 'sec-trace'));
});

test('las secciones ejecutivas comunes siguen visibles en ambas vistas', () => {
  assert.ok(seccionesVisibles('ejecutiva').some(section => section.id === 'sec-kpis'));
  assert.ok(seccionesVisibles('operativa').some(section => section.id === 'sec-kpis'));
});
