CREATE TABLE IF NOT EXISTS `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.comunicaciones_solicitudes_manuales_amplify` (
  manual_solicitud_id STRING NOT NULL,
  area STRING,
  pais STRING,
  proyecto STRING,
  accion STRING,
  tipo_comunicado STRING,
  fecha_envio DATE NOT NULL,
  audiencia STRING,
  url_sellers STRING,
  descripcion STRING,
  responsable STRING,
  creado_por_email STRING NOT NULL,
  sp_created_at TIMESTAMP NOT NULL,
  sp_modified_at TIMESTAMP NOT NULL,
  fecha_cargue TIMESTAMP NOT NULL,
  is_deleted BOOL NOT NULL
)
PARTITION BY DATE(sp_created_at)
CLUSTER BY pais, proyecto;
