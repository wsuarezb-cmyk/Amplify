CREATE TABLE IF NOT EXISTS `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.comunicaciones_decisiones_amplify` (
  decision_id STRING NOT NULL,
  sp_item_id INT64 NOT NULL,
  accion STRING NOT NULL,
  prioridad STRING NOT NULL,
  fecha_solicitada DATE,
  fecha_aprobada DATE NOT NULL,
  motivo STRING,
  decidido_por_email STRING NOT NULL,
  decidido_at TIMESTAMP NOT NULL,
  decision_anterior STRING
)
PARTITION BY DATE(decidido_at)
CLUSTER BY sp_item_id;
