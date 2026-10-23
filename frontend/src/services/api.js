/**
 * Wrapper centralizado para todas las llamadas al backend Pitch.
 *
 * En desarrollo: Vite proxy redirige /api/* → http://localhost:8080
 * En producción: FastAPI sirve el build de React directamente, mismo origen.
 *
 * Autenticación: transparente vía IAP. Las requests van same-origin y IAP
 * inyecta la identidad (header X-Goog-Authenticated-User-Email) en el proxy.
 * El frontend no maneja tokens.
 */

const BASE = '';  // mismo origen en todos los entornos

async function request(method, path, params = null, body = null) {
  let url = `${BASE}${path}`;

  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach(v => qs.append(key, v));
      } else if (value !== null && value !== undefined && value !== '') {
        qs.append(key, value);
      }
    }
    const qsStr = qs.toString();
    if (qsStr) url += `?${qsStr}`;
  }

  const headers = { 'Content-Type': 'application/json' };

  const options = { method, headers };

  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    let errorDetail = `${response.status} ${response.statusText}`;
    try {
      const err = await response.json();
      errorDetail = err.detail ?? errorDetail;
    } catch {
      // respuesta no-JSON — mantener mensaje HTTP
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

const api = {
  get:    (path, params)        => request('GET',    path, params, null),
  post:   (path, body)          => request('POST',   path, null, body),
  put:    (path, body)          => request('PUT',    path, null, body),
  patch:  (path, body)          => request('PATCH',  path, null, body),
  delete: (path)                => request('DELETE', path, null, null),
};

export default api;

// ─────────────────────────────────────────────────────────────
// Pitch — Reportería
// ─────────────────────────────────────────────────────────────

/**
 * Extracto diario completo (formato columnar: { columns, data, fecha_carga }).
 * Se carga UNA vez por sesión — el cross-filter ocurre en memoria.
 */
export function getPitchExtracto() {
  return api.get('/api/pitch/dashboard/extracto');
}

/**
 * Drilldown en vivo de una interacción, con observacion_saaca.
 */
export function getPitchInteractionDetail(interactionId) {
  return api.get(`/api/pitch/dashboard/interaction/${encodeURIComponent(interactionId)}`);
}

/** Acuerdo humano-SAACA (últimos 90 días) — meta-KPI de calibración. */
export function getCalibracionKpi() {
  return api.get('/api/pitch/dashboard/calibracion-kpi');
}

/**
 * Descarga CSV de pitch_eval_enriched con los filtros del dashboard.
 * Retorna { blob, truncated, filename }. Lanza Error con el detail del backend
 * si la validación falla (rango obligatorio ≤ 31 días).
 */
export async function exportEnriched(filters) {
  const qs = new URLSearchParams();
  qs.append('fecha_start', filters.fecha_start);
  qs.append('fecha_end', filters.fecha_end);
  const listas = {
    pais: filters.pais, departamento: filters.departamento,
    tipo_interaccion: filters.tipo_interaccion,
    mecanismo_evaluacion: filters.mecanismo_evaluacion,
    id_criterio: filters.id_criterio,
    tipificacion_nivel_1: filters.tipificacion_nivel_1,
    tipificacion_nivel_2: filters.tipificacion_nivel_2,
    nombre_tipificacion: filters.nombre_tipificacion,
    email_agente: filters.email_agente, email_manager: filters.email_manager,
    numero_caso: filters.numero_caso, interaction_id: filters.interaction_id,
    seller_code: filters.seller_code,
  };
  for (const [key, values] of Object.entries(listas)) {
    (values ?? []).forEach(v => qs.append(key, v));
  }

  // Sin headers de auth: IAP inyecta la identidad en el proxy (same-origin).
  const response = await fetch(`/api/pitch/dashboard/export?${qs}`);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { detail = (await response.json()).detail ?? detail; } catch { /* no-JSON */ }
    throw new Error(detail);
  }

  const blob = await response.blob();
  return {
    blob,
    truncated: response.headers.get('X-Export-Truncated') === 'true',
    filename: `pitch_enriched_${filters.fecha_start}_${filters.fecha_end}.csv`,
  };
}

// ─────────────────────────────────────────────────────────────
// Pitch — Diagnóstico IA (desde Reportería)
// ─────────────────────────────────────────────────────────────

/** Cuota mensual del usuario: { limite, usados, restantes, ilimitada }. */
export function getDiagnosticoCuota() {
  return api.get('/api/pitch/diagnostico/cuota');
}

/**
 * Genera el diagnóstico con los filtros del dashboard (mismo shape que el
 * estado de PitchDataContext). Retorna { blob, filename } con el HTML para
 * descargar — no se almacena en el servidor. Tarda ~1 minuto.
 */
export async function generarDiagnostico(filters) {
  const response = await fetch('/api/pitch/diagnostico', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters),
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { detail = (await response.json()).detail ?? detail; } catch { /* no-JSON */ }
    throw new Error(detail);
  }
  const blob = await response.blob();
  const match = (response.headers.get('Content-Disposition') ?? '').match(/filename="([^"]+)"/);
  return { blob, filename: match?.[1] ?? 'diagnostico.html' };
}

// ─────────────────────────────────────────────────────────────
// Pitch — Calibración
// ─────────────────────────────────────────────────────────────

/** Bandeja del auditor autenticado — interacciones con sus criterios asignados. */
export function getCalibracionInbox() {
  return api.get('/api/pitch/calibracion/inbox');
}

/**
 * Paso 1 — voto a ciegas (sin observación). Devuelve { revision } con el
 * veredicto de SAACA para el paso 2.
 * body: { interaction_id, interaction_type, evaluations: [{criterion_id, result_label}] }
 */
export function evaluarCalibracion(body) {
  return api.post('/api/pitch/calibracion/evaluar', body);
}

/** Revisión pendiente (voto a ciegas vs SAACA) — para retomar un caso "En revisión". */
export function getRevision(interactionId) {
  return api.get(`/api/pitch/calibracion/revision/${encodeURIComponent(interactionId)}`);
}

/**
 * Paso 2 — voto final + observación (obligatoria si hay desacuerdo).
 * body: { interaction_id, interaction_type, evaluations: [{criterion_id, result_label, observation}] }
 */
export function confirmarCalibracion(body) {
  return api.post('/api/pitch/calibracion/confirmar', body);
}

/** Descarte con motivo obligatorio. body: { interaction_id, motivo } */
export function descartarCalibracion(body) {
  return api.post('/api/pitch/calibracion/descartar', body);
}

/** AUTO vs HUMANO por criterio — llamar SOLO después de confirmar. */
export function getComparacion(interactionId) {
  return api.get(`/api/pitch/calibracion/comparacion/${encodeURIComponent(interactionId)}`);
}

/**
 * Preview de la muestra (LIDER_QUALITY+) — flujo de dos pasos:
 * sin capacidad: tamaño ideal Cochran (informativo);
 * con capacidad: además asignación por estrato + desglose de cobertura.
 */
export function getMuestraPreview(fechaStart, fechaEnd, capacidadObjetivo = null) {
  const params = { fecha_start: fechaStart, fecha_end: fechaEnd };
  if (capacidadObjetivo != null) params.capacidad_objetivo = capacidadObjetivo;
  return api.get('/api/pitch/calibracion/muestra/preview', params);
}

/**
 * Confirma y genera la muestra del período (LIDER_QUALITY+).
 * body: { fecha_start, fecha_end, capacidad_objetivo, distribucion: [{auditor_email, cantidad}] }
 */
export function generarMuestra(body) {
  return api.post('/api/pitch/calibracion/muestra/generar', body);
}

/** Batches generados con progreso (LIDER_QUALITY+) — detección de generaciones huérfanas. */
export function getBatchesMuestra() {
  return api.get('/api/pitch/calibracion/muestra/batches');
}

/** Anula un batch: elimina solo sus unidades pendientes (LIDER_QUALITY+). */
export function anularBatchMuestra(batchId) {
  return api.post(`/api/pitch/calibracion/muestra/batch/${encodeURIComponent(batchId)}/anular`);
}

/**
 * Progreso de calibración: propio para AUDITOR, global + por auditor para
 * LIDER_QUALITY+. fechaStart/fechaEnd opcionales (YYYY-MM-DD, default 30 días).
 */
export function getCalibracionDashboard(fechaStart = null, fechaEnd = null) {
  const params = {};
  if (fechaStart) params.fecha_start = fechaStart;
  if (fechaEnd) params.fecha_end = fechaEnd;
  return api.get('/api/pitch/calibracion/dashboard', params);
}

// ─── Contexto del caso (hilo + detalle de la interacción) ────────────────────

export function getCaseThread(caseNumber) {
  return api.get(`/api/interaction/case-thread/${encodeURIComponent(caseNumber)}`);
}

export function getInputDetail(interactionId, interactionType) {
  return api.get(
    `/api/interaction/input-detail/${encodeURIComponent(interactionId)}`,
    { interaction_type: interactionType },
  );
}

/** Criterios aplicables a un tipo de interacción para evaluación humana. */
export function getCriteriaByType(interactionType) {
  return api.get(`/api/criteria/by-interaction-type/${encodeURIComponent(interactionType)}`);
}

// ─────────────────────────────────────────────────────────────
// Glosario
// ─────────────────────────────────────────────────────────────

/** Catálogo de criterios de SAACA consolidado (vigente + historial) — todos los roles. */
export function getGlosario() {
  return api.get('/api/glosario');
}

export function getPlannerManualRequests() {
  return api.get('/api/planner/solicitudes-manuales');
}

export function createPlannerManualRequest(body) {
  return api.post('/api/planner/solicitudes-manuales', body);
}

export function getPlannerApprovalRequests(params = {}) {
  return api.get('/api/planner/solicitudes', params);
}

export function getPlannerApprovalFilters() {
  return api.get('/api/planner/filtros');
}

export function getPlannerDecisionHistory(spItemId) {
  return api.get(`/api/planner/solicitudes/${encodeURIComponent(spItemId)}/historial`);
}

export function createPlannerDecision(spItemId, body) {
  return api.post(`/api/planner/solicitudes/${encodeURIComponent(spItemId)}/decision`, body);
}
