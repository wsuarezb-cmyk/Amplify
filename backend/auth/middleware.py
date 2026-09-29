"""
AuthMiddleware — identidad vía header de IAP (patrón Overture).

Modelo de DOS puertas:
  1. IAP decide quien llega — inyecta el header X-Goog-Authenticated-User-Email
     (formato: accounts.google.com:correo@falabella.com) y borra cualquier copia
     que mande el cliente. Solo es confiable porque el invoker de Cloud Run está
     bloqueado al service agent de IAP: nadie externo alcanza el contenedor.
  2. pitch_users decide QUIÉN accede y con qué ROL — lista blanca por email exacto.
     No se valida dominio de email en ningún punto: la tabla ya es la lista blanca.

Rutas excluidas (no requieren identidad):
  - /api/health
  - /api/docs, /api/redoc, /api/openapi  (Swagger UI)
  - Cualquier ruta sin prefijo /api/      (React static build)
  - OPTIONS (CORS preflight)

Fallback de desarrollo local (sin IAP delante): si el header no viene y
DEV_AUTH_BYPASS está activo, se usa DEV_USER_EMAIL. NUNCA en producción.
"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from backend.config import get_settings
from backend.dependencies import get_bq
from backend.services.user_service import get_user_by_email

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


def _resolve_email(request: Request) -> str | None:
    """
    Extrae el email del header de IAP, o del fallback de desarrollo.
    Retorna None si no hay identidad (→ 401 anónimo, nunca rol default).
    """
    raw = request.headers.get(_IAP_EMAIL_HEADER, "")
    if raw:
        # Formato: accounts.google.com:correo@falabella.com — tomar lo posterior al ':'
        return raw.split(":")[-1].strip().lower()

    # Fallback SOLO desarrollo local: sin IAP no llega el header.
    settings = get_settings()
    if settings.DEV_AUTH_BYPASS and settings.DEV_USER_EMAIL:
        return settings.DEV_USER_EMAIL.strip().lower()

    return None


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Resuelve la identidad en cada request a /api/* protegida y puebla
    request.state.user (UserContext con el rol de pitch_users).

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
        email = _resolve_email(request)
        if email is None:
            return JSONResponse(status_code=401, content={"detail": "No autenticado"})

        # 6. Puerta 2 — autorización por email exacto en pitch_users (rol incluido)
        try:
            user = get_user_by_email(get_bq(), email)
        except Exception as exc:
            logger.error("Error resolviendo usuario %s: %s", email, exc)
            return JSONResponse(
                status_code=503,
                content={"detail": "No se pudo verificar el acceso. Intenta nuevamente."},
            )

        if user is None:
            logger.info("Acceso denegado — email no está en pitch_users: %s", email)
            return JSONResponse(status_code=403, content={"detail": "Usuario no autorizado"})

        request.state.user = user
        return await call_next(request)
