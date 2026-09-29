-- ===========================================================================
-- DDL: saaca_audit_assignment
-- Proyecto: PAUTA — Etapa 3 (Muestreo rediseñado)
-- Fecha: 2026-05-19
--
-- ADVERTENCIA: Este script recrea la tabla desde cero con CREATE OR REPLACE.
-- Todos los datos existentes serán eliminados.
-- Ejecutar solo después de confirmar que los datos de prueba son descartables.
--
-- IMPORTANTE: Ejecutar este script ANTES de ddl_audit_sample.sql,
-- ya que saaca_audit_sample.assignment_id es FK a esta tabla.
--
-- Ejecutar en: BigQuery Console o bq CLI
-- Proyecto: bi-fcom-drmb-sell-in-sbx
-- Dataset:  sandbox_data_analytics_psc
-- ===========================================================================

CREATE OR REPLACE TABLE
  `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_audit_assignment`
(
  -- ── Identidad ─────────────────────────────────────────────────────────────
  assignment_id         STRING NOT NULL,   -- UUID generado en Python, PK lógica
  batch_id              STRING NOT NULL,   -- agrupa asignaciones de un mismo batch
  batch_name            STRING NOT NULL,

  -- ── Filtros aplicados al generar el batch ─────────────────────────────────
  filter_date_start     DATE,             -- fecha inicio del período evaluado/cerrado
  filter_date_end       DATE,             -- fecha fin del período
  filter_countries      STRING,           -- JSON array serializado: '["CL","CO"]'
  filter_departments    STRING,           -- JSON array serializado
  filter_tipificacion   STRING,           -- JSON array serializado

  -- ── Tamaños de muestra configurados ──────────────────────────────────────
  saaca_evaluated_n     INT64,            -- N casos evaluados por SAACA (NULL si se usó pct)
  saaca_evaluated_pct   FLOAT64,          -- % alternativo (NULL si se usó n)
  not_evaluated_n       INT64,            -- N casos no evaluados (NULL si se usó pct)
  not_evaluated_pct     FLOAT64,          -- % alternativo (NULL si se usó n)
  total_cases_selected  INT64,            -- total real de casos en el batch
  total_interactions    INT64,            -- total de interacciones evaluables en el batch

  -- ── Auditor asignado ──────────────────────────────────────────────────────
  evaluator_email       STRING NOT NULL,
  evaluator_name        STRING,

  -- ── Progreso ──────────────────────────────────────────────────────────────
  total_assigned        INT64 NOT NULL DEFAULT 0,
  total_completed       INT64 NOT NULL DEFAULT 0,
  status                STRING NOT NULL,  -- 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'

  -- ── Metadata ──────────────────────────────────────────────────────────────
  assigned_at           TIMESTAMP NOT NULL,
  assigned_by           STRING    NOT NULL,  -- email del admin que creó el batch
  completed_at          TIMESTAMP,
  notes                 STRING
)
PARTITION BY DATE(assigned_at)
CLUSTER BY batch_id, evaluator_email, status;
