-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2026-10 — Diagnóstico previo a los fixes de Calibración (Fase 0)
--
-- Correr en la consola de BigQuery (proyecto bi-fcom-drmb-sell-in-sbx, VPN activa).
-- Las consultas D1–D7 son de SOLO LECTURA. La sección L (limpieza) modifica datos:
-- correr primero el SELECT L1, revisar, y recién entonces el UPDATE L2.
--
-- Devolver a Claude el resultado de D1–D7 (captura o CSV) para confirmar las
-- hipótesis antes de implementar las tareas 1.1 y 1.2.
-- ─────────────────────────────────────────────────────────────────────────────


-- D1. Valores reales de resultado × mecanismo en la fuente de la muestra.
--     Hipótesis: aparecen valores distintos de CUMPLE/NO_CUMPLE y/o mecanismos
--     no-SAACA (p.ej. HUMANO) que hoy pasan el filtro NOT IN ('N/A','NO_EVALUADO').
SELECT
  resultado,
  mecanismo_evaluacion,
  COUNT(*) AS filas,
  MIN(fecha_evaluacion) AS desde,
  MAX(fecha_evaluacion) AS hasta
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_eval_enriched`
GROUP BY 1, 2
ORDER BY filas DESC;


-- D2. Etiquetas de tipo de interacción (confirmar cómo llega el recontacto).
SELECT
  tipo_interaccion,
  COUNT(DISTINCT interaction_id) AS interacciones,
  COUNT(*) AS filas
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_eval_enriched`
GROUP BY 1
ORDER BY interacciones DESC;


-- D3. Criterios con más de una fila en el catálogo (versiones / reactivaciones).
--     Hipótesis: C0008 (recontacto) tiene 2+ filas → la bandeja duplica y muestra "1/2".
SELECT
  criterion_id,
  COUNT(*) AS filas,
  ARRAY_AGG(STRUCT(
    criterion_name, is_active, criteria_version, valid_from, valid_to, updated_at
  ) ORDER BY criteria_version) AS versiones
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_cat_criteria`
GROUP BY criterion_id
HAVING COUNT(*) > 1
ORDER BY criterion_id;


-- D4. Mapping del recontacto (todas las filas, todos los mecanismos).
--     Hipótesis: no existe fila mechanism='HUMANO' activa para TASK_RECONTACT → sin descripción.
SELECT *
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_cat_criteria_mapping`
WHERE criterion_id = 'C0008'
   OR UPPER(interaction_type) LIKE '%RECONT%'
ORDER BY interaction_type, mechanism, criterion_id;


-- D5a. Composición de la muestra actual por estado × snapshot de resultado × mecanismo.
SELECT
  estado,
  resultado_auto_snapshot,
  mecanismo_auto_snapshot,
  COUNT(*) AS filas
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_muestra_calibracion`
GROUP BY 1, 2, 3
ORDER BY estado, filas DESC;


-- D5b. Unidades duplicadas (misma interacción × criterio) dentro de la muestra activa.
SELECT
  interaction_id,
  criterion_id,
  COUNT(*) AS filas,
  ARRAY_AGG(STRUCT(batch_id, auditor_email, estado, resultado_auto_snapshot, mecanismo_auto_snapshot)) AS detalle
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_muestra_calibracion`
WHERE estado != 'ANULADO'
GROUP BY 1, 2
HAVING COUNT(*) > 1
ORDER BY filas DESC;


-- D6. Evaluaciones HUMANO duplicadas ya guardadas (efecto del bug "1/2").
SELECT
  interaction_id,
  criterion_id,
  evaluated_by,
  COUNT(*) AS filas
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail`
WHERE mechanism = 'HUMANO'
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
ORDER BY filas DESC;


-- D7. DDL de las tablas y vistas involucradas (no están en el repo).
SELECT table_name, table_type, ddl
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.INFORMATION_SCHEMA.TABLES`
WHERE table_name IN (
  'pitch_muestra_calibracion',
  'pitch_eval_enriched',
  'vw_pitch_calibracion_comparativa',
  'vw_pitch_dashboard_extracto',
  'saaca_cat_criteria',
  'saaca_cat_criteria_mapping'
)
ORDER BY table_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEGUNDA RONDA (tras resultados D1–D7): origen del "resultado distinto"
-- D1/D5a mostraron que la muestra solo contiene CUMPLE/NO_CUMPLE de AUTO_IA.
-- Hipótesis nueva: el resultado que se REVELA al auditor sale de la vista
-- vw_pitch_calibracion_comparativa, que elige el veredicto SAACA en
-- saaca_eval_detail solo por mecanismo (sin desempate). Si SAACA evaluó el mismo
-- interacción × criterio más de una vez (reintentos, re-runs), la vista puede
-- mostrar N/A o NO_EVALUADO aunque la muestra se generó con CUMPLE/NO_CUMPLE.
-- ─────────────────────────────────────────────────────────────────────────────

-- D8. Casos calibrados: snapshot de la muestra vs veredicto que muestra la vista,
--     y cuántas filas AUTO existen en saaca_eval_detail para ese par.
--     Solo lista los pares con problema (más de una fila AUTO o resultado distinto).
WITH cal AS (
  SELECT DISTINCT interaction_id, criterion_id, resultado_auto_snapshot
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_muestra_calibracion`
  WHERE estado = 'COMPLETADO'
),
vista AS (
  SELECT DISTINCT interaction_id, criterion_id, resultado_auto
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.vw_pitch_calibracion_comparativa`
)
SELECT
  c.interaction_id,
  c.criterion_id,
  c.resultado_auto_snapshot,
  v.resultado_auto AS resultado_en_vista,
  COUNT(d.eval_detail_id) AS filas_auto,
  ARRAY_AGG(STRUCT(d.result_label, d.mechanism, d.evaluated_at, d.eval_run_id)
            ORDER BY d.evaluated_at) AS evaluaciones_auto
FROM cal c
LEFT JOIN `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail` d
       ON d.interaction_id = c.interaction_id
      AND d.criterion_id   = c.criterion_id
      AND d.mechanism     != 'HUMANO'
LEFT JOIN vista v
       ON v.interaction_id = c.interaction_id
      AND v.criterion_id   = c.criterion_id
GROUP BY 1, 2, 3, 4
HAVING filas_auto != 1
    OR resultado_en_vista IS DISTINCT FROM c.resultado_auto_snapshot
ORDER BY filas_auto DESC;


-- D9. Magnitud general: pares interacción × criterio con más de una evaluación
--     AUTO en saaca_eval_detail (últimos 120 días) y cuántos con veredictos distintos.
SELECT
  COUNT(*)                   AS pares,
  COUNTIF(n > 1)             AS pares_con_varias_filas,
  COUNTIF(labels > 1)        AS pares_con_veredictos_distintos
FROM (
  SELECT interaction_id, criterion_id,
         COUNT(*) AS n,
         COUNT(DISTINCT result_label) AS labels
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail`
  WHERE mechanism != 'HUMANO'
    AND DATE(evaluated_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 120 DAY)
  GROUP BY 1, 2
);


-- D10. ¿pitch_eval_enriched también tiene más de una fila por interacción × criterio?
SELECT
  COUNT(*)            AS pares,
  COUNTIF(n > 1)      AS pares_duplicados,
  COUNTIF(labels > 1) AS pares_con_resultados_distintos
FROM (
  SELECT interaction_id, id_criterio,
         COUNT(*) AS n,
         COUNT(DISTINCT resultado) AS labels
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_eval_enriched`
  GROUP BY 1, 2
);


-- ─────────────────────────────────────────────────────────────────────────────
-- L3/L4. LIMPIEZA — evaluaciones HUMANO duplicadas por el bug "1/2" (ver D6)
--    ⚠️ L4 BORRA filas de saaca_eval_detail. Correr L3, revisar, luego L4.
--    Conserva una fila por (interacción, criterio, auditor): la más antigua.
-- ─────────────────────────────────────────────────────────────────────────────

-- L3. Vista previa: filas que se borrarían. Si result_label difiere entre las
--     dos copias de un mismo par, avisar antes de correr L4.
SELECT
  eval_detail_id, interaction_id, criterion_id, evaluated_by,
  result_label, observation, evaluated_at, eval_reference_id
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail`
WHERE mechanism = 'HUMANO'
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY interaction_id, criterion_id, evaluated_by
  ORDER BY evaluated_at, eval_detail_id
) > 1
ORDER BY interaction_id, criterion_id;


-- L4. Borrado de las copias (mismo criterio que L3).
DELETE FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail`
WHERE mechanism = 'HUMANO'
  AND eval_detail_id IN (
    SELECT eval_detail_id
    FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail`
    WHERE mechanism = 'HUMANO'
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY interaction_id, criterion_id, evaluated_by
      ORDER BY evaluated_at, eval_detail_id
    ) > 1
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- L. LIMPIEZA — anular pendientes no comparables o duplicados
--    ⚠️ Modifica datos. Correr L1, revisar el conteo y el detalle, luego L2.
--    Las filas anuladas vuelven a ser elegibles para futuros batches (el nuevo
--    filtro de la tarea 1.1 excluirá las no comparables).
-- ─────────────────────────────────────────────────────────────────────────────

-- L1. Vista previa de lo que se anularía.
WITH duplicadas AS (
  SELECT muestra_id
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_muestra_calibracion`
  WHERE estado IN ('PENDIENTE', 'EN_PROGRESO')
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY interaction_id, criterion_id
    ORDER BY fecha_asignacion, muestra_id
  ) > 1
)
SELECT
  m.muestra_id, m.batch_id, m.interaction_id, m.criterion_id, m.auditor_email,
  m.resultado_auto_snapshot, m.mecanismo_auto_snapshot,
  CASE
    WHEN m.muestra_id IN (SELECT muestra_id FROM duplicadas) THEN 'DUPLICADA'
    ELSE 'NO_COMPARABLE'
  END AS motivo
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_muestra_calibracion` m
WHERE m.estado IN ('PENDIENTE', 'EN_PROGRESO')
  AND (
    m.resultado_auto_snapshot IS NULL
    OR m.resultado_auto_snapshot NOT IN ('CUMPLE', 'NO_CUMPLE')
    -- Ajustar tras D1 si el mecanismo SAACA tiene otros nombres:
    OR m.mecanismo_auto_snapshot IS NULL
    OR m.mecanismo_auto_snapshot NOT IN ('AUTO_IA', 'AUTO_IA_RAG')
    OR m.muestra_id IN (SELECT muestra_id FROM duplicadas)
  )
ORDER BY motivo, m.auditor_email, m.interaction_id;


-- L2. Anulación (mismo criterio que L1). Reemplazar el correo en anulado_por.
UPDATE `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_muestra_calibracion`
SET estado = 'ANULADO',
    anulado_por = 'aoviedo@falabella.com',
    fecha_anulacion = CURRENT_TIMESTAMP()
WHERE estado IN ('PENDIENTE', 'EN_PROGRESO')
  AND (
    resultado_auto_snapshot IS NULL
    OR resultado_auto_snapshot NOT IN ('CUMPLE', 'NO_CUMPLE')
    OR mecanismo_auto_snapshot IS NULL
    OR mecanismo_auto_snapshot NOT IN ('AUTO_IA', 'AUTO_IA_RAG')
    OR muestra_id IN (
      SELECT muestra_id
      FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_muestra_calibracion`
      WHERE estado IN ('PENDIENTE', 'EN_PROGRESO')
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY interaction_id, criterion_id
        ORDER BY fecha_asignacion, muestra_id
      ) > 1
    )
  );
