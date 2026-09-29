-- ===========================================================================
-- DDL: saaca_audit_sample
-- Proyecto: PAUTA — Etapa 3 (Muestreo rediseñado)
-- Fecha: 2026-05-19
--
-- ADVERTENCIA: Este script recrea la tabla desde cero con CREATE OR REPLACE.
-- Todos los datos existentes serán eliminados.
-- Ejecutar solo después de confirmar que los datos de prueba son descartables.
--
-- Ejecutar en: BigQuery Console o bq CLI
-- Proyecto: bi-fcom-drmb-sell-in-sbx
-- Dataset:  sandbox_data_analytics_psc
-- ===========================================================================

CREATE OR REPLACE TABLE
  `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_audit_sample`
(
  -- ── Identidad ─────────────────────────────────────────────────────────────
  sample_id             STRING NOT NULL,   -- UUID generado en Python, PK lógica
  batch_id              STRING NOT NULL,   -- FK a saaca_audit_assignment.batch_id
  batch_name            STRING NOT NULL,   -- nombre legible del batch

  -- ── Caso (unidad de muestreo) ─────────────────────────────────────────────
  case_id               STRING NOT NULL,
  case_number           STRING NOT NULL,
  case_country          STRING NOT NULL,
  case_closed_date      TIMESTAMP,         -- fecha de cierre del caso (puede ser NULL)

  -- ── Interacción (unidad de evaluación) ────────────────────────────────────
  interaction_id        STRING NOT NULL,
  interaction_type      STRING NOT NULL,   -- EMAIL | TASK_INFO_REQUEST | TASK_REOPEN | TASK_RECONTACT | CASE

  -- ── Owner de la interacción ───────────────────────────────────────────────
  owner_id              STRING,
  owner_name            STRING,
  owner_email           STRING,
  owner_department      STRING,

  -- ── Tipificación (desde saaca_input_case) ─────────────────────────────────
  tipificacion_level_1  STRING,
  tipificacion_level_2  STRING,
  tipificacion_name     STRING,

  -- ── Tipo de muestra ───────────────────────────────────────────────────────
  selection_type        STRING NOT NULL,   -- 'SAACA_EVALUATED' | 'NOT_SAACA_EVALUATED'
  has_saaca_eval        BOOL   NOT NULL,   -- TRUE si existe evaluación en saaca_eval_detail

  -- ── Score SAACA de referencia (pre-calculado al generar muestra) ──────────
  saaca_overall_score   FLOAT64,           -- NULL si selection_type = 'NOT_SAACA_EVALUATED'
  saaca_is_defective    BOOL,             -- NULL si selection_type = 'NOT_SAACA_EVALUATED'

  -- ── Estado de la auditoría humana ─────────────────────────────────────────
  status                STRING NOT NULL,   -- 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  assignment_id         STRING,           -- FK a saaca_audit_assignment (puede ser NULL)

  -- ── Metadata ──────────────────────────────────────────────────────────────
  created_at            TIMESTAMP NOT NULL,
  created_by            STRING    NOT NULL,  -- email del admin que generó el batch
  updated_at            TIMESTAMP,
  completed_at          TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY batch_id, selection_type, status;
