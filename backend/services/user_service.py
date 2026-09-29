"""
user_service — lectura de usuarios desde pitch_users.

pitch_users es una TABLA independiente (pauta_users quedó obsoleta y ya no
se usa — confirmado 2026-07-17). El alta/gestión de usuarios es una
operación de datos directa sobre pitch_users, fuera del alcance de la app.

Caché en memoria: el proyecto BQ es compartido con pipelines y dashboards —
en horas de contención de slots una query trivial puede quedar minutos en
cola. Como los usuarios cambian poco, los logins repetidos se sirven desde
memoria (TTL 5 min) y la query de BQ lleva timeout para fallar rápido con un
mensaje claro en vez de colgar el login.
"""

import logging
import time

from google.cloud.bigquery import ScalarQueryParameter

from backend.connectors.bigquery_connector import BigQueryConnector
from backend.models.auth import UserContext

logger = logging.getLogger(__name__)

# Solo se cachean hits positivos: un usuario recién insertado en pitch_users
# debe poder loguear de inmediato (un miss siempre consulta BQ).
_CACHE_TTL_S = 300
_QUERY_TIMEOUT_S = 30
_cache: dict[str, tuple[UserContext, float]] = {}   # email → (user, expira_en)


def get_user_by_email(bq: BigQueryConnector, email: str) -> UserContext | None:
    """
    Busca un usuario activo en pitch_users por email.

    Args:
        bq:    BigQueryConnector inicializado.
        email: Email a buscar (case-sensitive, debe ser @falabella.com).

    Returns:
        UserContext si el usuario existe y está activo, None en caso contrario.

    Raises:
        RuntimeError: Si BigQuery no responde dentro del timeout (cola de slots).
    """
    cached = _cache.get(email)
    if cached and cached[1] > time.monotonic():
        return cached[0]

    table = bq.full_table_id("pitch_users")

    # Match case-insensitive: el email del header de IAP viene normalizado a
    # minúsculas, pero la fila en pitch_users puede tener mayúsculas
    # (ej. @Falabella.com). LOWER en ambos lados evita 403 por diferencia de caja.
    rows = bq.query(
        f"""
        SELECT user_id, email, full_name, role
        FROM `{table}`
        WHERE LOWER(email) = @email
          AND is_active = TRUE
        LIMIT 1
        """,
        params=[ScalarQueryParameter("email", "STRING", email)],
        timeout_s=_QUERY_TIMEOUT_S,
    )

    if not rows:
        logger.debug("Usuario no encontrado o inactivo: %s", email)
        return None

    row = rows[0]
    user = UserContext(
        user_id=row["user_id"],
        # Normalizado (no row["email"]): pitch_users puede tener mayúsculas
        # (ej. @Falabella.com) y ese valor crudo rompía comparaciones exactas
        # de auditor_email en calibración.
        email=email,
        full_name=row["full_name"],
        role=row["role"],
    )
    _cache[email] = (user, time.monotonic() + _CACHE_TTL_S)
    logger.debug("Usuario encontrado: %s (rol: %s)", user.email, user.role)
    return user
