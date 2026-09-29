-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2026-10 — Fase 3: Diagnóstico IA — tabla de registro (la corre la usuaria)
--
-- pitch_diagnosticos_ia: un registro por diagnóstico generado (OK o ERROR).
--   Alimenta la cuota mensual por usuario (solo cuentan los OK) y deja rastro de
--   uso y costo estimado. Los diagnósticos NO se almacenan: se regeneran.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── A. LIMPIEZA (ya creaste las tablas con la versión anterior) ──────────────
-- Tras simplificar la feature (sin GCS ni historial de descargas):

DROP TABLE IF EXISTS `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_diagnosticos_descargas`;

ALTER TABLE `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_diagnosticos_ia`
  DROP COLUMN IF EXISTS gcs_path,
  DROP COLUMN IF EXISTS expires_at;


-- ── B. DEFINICIÓN FINAL (referencia / ambiente nuevo) ────────────────────────

CREATE TABLE IF NOT EXISTS `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_diagnosticos_ia`
(
  report_id           STRING    NOT NULL OPTIONS(description = 'UUID del diagnóstico'),
  created_by          STRING    NOT NULL OPTIONS(description = 'Email de quien lo generó (identidad IAP)'),
  created_at          TIMESTAMP NOT NULL,
  alcance             STRING    OPTIONS(description = 'PERSONA / EQUIPO / GENERAL'),
  alcance_etiqueta    STRING    OPTIONS(description = 'Texto legible del alcance, p.ej. nombre del agente o equipos'),
  filtros_json        STRING    OPTIONS(description = 'Filtros normalizados de Reportería (JSON)'),
  filtros_hash        STRING    OPTIONS(description = 'sha256 de filtros_json'),
  fecha_start         DATE,
  fecha_end           DATE,
  n_interacciones     INT64,
  status              STRING    NOT NULL OPTIONS(description = 'OK / ERROR — ERROR no consume cuota'),
  error_message       STRING,
  model               STRING,
  prompt_version      STRING,
  prompt_tokens       INT64,
  output_tokens       INT64,
  costo_estimado_usd  FLOAT64,
  duracion_s          FLOAT64
)
PARTITION BY DATE(created_at)
CLUSTER BY created_by
OPTIONS(description = 'Pitch — diagnósticos IA generados desde Reportería (registro y cuota)');


-- Verificación
SELECT column_name, data_type
FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'pitch_diagnosticos_ia'
ORDER BY ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (solo si se revierte la feature completa)
--   DROP TABLE `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.pitch_diagnosticos_ia`;
-- ─────────────────────────────────────────────────────────────────────────────
