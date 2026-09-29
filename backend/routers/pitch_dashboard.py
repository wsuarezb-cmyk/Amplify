"""
Router: /api/pitch/dashboard/*  — Reportería de Pitch.

  GET /extracto           → payload columnar completo del día (carga única)
  GET /calibracion-kpi    → acuerdo humano-SAACA (ventana 90d)
  GET /interaction/{id}   → drilldown en vivo desde pitch_eval_enriched
  GET /export             → CSV de pitch_eval_enriched con filtros
                            (rango ≤ 31 días, máx 50k filas)
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from backend.dependencies import get_bq, get_current_user
from backend.models.auth import UserContext
from backend.models.pitch import (
    CalibracionKpiResponse,
    ExtractoResponse,
    InteractionDetailPitchResponse,
)
from backend.services.pitch_reporting_service import PitchReportingService

router = APIRouter()


def _get_service() -> PitchReportingService:
    return PitchReportingService(get_bq())


@router.get("/extracto", response_model=ExtractoResponse)
def get_extracto(
    force_refresh: bool = False,
    user: UserContext = Depends(get_current_user),
):
    """
    Extracto diario completo para el cross-filter en el navegador.
    force_refresh solo se honra para ADMIN (invalida el caché del día).
    """
    svc = _get_service()
    refresh = force_refresh and user.role == "ADMIN"
    try:
        return svc.get_extracto(force_refresh=refresh)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/calibracion-kpi", response_model=CalibracionKpiResponse)
def get_calibracion_kpi():
    """
    Acuerdo humano-SAACA de los últimos 90 días — meta-indicador para la card
    de Reportería. Independiente de los filtros del dashboard (otro grano).
    """
    svc = _get_service()
    try:
        return svc.get_calibracion_kpi()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/export")
def export_enriched(
    fecha_start: str = Query(..., description="Inicio del rango YYYY-MM-DD (obligatorio)"),
    fecha_end:   str = Query(..., description="Fin del rango YYYY-MM-DD (máx. 31 días)"),
    pais:                 Optional[list[str]] = Query(default=None),
    departamento:         Optional[list[str]] = Query(default=None),
    tipo_interaccion:     Optional[list[str]] = Query(default=None),
    mecanismo_evaluacion: Optional[list[str]] = Query(default=None),
    id_criterio:          Optional[list[str]] = Query(default=None),
    tipificacion_nivel_1: Optional[list[str]] = Query(default=None),
    tipificacion_nivel_2: Optional[list[str]] = Query(default=None),
    nombre_tipificacion:  Optional[list[str]] = Query(default=None),
    email_agente:         Optional[list[str]] = Query(default=None),
    email_manager:        Optional[list[str]] = Query(default=None),
    numero_caso:          Optional[list[str]] = Query(default=None),
    interaction_id:       Optional[list[str]] = Query(default=None),
    seller_code:          Optional[list[str]] = Query(default=None),
):
    """
    Descarga CSV de pitch_eval_enriched (incluye observacion_saaca) con los
    filtros del dashboard. Gobernado: rango obligatorio ≤ 31 días, corte en
    50.000 filas (header X-Export-Truncated: true si se alcanzó).
    """
    svc = _get_service()
    filtros = {
        "fecha_start": fecha_start, "fecha_end": fecha_end,
        "pais": pais, "departamento": departamento,
        "tipo_interaccion": tipo_interaccion,
        "mecanismo_evaluacion": mecanismo_evaluacion,
        "id_criterio": id_criterio,
        "tipificacion_nivel_1": tipificacion_nivel_1,
        "tipificacion_nivel_2": tipificacion_nivel_2,
        "nombre_tipificacion": nombre_tipificacion,
        "email_agente": email_agente, "email_manager": email_manager,
        "numero_caso": numero_caso, "interaction_id": interaction_id,
        "seller_code": seller_code,
    }
    try:
        stream, truncado = svc.export_enriched_csv(filtros)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    filename = f"pitch_enriched_{fecha_start}_{fecha_end}.csv"
    return StreamingResponse(
        stream,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Export-Truncated": "true" if truncado else "false",
        },
    )


@router.get("/interaction/{interaction_id}", response_model=InteractionDetailPitchResponse)
def get_interaction_detail(interaction_id: str):
    """
    Detalle por criterio de una interacción, con observacion_saaca.
    Consulta en vivo a pitch_eval_enriched (la vista extracto no la incluye).
    """
    svc = _get_service()
    try:
        detail = svc.get_interaction_detail(interaction_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if detail is None:
        raise HTTPException(status_code=404, detail="Interacción no encontrada")
    return detail
