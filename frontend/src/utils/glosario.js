/**
 * Glosario — funciones puras sobre el catálogo consolidado de /api/glosario.
 * El volumen es chico (decenas de criterios): todo se filtra en el cliente.
 */

export const DEFAULT_GLOSARIO_FILTERS = {
  estado:     'ACTIVO',   // ACTIVO / INACTIVO
  texto:      '',
  tipos:      [],         // interaction_type
  criticidad: [],         // CRITICAL / NON_CRITICAL
};

export const CRITICIDAD_LABEL = {
  CRITICAL:     'Crítico',
  NON_CRITICAL: 'No crítico',
};

// Categorías de error (error_category del catálogo de SAACA) — mismo texto que
// la sección "Resultados y puntaje" de constants/glosarioContenido.js.
export const CATEGORIA_LABEL = {
  ECU: 'ECU · Impacto en el seller',
  ECN: 'ECN · Impacto en el negocio',
  ECC: 'ECC · Cumplimiento',
  NON_CRITICAL: 'No crítico',
};

const tiposActivos = (c) => (c.tipos_interaccion ?? []).filter(t => t.is_active);

/** Conteo de criterios por estado, para el selector Activos/Inactivos. */
export function contarPorEstado(criterios) {
  const n = { ACTIVO: 0, INACTIVO: 0 };
  for (const c of criterios) n[c.estado] = (n[c.estado] ?? 0) + 1;
  return n;
}

export function filtrarCriterios(criterios, f) {
  const texto = f.texto.trim().toLowerCase();
  return criterios.filter(c => {
    if (f.estado && c.estado !== f.estado) return false;
    if (f.criticidad.length && !f.criticidad.includes(c.error_type)) return false;
    if (f.tipos.length && !(c.tipos_interaccion ?? []).some(t => f.tipos.includes(t.interaction_type))) return false;
    if (texto) {
      const campos = [c.criterion_id, c.criterion_name, c.criterion_description];
      if (!campos.some(v => v && v.toLowerCase().includes(texto))) return false;
    }
    return true;
  });
}

/**
 * Matriz criterio × tipo de interacción: solo criterios ACTIVOS y mapping
 * activo. celdas[tipo] = mecanismo (AUTO_IA / AUTO_IA_RAG / …) o null.
 */
export function matrizInteraccion(criterios, tipos) {
  return criterios
    .filter(c => c.estado === 'ACTIVO' && tiposActivos(c).length > 0)
    .map(c => {
      const celdas = Object.fromEntries(tipos.map(t => [t, null]));
      for (const t of tiposActivos(c)) {
        if (t.interaction_type in celdas) {
          celdas[t.interaction_type] = celdas[t.interaction_type]
            ? `${celdas[t.interaction_type]} + ${t.mechanism}`
            : t.mechanism;
        }
      }
      return { criterion_id: c.criterion_id, criterion_name: c.criterion_name, error_type: c.error_type, celdas };
    });
}
