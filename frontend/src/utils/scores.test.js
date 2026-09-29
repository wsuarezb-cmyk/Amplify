// Semáforo del tablero (≥90 Bueno, ≥85 Regular, <85 Crítico). Correr: npm test
// Debe coincidir con _SEMAFORO del diagnóstico IA (backend/services/diagnostico/metricas.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getScoreBg, getScoreColor, getScoreLabel, SCORE_THRESHOLDS } from './scores.js';

test('umbrales definidos por Calidad', () => {
  assert.equal(SCORE_THRESHOLDS.HIGH.min, 90);
  assert.equal(SCORE_THRESHOLDS.MEDIUM.min, 85);
});

test('etiquetas en los bordes de cada rango', () => {
  assert.equal(getScoreLabel(90), 'Bueno');
  assert.equal(getScoreLabel(89.9), 'Regular');
  assert.equal(getScoreLabel(85), 'Regular');
  assert.equal(getScoreLabel(84.9), 'Crítico');
  assert.equal(getScoreLabel(null), '—');
});

test('colores del semáforo', () => {
  assert.equal(getScoreColor(95), 'var(--color-score-high)');
  assert.equal(getScoreColor(87), 'var(--color-score-medium)');
  assert.equal(getScoreColor(80), 'var(--color-score-low)');
  assert.equal(getScoreBg(87), 'var(--color-score-medium-bg)');
});
