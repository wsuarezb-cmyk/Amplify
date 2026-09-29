"""
Router: GET /api/criteria/*

Catálogo de criterios de calidad SAACA.
Catalog-driven — no hardcodeado en el frontend.
"""

from fastapi import APIRouter, Path as PathParam

from backend.dependencies import get_bq
from backend.models.schemas import CriterionCatalogItem

router = APIRouter()

_CATALOG_TABLE = "saaca_cat_criteria"
_MAPPING_TABLE = "saaca_cat_criteria_mapping"


@router.get("/", response_model=list[CriterionCatalogItem])
async def list_criteria():
    """Devuelve todos los criterios activos del catálogo."""
    bq = get_bq()
    table = bq.full_table_id(_CATALOG_TABLE)

    sql = f"""
    SELECT
        criterion_id,
        criterion_name,
        criterion_description,
        error_type,
        error_category,
        criterion_weight
    FROM `{table}`
    WHERE is_active = TRUE
    ORDER BY criterion_id
    """
    rows = bq.query(sql)
    return [CriterionCatalogItem(**r) for r in rows]


@router.get("/by-interaction-type/{interaction_type}", response_model=list[CriterionCatalogItem])
async def list_criteria_by_type(interaction_type: str = PathParam(...)):
    """
    Devuelve los criterios aplicables a un tipo de interacción específico
    para evaluación humana (mechanism = 'HUMAN').

    Usado por EvalForm en Etapa 5 para mostrar solo los criterios relevantes.
    """
    bq = get_bq()
    catalog = bq.full_table_id(_CATALOG_TABLE)
    mapping = bq.full_table_id(_MAPPING_TABLE)

    from google.cloud.bigquery import ScalarQueryParameter

    sql = f"""
    SELECT DISTINCT
        c.criterion_id,
        c.criterion_name,
        c.criterion_description,
        c.error_type,
        c.error_category,
        c.criterion_weight
    FROM `{catalog}` c
    INNER JOIN `{mapping}` m USING (criterion_id)
    WHERE c.is_active = TRUE
      AND m.is_active = TRUE
      AND m.interaction_type = @interaction_type
      AND m.mechanism = 'HUMANO'
    ORDER BY c.criterion_id
    """
    params = [ScalarQueryParameter("interaction_type", "STRING", interaction_type)]
    rows = bq.query(sql, params)
    return [CriterionCatalogItem(**r) for r in rows]
