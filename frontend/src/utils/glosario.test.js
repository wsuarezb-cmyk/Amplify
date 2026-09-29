// Fase 2 — Glosario. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GLOSARIO_FILTERS, contarPorEstado, filtrarCriterios, matrizInteraccion } from './glosario.js';

const criterios = [
  { criterion_id: 'C0001', criterion_name: 'Relevancia temática', criterion_description: 'Coherencia con el caso',
    estado: 'ACTIVO', error_type: 'CRITICAL',
    tipos_interaccion: [
      { interaction_type: 'EMAIL', mechanism: 'AUTO_IA', is_active: true },
      { interaction_type: 'TASK_INFO_REQUEST', mechanism: 'AUTO_IA', is_active: true },
    ] },
  { criterion_id: 'C0004', criterion_name: 'Calidad de escritura', criterion_description: 'Ortografía y gramática',
    estado: 'ACTIVO', error_type: 'NON_CRITICAL',
    tipos_interaccion: [{ interaction_type: 'EMAIL', mechanism: 'AUTO_IA', is_active: true }] },
  { criterion_id: 'C0008', criterion_name: 'Motivo de recontacto', criterion_description: 'Motivo correcto',
    estado: 'ACTIVO', error_type: 'CRITICAL',
    tipos_interaccion: [
      { interaction_type: 'TASK_RECONTACT', mechanism: 'AUTO_IA', is_active: true },
      { interaction_type: 'CASE', mechanism: 'AUTO_IA', is_active: false },   // mapping inactivo
    ] },
  { criterion_id: 'C0099', criterion_name: 'Criterio retirado', criterion_description: 'Ya no aplica',
    estado: 'INACTIVO', error_type: 'CRITICAL',
    tipos_interaccion: [{ interaction_type: 'EMAIL', mechanism: 'AUTO_IA', is_active: true }] },
];

const f = (over) => ({ ...DEFAULT_GLOSARIO_FILTERS, ...over });
const ids = (arr) => arr.map(c => c.criterion_id);

test('por defecto muestra solo activos', () => {
  assert.deepEqual(ids(filtrarCriterios(criterios, DEFAULT_GLOSARIO_FILTERS)), ['C0001', 'C0004', 'C0008']);
});

test('pestaña inactivos', () => {
  assert.deepEqual(ids(filtrarCriterios(criterios, f({ estado: 'INACTIVO' }))), ['C0099']);
});

test('búsqueda en id, nombre y descripción sin mayúsculas', () => {
  assert.deepEqual(ids(filtrarCriterios(criterios, f({ texto: 'ortograf' }))), ['C0004']);
  assert.deepEqual(ids(filtrarCriterios(criterios, f({ texto: 'c0008' }))), ['C0008']);
});

test('filtra por tipo de interacción y criticidad', () => {
  assert.deepEqual(ids(filtrarCriterios(criterios, f({ tipos: ['EMAIL'] }))), ['C0001', 'C0004']);
  assert.deepEqual(ids(filtrarCriterios(criterios, f({ tipos: ['EMAIL'], criticidad: ['CRITICAL'] }))), ['C0001']);
});

test('conteo por estado', () => {
  assert.deepEqual(contarPorEstado(criterios), { ACTIVO: 3, INACTIVO: 1 });
});

test('matriz: solo criterios activos y mapping activo', () => {
  const m = matrizInteraccion(criterios, ['CASE', 'EMAIL', 'TASK_INFO_REQUEST', 'TASK_RECONTACT']);
  assert.deepEqual(m.map(r => r.criterion_id), ['C0001', 'C0004', 'C0008']);   // sin C0099
  const c8 = m.find(r => r.criterion_id === 'C0008');
  assert.equal(c8.celdas.TASK_RECONTACT, 'AUTO_IA');
  assert.equal(c8.celdas.CASE, null);                                         // mapping inactivo
  assert.equal(m[0].celdas.TASK_INFO_REQUEST, 'AUTO_IA');
});
