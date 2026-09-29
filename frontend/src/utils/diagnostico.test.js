// Fase 3.4 — reglas del modal de Diagnóstico IA. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarInteracciones, detectarAlcance, textoCuota, validarDiagnostico } from './diagnostico.js';

const base = {
  fecha_start: '2026-09-01', fecha_end: '2026-09-27',
  pais: [], departamento: [], email_agente: [], email_manager: [],
};
const opciones = {
  agentes:  [{ email: 'ana@f.com', nombre: 'Ana Pérez' }],
  managers: [{ email: 'lu@f.com',  nombre: 'Lucía' }],
};

test('cuenta una vez cada interacción', () => {
  const rows = [
    { es_primera_fila_interaccion: true }, { es_primera_fila_interaccion: false },
    { es_primera_fila_interaccion: true },
  ];
  assert.equal(contarInteracciones(rows), 2);
});

test('validación de período y volumen', () => {
  assert.match(validarDiagnostico({ ...base, fecha_start: '' }, 100), /período/);
  assert.match(validarDiagnostico({ ...base, fecha_start: '2026-05-01' }, 100), /máximo 92/);
  assert.match(validarDiagnostico({ ...base, fecha_start: '2026-09-28' }, 100), /anterior/);
  assert.match(validarDiagnostico(base, 19), /al menos 20/);
  assert.equal(validarDiagnostico(base, 20), null);
});

test('alcance persona con nombre del agente', () => {
  assert.deepEqual(detectarAlcance({ ...base, email_agente: ['ana@f.com'] }, opciones),
    { tipo: 'PERSONA', etiqueta: 'Ana Pérez' });
});

test('alcance equipo por equipo, manager o varios agentes', () => {
  assert.deepEqual(detectarAlcance({ ...base, departamento: ['GSC'], email_manager: ['lu@f.com'] }, opciones),
    { tipo: 'EQUIPO', etiqueta: 'Equipo GSC · Manager Lucía' });
  assert.equal(detectarAlcance({ ...base, email_agente: ['a@f.com', 'b@f.com'] }, opciones).tipo, 'EQUIPO');
});

test('alcance general', () => {
  assert.deepEqual(detectarAlcance({ ...base, pais: ['CO'] }, opciones), { tipo: 'GENERAL', etiqueta: 'Operación CO' });
  assert.deepEqual(detectarAlcance(base, opciones), { tipo: 'GENERAL', etiqueta: 'Operación' });
});

test('texto de cuota', () => {
  assert.equal(textoCuota({ ilimitada: false, restantes: 3, limite: 5 }), 'Te quedan 3 de 5 diagnósticos este mes.');
  assert.match(textoCuota({ ilimitada: true }), /Sin límite/);
  assert.equal(textoCuota(null), null);
});
