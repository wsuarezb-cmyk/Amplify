// Tarea 1.3 — filtros de la bandeja. Correr: npm test (node --test, sin dependencias).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BANDEJA_FILTERS, filtrarBandeja, filtrosActivos, opcionesBandeja,
} from './bandejaFilters.js';

const items = [
  { interaction_id: 'I1', numero_caso: '1001', nombre_agente: 'Ana Pérez', interaction_type: 'EMAIL',
    pais: 'CO', batch_id: 'B1', fecha_asignacion: '2026-09-10 10:00:00+00', estado: 'PENDIENTE',
    criterios: [{ criterion_id: 'C0001', criterion_name: 'Saludo' }] },
  { interaction_id: 'I2', numero_caso: '1002', nombre_agente: 'Luis Gómez', interaction_type: 'TASK_RECONTACT',
    pais: 'CL', batch_id: 'B2', fecha_asignacion: '2026-09-20 10:00:00+00', estado: 'EN_PROGRESO',
    criterios: [{ criterion_id: 'C0008', criterion_name: 'Motivo recontacto' }] },
  { interaction_id: 'I3', numero_caso: '1003', nombre_agente: 'Ana Pérez', interaction_type: 'EMAIL',
    pais: 'CO', batch_id: 'B1', fecha_asignacion: '2026-09-10 10:00:00+00', estado: 'COMPLETADO',
    criterios: [{ criterion_id: 'C0001', criterion_name: 'Saludo' }, { criterion_id: 'C0002', criterion_name: 'Cierre' }] },
];

const f = (over) => ({ ...DEFAULT_BANDEJA_FILTERS, ...over });
const ids = (arr) => arr.map(i => i.interaction_id);

test('por defecto muestra solo pendientes y en revisión', () => {
  assert.deepEqual(ids(filtrarBandeja(items, DEFAULT_BANDEJA_FILTERS)), ['I1', 'I2']);
});

test('estado vacío no restringe', () => {
  assert.deepEqual(ids(filtrarBandeja(items, f({ estado: [] }))), ['I1', 'I2', 'I3']);
});

test('filtra por tipo de interacción', () => {
  assert.deepEqual(ids(filtrarBandeja(items, f({ estado: [], tipo: ['TASK_RECONTACT'] }))), ['I2']);
});

test('filtra por criterio si alguno de los asignados coincide', () => {
  assert.deepEqual(ids(filtrarBandeja(items, f({ estado: [], criterio: ['C0002'] }))), ['I3']);
});

test('filtra por país y batch combinados', () => {
  assert.deepEqual(ids(filtrarBandeja(items, f({ estado: [], pais: ['CO'], batch: ['B1'] }))), ['I1', 'I3']);
});

test('rango de fechas inclusivo sobre fecha de asignación', () => {
  assert.deepEqual(ids(filtrarBandeja(items, f({ estado: [], desde: '2026-09-15' }))), ['I2']);
  assert.deepEqual(ids(filtrarBandeja(items, f({ estado: [], hasta: '2026-09-10' }))), ['I1', 'I3']);
});

test('búsqueda por texto en caso, interacción o agente (sin mayúsculas)', () => {
  assert.deepEqual(ids(filtrarBandeja(items, f({ estado: [], texto: 'ana' }))), ['I1', 'I3']);
  assert.deepEqual(ids(filtrarBandeja(items, f({ estado: [], texto: '1002' }))), ['I2']);
  assert.deepEqual(ids(filtrarBandeja(items, f({ estado: [], texto: 'zzz' }))), []);
});

test('opciones derivadas sin duplicados', () => {
  const o = opcionesBandeja(items);
  assert.deepEqual(o.tipos, ['EMAIL', 'TASK_RECONTACT']);
  assert.deepEqual(o.paises, ['CL', 'CO']);
  assert.deepEqual(o.criterios, ['C0001', 'C0002', 'C0008']);
  assert.equal(o.criterioNombre.C0008, 'Motivo recontacto');
  assert.deepEqual(o.batches, ['B2', 'B1']);   // más reciente primero
});

test('conteo de filtros activos ignora el default de estado', () => {
  assert.equal(filtrosActivos(DEFAULT_BANDEJA_FILTERS), 0);
  assert.equal(filtrosActivos(f({ tipo: ['EMAIL'], texto: 'x' })), 2);
  assert.equal(filtrosActivos(f({ estado: ['COMPLETADO'] })), 1);
});
