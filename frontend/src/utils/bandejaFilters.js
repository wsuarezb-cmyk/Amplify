/**
 * Filtros de la bandeja de calibración — funciones puras (sin React).
 *
 * La bandeja de un auditor es de volumen bajo (decenas/cientos de
 * interacciones), así que se filtra en el cliente sobre lo ya cargado:
 * sin nuevas consultas a BigQuery.
 */

// Estados agregados por interacción, en el orden en que se muestran.
export const ESTADOS_BANDEJA = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'DESCARTADO'];

export const ESTADO_LABEL = {
  PENDIENTE:   'Pendiente',
  EN_PROGRESO: 'En revisión',
  COMPLETADO:  'Completado',
  DESCARTADO:  'Descartado',
};

// Por defecto se muestra solo el trabajo abierto.
export const DEFAULT_BANDEJA_FILTERS = {
  texto:    '',
  estado:   ['PENDIENTE', 'EN_PROGRESO'],
  tipo:     [],
  pais:     [],
  criterio: [],
  batch:    [],
  desde:    '',   // YYYY-MM-DD sobre fecha_asignacion
  hasta:    '',
};

const sinDuplicados = (arr) => [...new Set(arr.filter(v => v != null && v !== ''))].sort();

/** Opciones de cada filtro, derivadas de los items cargados. */
export function opcionesBandeja(items) {
  const criterios = new Map();   // criterion_id → nombre
  const batches   = new Map();   // batch_id → fecha (YYYY-MM-DD) de asignación más antigua
  for (const it of items) {
    for (const c of it.criterios ?? []) {
      if (!criterios.has(c.criterion_id)) criterios.set(c.criterion_id, c.criterion_name ?? c.criterion_id);
    }
    if (it.batch_id) {
      const f = (it.fecha_asignacion ?? '').slice(0, 10);
      const prev = batches.get(it.batch_id);
      if (prev === undefined || (f && f < prev)) batches.set(it.batch_id, f);
    }
  }
  return {
    tipos:     sinDuplicados(items.map(i => i.interaction_type)),
    paises:    sinDuplicados(items.map(i => i.pais)),
    criterios: [...criterios.keys()].sort(),
    criterioNombre: Object.fromEntries(criterios),
    batches:   [...batches.keys()].sort((a, b) => (batches.get(b) ?? '').localeCompare(batches.get(a) ?? '')),
    batchFecha: Object.fromEntries(batches),
  };
}

/** Aplica los filtros; un filtro vacío no restringe. */
export function filtrarBandeja(items, f) {
  const texto = f.texto.trim().toLowerCase();
  return items.filter(it => {
    if (f.estado.length   && !f.estado.includes(it.estado))           return false;
    if (f.tipo.length     && !f.tipo.includes(it.interaction_type))   return false;
    if (f.pais.length     && !f.pais.includes(it.pais))               return false;
    if (f.batch.length    && !f.batch.includes(it.batch_id))          return false;
    if (f.criterio.length && !(it.criterios ?? []).some(c => f.criterio.includes(c.criterion_id))) return false;

    const fecha = (it.fecha_asignacion ?? '').slice(0, 10);
    if (f.desde && (!fecha || fecha < f.desde)) return false;
    if (f.hasta && (!fecha || fecha > f.hasta)) return false;

    if (texto) {
      const campos = [it.numero_caso, it.interaction_id, it.nombre_agente];
      if (!campos.some(v => v && String(v).toLowerCase().includes(texto))) return false;
    }
    return true;
  });
}

/** Cantidad de filtros que difieren del default (para el botón "Limpiar"). */
export function filtrosActivos(f) {
  let n = 0;
  if (f.texto.trim()) n++;
  if (f.desde) n++;
  if (f.hasta) n++;
  for (const k of ['tipo', 'pais', 'criterio', 'batch']) if (f[k].length) n++;
  const def = DEFAULT_BANDEJA_FILTERS.estado;
  if (f.estado.length !== def.length || f.estado.some(e => !def.includes(e))) n++;
  return n;
}
