"""
Pitch — FastAPI entry point.

Puerto: 8080 (requerido por Cloud Run).
Rutas:
  /api/health                → verificación de conexión a BigQuery
  /api/auth/me               → usuario autenticado (identidad vía header de IAP)
  /api/pitch/dashboard/*     → Reportería (extracto diario + drilldown en vivo)
  /api/pitch/calibracion/*   → Calibración (bandeja, evaluación ciega, muestra)
  /api/criteria/*            → Catálogo de criterios
  /api/interaction/*         → Hilo del caso (contexto para Calibración)
  /api/glosario              → Glosario: catálogo de criterios de SAACA (todos los roles)
  /api/pitch/diagnostico/*   → Diagnóstico IA desde Reportería (feature aislada)
  /                          → Sirve el build de React (dist/) en producción
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.auth.middleware import AuthMiddleware
from backend.config import get_settings
from backend.connectors.bigquery_connector import BigQueryConnector
from backend.dependencies import require_role
from backend.models.schemas import HealthResponse
from backend.routers import auth as auth_router
from backend.routers import criteria, glosario, interaction, pitch_dashboard, pitch_calibracion, pitch_diagnostico, planner

# ─────────────────────────────────────────────────────────────
# Configuración inicial
# ─────────────────────────────────────────────────────────────

# Cargar .env desde backend/ (en desarrollo local)
# En Docker/Cloud Run las variables vienen del entorno directamente
_env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=_env_path)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Pitch API",
    description="API interna de Pitch: reportería de calidad SAACA y calibración humana.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Orden de middlewares — el último en add_middleware es el más exterior (corre primero):
#   CORS (exterior) → AuthMiddleware → GZip → handler
# GZip es crítico para /api/pitch/dashboard/extracto (~170k filas JSON).
app.add_middleware(GZipMiddleware, minimum_size=2048)
app.add_middleware(AuthMiddleware)

# CORS (exterior): agrega headers CORS
_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────────────────────

# Roles mínimos por módulo — la validación de identidad (JWT) la hace AuthMiddleware;
# require_role() agrega la validación de autorización por jerarquía.
app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(
    pitch_dashboard.router, prefix="/api/pitch/dashboard", tags=["pitch-dashboard"],
    dependencies=[Depends(require_role("VIEWER"))],
)
app.include_router(
    pitch_calibracion.router, prefix="/api/pitch/calibracion", tags=["pitch-calibracion"],
    dependencies=[Depends(require_role("AUDITOR"))],
)
app.include_router(
    criteria.router, prefix="/api/criteria", tags=["criteria"],
    dependencies=[Depends(require_role("AUDITOR"))],
)
app.include_router(
    interaction.router, prefix="/api/interaction", tags=["interaction"],
    dependencies=[Depends(require_role("VIEWER"))],
)
app.include_router(
    glosario.router, prefix="/api/glosario", tags=["glosario"],
    dependencies=[Depends(require_role("VIEWER"))],
)
app.include_router(
    pitch_diagnostico.router, prefix="/api/pitch/diagnostico", tags=["pitch-diagnostico"],
    dependencies=[Depends(require_role("VIEWER"))],
)
app.include_router(planner.router, prefix="/api/planner", tags=["planner"])

# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    """
    Verifica que la API está activa y que BigQuery es accesible.

    Ejecuta un SELECT 1 contra BigQuery para confirmar conectividad real.
    """
    settings = get_settings()
    credentials_path = settings.BQ_CREDENTIALS_PATH

    if credentials_path and not os.path.isabs(credentials_path):
        credentials_path = str(Path(__file__).parent / credentials_path)

    try:
        bq = BigQueryConnector(
            credentials_path=credentials_path,
            project_id=settings.BQ_PROJECT_ID,
            dataset=settings.BQ_DATASET,
        )
        bq.query("SELECT 1 AS ok")
        return HealthResponse(
            status="ok",
            bq_connected=True,
            dataset=settings.BQ_DATASET,
        )
    except Exception as exc:
        logger.error("Health check falló: %s", exc)
        return HealthResponse(
            status="error",
            bq_connected=False,
            dataset=settings.BQ_DATASET,
            error=str(exc),
        )


# ─────────────────────────────────────────────────────────────
# Servir React build — DEBE ir al final para no pisar las rutas /api
# ─────────────────────────────────────────────────────────────

def _is_spa_route(path: str) -> bool:
    """True si el path es una ruta cliente de React Router (no /api, no un asset)."""
    if path == "api" or path.startswith("api/"):
        return False
    last_segment = path.rsplit("/", 1)[-1]
    return "." not in last_segment


class SPAStaticFiles(StaticFiles):
    """StaticFiles con Cache-Control correcto para un SPA con assets hasheados.

    - index.html (y cualquier .html): `no-cache` → el navegador revalida en cada
      visita, así un deploy nuevo se toma de inmediato. Sin esto, el navegador
      cachea heurísticamente un index.html viejo que apunta a bundles con hash
      antiguo y sigue mostrando la versión anterior (borrar cookies no lo limpia).
    - assets/* (JS/CSS con hash en el nombre): cache inmutable de 1 año, sin riesgo
      porque el nombre del archivo cambia en cada build.

    Fallback de SPA: sin esto, Starlette responde 404 para rutas que React
    Router resuelve client-side (ej. /reporteria) al navegar directo o al
    refrescar, porque no existen como archivo real dentro de dist/.
    """

    async def get_response(self, path, scope):
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and _is_spa_route(path):
                response = await super().get_response("index.html", scope)
            else:
                raise
        ctype = response.headers.get("content-type", "")
        if "text/html" in ctype:
            response.headers["Cache-Control"] = "no-cache"
        elif path.startswith("assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


# La ruta de dist es relativa a la raíz del proyecto (un nivel arriba de backend/)
# En desarrollo: saaca_frontend/dist/ (vacío — no crashea)
# En Docker: /app/dist/ (copiado desde el stage de Node)
_dist_path = Path(__file__).parent.parent / "dist"

if _dist_path.exists() and any(_dist_path.iterdir()):
    app.mount("/", SPAStaticFiles(directory=str(_dist_path), html=True), name="static")
    logger.info("Sirviendo React build desde: %s", _dist_path)
else:
    logger.info(
        "dist/ no encontrado o vacío — modo API only (desarrollo sin build de React)"
    )
