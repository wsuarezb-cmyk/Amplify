"""
Settings centralizados con Pydantic BaseSettings.

Las variables se cargan desde backend/.env en desarrollo local
y desde el entorno de Cloud Run en producción (Secret Manager).

Sin fallback para BQ_PROJECT_ID ni BQ_DATASET — si faltan, FastAPI
falla al iniciar con un ValidationError descriptivo en lugar de silenciosamente
conectarse al proyecto o dataset equivocado.

Compatibilidad con el .env legacy (nombres anteriores a Pauta):
  BQ_PROJECT             → BQ_PROJECT_ID
  GOOGLE_APPLICATION_CREDENTIALS → BQ_CREDENTIALS_PATH
"""

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── BigQuery ──────────────────────────────────────────────────────────
    # Acepta BQ_PROJECT_ID (nombre canónico PAUTA) o BQ_PROJECT (legacy)
    BQ_PROJECT_ID: str = Field(
        validation_alias=AliasChoices("BQ_PROJECT_ID", "BQ_PROJECT")
    )
    BQ_DATASET: str  # requerido, sin default — sandbox_data_analytics_psc en .env
    PLANNER_DATASET: str = "sandbox_data_analytics"
    PLANNER_TIMEZONE: str = "America/Bogota"

    # Acepta BQ_CREDENTIALS_PATH (nombre canónico) o GOOGLE_APPLICATION_CREDENTIALS (legacy)
    BQ_CREDENTIALS_PATH: str = Field(
        validation_alias=AliasChoices(
            "BQ_CREDENTIALS_PATH", "GOOGLE_APPLICATION_CREDENTIALS"
        )
    )

    # ── Auth — identidad vía header de IAP (patrón Overture/Canon) ────────
    # No hay JWT propio ni Google Sign-In: IAP inyecta el email autenticado y
    # el rol se resuelve contra Overture en producción. No se valida dominio
    # de email: la asignación por email y app es la lista blanca.

    # ── Dev bypass — SOLO desarrollo local, NUNCA en producción ─────────
    # ⚠️  SOLO PARA DESARROLLO LOCAL
    # Sin IAP delante no llega el header X-Goog-Authenticated-User-Email;
    # con DEV_AUTH_BYPASS=true se usa DEV_USER_EMAIL como identidad simulada.
    # En Cloud Run estas variables no existen → sin header → 401 (fail-closed).
    DEV_AUTH_BYPASS: bool = False
    DEV_USER_EMAIL: str = ""

    # ── Roles de Overture (PostgreSQL Cloud SQL, solo lectura) ────────────
    SQL_CREDENTIALS: str = ""
    OVERTURE_DB_HOST: str = "/cloudsql/flb-rtl-3p-sx-reg-dev:us-east4:flb-rtl-3p-sx-reg-dev-db"
    OVERTURE_DB_NAME: str = "postgres"
    OVERTURE_DB_PORT: int = Field(default=5432, ge=1, le=65535)
    OVERTURE_DB_CONNECT_TIMEOUT_S: int = Field(default=5, ge=1, le=30)
    OVERTURE_ROLES_APP: str = "amplify"

    # ── CORS — en producción la app sirve el frontend → mismo origen ──────
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    # ── Diagnóstico IA (feature opcional) ─────────────────────────────────
    # Todas con default: si falta KAIROS_JWT, SOLO el diagnóstico responde 503
    # — el resto de la app arranca y funciona igual.
    # Gateway Kairos: mismo proyecto de calidad que SAACA → mismo endpoint/JWT.
    # El endpoint y el modelo son un PAR: el gateway valida que coincidan.
    KAIROS_JWT: str = ""
    KAIROS_GATEWAY_BASE: str = "https://gateway-preprod.falabella.ai/tenant/fal/scope/dev/google/models"
    KAIROS_CHAT_ENDPOINT: str = "fal-saaca-evaluate-gemini-31-flash-lite-oai"
    GENAI_MODEL: str = "gemini-3.1-flash-lite"
    # Diagnósticos por usuario y mes calendario (ADMIN sin límite; fallidos no cuentan).
    DIAGNOSTICO_CUOTA_MENSUAL: int = 5

    # ── Trace ────────────────────────────────────────────────────────────
    # Se configuran solo después de validar dataset, ownership y permisos.
    TRACE_AUDIENCE_HISTORY_TABLE: str = ""
    TRACE_AUDIENCE_MEMBERS_TABLE: str = "bi-fcom-drmb-sell-in-sbx.crm_sellers.trace_audience_members"
    TRACE_SEND_RECONCILIATION_HISTORY_TABLE: str = "bi-fcom-drmb-sell-in-sbx.crm_sellers.trace_send_reconciliation_history"
    TRACE_SEND_ALERT_MAX_BYTES: int = Field(default=10 * 1024 * 1024, ge=1024, le=31 * 1024 * 1024)
    TRACE_TEAMS_ALERT_WEBHOOK_URL: str = ""
    TRACE_TEAMS_ALLOWED_EMAIL_DOMAINS: str = ""
    TRACE_TEAMS_MAX_RECIPIENTS: int = Field(default=20, ge=1, le=20)
    TRACE_TEAMS_TIMEOUT_SECONDS: int = Field(default=15, ge=1, le=60)
    TRACE_CONTACTS_SNAPSHOT_TABLE: str = ""
    TRACE_NOT_FOUND_ALERT_THRESHOLD: float = Field(default=0.20, ge=0.0, le=1.0)
    TRACE_DAILY_DROP_THRESHOLD: float = Field(default=0.20, ge=0.0, le=1.0)

    model_config = SettingsConfigDict(
        env_file="backend/.env",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
