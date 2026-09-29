"""
Singleton de BigQueryConnector compartido entre todos los routers.

Usa lru_cache para crear una sola instancia por proceso.
Carga credenciales desde Settings (config.py), que a su vez lee .env
en desarrollo y variables de entorno en Cloud Run.

Auth dependencies:
  get_current_user()  — extrae UserContext del request (seteado por AuthMiddleware)
  require_role(role)  — factory para validar rol mínimo en endpoints protegidos
"""

from functools import lru_cache
from pathlib import Path

from fastapi import Depends, HTTPException, Request

from backend.config import get_settings
from backend.connectors.bigquery_connector import BigQueryConnector
from backend.models.auth import UserContext

# Jerarquía de roles — coincide con frontend/src/constants/roles.js
_ROLE_ORDER: dict[str, int] = {
    "VIEWER":        0,
    "AUDITOR":       1,
    "LIDER_QUALITY": 2,
    "ADMIN":         3,
}


@lru_cache(maxsize=1)
def get_bq() -> BigQueryConnector:
    """
    Retorna el conector BigQuery singleton del proceso.

    La primera llamada inicializa el cliente (incluye handshake con GCP).
    Las llamadas siguientes retornan la instancia cacheada.
    """
    settings = get_settings()
    credentials_path = settings.BQ_CREDENTIALS_PATH
    if credentials_path and not Path(credentials_path).is_absolute():
        credentials_path = str(Path(__file__).parent / credentials_path)

    return BigQueryConnector(
        credentials_path=credentials_path,
        project_id=settings.BQ_PROJECT_ID,
        dataset=settings.BQ_DATASET,
    )


def get_current_user(request: Request) -> UserContext:
    """
    Retorna el UserContext inyectado por AuthMiddleware en request.state.user.

    Si el middleware no procesó el request (bug de configuración),
    lanza HTTPException(401).

    Uso en endpoints:
        async def my_endpoint(user: UserContext = Depends(get_current_user)):
            ...
    """
    user: UserContext | None = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_role(min_role: str):
    """
    Factory que retorna un Depends para validar rol mínimo en un endpoint.

    Uso:
        @router.get("/admin-only")
        async def admin_endpoint(user: UserContext = Depends(require_role("ADMIN"))):
            ...

    Lanza HTTPException(403) si el usuario no tiene el rol requerido.
    """
    def _check_role(user: UserContext = Depends(get_current_user)) -> UserContext:
        if _ROLE_ORDER.get(user.role, -1) < _ROLE_ORDER.get(min_role, 0):
            raise HTTPException(
                status_code=403,
                detail=f"Requiere rol {min_role} o superior",
            )
        return user

    return _check_role
