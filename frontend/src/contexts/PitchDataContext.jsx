/**
 * PitchDataContext — datos y cross-filter de Reportería.
 *
 * Arquitectura (spec §1): el extracto completo se carga UNA vez por sesión
 * y todo el filtrado ocurre en memoria del navegador. Un click en cualquier
 * gráfico (crossFilter) actúa como un filtro más — todos los componentes
 * que leen filteredRows se recalculan sin ningún request nuevo.
 *
 * Semántica del cross-filter: los filtros seleccionan un subconjunto de
 * filas; los KPIs de nivel interacción usan el score_interaccion canónico
 * precalculado río arriba (pitch_eval_enriched) — no se recalcula el
 * ponderado con subconjuntos de criterios.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getPitchExtracto } from '../services/api.js';
import { hydrateExtracto } from '../utils/aggregations.js';

const EMPTY_FILTERS = {
  fecha_start:          '',   // '' = sin límite (toda la ventana del extracto)
  fecha_end:            '',
  pais:                 [],
  departamento:         [],
  tipo_interaccion:     [],
  id_criterio:          [],
  tipificacion_nivel_1: [],
  tipificacion_nivel_2: [],
  nombre_tipificacion:  [],
  email_agente:         [],
  email_manager:        [],
  mecanismo_evaluacion: [],
  // Multi-valor por lista pegada (coma/espacio/salto de línea) — match exacto
  numero_caso:          [],
  interaction_id:       [],
  seller_code:          [],
};

const PitchDataContext = createContext(null);

export function PitchDataProvider({ children }) {
  const [rows, setRows]       = useState(null);   // null = aún no cargado
  const [meta, setMeta]       = useState(null);   // { fecha_carga, total_filas }
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getPitchExtracto();
      setRows(hydrateExtracto(payload));
      setMeta({ fecha_carga: payload.fecha_carga, total_filas: payload.total_filas });
    } catch (e) {
      setError(e.message ?? 'Error al cargar el extracto');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  /** Click en un gráfico: alterna el valor dentro del filtro de esa dimensión. */
  const crossFilter = useCallback((key, value) => {
    setFilters(prev => {
      const current = prev[key];
      if (!Array.isArray(current)) return { ...prev, [key]: value };
      return current.includes(value)
        ? { ...prev, [key]: current.filter(v => v !== value) }
        : { ...prev, [key]: [...current, value] };
    });
  }, []);

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const activeFilterCount = useMemo(() =>
    Object.entries(filters).reduce((acc, [key, v]) => {
      if (key === 'fecha_start' || key === 'fecha_end') return acc;
      if (Array.isArray(v)) return acc + (v.length > 0 ? 1 : 0);
      return acc + (v ? 1 : 0);
    }, 0),
  [filters]);

  // ── Aplicación de filtros sobre las filas crudas ──────────────────────
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const f = filters;
    // Sets para match exacto O(1) en los filtros de lista pegada
    const casosSet    = f.numero_caso.length    > 0 ? new Set(f.numero_caso)    : null;
    const interSet    = f.interaction_id.length > 0 ? new Set(f.interaction_id) : null;
    const sellerSet   = f.seller_code.length    > 0 ? new Set(f.seller_code)    : null;

    // Filtros de criterio (id_criterio, mecanismo) seleccionan interacciones:
    // primero se identifican las interacciones que tienen alguna fila que
    // matchea, luego se conservan TODAS sus filas (para que los KPIs de
    // interacción y categoría no queden truncados).
    const rowLevelActive = f.id_criterio.length > 0 || f.mecanismo_evaluacion.length > 0;

    const interactionPred = r =>
      (!f.fecha_start || (r.fecha_evaluacion ?? '') >= f.fecha_start) &&
      (!f.fecha_end   || (r.fecha_evaluacion ?? '') <= f.fecha_end) &&
      (f.pais.length === 0                 || f.pais.includes(r.pais)) &&
      (f.departamento.length === 0         || f.departamento.includes(r.departamento)) &&
      (f.tipo_interaccion.length === 0     || f.tipo_interaccion.includes(r.tipo_interaccion)) &&
      (f.tipificacion_nivel_1.length === 0 || f.tipificacion_nivel_1.includes(r.tipificacion_nivel_1)) &&
      (f.tipificacion_nivel_2.length === 0 || f.tipificacion_nivel_2.includes(r.tipificacion_nivel_2)) &&
      (f.nombre_tipificacion.length === 0  || f.nombre_tipificacion.includes(r.nombre_tipificacion)) &&
      (f.email_agente.length === 0         || f.email_agente.includes(r.email_agente)) &&
      (f.email_manager.length === 0        || f.email_manager.includes(r.email_manager)) &&
      (!casosSet  || casosSet.has(r.numero_caso)) &&
      (!interSet  || interSet.has(r.interaction_id)) &&
      (!sellerSet || sellerSet.has(r.seller_code));

    if (!rowLevelActive) return rows.filter(interactionPred);

    const matchIds = new Set();
    for (const r of rows) {
      if (!interactionPred(r)) continue;
      if (f.id_criterio.length > 0 && !f.id_criterio.includes(r.id_criterio)) continue;
      if (f.mecanismo_evaluacion.length > 0 && !f.mecanismo_evaluacion.includes(r.mecanismo_evaluacion)) continue;
      matchIds.add(r.interaction_id);
    }
    return rows.filter(r => interactionPred(r) && matchIds.has(r.interaction_id));
  }, [rows, filters]);

  // ── Filas de NIVEL CRITERIO ──────────────────────────────────────────
  // filteredRows conserva TODAS las filas de las interacciones que matchean
  // (correcto para KPIs y vistas de interacción). Pero las vistas POR CRITERIO
  // (cumplimiento por criterio, heatmap) deben ver SOLO las filas del criterio
  // filtrado — si no, muestran criterios ajenos. criterionRows aplica ese
  // recorte extra por id_criterio / mecanismo.
  const criterionRows = useMemo(() => {
    const f = filters;
    if (f.id_criterio.length === 0 && f.mecanismo_evaluacion.length === 0) {
      return filteredRows;
    }
    return filteredRows.filter(r =>
      (f.id_criterio.length === 0        || f.id_criterio.includes(r.id_criterio)) &&
      (f.mecanismo_evaluacion.length === 0 || f.mecanismo_evaluacion.includes(r.mecanismo_evaluacion))
    );
  }, [filteredRows, filters]);

  // ── Opciones de filtro derivadas del propio payload ───────────────────
  const filterOptions = useMemo(() => {
    if (!rows) return null;
    const sets = {
      pais: new Set(), departamento: new Set(), tipo_interaccion: new Set(),
      mecanismo_evaluacion: new Set(),
      tipificacion_nivel_1: new Set(),
    };
    const criterios = new Map();   // id → nombre
    const agentes   = new Map();   // email → nombre
    const managers  = new Map();   // email → nombre
    const tipiTree  = new Set();   // "n1|n2|nombre"
    let fechaMin = '', fechaMax = '';

    for (const r of rows) {
      if (r.pais) sets.pais.add(r.pais);
      if (r.departamento) sets.departamento.add(r.departamento);
      if (r.tipo_interaccion) sets.tipo_interaccion.add(r.tipo_interaccion);
      if (r.mecanismo_evaluacion) sets.mecanismo_evaluacion.add(r.mecanismo_evaluacion);
      if (r.tipificacion_nivel_1) sets.tipificacion_nivel_1.add(r.tipificacion_nivel_1);
      if (r.id_criterio && !criterios.has(r.id_criterio)) criterios.set(r.id_criterio, r.nombre_criterio ?? r.id_criterio);
      if (r.email_agente && !agentes.has(r.email_agente)) agentes.set(r.email_agente, r.nombre_agente ?? r.email_agente);
      if (r.email_manager && !managers.has(r.email_manager)) managers.set(r.email_manager, r.nombre_manager ?? r.email_manager);
      if (r.tipificacion_nivel_1) tipiTree.add(`${r.tipificacion_nivel_1}|${r.tipificacion_nivel_2 ?? ''}|${r.nombre_tipificacion ?? ''}`);
      if (r.fecha_evaluacion) {
        if (!fechaMin || r.fecha_evaluacion < fechaMin) fechaMin = r.fecha_evaluacion;
        if (r.fecha_evaluacion > fechaMax) fechaMax = r.fecha_evaluacion;
      }
    }

    const sorted = s => [...s].sort();
    return {
      pais: sorted(sets.pais),
      departamento: sorted(sets.departamento),
      tipo_interaccion: sorted(sets.tipo_interaccion),
      mecanismo_evaluacion: sorted(sets.mecanismo_evaluacion),
      tipificacion_nivel_1: sorted(sets.tipificacion_nivel_1),
      criterios: [...criterios.entries()]
        .map(([id, nombre]) => ({ id, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      agentes: [...agentes.entries()]
        .map(([email, nombre]) => ({ email, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      managers: [...managers.entries()]
        .map(([email, nombre]) => ({ email, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      tipiTree: [...tipiTree].map(t => {
        const [n1, n2, nombre] = t.split('|');
        return { n1, n2: n2 || null, nombre: nombre || null };
      }),
      fechaMin,
      fechaMax,
    };
  }, [rows]);

  return (
    <PitchDataContext.Provider value={{
      allRows: rows,
      filteredRows,
      criterionRows,
      filterOptions,
      meta,
      loading,
      error,
      reload: load,
      filters,
      setFilter,
      crossFilter,
      resetFilters,
      activeFilterCount,
    }}>
      {children}
    </PitchDataContext.Provider>
  );
}

export function usePitchData() {
  const ctx = useContext(PitchDataContext);
  if (!ctx) throw new Error('usePitchData debe usarse dentro de <PitchDataProvider>');
  return ctx;
}
