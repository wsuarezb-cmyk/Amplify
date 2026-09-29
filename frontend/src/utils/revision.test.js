// Tarea 1.4 — reglas de la revisión frente a SAACA. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observacionValida, puedeConfirmar, requiereObservacion } from './revision.js';

test('observación obligatoria solo con desacuerdo o cambio de voto', () => {
  assert.equal(requiereObservacion('CUMPLE', 'CUMPLE', 'CUMPLE'), false);
  assert.equal(requiereObservacion('NO_CUMPLE', 'CUMPLE', 'NO_CUMPLE'), true);
  assert.equal(requiereObservacion('NO_CUMPLE', 'CUMPLE', 'CUMPLE'), true);
  assert.equal(requiereObservacion('CUMPLE', 'CUMPLE', 'NO_CUMPLE'), true);
});

test('observación válida exige un mínimo de caracteres', () => {
  assert.equal(observacionValida('  ok  '), false);
  assert.equal(observacionValida(null), false);
  assert.equal(observacionValida('Motivo correcto'), true);
});

const criterios = [
  { criterion_id: 'C1', resultado_ciego: 'CUMPLE',    resultado_saaca: 'CUMPLE' },
  { criterion_id: 'C2', resultado_ciego: 'NO_CUMPLE', resultado_saaca: 'CUMPLE' },
];

test('no se puede confirmar si falta la observación de un desacuerdo', () => {
  assert.equal(puedeConfirmar(criterios, { C1: 'CUMPLE', C2: 'NO_CUMPLE' }, {}), false);
});

test('se puede confirmar con la observación del desacuerdo', () => {
  assert.equal(puedeConfirmar(criterios, { C1: 'CUMPLE', C2: 'NO_CUMPLE' }, { C2: 'El seller adjuntó' }), true);
});

test('cambiar el voto para coincidir con SAACA también pide observación', () => {
  assert.equal(puedeConfirmar(criterios, { C1: 'CUMPLE', C2: 'CUMPLE' }, {}), false);
  assert.equal(puedeConfirmar(criterios, { C1: 'CUMPLE', C2: 'CUMPLE' }, { C2: 'SAACA tiene razón' }), true);
});

test('sin criterios no hay nada que confirmar', () => {
  assert.equal(puedeConfirmar([], {}, {}), false);
});
