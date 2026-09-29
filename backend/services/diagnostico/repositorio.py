"""
Registro de diagnósticos en BigQuery (pitch_diagnosticos_ia) y cuota mensual.

Los diagnósticos NO se almacenan (se regeneran); esta tabla solo deja un
registro por intento — OK o ERROR — para contar la cuota (solo cuentan los OK)
y ver uso y costo. Escritura vía Load Job, como el resto de la app.
"""

import json
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from google.cloud.bigquery import ScalarQueryParameter

from backend.connectors.bigquery_connector import BigQueryConnector

_TABLE = "pitch_diagnosticos_ia"


def inicio_de_mes(ahora: datetime) -> datetime:
    """Primer instante del mes calendario (UTC) — la cuota se reinicia cada mes."""
    return ahora.astimezone(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)


class RepositorioDiagnosticos:

    def __init__(self, bq: BigQueryConnector) -> None:
        self.bq = bq

    def usados_en_mes(self, email: str, ahora: Optional[datetime] = None) -> int:
        """Diagnósticos OK del usuario en el mes en curso (los ERROR no cuentan)."""
        ahora = ahora or datetime.now(timezone.utc)
        rows = self.bq.query(
            f"""
            SELECT COUNT(*) AS n
            FROM `{self.bq.full_table_id(_TABLE)}`
            WHERE LOWER(created_by) = LOWER(@email)
              AND status = 'OK'
              AND created_at >= @desde
            """,
            [
                ScalarQueryParameter("email", "STRING", email),
                ScalarQueryParameter("desde", "TIMESTAMP", inicio_de_mes(ahora)),
            ],
            timeout_s=30,
        )
        return int(rows[0]["n"]) if rows else 0

    def registrar(
        self, *, email: str, status: str, norm: dict, meta: Optional[dict] = None,
        error: Optional[str] = None, creado_en: Optional[datetime] = None,
    ) -> str:
        """Inserta una fila OK o ERROR. Retorna el report_id."""
        meta = meta or {}
        report_id = str(uuid.uuid4())
        fila = {
            "report_id":          report_id,
            "created_by":         email,
            "created_at":         creado_en or meta.get("generado_en") or datetime.now(timezone.utc),
            "alcance":            (meta.get("alcance") or {}).get("tipo"),
            "alcance_etiqueta":   (meta.get("alcance") or {}).get("etiqueta"),
            "filtros_json":       json.dumps(norm, ensure_ascii=False, sort_keys=True),
            "filtros_hash":       meta.get("filtros_hash"),
            "fecha_start":        date.fromisoformat(norm["fecha_start"]) if norm.get("fecha_start") else None,
            "fecha_end":          date.fromisoformat(norm["fecha_end"]) if norm.get("fecha_end") else None,
            "n_interacciones":    meta.get("n_interacciones"),
            "status":             status,
            "error_message":      (error or "")[:1000] or None,
            "model":              meta.get("model"),
            "prompt_version":     meta.get("prompt_version"),
            "prompt_tokens":      meta.get("prompt_tokens"),
            "output_tokens":      meta.get("output_tokens"),
            "costo_estimado_usd": meta.get("costo_estimado_usd"),
            "duracion_s":         meta.get("duracion_s"),
        }
        self.bq.insert_rows_dml(self.bq.full_table_id(_TABLE), [fila])
        return report_id
