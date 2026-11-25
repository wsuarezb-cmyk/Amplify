"""
AuthMiddleware — identidad vía header de IAP (patrón Overture).

Modelo de DOS puertas:
  1. IAP decide quien llega — inyecta el header X-Goog-Authenticated-User-Email
     (formato: accounts.google.com:correo@falabella.com) y borra cualquier copia
     que mande el cliente. Solo es confiable porque el invoker de Cloud Run está
     bloqueado al service agent de IAP: nadie externo alcanza el contenedor.
  2. Overture decide QUIÉN accede y con qué ROL — asignación por email y app.
      El bypass de desarrollo conserva pitch_users; producción no lo consulta.

Rutas excluidas (no requieren identidad):
  - /api/health
  - /api/docs, /api/redoc, /api/openapi  (Swagger UI)
  - Cualquier ruta sin prefijo /api/      (React static build)
  - OPTIONS (CORS preflight)

Fallback de desarrollo local (sin IAP delante): si el header no viene y
DEV_AUTH_BYPASS está activo, se usa DEV_USER_EMAIL. NUNCA en producción.
"""

import logging
from io import StringIO

from dotenv import dotenv_values

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from backend.config import get_settings
from backend.dependencies import get_bq
from backend.services.user_service import get_user_by_email
from backend.services.overture_role_service import get_overture_user_by_email

logger = logging.getLogger(__name__)

# Header que inyecta IAP con la identidad autenticada.
_IAP_EMAIL_HEADER = "X-Goog-Authenticated-User-Email"

# Paths públicos exactos (no requieren identidad)
_BYPASS_EXACT: frozenset[str] = frozenset({
    "/api/health",
})

# Prefijos públicos (Swagger UI assets)
_BYPASS_PREFIXES: tuple[str, ...] = (
    "/api/docs",
    "/api/redoc",
    "/api/openapi",
)


def _safe_error_detail(exc: Exception, sql_credentials: str) -> str:
    detail = str(exc)
    if sql_credentials:
        try:
            password = dotenv_values(
                stream=StringIO(sql_credentials), interpolate=False
            ).get("password")
        except Exception:
            password = None
        if password:
            detail = detail.replace(password, "[REDACTED]")
    return detail[:400]


def _resolve_email(request: Request, settings=None) -> str | None:
    """
    Extrae el email del header de IAP, o del fallback de desarrollo.
    Retorna None si no hay identidad (→ 401 anónimo, nunca rol default).
    """
    raw = request.headers.get(_IAP_EMAIL_HEADER, "")
    if raw:
        # Formato: accounts.google.com:correo@falabella.com — tomar lo posterior al ':'
        return raw.split(":")[-1].strip().lower()

    # Fallback SOLO desarrollo local: sin IAP no llega el header.
    settings = settings or get_settings()
    if settings.DEV_AUTH_BYPASS and settings.DEV_USER_EMAIL:
        return settings.DEV_USER_EMAIL.strip().lower()

    return None


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Resuelve la identidad en cada request a /api/* protegida y puebla
    request.state.user (UserContext con el rol de Overture en producción).

    Se agrega ANTES del CORSMiddleware para que CORS sea la capa exterior
    y pueda agregar sus headers incluso a respuestas 401/403.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # 1. Rutas no-API: React static build — pasar sin validar
        if not path.startswith("/api/"):
            return await call_next(request)

        # 2. OPTIONS (CORS preflight) — pasar sin validar
        if request.method == "OPTIONS":
            return await call_next(request)

        # 3. Rutas públicas exactas
        if path in _BYPASS_EXACT:
            return await call_next(request)

        # 4. Prefijos públicos (Swagger)
        if any(path.startswith(prefix) for prefix in _BYPASS_PREFIXES):
            return await call_next(request)

        # 5. Puerta 1 — identidad (header IAP o fallback dev)
        settings = get_settings()
        has_iap_identity = bool(request.headers.get(_IAP_EMAIL_HEADER, ""))
        email = _resolve_email(request, settings)
        if email is None:
            return JSONResponse(status_code=401, content={"detail": "No autenticado"})

        # 6. Producción usa Overture; el fallback local conserva el catálogo de desarrollo.
        try:
            if not has_iap_identity and settings.DEV_AUTH_BYPASS:
                user = get_user_by_email(get_bq(), email)
            else:
                user = get_overture_user_by_email(email)
        except Exception as exc:
            logger.error(
                "Error resolviendo usuario (tipo=%s, detalle=%s)",
                type(exc).__name__,
                _safe_error_detail(exc, settings.SQL_CREDENTIALS),
            )
            return JSONResponse(
                status_code=503,
                content={"detail": "No se pudo verificar el acceso. Intenta nuevamente."},
            )

        if user is None:
            logger.info("Acceso denegado — usuario sin rol válido en su catálogo")
            return JSONResponse(status_code=403, content={"detail": "Usuario no autorizado"})

        request.state.user = user
        return await call_next(request)
