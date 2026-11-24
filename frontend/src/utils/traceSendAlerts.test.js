import test from 'node:test';
import assert from 'node:assert/strict';
import { addTraceAlertRecipients } from './traceSendAlerts.js';

test('agrega correos separados por comas, punto y coma o saltos de línea', () => {
  const result = addTraceAlertRecipients([], 'ana@falabella.com; bob@falabella.com\ncarla@falabella.com');

  assert.deepEqual(result.recipients, ['ana@falabella.com', 'bob@falabella.com', 'carla@falabella.com']);
  assert.equal(result.error, '');
});

test('deduplica correos sin distinguir mayúsculas y conserva la forma escrita', () => {
  const result = addTraceAlertRecipients(
    ['Ana@Falabella.com'], 'ana@falabella.com, bob@falabella.com; BOB@FALABELLA.COM',
  );

  assert.deepEqual(result.recipients, ['Ana@Falabella.com', 'bob@falabella.com']);
});

test('rechaza entradas inválidas y conserva los destinatarios válidos', () => {
  const result = addTraceAlertRecipients([], 'ana@falabella.com,correo-invalido');

  assert.deepEqual(result.recipients, ['ana@falabella.com']);
  assert.equal(result.error, 'Revisa los correos ingresados.');
});

test('no excede el máximo permitido', () => {
  const current = ['ana@falabella.com'];
  const result = addTraceAlertRecipients(current, 'bob@falabella.com', 1);

  assert.equal(result.recipients, current);
  assert.match(result.error, /hasta 1 destinatarios/u);
});