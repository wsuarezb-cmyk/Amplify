/**
 * Utilidades de score para Pitch.
 * Todas las funciones trabajan con scores en rango 0–100.
 *
 * Los colores se devuelven como referencias var(--color-*) de
 * design-system/colors_and_type.css — válidas en estilos inline de React
 * y en atributos fill/stroke de SVG (Recharts). Nunca hex acá.
 */

// Umbrales del semáforo (definidos por Calidad) — sincronizados con los tokens
// --color-score-* del CSS y con _SEMAFORO del diagnóstico IA
// (backend/services/diagnostico/metricas.py). Cambiar en los tres lugares.
export const SCORE_THRESHOLDS = {
  HIGH:   { min: 90, label: 'Bueno' },
  MEDIUM: { min: 85, label: 'Regular' },
  LOW:    { min: 0,  label: 'Crítico' },
};

/**
 * Devuelve el color semafórico para un score (0–100) como var() CSS.
 */
export const getScoreColor = (score) => {
  if (score == null) return 'var(--color-score-none)';
  if (score >= SCORE_THRESHOLDS.HIGH.min)   return 'var(--color-score-high)';
  if (score >= SCORE_THRESHOLDS.MEDIUM.min) return 'var(--color-score-medium)';
  return 'var(--color-score-low)';
};

/**
 * Devuelve el color de fondo semafórico (versión clara) para un score.
 */
export const getScoreBg = (score) => {
  if (score == null) return 'var(--color-score-none-bg)';
  if (score >= SCORE_THRESHOLDS.HIGH.min)   return 'var(--color-score-high-bg)';
  if (score >= SCORE_THRESHOLDS.MEDIUM.min) return 'var(--color-score-medium-bg)';
  return 'var(--color-score-low-bg)';
};

/**
 * Devuelve el label semafórico ('Bueno', 'Regular', 'Crítico') para un score (0–100).
 */
export const getScoreLabel = (score) => {
  if (score == null) return '—';
  if (score >= SCORE_THRESHOLDS.HIGH.min)   return SCORE_THRESHOLDS.HIGH.label;
  if (score >= SCORE_THRESHOLDS.MEDIUM.min) return SCORE_THRESHOLDS.MEDIUM.label;
  return SCORE_THRESHOLDS.LOW.label;
};

/**
 * Formatea un score para display.
 * Acepta rango 0–1 (fraccionario) o 0–100.
 * @param {number|null} score
 * @param {boolean} [fractional=false] – true si el score viene en rango 0–1
 * @returns {string} e.g. "87.3%"
 */
export const formatScore = (score, fractional = false) => {
  if (score == null) return '—';
  const pct = fractional ? score * 100 : score;
  return `${pct.toFixed(1)}%`;
};
