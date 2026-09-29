"""
Ejemplos reales de evaluaciones con la observación de SAACA — el contexto
cualitativo del diagnóstico. Es la ÚNICA consulta en vivo a BigQuery del flujo
(la observación no está en el extracto).

Muestreo: al azar, repartido entre criterios (round-robin por criterio) y
sesgado a NO_CUMPLE, donde están las oportunidades de mejora; algunos CUMPLE
dan evidencia para los reconocimientos. Los filtros de lista se aplican a
nivel fila, reutilizando el mapa del export CSV.
"""

from datetime import date

from google.cloud.bigquery import ArrayQueryParameter, ScalarQueryParameter

from backend.connectors.bigquery_connector import BigQueryConnector
from backend.services.diagnostico.filtros import CASE_INSENSITIVE_FILTERS
from backend.services.pitch_reporting_service import _EXPORT_LIST_FILTERS, _TABLE_ENRICHED

N_NO_CUMPLE = 28
N_CUMPLE = 12
MAX_POR_CRITERIO = 6          # por resultado: evita que un criterio acapare la muestra
MAX_CHARS_OBSERVACION = 500


def obtener_muestras(bq: BigQueryConnector, norm: dict) -> list[dict]:
    condiciones = [
        "fecha_evaluacion BETWEEN @fecha_start AND @fecha_end",
        "resultado IN ('CUMPLE', 'NO_CUMPLE')",
        "observacion_saaca IS NOT NULL",
        "TRIM(observacion_saaca) != ''",
    ]
    params = [
        ScalarQueryParameter("fecha_start", "DATE", date.fromisoformat(norm["fecha_start"])),
        ScalarQueryParameter("fecha_end",   "DATE", date.fromisoformat(norm["fecha_end"])),
        ScalarQueryParameter("n_no_cumple", "INT64", N_NO_CUMPLE),
        ScalarQueryParameter("n_cumple",    "INT64", N_CUMPLE),
        ScalarQueryParameter("por_criterio", "INT64", MAX_POR_CRITERIO),
        ScalarQueryParameter("max_chars",   "INT64", MAX_CHARS_OBSERVACION),
    ]
    for param, columna in _EXPORT_LIST_FILTERS.items():
        valores = norm.get(param) or []
        if valores:
            # los correos llegan normalizados en minúsculas (filtros.normalizar)
            campo = f"LOWER({columna})" if param in CASE_INSENSITIVE_FILTERS else columna
            condiciones.append(f"{campo} IN UNNEST(@f_{param})")
            params.append(ArrayQueryParameter(f"f_{param}", "STRING", list(valores)))

    sql = f"""
    WITH base AS (
      SELECT
        numero_caso, tipo_interaccion, pais, nombre_agente,
        tipificacion_nivel_2, id_criterio, nombre_criterio, resultado,
        SUBSTR(observacion_saaca, 1, @max_chars) AS observacion_saaca,
        CAST(fecha_evaluacion AS STRING) AS fecha_evaluacion,
        ROW_NUMBER() OVER (PARTITION BY resultado, id_criterio ORDER BY RAND()) AS rn_criterio
      FROM `{bq.full_table_id(_TABLE_ENRICHED)}`
      WHERE {' AND '.join(condiciones)}
    )
    SELECT * EXCEPT (rn_criterio)
    FROM base
    WHERE rn_criterio <= @por_criterio
    QUALIFY ROW_NUMBER() OVER (PARTITION BY resultado ORDER BY rn_criterio, RAND())
            <= IF(resultado = 'NO_CUMPLE', @n_no_cumple, @n_cumple)
    ORDER BY resultado DESC, id_criterio
    """
    return bq.query(sql, params, timeout_s=60)
