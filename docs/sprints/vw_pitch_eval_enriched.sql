WITH
-- Usuarios deduplicados por Id (versión más reciente)
usuarios_dedup AS (
  SELECT
    Id,
    TRIM(CONCAT(COALESCE(FirstName,''),' ',COALESCE(LastName,''))) AS nombre_usuario,
    Email AS email_usuario,
    ManagerId,
    UPPER(Department) AS departamento_usuario
  FROM `bi-fcom-drmb-sell-in-sbx.svw_tc_sc_bi_bigdata_cust_dp_prod_acc_salesforce_v2_cust_dp_prod.svw_vw_salesforce_user`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY Id ORDER BY AclEntities_timestamp DESC) = 1
),

-- Usuarios deduplicados por Email (para resolver manager desde email_agente)
usuarios_por_email AS (
  SELECT Email, ManagerId
  FROM `bi-fcom-drmb-sell-in-sbx.svw_tc_sc_bi_bigdata_cust_dp_prod_acc_salesforce_v2_cust_dp_prod.svw_vw_salesforce_user`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY Email ORDER BY AclEntities_timestamp DESC) = 1
),

-- Creador real de la Task (solo relevante para TASK_INFO_REQUEST)
task_creator AS (
  SELECT
    t.Id AS interaction_id,
    t.CreatedById
  FROM `bi-fcom-drmb-sell-in-sbx.svw_tc_sc_bi_bigdata_cust_dp_prod_acc_salesforce_v2_cust_dp_prod.svw_vw_salesforce_task` t
  WHERE t.creation_date <= CURRENT_DATETIME()
  QUALIFY ROW_NUMBER() OVER (PARTITION BY t.Id ORDER BY t.creation_date DESC) = 1
),

-- Agente corregido: TASK_INFO_REQUEST usa creador real; el resto queda igual que saaca_eval_detail
agente_corregido AS (
  SELECT
    ed.interaction_id,
    ed.interaction_type,
    CASE WHEN ed.interaction_type = 'TASK_INFO_REQUEST'
         THEN creator.nombre_usuario ELSE ed.owner_name END AS nombre_agente_ok,
    CASE WHEN ed.interaction_type = 'TASK_INFO_REQUEST'
         THEN creator.email_usuario ELSE ed.owner_email END AS email_agente_ok,
    CASE WHEN ed.interaction_type = 'TASK_INFO_REQUEST'
         THEN creator.departamento_usuario ELSE ed.owner_department END AS departamento_ok
  FROM (
    SELECT DISTINCT interaction_id, interaction_type, owner_name, owner_email, owner_department
    FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail`
  ) ed
  LEFT JOIN task_creator tc USING (interaction_id)
  LEFT JOIN usuarios_dedup creator ON creator.Id = tc.CreatedById
),

-- Manager resuelto por email del agente ya corregido
agente_con_manager AS (
  SELECT
    ac.*,
    mgr.nombre_usuario AS nombre_manager,
    mgr.email_usuario  AS email_manager
  FROM agente_corregido ac
  LEFT JOIN usuarios_por_email upe ON upe.Email = ac.email_agente_ok
  LEFT JOIN usuarios_dedup mgr ON mgr.Id = upe.ManagerId
),

eval_detail AS (
  SELECT
    ed.*,
    ic.seller_code,
    ic.tipificacion_level_1_final,
    ic.tipificacion_level_2_final,
    ic.tipificacion_name_final,
    ic.case_closed_date_local,
    am.nombre_agente_ok,
    am.email_agente_ok,
    am.departamento_ok,
    am.nombre_manager,
    am.email_manager
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_eval_detail` ed
  LEFT JOIN `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc.saaca_input_case` ic
    ON ed.case_id = ic.case_id
  LEFT JOIN agente_con_manager am
    ON am.interaction_id = ed.interaction_id
),

deduped AS (
  -- Reportería general: SIEMPRE gana AUTO. HUMANO nunca pisa este universo
  -- (vive aparte en pitch_calibracion_comparativa).
  SELECT *
  FROM eval_detail
  WHERE DATE(evaluated_at) >= '2026-06-01'
    AND criterion_name NOT IN ('Veracidad contractual de la información', 'Registro de impacto de órdenes y SKUs', 'Coherencia de la tipificación')
    AND mechanism != 'HUMANO'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY interaction_id, criterion_id
    ORDER BY
      CASE mechanism
        WHEN 'AUTO_IA_RAG' THEN 1
        WHEN 'AUTO_IA'     THEN 2
        WHEN 'AUTO_REGLA'  THEN 3
        ELSE 4
      END
  ) = 1
),

interaction_metrics AS (
  SELECT
    interaction_id,
    SAFE_DIVIDE(
      SUM(CASE WHEN result_label NOT IN ('N/A', 'NO_EVALUADO')
               THEN result_score * COALESCE(weight_applied, 1.0) END),
      SUM(CASE WHEN result_label NOT IN ('N/A', 'NO_EVALUADO')
               THEN COALESCE(weight_applied, 1.0) END)
    ) * 100                                      AS score_interaccion,
    LOGICAL_OR(is_defective_transaction IS TRUE) AS es_defectuosa,
    SUM(CASE WHEN result_label NOT IN ('N/A', 'NO_EVALUADO')
             THEN COALESCE(weight_applied, 1.0) ELSE 0 END) AS suma_pesos_interaccion
  FROM deduped
  GROUP BY interaction_id
),

category_errors AS (
  SELECT
    interaction_id,
    error_category,
    LOGICAL_OR(result_label = 'NO_CUMPLE') AS tiene_error_en_categoria
  FROM deduped
  WHERE result_label NOT IN ('N/A', 'NO_EVALUADO')
    AND error_category IS NOT NULL
  GROUP BY interaction_id, error_category
)

SELECT
  d.interaction_id,
  d.interaction_type              AS tipo_interaccion,
  d.case_id,
  d.case_number                   AS numero_caso,
  d.case_country                  AS pais,
  d.nombre_agente_ok              AS nombre_agente,
  d.email_agente_ok               AS email_agente,
  d.departamento_ok               AS departamento,
  d.nombre_manager,
  d.email_manager,
  d.seller_code,
  d.tipificacion_level_1_final    AS tipificacion_nivel_1,
  d.tipificacion_level_2_final    AS tipificacion_nivel_2,
  d.tipificacion_name_final       AS nombre_tipificacion,
  DATE(d.evaluated_at)            AS fecha_evaluacion,

  im.score_interaccion,
  im.es_defectuosa,

  (ROW_NUMBER() OVER (
    PARTITION BY d.interaction_id
    ORDER BY d.criterion_id
  ) = 1) AS es_primera_fila_interaccion,

  CASE
    WHEN d.error_category IS NOT NULL
         AND d.result_label NOT IN ('N/A', 'NO_EVALUADO')
         AND ROW_NUMBER() OVER (
               PARTITION BY d.interaction_id, d.error_category
               ORDER BY d.criterion_id
             ) = 1
    THEN TRUE
    ELSE FALSE
  END AS es_primera_fila_categoria,

  d.criterion_id                  AS id_criterio,
  d.criterion_name                AS nombre_criterio,
  d.error_type                    AS tipo_error,
  d.error_category                AS categoria_error,
  d.result_label                  AS resultado,
  d.result_score                  AS score_criterio,
  d.observation                   AS observacion_saaca,
  d.weight_applied                AS peso_aplicado,
  d.mechanism                     AS mecanismo_evaluacion,
  d.evaluated_at                  AS fecha_hora_evaluacion,

  -- NUEVO: peso relativo del criterio dentro del score de su interacción
  SAFE_DIVIDE(
    CASE WHEN d.result_label NOT IN ('N/A','NO_EVALUADO') THEN COALESCE(d.weight_applied, 1.0) END,
    im.suma_pesos_interaccion
  ) AS peso_relativo_criterio,

  ce.tiene_error_en_categoria

FROM deduped d
JOIN interaction_metrics im USING (interaction_id)
LEFT JOIN category_errors ce
       ON ce.interaction_id = d.interaction_id
      AND ce.error_category  = d.error_category
