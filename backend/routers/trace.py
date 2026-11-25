import logging
from datetime import date
from urllib.parse import unquote
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response

from backend.config import get_settings
from backend.dependencies import get_bq, get_current_user, require_role
from backend.models.auth import UserContext
from backend.models.trace import (
    AudienceExportRequest, AudiencePreviewRequest, AudienceSearchRequest,
    TraceTeamsNotifyRequest,
)
from backend.services.trace_service import TraceService
from backend.services.teams_notification_service import (
    TeamsNotificationError, normalize_recipients,
    service_from_settings as get_teams_notification_service,
)
from backend.services.user_service import get_display_names_by_email

router = APIRouter()
logger = logging.getLogger(__name__)


def get_trace_service(bq=Depends(get_bq)) -> TraceService:
    settings = get_settings()
    return TraceService(
        bq,
        audit_table_id=settings.TRACE_AUDIENCE_HISTORY_TABLE,
        snapshot_table_id=settings.TRACE_CONTACTS_SNAPSHOT_TABLE,
        not_found_alert_threshold=settings.TRACE_NOT_FOUND_ALERT_THRESHOLD,
        daily_drop_threshold=settings.TRACE_DAILY_DROP_THRESHOLD,
        members_table_id=settings.TRACE_AUDIENCE_MEMBERS_TABLE,
        reconciliation_table_id=settings.TRACE_SEND_RECONCILIATION_HISTORY_TABLE,
    )


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(status_code=503, detail="No se pudo completar la consulta de Trace.")


async def _read_send_alert_upload(request: Request, max_bytes: int) -> tuple[str, str, bytes]:
    encoded_name = request.headers.get("x-upload-filename", "")
    file_name = unquote(encoded_name)
    content_type = request.headers.get("content-type", "")
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > max_bytes:
        raise HTTPException(status_code=413, detail="El archivo supera el límite permitido.")
    chunks = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail="El archivo supera el límite permitido.")
        chunks.append(chunk)
    return file_name, content_type, b"".join(chunks)


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
    countries: list[str] | None = Query(default=None),
    date_from: date | None = None,
    date_to: date | None = None,
    job_id: str | None = None,
    audience_id: str | None = None,
    service: TraceService = Depends(get_trace_service),
):
    try:
        return service.sends_summary(
            template, seller_id, status, countries, date_from, date_to, job_id, audience_id,
        )
    except Exception as exc:
        raise _http_error(exc) from exc


@router.get("/sends/detail")
def sends_detail(
    template: str = Query(min_length=1, max_length=256),
    seller_id: str | None = None,
    status: str | None = None,
    countries: list[str] | None = Query(default=None),
    date_from: date | None = None,
    date_to: date | None = None,
    job_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    service: TraceService = Depends(get_trace_service),
):
    try:
        return service.sends_detail(
            template, seller_id, status, page, page_size, countries, date_from, date_to, job_id,
        )
    except Exception as exc:
        raise _http_error(exc) from exc


@router.get("/sends/export")
def sends_export(
    template: str = Query(min_length=1, max_length=256),
    seller_id: str | None = None,
    status: str | None = None,
    countries: list[str] | None = Query(default=None),
    date_from: date | None = None,
    date_to: date | None = None,
    job_id: str | None = None,
    service: TraceService = Depends(get_trace_service),
):
    try:
        csv_content, filename = service.sends_export(
            template, seller_id, status, countries, date_from, date_to, job_id,
        )
    except Exception as exc:
        raise _http_error(exc) from exc
    return Response(
        content=csv_content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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


@router.post("/audiences/search")
def audience_search_post(
    body: AudienceSearchRequest,
    service: TraceService = Depends(get_trace_service),
    user: UserContext = Depends(get_current_user),
):
    if user.role == "VIEWER" and not body.members_only:
        raise HTTPException(status_code=403, detail="VIEWER solo puede buscar audiencias con miembros")
    try:
        return service.search_audiences(
            body.search, body.created_by, body.created_from, body.created_to,
            body.page, body.page_size, body.members_only,
        )
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/send-alerts/validate")
async def validate_send_alert_csv(
    request: Request,
    audience_id: str = Query(min_length=1, max_length=64),
    email_column: str | None = Header(default=None, alias="X-Email-Column"),
    service: TraceService = Depends(get_trace_service),
    user: UserContext = Depends(get_current_user),
):
    del user
    settings = get_settings()
    file_name, content_type, content = await _read_send_alert_upload(request, settings.TRACE_SEND_ALERT_MAX_BYTES)
    try:
        return service.validate_send_csv(
            audience_id, file_name, content_type, content, email_column,
            settings.TRACE_SEND_ALERT_MAX_BYTES,
        )
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/send-alerts/reconcile")
async def reconcile_send_alert_csv(
    request: Request,
    audience_id: str = Query(min_length=1, max_length=64),
    email_column: str = Header(alias="X-Email-Column"),
    allow_duplicate: bool = Query(default=False),
    service: TraceService = Depends(get_trace_service),
    user: UserContext = Depends(get_current_user),
):
    settings = get_settings()
    file_name, content_type, content = await _read_send_alert_upload(request, settings.TRACE_SEND_ALERT_MAX_BYTES)
    try:
        return service.reconcile_send_csv(
            audience_id, file_name, content_type, content, email_column, user.email,
            allow_duplicate, settings.TRACE_SEND_ALERT_MAX_BYTES,
        )
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/send-alerts/{reconciliation_id}/notify-teams")
def notify_send_reconciliation_teams(
    reconciliation_id: UUID,
    body: TraceTeamsNotifyRequest,
    service: TraceService = Depends(get_trace_service),
    user: UserContext = Depends(get_current_user),
):
    try:
        reconciliation = service.get_send_reconciliation(str(reconciliation_id))
    except Exception as exc:
        raise _http_error(exc) from exc
    if not reconciliation:
        raise HTTPException(status_code=404, detail="No se encontró esa conciliación.")
    if reconciliation.get("status") != "COMPLETED":
        raise HTTPException(status_code=409, detail="La conciliación aún no está disponible para notificar.")
    try:
        settings = get_settings()
        recipients = normalize_recipients(
            body.recipients,
            settings.TRACE_TEAMS_ALLOWED_EMAIL_DOMAINS,
            settings.TRACE_TEAMS_MAX_RECIPIENTS,
        )
        notification_service = get_teams_notification_service(settings)
        notification_service.validate_configuration()
        try:
            directory_names = get_display_names_by_email(service.bq, recipients)
        except Exception:
            logger.warning(
                "Trace Teams mention name lookup failed: reconciliation_id=%s",
                reconciliation_id,
            )
            directory_names = {}
        return notification_service.notify(
            reconciliation, recipients, user.email,
            directory_names,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TeamsNotificationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/send-alerts/history")
def send_alert_history(
    audience_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    service: TraceService = Depends(get_trace_service),
):
    try:
        return service.search_send_alert_history(audience_id, page, page_size)
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