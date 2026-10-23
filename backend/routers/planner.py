import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.config import get_settings
from backend.dependencies import get_bq, get_current_user
from backend.models.auth import UserContext
from backend.models.planner import (
    ManualSolicitudCreate,
    ManualSolicitudResponse,
    PlannerDecisionCreate,
    PlannerDecisionHistory,
    PlannerDecisionResponse,
    PlannerFilterOptions,
    PlannerSolicitudResponse,
)
from backend.services.planner_service import PlannerDecisionConflict, PlannerService

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_service() -> PlannerService:
    return PlannerService(get_bq(), get_settings())


def _validate_date_range(desde: date | None, hasta: date | None) -> None:
    if desde and hasta and desde > hasta:
        raise HTTPException(status_code=422, detail="desde no puede ser posterior a hasta")


@router.get("/solicitudes", response_model=list[PlannerSolicitudResponse])
def list_approval_requests(
    estado: str | None = None,
    pais_codigo: str | None = None,
    proyecto: str | None = None,
    area: str | None = None,
    responsable_nombre: str | None = None,
    prioridad: str | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    user: UserContext = Depends(get_current_user),
):
    _validate_date_range(desde, hasta)
    try:
        return _get_service().list_approval_requests(
            estado=estado,
            pais_codigo=pais_codigo,
            proyecto=proyecto,
            area=area,
            responsable_nombre=responsable_nombre,
            prioridad=prioridad,
            desde=desde,
            hasta=hasta,
        )
    except Exception as exc:
        logger.error("Error consultando solicitudes para aprobación: %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="No se pudieron cargar las solicitudes.") from exc


@router.get("/calendario", response_model=list[PlannerSolicitudResponse])
def list_approval_calendar(
    desde: date = Query(...),
    hasta: date = Query(...),
    estado: str | None = None,
    pais_codigo: str | None = None,
    proyecto: str | None = None,
    area: str | None = None,
    responsable_nombre: str | None = None,
    prioridad: str | None = None,
    user: UserContext = Depends(get_current_user),
):
    _validate_date_range(desde, hasta)
    try:
        return _get_service().list_calendar_requests(
            desde,
            hasta,
            estado=estado,
            pais_codigo=pais_codigo,
            proyecto=proyecto,
            area=area,
            responsable_nombre=responsable_nombre,
            prioridad=prioridad,
        )
    except Exception as exc:
        logger.error("Error consultando calendario de Planner: %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="No se pudo cargar el calendario.") from exc


@router.get("/filtros", response_model=PlannerFilterOptions)
def get_approval_filters(user: UserContext = Depends(get_current_user)):
    try:
        return _get_service().get_approval_filter_options()
    except Exception as exc:
        logger.error("Error consultando filtros de Planner: %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="No se pudieron cargar los filtros.") from exc


@router.post(
    "/solicitudes/{sp_item_id}/decision",
    response_model=PlannerDecisionResponse,
    status_code=201,
)
def create_approval_decision(
    sp_item_id: int,
    body: PlannerDecisionCreate,
    user: UserContext = Depends(get_current_user),
):
    # TODO: agregar require_role cuando se definan los roles de aprobación.
    try:
        return _get_service().create_decision(sp_item_id, body, user.email)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlannerDecisionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error(
            "Error guardando decisión de Planner (solicitud=%s, acción=%s, tipo=%s)",
            sp_item_id,
            body.accion,
            type(exc).__name__,
        )
        raise HTTPException(status_code=500, detail="No se pudo guardar la decisión.") from exc


@router.get(
    "/solicitudes/{sp_item_id}/historial",
    response_model=list[PlannerDecisionHistory],
)
def get_approval_history(
    sp_item_id: int,
    user: UserContext = Depends(get_current_user),
):
    try:
        return _get_service().get_decision_history(sp_item_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.error(
            "Error consultando historial de Planner (solicitud=%s, tipo=%s)",
            sp_item_id,
            type(exc).__name__,
        )
        raise HTTPException(status_code=500, detail="No se pudo cargar el historial.") from exc


@router.get("/solicitudes-manuales", response_model=list[ManualSolicitudResponse])
def list_manual_requests(user: UserContext = Depends(get_current_user)):
    try:
        return _get_service().list_manual_requests()
    except Exception as exc:
        logger.error("Error consultando solicitudes manuales de Planner: %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="No se pudieron cargar las solicitudes.") from exc


@router.post("/solicitudes-manuales", response_model=ManualSolicitudResponse, status_code=201)
def create_manual_request(
    body: ManualSolicitudCreate,
    user: UserContext = Depends(get_current_user),
):
    try:
        return _get_service().create_manual_request(body, user.email, user.full_name)
    except Exception as exc:
        logger.error("Error creando solicitud manual de Planner: %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="No se pudo crear la solicitud.") from exc
