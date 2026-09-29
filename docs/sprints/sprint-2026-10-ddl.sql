-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2026-10 — Cambios de esquema de Calibración (los corre la usuaria)
--
-- Orden: 1) DDL-1 antes de desplegar la tarea 1.4 (flujo de dos pasos).
--        2) DDL-2 en cualquier momento (corrige el veredicto SAACA de la vista).
-- Ambos son idempotentes / reversibles (ver ROLLBACK al final).
-- ─────────────────────────────────────────────────────────────────────────────


-- DDL-1. Borrador del voto a ciegas (tarea 1.4).
--   resultado_ciego  : CUMPLE / NO_CUMPLE que el auditor marcó antes de ver a SAACA.
--   fecha_voto_ciego : cuándo lo marcó (el caso queda EN_PROGRESO hasta confirmar).
ALTER TABLE `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_muestra_calibracion`
ADD COLUMN IF NOT EXISTS resultado_ciego STRING,
ADD COLUMN IF NOT EXISTS fecha_voto_ciego TIMESTAMP;


-- DDL-2. vw_pitch_calibracion_comparativa — desempate del veredicto SAACA.
--   Problema (D8/D9): auto_eval elegía la fila AUTO solo por mecanismo. Con varias
--   corridas del mismo interacción × criterio (1.536 pares con veredictos distintos
--   en 120 días) podía quedarse con un NO_EVALUADO viejo en vez del veredicto
--   vigente. Ej.: 00TUg000016F723MAC/C0003 → vista NO_EVALUADO (11-08), vigente CUMPLE (20-08).
--   Cambio: único ajuste es el desempate "evaluated_at DESC" (gana la corrida más
--   reciente, igual que pitch_eval_enriched, que D10 mostró sin duplicados).
CREATE OR REPLACE VIEW `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.vw_pitch_calibracion_comparativa`
AS WITH auto_eval AS (
  SELECT
    interaction_id,
    criterion_id,
    result_label   AS resultado_auto,
    result_score   AS score_auto,
    mechanism      AS mecanismo_auto,
    evaluated_at   AS fecha_evaluacion_auto,
    observation    AS observacion_auto
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail`
  WHERE mechanism != 'HUMANO'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY interaction_id, criterion_id
    ORDER BY
      CASE mechanism
        WHEN 'AUTO_IA_RAG' THEN 1
        WHEN 'AUTO_IA'     THEN 2
        WHEN 'AUTO_REGLA'  THEN 3
        ELSE 4
      END,
      evaluated_at DESC          -- sprint 2026-10: gana la corrida más reciente
  ) = 1
),

humano_eval AS (
  -- Si un caso se re-audita, se queda la evaluación humana más reciente
  SELECT
    interaction_id,
    interaction_type,
    case_country      AS pais,
    criterion_id,
    criterion_name,
    error_type        AS criticidad,
    error_category    AS categoria_error_catalogo,
    result_label      AS resultado_humano,
    result_score      AS score_humano,
    evaluated_by       AS auditor_email,
    observation        AS observacion_humana,
    evaluated_at        AS fecha_evaluacion_humana
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail`
  WHERE mechanism = 'HUMANO'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY interaction_id, criterion_id
    ORDER BY evaluated_at DESC
  ) = 1
)

SELECT
  h.interaction_id,
  h.interaction_type,
  h.pais,
  h.criterion_id,
  h.criterion_name,
  h.criticidad,
  h.categoria_error_catalogo,

  h.auditor_email,
  m.estrato,                     -- NULL hasta que exista el módulo de generación de muestra

  a.resultado_auto,
  a.score_auto,
  a.mecanismo_auto,
  a.observacion_auto,
  a.fecha_evaluacion_auto,

  h.resultado_humano,
  h.score_humano,
  h.observacion_humana,
  h.fecha_evaluacion_humana,

  a.resultado_auto = h.resultado_humano AS coincide

FROM humano_eval h
LEFT JOIN auto_eval a
       ON a.interaction_id = h.interaction_id
      AND a.criterion_id   = h.criterion_id
LEFT JOIN `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_muestra_calibracion` m
       ON m.interaction_id = h.interaction_id
      AND m.criterion_id   = h.criterion_id;


-- Verificación post DDL-2: debe devolver 0 filas con resultado distinto salvo
-- casos sin fila AUTO en saaca_eval_detail (p.ej. 00TUg00000wrMAwMAM/C0008 de D8).
-- (Re-correr D8 del archivo sprint-2026-10-diagnostico.sql.)


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--   DDL-1: ALTER TABLE ... DROP COLUMN resultado_ciego, DROP COLUMN fecha_voto_ciego;
--          (solo si se revierte la tarea 1.4 del código).
--   DDL-2: re-crear la vista sin la línea "evaluated_at DESC" (DDL original en
--          resultados-sprint-2026-10-diagnostico.txt, sección D7).
-- ─────────────────────────────────────────────────────────────────────────────
