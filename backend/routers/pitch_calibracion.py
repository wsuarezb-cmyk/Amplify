"""
Router: /api/pitch/calibracion/*  — Calibración de Pitch.

  GET  /inbox                → bandeja del auditor autenticado (aislamiento por email)
  POST /evaluar              → paso 1: voto a ciegas (sin observación) → EN_PROGRESO
  GET  /revision/{id}        → voto a ciegas vs veredicto/observación SAACA (solo EN_PROGRESO)
  POST /confirmar            → paso 2: voto final + observación → escritura dual (spec 3.4)
  POST /descartar            → marca DESCARTADO con motivo obligatorio
  GET  /comparacion/{id}     → AUTO vs HUMANO — SOLO tras confirmar
  GET  /dashboard            → progreso + % acuerdo (propio para AUDITOR, global para LIDER_QUALITY+)
  GET  /muestra/preview      → población + n de Cochran por estrato (LIDER_QUALITY+)
  POST /muestra/generar      → genera e inserta la muestra del período (LIDER_QUALITY+)
  GET  /muestra/batches      → batches generados con progreso (LIDER_QUALITY+)
  POST /muestra/batch/{id}/anular → elimina las unidades pendientes del batch (LIDER_QUALITY+)

El dashboard de agreement (matriz de confusión + Kappa) es fase posterior —
se agregará aquí como GET /agreement cuando se implemente.

El rol mínimo AUDITOR se aplica a nivel de router (main.py); los endpoints de
muestra elevan a LIDER_QUALITY con require_role.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.dependencies import get_bq, get_current_user, require_role
from backend.models.auth import UserContext
from backend.models.pitch import (
    AnularBatchResponse,
    BatchListResponse,
    CalibracionDashboardResponse,
    CalibracionInboxResponse,
    ComparacionResponse,
    ConfirmarRequest,
    ConfirmarResponse,
    DescartarRequest,
    DescartarResponse,
    EvaluarRequest,
    EvaluarResponse,
    GenerarMuestraRequest,
    GenerarMuestraResponse,
    MuestraPreviewResponse,
    RevisionResponse,
)
from backend.services.calibracion_service import CalibracionService

router = APIRouter()


def _get_service() -> CalibracionService:
    return CalibracionService(get_bq())


# ─── Bandeja ──────────────────────────────────────────────────────────────────

@router.get("/inbox", response_model=CalibracionInboxResponse)
def inbox(user: UserContext = Depends(get_current_user)):
    """Interacciones asignadas al auditor autenticado, agrupadas con sus criterios."""
    svc = _get_service()
    try:
        return svc.get_inbox(user.email)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ─── Evaluación en dos pasos ──────────────────────────────────────────────────

@router.post("/evaluar", response_model=EvaluarResponse)
def evaluar(body: EvaluarRequest, user: UserContext = Depends(get_current_user)):
    """
    Paso 1 — voto a ciegas: guarda el borrador en la muestra (EN_PROGRESO)
    y devuelve la revisión con el veredicto de SAACA. No escribe en
    saaca_eval_detail.
    """
    svc = _get_service()
    try:
        return svc.evaluar(body, user.email)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/revision/{interaction_id}", response_model=RevisionResponse)
def revision(interaction_id: str, user: UserContext = Depends(get_current_user)):
    """
    Voto a ciegas vs SAACA para retomar una revisión pendiente (EN_PROGRESO).
    Solo devuelve criterios ya votados a ciegas: nunca revela a SAACA antes.
    """
    svc = _get_service()
    try:
        return svc.get_revision(interaction_id, user.email)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/confirmar", response_model=ConfirmarResponse)
def confirmar(body: ConfirmarRequest, user: UserContext = Depends(get_current_user)):
    """
    Paso 2 — voto final: observación obligatoria donde hay desacuerdo;
    INSERT confirmado en saaca_eval_detail → UPDATE de pitch_muestra_calibracion.
    """
    svc = _get_service()
    try:
        return svc.confirmar(body, user.email)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/descartar", response_model=DescartarResponse)
def descartar(body: DescartarRequest, user: UserContext = Depends(get_current_user)):
    """Descarta la interacción asignada (motivo obligatorio, min. 5 caracteres)."""
    svc = _get_service()
    try:
        return svc.descartar(body.interaction_id, body.motivo, user.email)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/comparacion/{interaction_id}", response_model=ComparacionResponse)
def comparacion(interaction_id: str, user: UserContext = Depends(get_current_user)):
    """
    AUTO vs HUMANO por criterio para el auditor autenticado.
    El frontend SOLO la llama después de confirmar — antes de eso la vista
    no tiene fila humana (el voto a ciegas vive solo en la muestra).
    """
    svc = _get_service()
    try:
        return svc.get_comparacion(interaction_id, user.email)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ─── Mini dashboard de seguimiento (Improvement 1) ──────────────────────────────────────

@router.get("/dashboard", response_model=CalibracionDashboardResponse)
def dashboard(
    fecha_start: str | None = Query(default=None, description="YYYY-MM-DD, default: hoy - 30d"),
    fecha_end:   str | None = Query(default=None, description="YYYY-MM-DD, default: hoy"),
    user: UserContext = Depends(get_current_user),
):
    """
    Progreso de calibración. AUDITOR ve solo su propio avance (mismo
    aislamiento que /inbox); LIDER_QUALITY+ ve el desglose por auditor.
    """
    svc = _get_service()
    es_lider = user.role in ("LIDER_QUALITY", "ADMIN")
    try:
        return svc.get_dashboard(user.email, es_lider, fecha_start, fecha_end)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ─── Generación de muestra (LIDER_QUALITY+) ───────────────────────────────────

@router.get("/muestra/preview", response_model=MuestraPreviewResponse)
def muestra_preview(
    fecha_start: str = Query(..., description="Fecha inicio YYYY-MM-DD (fecha_evaluacion)"),
    fecha_end:   str = Query(..., description="Fecha fin YYYY-MM-DD"),
    capacidad_objetivo: int | None = Query(
        default=None, gt=0,
        description="Capacidad real del equipo. Sin ella el preview solo "
                    "informa el tamaño ideal de Cochran; con ella agrega la "
                    "asignación por estrato y el desglose de cobertura.",
    ),
    user: UserContext = Depends(require_role("LIDER_QUALITY")),
):
    """Paso informativo del flujo de dos pasos — nunca inserta nada."""
    svc = _get_service()
    try:
        return svc.preview_muestra(fecha_start, fecha_end, capacidad_objetivo)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/muestra/generar", response_model=GenerarMuestraResponse, status_code=201)
def muestra_generar(
    body: GenerarMuestraRequest,
    user: UserContext = Depends(require_role("LIDER_QUALITY")),
):
    """
    Confirmación del preview: asignación por capacidad_objetivo (pisos +
    prioridad CRITICAL + reparto proporcional), selección aleatoria por
    estrato e inserción en pitch_muestra_calibracion vía Load Job.
    """
    svc = _get_service()
    try:
        return svc.generar_muestra(body, generado_por=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/muestra/batches", response_model=BatchListResponse)
def muestra_batches(user: UserContext = Depends(require_role("LIDER_QUALITY"))):
    """
    Batches generados con su progreso, más reciente primero.
    Red de seguridad: si el response de una generación se pierde
    (red/timeout), el batch aparece aquí y puede anularse desde la app.
    """
    svc = _get_service()
    try:
        return svc.list_batches()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/muestra/batch/{batch_id}/anular", response_model=AnularBatchResponse)
def muestra_batch_anular(
    batch_id: str,
    user: UserContext = Depends(require_role("LIDER_QUALITY")),
):
    """
    Anula un batch: sus unidades PENDIENTE/EN_PROGRESO pasan a estado
    ANULADO (con anulado_por + fecha_anulacion) y vuelven a ser elegibles
    para muestreo de inmediato. Lo completado y descartado no se toca.
    """
    svc = _get_service()
    try:
        return svc.anular_batch(batch_id, anulado_por=user.email)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
