import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTraceIdentifiers } from './trace.js';

test('normaliza IDs separados por espacios, saltos, comas, punto y coma y tabulaciones', () => {
  const result = parseTraceIdentifiers('  S-01, S-02;\nS-03\tS-04  ');

  assert.deepEqual(result.identifiers, ['S-01', 'S-02', 'S-03', 'S-04']);
  assert.equal(result.received, 4);
  assert.equal(result.validUnique, 4);
  assert.equal(result.invalid.length, 0);
  assert.equal(result.duplicates, 0);
});

test('ignora valores vacíos y conserva una sola ocurrencia exacta de cada ID', () => {
  const result = parseTraceIdentifiers('\nA1, A1; a1\t\n');

  assert.deepEqual(result.identifiers, ['A1', 'a1']);
  assert.equal(result.received, 3);
  assert.equal(result.validUnique, 2);
  assert.equal(result.duplicates, 1);
});

test('una entrada vacía no produce IDs para consultar', () => {
  const result = parseTraceIdentifiers('  ,\n;\t ');

  assert.deepEqual(result.identifiers, []);
  assert.equal(result.received, 0);
});

test('preserva espacios internos al buscar nombres exactos', () => {
  const result = parseTraceIdentifiers('  Ana   María López ;\nJuan Pérez  ', { preserveSpaces: true });

  assert.deepEqual(result.identifiers, ['Ana María López', 'Juan Pérez']);
  assert.equal(result.received, 2);
});