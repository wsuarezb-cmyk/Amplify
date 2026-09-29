"""
Router: /api/pitch/diagnostico/* — Diagnóstico IA desde Reportería (feature aislada).

  POST (raíz)     → genera el diagnóstico con los filtros de Reportería y lo
                    devuelve como HTML descargable (no se almacena). Consume cuota.
  GET  /cuota     → cuota mensual del usuario (usados / restantes).
  POST /contexto  → (ADMIN) datos que alimentan el diagnóstico, sin IA ni
                    escritura. Valida que las cifras coinciden con el tablero.
  POST /preview   → (ADMIN) diagnóstico en HTML sin registrar ni consumir cuota.
                    Para revisar y ajustar la calidad del prompt.

El rol mínimo VIEWER se aplica a nivel de router (main.py).
"""

import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse

from backend.config import get_settings
from backend.connectors.genai_connector import GenAIAuthError, GenAIError
from backend.dependencies import get_bq, get_current_user, require_role
from backend.models.auth import UserContext
from backend.models.diagnostico import DiagnosticoFiltros
from backend.services.diagnostico.service import CuotaAgotada, DiagnosticoService, FeatureNoConfigurada

router = APIRouter()


def _get_service() -> DiagnosticoService:
    return DiagnosticoService(get_bq(), get_settings())


def _http_error(exc: Exception) -> HTTPException:
    """Traduce los errores del flujo a respuestas claras para el usuario."""
    if isinstance(exc, FeatureNoConfigurada):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, CuotaAgotada):
        return HTTPException(status_code=429, detail=str(exc))
    if isinstance(exc, GenAIAuthError):
        return HTTPException(
            status_code=503,
            detail="El servicio de IA no está disponible (credencial rechazada). Avisa al equipo de Calidad.",
        )
    if isinstance(exc, GenAIError):
        return HTTPException(status_code=502, detail=f"El servicio de IA falló: {exc}")
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


def nombre_archivo(meta: dict) -> str:
    """diagnostico_<alcance>_<desde>_<hasta>.html, solo caracteres seguros."""
    etiqueta = re.sub(r"[^A-Za-z0-9]+", "-", meta["alcance"]["etiqueta"]).strip("-").lower()[:40] or "reporte"
    norm = meta["filtros_norm"]
    return f"diagnostico_{etiqueta}_{norm['fecha_start']}_{norm['fecha_end']}.html"


# Ruta vacía (no "/"): la URL queda exactamente /api/pitch/diagnostico, sin redirect 307.
@router.post("", response_class=HTMLResponse)
def generar(
    body: DiagnosticoFiltros,
    user: UserContext = Depends(get_current_user),
) -> HTMLResponse:
    """Genera el diagnóstico para los filtros aplicados y lo devuelve para descargar."""
    try:
        html, meta = _get_service().generar_para_usuario(
            body.model_dump(), email=user.email, es_admin=user.role == "ADMIN",
        )
    except Exception as exc:
        raise _http_error(exc) from exc
    return HTMLResponse(
        html, headers={"Content-Disposition": f'attachment; filename="{nombre_archivo(meta)}"'},
    )


@router.get("/cuota")
def cuota(user: UserContext = Depends(get_current_user)) -> dict:
    """Cuota mensual del usuario autenticado."""
    try:
        return _get_service().cuota(user.email, es_admin=user.role == "ADMIN")
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/contexto")
def contexto(
    body: DiagnosticoFiltros,
    user: UserContext = Depends(require_role("ADMIN")),
) -> dict:
    """Contexto de datos del diagnóstico para los filtros dados (depuración, ADMIN)."""
    try:
        _, ctx = _get_service().preparar(body.model_dump())
        return ctx
    except Exception as exc:
        raise _http_error(exc) from exc


@router.post("/preview", response_class=HTMLResponse)
def preview(
    body: DiagnosticoFiltros,
    user: UserContext = Depends(require_role("ADMIN")),
) -> HTMLResponse:
    """Diagnóstico completo en HTML, sin guardar (revisión de calidad del prompt, ADMIN)."""
    try:
        html, _ = _get_service().generar_html(body.model_dump(), usuario=user.email)
        return HTMLResponse(html)
    except Exception as exc:
        raise _http_error(exc) from exc
