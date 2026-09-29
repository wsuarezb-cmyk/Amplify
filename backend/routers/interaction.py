"""
Router: GET /api/interaction/*

Contexto del caso para Calibración:
    GET /case-thread/{case_number}      → hilo completo del caso (seller + interno)
    GET /input-detail/{interaction_id}  → campos clave de la tabla saaca_input_*
                                          según interaction_type
"""

import logging

from fastapi import APIRouter, Query
from google.cloud.bigquery import ScalarQueryParameter

from backend.dependencies import get_bq
from backend.models.schemas import CaseThreadResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# Mapeo interaction_type → tabla input (constantes, nunca del usuario)
_INPUT_TABLES = {
    "EMAIL":             "saaca_input_email",
    "SELLER_REPLY":      "saaca_input_seller_reply",
    "TASK_INFO_REQUEST": "saaca_input_task_info_request",
    "TASK_INTERNAL":     "saaca_input_task_internal",
    "TASK_RECONTACT":    "saaca_input_task_recontact",
    "TASK_REOPEN":       "saaca_input_task_reopen",
    "CASE":              "saaca_input_case",
}

# Campos a mostrar por tipo (replicando el contexto que SAACA entrega a Gemini)
_FIELDS_BY_TYPE = {
    "EMAIL": [
        "interaction_id", "interaction_date", "case_number", "case_country",
        "owner_name", "owner_email", "owner_department",
        "task_subject", "email_to", "email_body",
        "tipificacion_level_1_final", "tipificacion_level_2_final", "tipificacion_name_final",
    ],
    "SELLER_REPLY": [
        "interaction_id", "interaction_date", "case_number", "case_country",
        "owner_name", "owner_department",
        "task_subject", "task_description",
    ],
    "TASK_INFO_REQUEST": [
        "interaction_id", "interaction_date", "case_number", "case_country",
        "owner_name", "owner_email", "owner_department",
        "task_subject", "task_description",
        "tipificacion_level_1_final", "tipificacion_level_2_final", "tipificacion_name_final",
    ],
    "TASK_INTERNAL": [
        "interaction_id", "interaction_date", "case_number", "case_country",
        "owner_name", "owner_department",
        "task_subject", "task_description", "task_status",
    ],
    "TASK_RECONTACT": [
        "interaction_id", "interaction_date", "case_number", "case_country",
        "owner_name", "owner_email", "owner_department",
        "task_subject", "task_description",
        "recontact_reason", "recontact_within_sla", "case_state_at_recontact",
        "task_hours_elapsed", "task_hours_business",
    ],
    "TASK_REOPEN": [
        "interaction_id", "interaction_date", "case_number", "case_country",
        "owner_name", "owner_email", "owner_department",
        "task_subject", "task_description",
        "reopening_reason", "reopen_context",
        "task_hours_elapsed", "task_hours_business",
    ],
    "CASE": [
        "interaction_id", "interaction_date", "case_number", "case_country",
        "owner_name", "owner_email", "owner_department",
        "case_description", "case_closure_reason",
        "tipificacion_level_1_final", "tipificacion_level_2_final", "tipificacion_name_final",
        "case_impactonorders", "case_skuimpact", "case_duplicate",
    ],
}


def _to_serializable(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (int, float, bool, str)):
        return value
    return str(value)


# ─────────────────────────────────────────────────────────────
# Helpers para construir el hilo desde saaca_input_*
# ─────────────────────────────────────────────────────────────

_SELLER_TYPES   = {"CASE", "EMAIL", "SELLER_REPLY", "TASK_INFO_REQUEST",
                   "TASK_REOPEN", "TASK_RECONTACT"}
_INTERNAL_TYPES = {"TASK_INTERNAL"}

_TYPE_LABEL = {
    "CASE":              "APERTURA DEL CASO",
    "EMAIL":             "EMAIL",
    "SELLER_REPLY":      "RESPUESTA DEL SELLER",
    "TASK_INFO_REQUEST": "SOLICITUD DE INFORMACIÓN",
    "TASK_REOPEN":       "REAPERTURA",
    "TASK_RECONTACT":    "RECONTACTO",
    "TASK_INTERNAL":     "GESTIÓN INTERNA",
}


def _build_thread_from_inputs(bq, case_id: str) -> tuple[str, str, int]:
    """
    Construye el hilo completo desde las tablas saaca_input_*,
    igual que SAACA hace en build_context_thread() pero:
      - Sin filtro temporal (hilo completo)
      - Incluyendo interaction_id en cada bloque (para identificación exacta)
      - Separando seller vs internal

    Returns:
        (seller_thread_text, internal_thread_text, total_interactions)
    """
    ds = f"{bq.client.project}.{bq.dataset}"

    sql = f"""
    SELECT
        interaction_id,
        interaction_type,
        interaction_date,
        owner_name,
        owner_department,
        content
    FROM (

        SELECT
            interaction_id,
            'CASE'                                              AS interaction_type,
            interaction_date,
            owner_name,
            owner_department,
            CONCAT(
                'País: ', IFNULL(case_country, '?'), '\\n',
                'Motivo: ', IFNULL(case_description, '(sin descripción)'), '\\n',
                'Cierre: ', IFNULL(case_closure_reason, '(abierto)'), '\\n',
                'Tipificación: ', IFNULL(tipificacion_name_final, 'Sin tipificación')
            )                                                   AS content
        FROM `{ds}.saaca_input_case`
        WHERE case_id = @case_id

        UNION ALL

        SELECT
            interaction_id,
            'EMAIL'                                             AS interaction_type,
            interaction_date,
            owner_name,
            owner_department,
            CONCAT(
                'Asunto: ', IFNULL(task_subject, '(sin asunto)'), '\\n',
                'Para: ', IFNULL(email_to, ''), '\\n',
                'Cuerpo:\\n', IFNULL(email_body, '(sin cuerpo)')
            )                                                   AS content
        FROM `{ds}.saaca_input_email`
        WHERE case_id = @case_id

        UNION ALL

        SELECT
            interaction_id,
            'SELLER_REPLY'                                      AS interaction_type,
            interaction_date,
            owner_name,
            owner_department,
            IFNULL(task_description, '(sin respuesta)')         AS content
        FROM `{ds}.saaca_input_seller_reply`
        WHERE case_id = @case_id

        UNION ALL

        SELECT
            interaction_id,
            'TASK_INFO_REQUEST'                                 AS interaction_type,
            interaction_date,
            owner_name,
            owner_department,
            CONCAT(
                'Asunto: ', IFNULL(task_subject, '(sin asunto)'), '\\n',
                IFNULL(task_description, '(sin descripción)')
            )                                                   AS content
        FROM `{ds}.saaca_input_task_info_request`
        WHERE case_id = @case_id

        UNION ALL

        SELECT
            interaction_id,
            'TASK_REOPEN'                                       AS interaction_type,
            interaction_date,
            owner_name,
            owner_department,
            CONCAT(
                'Motivo: ', IFNULL(reopening_reason, '(sin motivo)'), '\\n',
                IFNULL(NULLIF(TRIM(task_description), ''),
                       '(reapertura sin contenido adicional)')
            )                                                   AS content
        FROM `{ds}.saaca_input_task_reopen`
        WHERE case_id = @case_id

        UNION ALL

        SELECT
            interaction_id,
            'TASK_RECONTACT'                                    AS interaction_type,
            interaction_date,
            owner_name,
            owner_department,
            CONCAT(
                'Motivo: ', IFNULL(recontact_reason, '(sin motivo)'), '\\n',
                IFNULL(NULLIF(TRIM(task_description), ''),
                       '(recontacto sin contenido adicional)')
            )                                                   AS content
        FROM `{ds}.saaca_input_task_recontact`
        WHERE case_id = @case_id

        UNION ALL

        SELECT
            interaction_id,
            'TASK_INTERNAL'                                     AS interaction_type,
            interaction_date,
            owner_name,
            owner_department,
            CONCAT(
                'Tipo: ', IFNULL(task_subject, 'Sin tipo'), '\\n',
                'BU: ', IFNULL(owner_department, 'Sin BU'), '\\n',
                IFNULL(task_description, '(sin descripción)')
            )                                                   AS content
        FROM `{ds}.saaca_input_task_internal`
        WHERE case_id = @case_id
          AND task_description IS NOT NULL
          AND TRIM(task_description) != ''

    )
    ORDER BY interaction_date ASC, interaction_type ASC
    """

    rows = bq.query(sql, [ScalarQueryParameter("case_id", "STRING", case_id)])
    if not rows:
        return "", "", 0

    seller_pieces   = []
    internal_pieces = []

    for row in rows:
        itype  = row["interaction_type"]
        label  = _TYPE_LABEL.get(itype, itype)
        iid    = row["interaction_id"] or ""
        fecha  = str(row["interaction_date"])[:16].replace("T", " ")
        agente = row.get("owner_name") or ""
        agent_part = f" | {agente}" if agente else ""
        content = (row.get("content") or "").strip()

        # Cabecera incluye interaction_id para identificación exacta
        header  = f"[{label} - {fecha}{agent_part}]\nID: {iid}"
        piece   = f"{header}\n{content}"

        if itype in _INTERNAL_TYPES:
            internal_pieces.append(piece)
        else:
            seller_pieces.append(piece)

    return (
        "\n\n".join(seller_pieces),
        "\n\n".join(internal_pieces),
        len(rows),
    )


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/case-thread/{case_number}", response_model=CaseThreadResponse)
async def get_case_thread(case_number: str):
    """
    Construye el hilo del caso directamente desde saaca_input_*
    (igual que SAACA hace en build_context_thread), incluyendo
    interaction_id en cada bloque para identificación exacta.
    Requiere case_id: se resuelve desde saaca_input_case.
    """
    bq = get_bq()
    ds = f"{bq.client.project}.{bq.dataset}"

    # Resolver case_id desde saaca_input_case (filtro por case_number)
    id_rows = bq.query(
        f"SELECT case_id FROM `{ds}.saaca_input_case` WHERE case_number = @cn LIMIT 1",
        [ScalarQueryParameter("cn", "STRING", case_number)],
    )

    if not id_rows:
        # Fallback: intentar con saaca_input_email
        id_rows = bq.query(
            f"SELECT case_id FROM `{ds}.saaca_input_email` WHERE case_number = @cn LIMIT 1",
            [ScalarQueryParameter("cn", "STRING", case_number)],
        )

    if not id_rows:
        return CaseThreadResponse(
            case_number=case_number,
            total_tasks=0,
            seller_thread_text=None,
            internal_thread_text=None,
        )

    case_id = id_rows[0]["case_id"]
    seller_text, internal_text, total = _build_thread_from_inputs(bq, case_id)

    return CaseThreadResponse(
        case_number=case_number,
        total_tasks=total,
        seller_thread_text=seller_text or None,
        internal_thread_text=internal_text or None,
    )


@router.get("/input-detail/{interaction_id}")
async def get_input_detail(
    interaction_id: str,
    interaction_type: str = Query(..., description="Tipo de interacción: EMAIL, TASK_REOPEN, etc."),
):
    """
    Retorna los campos clave de la interacción desde la tabla saaca_input_*
    correspondiente al tipo. Replica el contexto que SAACA entrega a Gemini.
    """
    itype = interaction_type.upper()
    table_name = _INPUT_TABLES.get(itype)
    if not table_name:
        return {"interaction_id": interaction_id, "interaction_type": itype, "fields": {}}

    desired_fields = _FIELDS_BY_TYPE.get(itype, [
        "interaction_id", "interaction_date", "case_number", "case_country",
        "owner_name", "owner_department",
    ])

    bq = get_bq()
    table = bq.full_table_id(table_name)

    try:
        rows = bq.query(
            f"SELECT * FROM `{table}` WHERE interaction_id = @iid LIMIT 1",
            [ScalarQueryParameter("iid", "STRING", interaction_id)],
        )
    except Exception as exc:
        logger.error("input-detail BQ error [%s / %s]: %s", interaction_id, itype, exc)
        return {"interaction_id": interaction_id, "interaction_type": itype, "fields": {}}

    if not rows:
        return {"interaction_id": interaction_id, "interaction_type": itype, "fields": {}}

    row = rows[0]
    # Devolver sólo los campos deseados que existan en la fila
    fields_out = {k: _to_serializable(row.get(k)) for k in desired_fields if k in row}
    return {
        "interaction_id": interaction_id,
        "interaction_type": itype,
        "fields": fields_out,
    }
