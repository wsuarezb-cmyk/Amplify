/**
 * Diagnóstico IA — reglas puras del modal (sin React).
 *
 * Espejo de backend/services/diagnostico (filtros.validar_periodo,
 * contexto.detectar_alcance, MIN_INTERACCIONES): el backend valida igual,
 * esto solo guía al usuario antes de gastar cuota o esperar a la IA.
 */

export const MAX_DIAS = 92;
export const MIN_INTERACCIONES = 20;

export const ALCANCE_LABEL = {
  PERSONA: 'Feedback individual',
  EQUIPO:  'Diagnóstico de equipo',
  GENERAL: 'Diagnóstico operativo',
};

/** Interacciones evaluadas en las filas filtradas (una por interacción). */
export function contarInteracciones(filteredRows) {
  let n = 0;
  for (const r of filteredRows) if (r.es_primera_fila_interaccion) n++;
  return n;
}

/** Mensaje de por qué no se puede generar, o null si se puede. */
export function validarDiagnostico(filters, nInteracciones) {
  if (!filters.fecha_start || !filters.fecha_end) {
    return `Elige un período (fecha desde y hasta, máx. ${MAX_DIAS} días) para generar el diagnóstico.`;
  }
  const dias = (new Date(filters.fecha_end) - new Date(filters.fecha_start)) / 86400000 + 1;
  if (dias < 1) return 'La fecha hasta no puede ser anterior a la fecha desde.';
  if (dias > MAX_DIAS) {
    return `El período es de ${Math.round(dias)} días — el diagnóstico permite máximo ${MAX_DIAS}.`;
  }
  if (nInteracciones < MIN_INTERACCIONES) {
    return `Con estos filtros hay ${nInteracciones} interacciones evaluadas; se necesitan al menos ${MIN_INTERACCIONES}.`;
  }
  return null;
}

/** PERSONA si filtra un único agente; EQUIPO si filtra agentes, equipos o managers; si no, GENERAL. */
export function detectarAlcance(filters, filterOptions) {
  const nombre = (lista, email) => (lista ?? []).find(x => x.email === email)?.nombre;
  const agentes  = filters.email_agente ?? [];
  const equipos  = filters.departamento ?? [];
  const managers = filters.email_manager ?? [];

  if (agentes.length === 1) {
    return { tipo: 'PERSONA', etiqueta: nombre(filterOptions?.agentes, agentes[0]) ?? agentes[0] };
  }
  if (agentes.length || equipos.length || managers.length) {
    const partes = [];
    if (equipos.length)  partes.push(`Equipo ${equipos.join(', ')}`);
    if (managers.length) partes.push(`Manager ${managers.map(m => nombre(filterOptions?.managers, m) ?? m).join(', ')}`);
    if (agentes.length)  partes.push(`${agentes.length} agentes`);
    return { tipo: 'EQUIPO', etiqueta: partes.join(' · ') };
  }
  const paises = filters.pais ?? [];
  return { tipo: 'GENERAL', etiqueta: `Operación${paises.length ? ` ${paises.join(', ')}` : ''}` };
}

/** Texto de la cuota para el modal. */
export function textoCuota(cuota) {
  if (!cuota) return null;
  if (cuota.ilimitada) return 'Sin límite de diagnósticos (ADMIN).';
  return `Te quedan ${cuota.restantes} de ${cuota.limite} diagnósticos este mes.`;
}
