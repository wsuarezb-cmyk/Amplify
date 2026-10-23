"""
BigQueryConnector para SAACA Dashboard & Audit App.

Adaptado del patrón del pipeline SAACA.
Diferencias respecto al original:
  - Sin pandas: query() retorna list[dict] directamente del RowIterator de BQ
  - Soporte de query parameters (@param) para prevenir SQL injection
  - Método update_row() para DML parametrizado
  - Método insert_rows() idéntico al de SAACA (streaming insert)
"""

import json
import logging
import os
from typing import Any, Optional

from google.cloud import bigquery
from google.cloud.bigquery import ScalarQueryParameter, ArrayQueryParameter, QueryJobConfig

logger = logging.getLogger(__name__)


class BigQueryConnector:
    """
    Conector centralizado para operaciones de BigQuery.

    Soporta autenticación via:
    1. Archivo JSON explícito (desarrollo local con credenciales OAuth2 de usuario)
    2. Application Default Credentials / ADC (Cloud Run, GOOGLE_APPLICATION_CREDENTIALS)
    """

    _SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

    def __init__(
        self,
        credentials_path: Optional[str] = None,
        project_id: Optional[str] = None,
        dataset: Optional[str] = None,
    ):
        """
        Inicializa el cliente de BigQuery.

        Args:
            credentials_path: Ruta al archivo JSON de credenciales.
                              Si es None, usa ADC automáticamente.
            project_id: ID del proyecto GCP.
                       Si es None, se lee de BQ_PROJECT env var o del JSON.
            dataset: Dataset de BigQuery.
                    Si es None, se lee de BQ_DATASET env var.
        """
        self.client = self._build_client(credentials_path, project_id)
        self.dataset = dataset or os.getenv("BQ_DATASET", "")
        logger.info(
            "BigQueryConnector inicializado — proyecto: %s, dataset: %s",
            self.client.project,
            self.dataset,
        )

    def _build_client(
        self,
        credentials_path: Optional[str],
        project_id: Optional[str],
    ) -> bigquery.Client:
        """Construye el cliente BQ según el tipo de credenciales disponibles."""

        if credentials_path and os.path.exists(credentials_path):
            with open(credentials_path) as f:
                cred_data = json.load(f)

            cred_type = cred_data.get("type", "")

            if cred_type == "service_account":
                from google.oauth2 import service_account as sa
                credentials = sa.Credentials.from_service_account_info(
                    cred_data, scopes=self._SCOPES
                )
                resolved_project = project_id or credentials.project_id
                logger.debug("BQ auth: service_account — proyecto: %s", resolved_project)

            else:
                # OAuth2 de usuario (gcp_user_credentials.json — authorized_user)
                from google.oauth2.credentials import Credentials as UserCredentials
                credentials = UserCredentials(
                    token=cred_data.get("token"),
                    refresh_token=cred_data["refresh_token"],
                    token_uri=cred_data["token_uri"],
                    client_id=cred_data["client_id"],
                    client_secret=cred_data["client_secret"],
                )
                # Las credenciales de usuario no llevan project_id embebido
                resolved_project = project_id or os.getenv("BQ_PROJECT")
                logger.debug("BQ auth: OAuth2 usuario — proyecto: %s", resolved_project)

            return bigquery.Client(credentials=credentials, project=resolved_project)

        # ADC — detecta GOOGLE_APPLICATION_CREDENTIALS o metadata server (Cloud Run)
        logger.debug("BQ auth: ADC automático")
        return bigquery.Client(project=project_id or os.getenv("BQ_PROJECT"))

    def query(
        self,
        sql: str,
        params: Optional[list] = None,
        timeout_s: Optional[float] = None,
    ) -> list[dict]:
        """
        Ejecuta una query SQL y retorna los resultados como lista de dicts.

        Args:
            sql: Query SQL. Usar @nombre_param para parámetros (nunca f-strings).
            params: Lista de BigQuery QueryParameter (ScalarQueryParameter, etc.).
                   None si la query no tiene parámetros.
            timeout_s: Máximo de segundos a esperar el resultado. Usar en caminos
                   críticos de UX (ej. login) donde es mejor fallar rápido que
                   colgarse minutos cuando el proyecto BQ tiene cola de slots.
                   None = sin límite (default, para queries pesadas legítimas).

        Returns:
            list[dict] con los resultados. Lista vacía si no hay filas.

        Raises:
            RuntimeError: Si timeout_s se especifica y la query no termina a tiempo.
        """
        job_config = QueryJobConfig(query_parameters=params or [])
        logger.debug("Ejecutando query: %s...", sql[:120])
        job = self.client.query(sql, job_config=job_config)
        try:
            results = job.result(timeout=timeout_s)
        except Exception as exc:
            if timeout_s is not None and "imeout" in type(exc).__name__ + str(exc):
                raise RuntimeError(
                    f"BigQuery no respondió en {timeout_s:.0f}s (cola de slots del "
                    "proyecto). Intenta nuevamente en unos segundos."
                ) from exc
            raise
        rows = [dict(row) for row in results]
        logger.debug("Query retornó %d filas", len(rows))
        return rows

    def insert_rows(self, table_id: str, rows: list[dict]) -> None:
        """
        Streaming insert de filas en una tabla de BigQuery.

        Útil para escribir evaluaciones humanas inmediatamente sin LoadJob.

        Args:
            table_id: Formato 'proyecto.dataset.tabla'.
            rows: Lista de dicts. Las claves deben coincidir con el schema de la tabla.

        Raises:
            RuntimeError: Si BigQuery reporta errores en alguna fila.
        """
        errors = self.client.insert_rows_json(table_id, rows)
        if errors:
            raise RuntimeError(
                f"Error en streaming insert hacia {table_id}: {errors}"
            )
        logger.info("Streaming insert completado: %d filas en %s", len(rows), table_id)

    def execute_dml(self, sql: str, params: Optional[list] = None) -> int:
        """Ejecuta DML parametrizado y devuelve las filas afectadas."""
        job_config = QueryJobConfig(query_parameters=params or [])
        job = self.client.query(sql, job_config=job_config)
        job.result()
        affected_rows = job.num_dml_affected_rows
        if affected_rows is None:
            raise RuntimeError("BigQuery no informó las filas afectadas por el DML")
        return affected_rows

    def insert_rows_dml(self, table_id: str, rows: list[dict], schema=None) -> None:
        """
        Inserta filas usando un Load Job (NO streaming insert).

        Usar este método en lugar de insert_rows() para las tablas de auditoría
        (saaca_audit_sample, saaca_audit_assignment) donde se necesita hacer
        UPDATE/SELECT inmediatamente después sin esperar el streaming buffer (~90 min).

        Implementación: load_table_from_dataframe() con WRITE_APPEND.
        Requiere pandas y pyarrow instalados.

        Args:
            table_id: Full table ID 'proyecto.dataset.tabla'.
            rows: Lista de dicts. Las claves deben coincidir con el schema de la tabla.
                  Los valores None se convierten a NULL en BigQuery.

        Raises:
            RuntimeError: Si el Load Job falla.
        """
        if not rows:
            logger.info("insert_rows_dml: lista vacía — nada que insertar en %s", table_id)
            return

        import pandas as pd
        from google.cloud.bigquery import LoadJobConfig, WriteDisposition

        df = pd.DataFrame(rows)
        job_config = LoadJobConfig(
            schema=schema, write_disposition=WriteDisposition.WRITE_APPEND
        )

        try:
            job = self.client.load_table_from_dataframe(df, table_id, job_config=job_config)
            job.result()  # Bloquea hasta que el Load Job complete
        except Exception as exc:
            raise RuntimeError(
                f"Error en DML insert hacia {table_id}: {exc}"
            ) from exc

        logger.info("DML insert completado: %d filas en %s", len(rows), table_id)

    def update_row(
        self,
        table_id: str,
        set_clause: str,
        where_clause: str,
        params: list,
    ) -> None:
        """
        Ejecuta un UPDATE parametrizado en BigQuery.

        IMPORTANTE: Nunca construir set_clause / where_clause con f-strings
        que incluyan datos del usuario. Siempre usar @param.

        Args:
            table_id: Formato 'proyecto.dataset.tabla' (sin backticks — se agregan aquí).
            set_clause: Cláusula SET, ej: "status = @status, updated_at = CURRENT_TIMESTAMP()".
            where_clause: Cláusula WHERE, ej: "sample_id = @sample_id".
            params: Lista de BigQuery QueryParameter.

        Example:
            bq.update_row(
                table_id="proyecto.dataset.tabla",
                set_clause="status = @status",
                where_clause="id = @id",
                params=[
                    ScalarQueryParameter("status", "STRING", "COMPLETED"),
                    ScalarQueryParameter("id", "STRING", "uuid-aqui"),
                ],
            )
        """
        sql = f"UPDATE `{table_id}` SET {set_clause} WHERE {where_clause}"
        job_config = QueryJobConfig(query_parameters=params)
        self.client.query(sql, job_config=job_config).result()
        logger.info("UPDATE completado en %s", table_id)

    def full_table_id(self, table_name: str) -> str:
        """Construye el ID completo de una tabla: proyecto.dataset.tabla."""
        return f"{self.client.project}.{self.dataset}.{table_name}"
