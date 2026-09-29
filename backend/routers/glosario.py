"""
Router: /api/glosario — catálogo de criterios de SAACA (todos los roles).

  GET /api/glosario → criterios consolidados (versión vigente + historial) y dónde aplican

El rol mínimo VIEWER se aplica a nivel de router (main.py). /api/criteria
sigue exigiendo AUDITOR: es el catálogo operativo de Calibración.
"""

from fastapi import APIRouter, Depends, HTTPException

from backend.dependencies import get_bq, get_current_user
from backend.models.auth import UserContext
from backend.models.glosario import GlosarioResponse
from backend.services.glosario_service import GlosarioService

router = APIRouter()


# Ruta vacía (no "/"): la URL queda exactamente /api/glosario, sin el redirect
# 307 por la barra final.
@router.get("", response_model=GlosarioResponse)
def get_glosario(
    force_refresh: bool = False,
    user: UserContext = Depends(get_current_user),
):
    """Catálogo del Glosario, cacheado por día. force_refresh solo se honra para ADMIN."""
    svc = GlosarioService(get_bq())
    refresh = force_refresh and user.role == "ADMIN"
    try:
        return svc.get_glosario(force_refresh=refresh)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
