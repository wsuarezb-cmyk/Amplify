from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from backend.config import get_settings
from backend.dependencies import get_bq, get_current_user, require_role
from backend.models.auth import UserContext
from backend.models.trace import AudienceExportRequest, AudiencePreviewRequest
from backend.services.trace_service import TraceService

router = APIRouter()


def get_trace_service(bq=Depends(get_bq)) -> TraceService:
    settings = get_settings()
    return TraceService(
        bq,
        audit_table_id=settings.TRACE_AUDIENCE_HISTORY_TABLE,
        snapshot_table_id=settings.TRACE_CONTACTS_SNAPSHOT_TABLE,
        not_found_alert_threshold=settings.TRACE_NOT_FOUND_ALERT_THRESHOLD,
        daily_drop_threshold=settings.TRACE_DAILY_DROP_THRESHOLD,
    )


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(status_code=503, detail="No se pudo completar la consulta de Trace.")


@router.get("/audiences/options")
def audience_options(service: TraceService = Depends(get_trace_service)):
    try:
        return {"filters": service.get_filter_options()}
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/audiences/dataset")
def audience_dataset(
    body: AudiencePreviewRequest,
    service: TraceService = Depends(get_trace_service),
):
    try:
        return service.dataset(body.raw_input, body.search_type)
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/audiences/preview")
def audience_preview(
    body: AudiencePreviewRequest,
    service: TraceService = Depends(get_trace_service),
):
    try:
        return service.preview(body.raw_input, body.search_type, body.filters)
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/audiences/export")
def audience_export(
    body: AudienceExportRequest,
    service: TraceService = Depends(get_trace_service),
    user: UserContext = Depends(get_current_user),
):
    try:
        csv_content, filename, _ = service.export(
            body.raw_input,
            body.search_type,
            body.filters,
            body.template,
            body.confirm_warnings,
            user.email,
        )
    except Exception as exc:
        raise _http_error(exc) from exc
    return Response(
        content=csv_content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sends/summary")
def sends_summary(
    template: str = Query(min_length=1, max_length=256),
    seller_id: str | None = None,
    status: str | None = None,
    service: TraceService = Depends(get_trace_service),
):
    try:
        return service.sends_summary(template, seller_id, status)
    except Exception as exc:
        raise _http_error(exc) from exc


@router.get("/sends/detail")
def sends_detail(
    template: str = Query(min_length=1, max_length=256),
    seller_id: str | None = None,
    status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    service: TraceService = Depends(get_trace_service),
):
    try:
        return service.sends_detail(template, seller_id, status, page, page_size)
    except Exception as exc:
        raise _http_error(exc) from exc


@router.get("/audiences/history")
def audience_history(
    template: str | None = None,
    created_by: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    service: TraceService = Depends(get_trace_service),
):
    try:
        return service.audience_history(template, created_by, created_from, created_to, page, page_size)
    except Exception as exc:
        raise _http_error(exc) from exc


@router.get("/contacts/daily-volume")
def daily_volume(service: TraceService = Depends(get_trace_service)):
    try:
        return service.daily_volume_status()
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/contacts/daily-volume/capture", dependencies=[Depends(require_role("ADMIN"))])
def capture_daily_volume(service: TraceService = Depends(get_trace_service)):
    try:
        return service.capture_daily_volume()
    except Exception as exc:
        raise _http_error(exc) from exc