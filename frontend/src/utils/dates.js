/**
 * Utilidades de fecha para PAUTA.
 */

/**
 * Formatea una fecha ISO o Date a string legible en español.
 * @param {string|Date|null} date
 * @param {object} [options] – opciones de Intl.DateTimeFormat
 * @returns {string}
 */
export const formatDate = (date, options = {}) => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  });
};

/**
 * Formatea a fecha + hora corta (DD/MM/YYYY HH:MM).
 * @param {string|Date|null} date
 * @returns {string}
 */
export const formatDateTime = (date) => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Convierte una fecha ISO UTC a fecha local (truncando la hora).
 * Útil para comparar fechas sin timezone offset.
 * @param {string|Date|null} date
 * @returns {Date|null}
 */
export const toLocalDate = (date) => {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
