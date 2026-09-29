"""
PitchReportingService — Reportería de Pitch.

Principio de arquitectura (spec §1):
  - El extracto (vw_pitch_dashboard_extracto) se carga UNA vez al día y se
    cachea en memoria de proceso. El cross-filtering ocurre en el navegador.
  - El drilldown por interacción consulta BQ en vivo contra la tabla física
    pitch_eval_enriched (la única con observacion_saaca) — NUNCA la vista.
"""

import csv
import io
import logging
from datetime import date, datetime, timezone
from typing import Iterator, Optional

from google.cloud.bigquery import ArrayQueryParameter, ScalarQueryParameter

from backend.connectors.bigquery_connector import BigQueryConnector
from backend.models.pitch import (
    CalibracionKpiResponse,
    ExtractoResponse,
    InteractionCriterionDetail,
    InteractionDetailPitchResponse,
)

logger = logging.getLogger(__name__)

_VIEW_EXTRACTO = "vw_pitch_dashboard_extracto"
_TABLE_ENRICHED = "pitch_eval_enriched"
_VIEW_COMPARATIVA = "vw_pitch_calibracion_comparativa"

# Ventana del KPI de acuerdo humano-SAACA (días, por fecha de evaluación humana)
_CALIBRACION_KPI_DIAS = 90

# Export gobernado (decisión confirmada): CSV, máx 50k filas, rango ≤ 31 días.
_EXPORT_MAX_FILAS = 50_000
_EXPORT_MAX_DIAS = 31

# Columnas del export — pitch_eval_enriched completo, CON observacion_saaca.
_EXPORT_COLUMNS = [
    "interaction_id", "tipo_interaccion", "case_id", "numero_caso", "seller_code",
    "pais", "nombre_agente", "email_agente", "departamento",
    "nombre_manager", "email_manager",
    "tipificacion_nivel_1", "tipificacion_nivel_2", "nombre_tipificacion",
    "fecha_evaluacion", "score_interaccion", "es_defectuosa",
    "id_criterio", "nombre_criterio", "tipo_error", "categoria_error",
    "resultado", "score_criterio", "observacion_saaca",
    "peso_aplicado", "peso_relativo_criterio", "mecanismo_evaluacion",
]

# Filtros dimensionales del export: nombre de query param → columna de la tabla
_EXPORT_LIST_FILTERS = {
    "pais":                 "pais",
    "departamento":         "departamento",
    "tipo_interaccion":     "tipo_interaccion",
    "mecanismo_evaluacion": "mecanismo_evaluacion",
    "id_criterio":          "id_criterio",
    "tipificacion_nivel_1": "tipificacion_nivel_1",
    "tipificacion_nivel_2": "tipificacion_nivel_2",
    "nombre_tipificacion":  "nombre_tipificacion",
    "email_agente":         "email_agente",
    "email_manager":        "email_manager",
    "numero_caso":          "numero_caso",
    "interaction_id":       "interaction_id",
    "seller_code":          "seller_code",
}

# Orden canónico de columnas del extracto — el frontend hidrata objetos
# a partir de este orden, no debe cambiar sin coordinar ambos lados.
_EXTRACTO_COLUMNS = [
    "interaction_id", "tipo_interaccion", "case_id", "numero_caso", "seller_code", "pais",
    "nombre_agente", "email_agente", "departamento",
    "nombre_manager", "email_manager",
    "tipificacion_nivel_1", "tipificacion_nivel_2", "nombre_tipificacion",
    "fecha_evaluacion", "score_interaccion", "es_defectuosa",
    "es_primera_fila_interaccion", "es_primera_fila_categoria",
    "id_criterio", "nombre_criterio", "tipo_error", "categoria_error",
    "resultado", "score_criterio", "peso_aplicado", "mecanismo_evaluacion",
    "peso_relativo_criterio", "tiene_error_en_categoria",
]

# Caché en memoria del proceso: un payload por fecha (UTC).
# Cloud Run puede tener varias instancias — cada una calienta su propio caché;
# aceptable porque la vista es estable durante el día.
_cache: dict[str, ExtractoResponse] = {}


class PitchReportingService:

    def __init__(self, bq: BigQueryConnector) -> None:
        self.bq = bq

    # ── Extracto diario ──────────────────────────────────────────────────

    def get_extracto(self, force_refresh: bool = False) -> ExtractoResponse:
        """
        Retorna el extracto completo del día, cacheado en memoria.

        force_refresh=True invalida el caché del día (uso: ADMIN tras un
        re-proceso del SP fuera de horario).
        """
        cache_key = date.today().isoformat()

        if not force_refresh and cache_key in _cache:
            return _cache[cache_key]

        select_cols = ", ".join(
            "CAST(fecha_evaluacion AS STRING) AS fecha_evaluacion"
            if col == "fecha_evaluacion" else col
            for col in _EXTRACTO_COLUMNS
        )
        table = self.bq.full_table_id(_VIEW_EXTRACTO)
        rows = self.bq.query(f"SELECT {select_cols} FROM `{table}`")

        payload = ExtractoResponse(
            fecha_carga=datetime.now(timezone.utc).isoformat(),
            total_filas=len(rows),
            columns=_EXTRACTO_COLUMNS,
            data=[[r[c] for c in _EXTRACTO_COLUMNS] for r in rows],
        )

        # Solo se mantiene el día vigente en el caché
        _cache.clear()
        _cache[cache_key] = payload
        logger.info("Extracto cargado y cacheado: %d filas (key=%s)", len(rows), cache_key)
        return payload

    # ── KPI de calibración (acuerdo humano-SAACA) ────────────────────────

    def get_calibracion_kpi(self) -> CalibracionKpiResponse:
        """
        % de acuerdo humano-SAACA sobre los criterios calibrados en los
        últimos 90 días (fecha de evaluación humana). Query pequeña en vivo —
        el volumen de calibración es bajo por diseño.
        """
        view = self.bq.full_table_id(_VIEW_COMPARATIVA)
        rows = self.bq.query(
            f"""
            SELECT
              COUNT(*)            AS total_calibrados,
              COUNTIF(coincide)   AS coincidencias
            FROM `{view}`
            WHERE resultado_humano IS NOT NULL
              AND fecha_evaluacion_humana >= TIMESTAMP_SUB(
                    CURRENT_TIMESTAMP(), INTERVAL {_CALIBRACION_KPI_DIAS} DAY)
            """,
            timeout_s=30,
        )
        r = rows[0] if rows else {}
        total = int(r.get("total_calibrados") or 0)
        coincidencias = int(r.get("coincidencias") or 0)
        return CalibracionKpiResponse(
            ventana_dias=_CALIBRACION_KPI_DIAS,
            total_calibrados=total,
            coincidencias=coincidencias,
            pct_acuerdo=(coincidencias / total * 100) if total > 0 else None,
        )

    # ── Export CSV gobernado ─────────────────────────────────────────────

    def export_enriched_csv(self, filtros: dict) -> tuple[Iterator[str], bool]:
        """
        Exporta pitch_eval_enriched (CON observacion_saaca) con los filtros
        del dashboard aplicados, como stream de CSV.

        Gobernanza (decisión confirmada): rango de fechas OBLIGATORIO y ≤ 31
        días; corte en 50.000 filas. Retorna (generador_csv, truncado).
        """
        fecha_start = filtros.get("fecha_start")
        fecha_end = filtros.get("fecha_end")
        if not fecha_start or not fecha_end:
            raise ValueError("El export exige un rango de fechas (fecha_start y fecha_end).")
        d0, d1 = date.fromisoformat(fecha_start), date.fromisoformat(fecha_end)
        if d1 < d0:
            raise ValueError("fecha_end no puede ser anterior a fecha_start.")
        if (d1 - d0).days + 1 > _EXPORT_MAX_DIAS:
            raise ValueError(
                f"El export permite un rango de máximo {_EXPORT_MAX_DIAS} días "
                "(protege el rendimiento del proyecto BQ). Acota las fechas."
            )

        conditions = ["fecha_evaluacion BETWEEN @fecha_start AND @fecha_end"]
        params: list = [
            ScalarQueryParameter("fecha_start", "DATE", d0),
            ScalarQueryParameter("fecha_end", "DATE", d1),
        ]
        for param_name, col in _EXPORT_LIST_FILTERS.items():
            values = filtros.get(param_name)
            if values:
                conditions.append(f"{col} IN UNNEST(@{param_name})")
                params.append(ArrayQueryParameter(param_name, "STRING", values))

        table = self.bq.full_table_id(_TABLE_ENRICHED)
        cols = ", ".join(
            "CAST(fecha_evaluacion AS STRING) AS fecha_evaluacion"
            if c == "fecha_evaluacion" else c
            for c in _EXPORT_COLUMNS
        )
        rows = self.bq.query(
            f"""
            SELECT {cols}
            FROM `{table}`
            WHERE {" AND ".join(conditions)}
            ORDER BY fecha_evaluacion, interaction_id, id_criterio
            LIMIT {_EXPORT_MAX_FILAS + 1}
            """,
            params,
        )

        truncado = len(rows) > _EXPORT_MAX_FILAS
        if truncado:
            rows = rows[:_EXPORT_MAX_FILAS]
        logger.info("Export enriched: %d filas (truncado=%s)", len(rows), truncado)

        def _stream() -> Iterator[str]:
            buf = io.StringIO()
            writer = csv.writer(buf, lineterminator="\n")
            # BOM para que Excel abra UTF-8 con acentos correctamente
            yield "﻿"
            writer.writerow(_EXPORT_COLUMNS)
            for i, r in enumerate(rows, 1):
                writer.writerow([r.get(c) for c in _EXPORT_COLUMNS])
                if i % 500 == 0:
                    yield buf.getvalue()
                    buf.seek(0)
                    buf.truncate(0)
            yield buf.getvalue()

        return _stream(), truncado

    # ── Drilldown en vivo ────────────────────────────────────────────────

    def get_interaction_detail(self, interaction_id: str) -> Optional[InteractionDetailPitchResponse]:
        """
        Detalle por criterio de una interacción, con observacion_saaca.
        Consulta en vivo a pitch_eval_enriched. None si no existe.
        """
        table = self.bq.full_table_id(_TABLE_ENRICHED)
        rows = self.bq.query(
            f"""
            SELECT
              interaction_id, tipo_interaccion, numero_caso, pais,
              nombre_agente, departamento, nombre_manager,
              score_interaccion, es_defectuosa,
              id_criterio, nombre_criterio, tipo_error, categoria_error,
              resultado, score_criterio, observacion_saaca,
              peso_aplicado, peso_relativo_criterio, mecanismo_evaluacion,
              CAST(fecha_hora_evaluacion AS STRING) AS fecha_hora_evaluacion
            FROM `{table}`
            WHERE interaction_id = @iid
            ORDER BY id_criterio
            """,
            [ScalarQueryParameter("iid", "STRING", interaction_id)],
        )

        if not rows:
            return None

        head = rows[0]
        return InteractionDetailPitchResponse(
            interaction_id=head["interaction_id"],
            tipo_interaccion=head.get("tipo_interaccion"),
            numero_caso=head.get("numero_caso"),
            pais=head.get("pais"),
            nombre_agente=head.get("nombre_agente"),
            departamento=head.get("departamento"),
            nombre_manager=head.get("nombre_manager"),
            score_interaccion=head.get("score_interaccion"),
            es_defectuosa=head.get("es_defectuosa"),
            criterios=[
                InteractionCriterionDetail(
                    id_criterio=r.get("id_criterio"),
                    nombre_criterio=r.get("nombre_criterio"),
                    tipo_error=r.get("tipo_error"),
                    categoria_error=r.get("categoria_error"),
                    resultado=r.get("resultado"),
                    score_criterio=r.get("score_criterio"),
                    observacion_saaca=r.get("observacion_saaca"),
                    peso_aplicado=r.get("peso_aplicado"),
                    peso_relativo_criterio=r.get("peso_relativo_criterio"),
                    mecanismo_evaluacion=r.get("mecanismo_evaluacion"),
                    fecha_hora_evaluacion=r.get("fecha_hora_evaluacion"),
                )
                for r in rows
            ],
        )
