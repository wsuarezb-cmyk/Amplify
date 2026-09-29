/**
 * Agregaciones puras sobre las filas del extracto de Reportería.
 *
 * Modelo de datos: una fila por (interaction_id, id_criterio). Los campos de
 * nivel interacción (score_interaccion, es_defectuosa) vienen repetidos en
 * cada fila; usar es_primera_fila_interaccion para no duplicar conteos.
 * Análogamente, es_primera_fila_categoria + tiene_error_en_categoria dan una
 * fila por (interaction_id, categoria_error) para el accuracy por categoría.
 *
 * Escalas: score_interaccion viene 0–100. score_criterio viene 0–1 (-1 = N/A).
 */

/** Hidrata el payload columnar { columns, data } en objetos fila. */
export function hydrateExtracto(payload) {
  const { columns, data } = payload;
  return data.map(arr => {
    const row = {};
    for (let i = 0; i < columns.length; i++) row[columns[i]] = arr[i];
    return row;
  });
}

/** Filas de nivel interacción (una por interaction_id). */
export function interactionRows(rows) {
  return rows.filter(r => r.es_primera_fila_interaccion);
}

/**
 * KPIs principales sobre un set de filas ya filtrado:
 * score ponderado (avg de score_interaccion), % defectuosas, total interacciones,
 * y accuracy por categoría de error (ECU/ECN/ECC/NON_CRITICAL).
 */
export function computeKpis(rows) {
  let nInter = 0, scoreSum = 0, nScore = 0, nDefect = 0;
  const cat = {}; // categoria_error → { total, conError }

  for (const r of rows) {
    if (r.es_primera_fila_interaccion) {
      nInter++;
      if (r.score_interaccion != null) { scoreSum += r.score_interaccion; nScore++; }
      if (r.es_defectuosa) nDefect++;
    }
    if (r.es_primera_fila_categoria && r.categoria_error) {
      const c = cat[r.categoria_error] ?? (cat[r.categoria_error] = { total: 0, conError: 0 });
      c.total++;
      if (r.tiene_error_en_categoria) c.conError++;
    }
  }

  const accuracyPorCategoria = {};
  for (const [k, v] of Object.entries(cat)) {
    accuracyPorCategoria[k] = {
      total: v.total,
      conError: v.conError,
      pctAccuracy: v.total > 0 ? ((v.total - v.conError) / v.total) * 100 : null,
    };
  }

  return {
    totalInteracciones: nInter,
    scorePonderado: nScore > 0 ? scoreSum / nScore : null,
    pctDefectuosas: nInter > 0 ? (nDefect / nInter) * 100 : null,
    nDefectuosas: nDefect,
    accuracyPorCategoria,
  };
}

/**
 * Cumplimiento por criterio — base CUMPLE/NO_CUMPLE únicamente
 * (N/A y NO_EVALUADO excluidos del denominador). Ordenado peor primero.
 */
export function byCriterion(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r.id_criterio) continue;
    let c = map.get(r.id_criterio);
    if (!c) {
      c = { id_criterio: r.id_criterio, nombre_criterio: r.nombre_criterio,
            tipo_error: r.tipo_error, categoria_error: r.categoria_error,
            cumple: 0, noCumple: 0 };
      map.set(r.id_criterio, c);
    }
    if (r.resultado === 'CUMPLE') c.cumple++;
    else if (r.resultado === 'NO_CUMPLE') c.noCumple++;
  }
  const out = [];
  for (const c of map.values()) {
    const base = c.cumple + c.noCumple;
    if (base === 0) continue;
    const pctCumple = (c.cumple / base) * 100;
    out.push({
      ...c,
      total: base,
      pctCumple,
      // Complemento exacto: evita que la barra apilada sume 100.000…1%
      // por error de punto flotante.
      pctNoCumple: 100 - pctCumple,
    });
  }
  return out.sort((a, b) => a.pctCumple - b.pctCumple);
}

/**
 * Serie temporal por período de fecha_evaluacion (nivel interacción).
 * granularidad: 'dia' (YYYY-MM-DD) | 'mes' (YYYY-MM) | 'anio' (YYYY).
 */
export function byPeriod(rows, granularidad = 'dia') {
  const len = granularidad === 'anio' ? 4 : granularidad === 'mes' ? 7 : 10;
  const map = new Map();
  for (const r of rows) {
    if (!r.es_primera_fila_interaccion || !r.fecha_evaluacion) continue;
    const key = r.fecha_evaluacion.slice(0, len);
    let d = map.get(key);
    if (!d) { d = { fecha: key, n: 0, scoreSum: 0, nScore: 0, defectuosas: 0 }; map.set(key, d); }
    d.n++;
    if (r.score_interaccion != null) { d.scoreSum += r.score_interaccion; d.nScore++; }
    if (r.es_defectuosa) d.defectuosas++;
  }
  return [...map.values()]
    .map(d => ({
      fecha: d.fecha,
      interacciones: d.n,
      score: d.nScore > 0 ? d.scoreSum / d.nScore : null,
      pctDefectuosas: d.n > 0 ? (d.defectuosas / d.n) * 100 : null,
    }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

/** Rango [inicio, fin] en YYYY-MM-DD de un período de byPeriod. */
export function periodRange(fecha) {
  if (fecha.length === 10) return [fecha, fecha];
  if (fecha.length === 7) {
    const [y, m] = fecha.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return [`${fecha}-01`, `${fecha}-${String(last).padStart(2, '0')}`];
  }
  return [`${fecha}-01-01`, `${fecha}-12-31`];
}

/** Agrupador genérico de nivel interacción por una clave. */
export function byDimension(rows, key, labelKey = null) {
  const map = new Map();
  for (const r of rows) {
    if (!r.es_primera_fila_interaccion) continue;
    const k = r[key] ?? '(sin dato)';
    let d = map.get(k);
    if (!d) {
      d = { key: k, label: labelKey ? (r[labelKey] ?? k) : k,
            n: 0, scoreSum: 0, nScore: 0, defectuosas: 0 };
      map.set(k, d);
    }
    d.n++;
    if (r.score_interaccion != null) { d.scoreSum += r.score_interaccion; d.nScore++; }
    if (r.es_defectuosa) d.defectuosas++;
  }
  return [...map.values()].map(d => ({
    key: d.key,
    label: d.label,
    interacciones: d.n,
    score: d.nScore > 0 ? d.scoreSum / d.nScore : null,
    pctDefectuosas: d.n > 0 ? (d.defectuosas / d.n) * 100 : null,
  }));
}

/**
 * Heatmap tipificación × criterio: % NO_CUMPLE por celda, base CUMPLE+NO_CUMPLE.
 * tipKey define el nivel de tipificación usado como columnas (drill N1→N2→N3).
 * Limita a las tipificaciones y criterios con más volumen.
 * Orientación: criterios como FILAS (nombre completo legible), tipificaciones
 * como COLUMNAS.
 */
export function heatmapTipCriterio(rows, tipKey = 'tipificacion_nivel_1', maxTip = 14, maxCrit = 20) {
  const cell = new Map();   // `${tip}|${crit}` → { cumple, noCumple }
  const tipVol = new Map(); // volumen por tipificación
  const critVol = new Map();
  const critName = new Map();

  for (const r of rows) {
    if (!r.id_criterio) continue;
    if (r.resultado !== 'CUMPLE' && r.resultado !== 'NO_CUMPLE') continue;
    const tip = r[tipKey] ?? '(sin tipificación)';
    const k = `${tip}|${r.id_criterio}`;
    let c = cell.get(k);
    if (!c) { c = { cumple: 0, noCumple: 0 }; cell.set(k, c); }
    if (r.resultado === 'CUMPLE') c.cumple++; else c.noCumple++;
    tipVol.set(tip, (tipVol.get(tip) ?? 0) + 1);
    critVol.set(r.id_criterio, (critVol.get(r.id_criterio) ?? 0) + 1);
    critName.set(r.id_criterio, r.nombre_criterio ?? r.id_criterio);
  }

  const tips = [...tipVol.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTip).map(e => e[0]);
  const crits = [...critVol.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxCrit).map(e => e[0]);

  // matrix[criterio][tipificación]
  const matrix = crits.map(crit => tips.map(tip => {
    const c = cell.get(`${tip}|${crit}`);
    const base = c ? c.cumple + c.noCumple : 0;
    return base > 0 ? { pctNoCumple: (c.noCumple / base) * 100, n: base } : null;
  }));

  return { tips, crits, critNames: crits.map(c => critName.get(c)), matrix };
}

// ─────────────────────────────────────────────────────────────
// Insight cards — semana vs semana anterior (spec 5.5 + ronda v2)
// Ventanas móviles de 7 días ancladas en la fecha máxima del dataset.
// Umbrales simétricos: |Δscore| ≥5 pts o |ΔpctNoCumple| ≥8 pp de un criterio,
// con mínimo 20 interacciones/evaluaciones en ambas ventanas.
// direccion: 'mala' (alerta) o 'buena' (avance).
// prioridad = |delta| × √base — magnitud del cambio ponderada por volumen.
// ─────────────────────────────────────────────────────────────

const MIN_VOLUMEN = 20;
const UMBRAL_SCORE = 5;
const UMBRAL_CRITERIO_PP = 8;

function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Ventanas móviles de 7 días que usan las alertas, ancladas en la fecha máxima
 * del extracto (no en "hoy" ni en semana calendario). Devuelve las fechas para
 * mostrarlas explícitamente en la UI.
 */
export function insightWindows(allRows) {
  if (!allRows?.length) return null;
  let maxDate = '';
  for (const r of allRows) {
    if (r.fecha_evaluacion && r.fecha_evaluacion > maxDate) maxDate = r.fecha_evaluacion;
  }
  if (!maxDate) return null;
  return {
    maxDate,
    w1Start: shiftDate(maxDate, -6),   // actual:   [maxDate-6, maxDate]
    w1End: maxDate,
    w0Start: shiftDate(maxDate, -13),  // anterior: [maxDate-13, maxDate-7]
    w0End: shiftDate(maxDate, -7),
  };
}

export function computeInsights(allRows) {
  if (!allRows.length) return [];

  let maxDate = '';
  for (const r of allRows) {
    if (r.fecha_evaluacion && r.fecha_evaluacion > maxDate) maxDate = r.fecha_evaluacion;
  }
  if (!maxDate) return [];

  const w1Start = shiftDate(maxDate, -6);   // semana actual: [maxDate-6, maxDate]
  const w0Start = shiftDate(maxDate, -13);  // semana anterior: [maxDate-13, maxDate-7]
  const w0End   = shiftDate(maxDate, -7);

  const inW1 = r => r.fecha_evaluacion >= w1Start && r.fecha_evaluacion <= maxDate;
  const inW0 = r => r.fecha_evaluacion >= w0Start && r.fecha_evaluacion <= w0End;

  const insights = [];
  const push = (base) => insights.push({
    ...base,
    prioridad: Math.abs(base.delta) * Math.sqrt(base.volumen),
  });

  // Cortes: por país, y por país + tipificación nivel 2
  const cortes = new Map(); // etiqueta → predicado
  const paises = new Set(), paisTip = new Set();
  for (const r of allRows) {
    if (r.pais) paises.add(r.pais);
    if (r.pais && r.tipificacion_nivel_2) paisTip.add(`${r.pais}|${r.tipificacion_nivel_2}`);
  }
  for (const p of paises) {
    cortes.set(p, r => r.pais === p);
  }
  for (const pt of paisTip) {
    const [p, t] = pt.split('|');
    cortes.set(`${p} · ${t}`, r => r.pais === p && r.tipificacion_nivel_2 === t);
  }

  for (const [etiqueta, pred] of cortes) {
    const rows1 = allRows.filter(r => pred(r) && inW1(r));
    const rows0 = allRows.filter(r => pred(r) && inW0(r));

    // ── Score ponderado: caída (mala) o subida (buena) ≥5 pts ──
    const k1 = computeKpis(rows1);
    const k0 = computeKpis(rows0);
    if (
      k1.totalInteracciones >= MIN_VOLUMEN && k0.totalInteracciones >= MIN_VOLUMEN &&
      k1.scorePonderado != null && k0.scorePonderado != null
    ) {
      const delta = k1.scorePonderado - k0.scorePonderado;
      if (Math.abs(delta) >= UMBRAL_SCORE) {
        push({
          tipo: 'score',
          direccion: delta < 0 ? 'mala' : 'buena',
          corte: etiqueta,
          delta,
          actual: k1.scorePonderado,
          anterior: k0.scorePonderado,
          volumen: k1.totalInteracciones,
        });
      }
    }

    // ── pctNoCumple de un criterio: subida (mala) o baja (buena) ≥8 pp ──
    const c1 = new Map(byCriterion(rows1).map(c => [c.id_criterio, c]));
    for (const c0 of byCriterion(rows0)) {
      const c1row = c1.get(c0.id_criterio);
      if (!c1row) continue;
      if (c1row.total < MIN_VOLUMEN || c0.total < MIN_VOLUMEN) continue;
      const delta = c1row.pctNoCumple - c0.pctNoCumple;
      if (Math.abs(delta) >= UMBRAL_CRITERIO_PP) {
        push({
          tipo: 'criterio',
          direccion: delta > 0 ? 'mala' : 'buena',
          corte: etiqueta,
          criterio: c1row.nombre_criterio ?? c1row.id_criterio,
          delta,
          actual: c1row.pctNoCumple,
          anterior: c0.pctNoCumple,
          volumen: c1row.total,
        });
      }
    }
  }

  // Prioridad descendente: cambios grandes con base grande primero
  return insights.sort((a, b) => b.prioridad - a.prioridad);
}
