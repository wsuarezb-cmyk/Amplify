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
    # el rol se resuelve contra pitch_users. No se valida dominio de email
    # (pitch_users ya es la lista blanca por email exacto).

    # ── Dev bypass — SOLO desarrollo local, NUNCA en producción ─────────
    # ⚠️  SOLO PARA DESARROLLO LOCAL
    # Sin IAP delante no llega el header X-Goog-Authenticated-User-Email;
    # con DEV_AUTH_BYPASS=true se usa DEV_USER_EMAIL como identidad simulada.
    # En Cloud Run estas variables no existen → sin header → 401 (fail-closed).
    DEV_AUTH_BYPASS: bool = False
    DEV_USER_EMAIL: str = ""

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

    model_config = SettingsConfigDict(
        env_file="backend/.env",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
