"""Resolve Amplify users and roles from Overture's read-only catalog."""

import logging
import time
from functools import lru_cache

from backend.config import get_settings
from backend.connectors.overture_postgres_connector import OverturePostgresConnector
from backend.models.auth import UserContext

logger = logging.getLogger(__name__)

_CACHE_TTL_S = 300
_cache: dict[str, tuple[UserContext, float]] = {}
_ROLE_MAP = {
    "admin": "ADMIN",
    "viewer": "VIEWER",
    "operator": "AUDITOR",
}


@lru_cache(maxsize=1)
def _get_connector() -> OverturePostgresConnector:
    settings = get_settings()
    return OverturePostgresConnector(
        host=settings.OVERTURE_DB_HOST,
        database=settings.OVERTURE_DB_NAME,
        port=settings.OVERTURE_DB_PORT,
        credentials=settings.SQL_CREDENTIALS,
        connect_timeout_s=settings.OVERTURE_DB_CONNECT_TIMEOUT_S,
    )


def get_overture_user_by_email(email: str) -> UserContext | None:
    normalized_email = email.strip().lower()
    cached = _cache.get(normalized_email)
    if cached and cached[1] > time.monotonic():
        return cached[0]

    settings = get_settings()
    row = _get_connector().get_user_role(normalized_email, settings.OVERTURE_ROLES_APP)
    if row is None:
        logger.debug("Usuario sin asignación en Overture: %s", normalized_email)
        return None

    user_id, overture_role = row
    role = _ROLE_MAP.get(overture_role.strip().lower())
    if role is None:
        logger.info("Rol Overture no mapeado para %s", normalized_email)
        return None

    user = UserContext(
        user_id=str(user_id),
        email=normalized_email,
        full_name=normalized_email,
        role=role,
    )
    _cache[normalized_email] = (user, time.monotonic() + _CACHE_TTL_S)
    return user