"""Tarea 1.1 — el universo de la muestra solo toma veredictos comparables de SAACA."""

from backend.services.calibracion_service import CalibracionService
from backend.tests.conftest import FakeBQ, param_values


def _poblacion_sql_y_params():
    bq = FakeBQ()
    CalibracionService(bq)._poblacion_elegible("2026-09-01", "2026-09-27")
    assert len(bq.queries) == 1
    return bq.queries[0]


def test_universo_filtra_solo_cumple_y_no_cumple():
    sql, params = _poblacion_sql_y_params()
    assert "e.resultado IN UNNEST(@resultados_comparables)" in sql
    assert sorted(param_values(params, "resultados_comparables")) == ["CUMPLE", "NO_CUMPLE"]


def test_universo_no_usa_filtro_negativo():
    # El NOT IN ('N/A','NO_EVALUADO') dejaba pasar cualquier valor nuevo.
    sql, _ = _poblacion_sql_y_params()
    assert "NOT IN ('N/A'" not in sql


def test_universo_filtra_mecanismos_automaticos():
    sql, params = _poblacion_sql_y_params()
    assert "e.mecanismo_evaluacion IN UNNEST(@mecanismos_saaca)" in sql
    mecanismos = param_values(params, "mecanismos_saaca")
    assert "AUTO_IA" in mecanismos
    assert "HUMANO" not in mecanismos


def test_universo_una_fila_por_interaccion_y_criterio():
    sql, _ = _poblacion_sql_y_params()
    assert "PARTITION BY e.interaction_id, e.id_criterio" in sql
    assert "SELECT DISTINCT" not in sql


def test_universo_no_multiplica_por_versiones_del_catalogo():
    # JOIN directo al catálogo versionado duplicaba C0007/C0008.
    sql, _ = _poblacion_sql_y_params()
    assert "JOIN `proj.ds.saaca_cat_criteria`" not in sql
    assert "EXISTS (\n            SELECT 1 FROM `proj.ds.saaca_cat_criteria` c" in sql


def test_estratificar_agrupa_por_criterio_mecanismo_resultado_pais():
    poblacion = [
        {"id_criterio": "C0008", "mecanismo_evaluacion": "AUTO_IA", "resultado": "CUMPLE",
         "pais": "CO", "tipo_error": "CRITICAL"},
        {"id_criterio": "C0008", "mecanismo_evaluacion": "AUTO_IA", "resultado": "CUMPLE",
         "pais": "CO", "tipo_error": "CRITICAL"},
        {"id_criterio": "C0008", "mecanismo_evaluacion": "AUTO_IA", "resultado": "NO_CUMPLE",
         "pais": "CO", "tipo_error": "CRITICAL"},
        {"id_criterio": "C0004", "mecanismo_evaluacion": "AUTO_IA", "resultado": "CUMPLE",
         "pais": "CL", "tipo_error": "OTRO"},
    ]
    estratos = CalibracionService._estratificar(poblacion)
    assert len(estratos["C0008|AUTO_IA|CUMPLE|CO"]["unidades"]) == 2
    assert len(estratos["C0008|AUTO_IA|NO_CUMPLE|CO"]["unidades"]) == 1
    # tipo_error desconocido cae en NON_CRITICAL
    assert estratos["C0004|AUTO_IA|CUMPLE|CL"]["criticidad"] == "NON_CRITICAL"
