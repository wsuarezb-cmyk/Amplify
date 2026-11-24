"""Read-only connection to Overture's PostgreSQL role catalog."""

import logging
from io import StringIO

from dotenv import dotenv_values

logger = logging.getLogger(__name__)

_ROLE_QUERY = """
SELECT u.id, r.nombre_rol
FROM accesos.usuarios_roles ur
JOIN accesos.sx_reg_users u ON u.id = ur.fk_usuarios
JOIN accesos.roles_app ra ON ra.id = ur.fk_roles_app
JOIN accesos.roles r ON r.id_roles = ur.fk_roles
WHERE LOWER(u.email) = LOWER(%s)
  AND LOWER(ra.app) = LOWER(%s)
LIMIT 1
"""


class OverturePostgresConnector:
    def __init__(
        self,
        host: str,
        database: str,
        port: int,
        credentials: str,
        connect_timeout_s: int,
    ) -> None:
        parsed_credentials = dotenv_values(stream=StringIO(credentials), interpolate=False)
        self.user = parsed_credentials.get("user")
        self.password = parsed_credentials.get("password")
        if not self.user or not self.password:
            raise RuntimeError("SQL_CREDENTIALS debe contener user y password")

        self.host = host
        self.database = database
        self.port = port
        self.connect_timeout_s = connect_timeout_s

    def get_user_role(self, email: str, app_name: str) -> tuple[int, str] | None:
        import psycopg

        with psycopg.connect(
            host=self.host,
            dbname=self.database,
            port=self.port,
            user=self.user,
            password=self.password,
            connect_timeout=self.connect_timeout_s,
            options=f"-c statement_timeout={self.connect_timeout_s * 1000}",
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(_ROLE_QUERY, (email, app_name))
                row = cursor.fetchone()

        if row is None:
            return None
        return int(row[0]), str(row[1])