CREATE OR REPLACE VIEW `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.vw_planner_solicitudes` AS
WITH solicitudes AS (
  SELECT
    sp_item_id,
    proyecto,
    proyecto AS titulo,
    area,
    pais,
    NULLIF(ARRAY_TO_STRING(ARRAY(
      SELECT CASE
        WHEN REGEXP_CONTAINS(LOWER(TRIM(pais_value)), r'chile$') THEN 'CL'
        WHEN REGEXP_CONTAINS(LOWER(TRIM(pais_value)), r'per[uú]$') THEN 'PE'
        WHEN REGEXP_CONTAINS(LOWER(TRIM(pais_value)), r'colombia$') THEN 'CO'
      END
      FROM UNNEST(SPLIT(COALESCE(pais, ''), ',')) AS pais_value WITH OFFSET AS country_position
      WHERE REGEXP_CONTAINS(LOWER(TRIM(pais_value)), r'(chile|per[uú]|colombia)$')
      ORDER BY country_position
    ), ','), '') AS pais_codigo,
    responsable AS responsable_nombre,
    DATE(sp_created_at) AS fecha_solicitud,
    fecha_envio AS fecha_publicacion,
    accion AS accion_solicitud,
    tipo_comunicado,
    audiencia,
    url_sellers,
    descripcion,
    sp_created_at,
    sp_modified_at
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.comunicaciones_solicitudes_amplify`
  WHERE is_deleted = FALSE
  -- Particionada por sp_created_at; require_partition_filter = FALSE.
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY sp_item_id
    ORDER BY sp_modified_at DESC, fecha_cargue DESC, sp_created_at DESC
  ) = 1
),
ultima_decision AS (
  SELECT
    decision_id,
    sp_item_id,
    accion AS decision_accion,
    prioridad,
    fecha_solicitada,
    fecha_aprobada,
    motivo,
    decidido_at
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.comunicaciones_decisiones_amplify`
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY sp_item_id
    ORDER BY decidido_at DESC, decision_id DESC
  ) = 1
)
SELECT
  s.sp_item_id,
  s.titulo,
  s.proyecto,
  s.area,
  s.pais,
  s.pais_codigo,
  s.responsable_nombre,
  s.fecha_solicitud,
  s.fecha_publicacion,
  s.accion_solicitud,
  s.tipo_comunicado,
  s.audiencia,
  s.url_sellers,
  s.descripcion,
  s.sp_created_at,
  s.sp_modified_at,
  d.decision_id,
  d.decision_accion,
  d.prioridad,
  d.fecha_solicitada,
  d.fecha_aprobada,
  d.motivo,
  d.decidido_at,
  CASE
    WHEN d.sp_item_id IS NULL THEN 'PENDIENTE'
    WHEN s.sp_modified_at > d.decidido_at THEN 'MODIFICADA'
    WHEN d.decision_accion = 'AUTORIZAR' THEN 'AUTORIZADA'
    WHEN d.decision_accion = 'REPROGRAMAR' THEN 'REPROGRAMADA'
  END AS estado,
  d.fecha_aprobada AS fecha_calendario
FROM solicitudes AS s
LEFT JOIN ultima_decision AS d USING (sp_item_id);
