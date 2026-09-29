"""Tarea 1.2 — catálogo deduplicado y descripción del criterio en la bandeja."""

from backend.services.calibracion_service import CalibracionService, agrupar_inbox
from backend.tests.conftest import FakeBQ


def _fila(muestra_id, interaction_id="I1", criterion_id="C0008", estado="PENDIENTE", **extra):
    return {
        "muestra_id": muestra_id, "batch_id": "B1", "interaction_id": interaction_id,
        "interaction_type": "TASK_RECONTACT", "pais": "CO", "criterion_id": criterion_id,
        "estado": estado, "fecha_asignacion": "2026-09-20 10:00:00",
        "criterion_name": "Uso correcto del motivo de recontacto",
        "criterion_description": "Evalúa si el motivo seleccionado corresponde.",
        "error_type": "CRITICAL",
        "numero_caso": "123", "nombre_agente": "Agente", "departamento": "GSC",
        **extra,
    }


# ── agrupar_inbox ───────────────────────────────────────────────────────────

def test_fila_duplicada_por_catalogo_se_muestra_una_vez():
    # Caso real C0008: v1 inactiva + v2 activa → la misma fila de muestra llegaba dos veces.
    resp = agrupar_inbox([_fila("M1"), _fila("M1")])
    assert len(resp.items) == 1
    assert len(resp.items[0].criterios) == 1
    assert resp.total_asignados == 1


def test_criterios_distintos_de_la_misma_interaccion_se_conservan():
    resp = agrupar_inbox([_fila("M1", criterion_id="C0001"), _fila("M2", criterion_id="C0002")])
    assert len(resp.items) == 1
    assert [c.criterion_id for c in resp.items[0].criterios] == ["C0001", "C0002"]
    assert resp.total_asignados == 2


def test_descripcion_y_criticidad_viajan_con_el_criterio():
    criterio = agrupar_inbox([_fila("M1")]).items[0].criterios[0]
    assert criterio.criterion_description == "Evalúa si el motivo seleccionado corresponde."
    assert criterio.error_type == "CRITICAL"


def test_criterio_sin_catalogo_no_rompe_la_bandeja():
    fila = _fila("M1", criterion_name=None, criterion_description=None, error_type=None)
    criterio = agrupar_inbox([fila]).items[0].criterios[0]
    assert criterio.criterion_description is None


def test_estado_agregado_y_totales():
    resp = agrupar_inbox([
        _fila("M1", interaction_id="I1", estado="COMPLETADO"),
        _fila("M2", interaction_id="I2", estado="DESCARTADO"),
        _fila("M3", interaction_id="I3", criterion_id="C0001", estado="COMPLETADO"),
        _fila("M4", interaction_id="I3", criterion_id="C0002", estado="PENDIENTE"),
    ])
    estados = {i.interaction_id: i.estado for i in resp.items}
    assert estados == {"I1": "COMPLETADO", "I2": "DESCARTADO", "I3": "PENDIENTE"}
    assert (resp.total_asignados, resp.total_completados, resp.total_descartados) == (4, 2, 1)


# ── SQL de la bandeja ───────────────────────────────────────────────────────

def test_bandeja_usa_catalogo_canonico():
    bq = FakeBQ([[_fila("M1")]])
    CalibracionService(bq).get_inbox("auditor@falabella.com")
    sql, _ = bq.queries[0]
    assert "PARTITION BY criterion_id" in sql
    assert "c.criterion_description" in sql
    assert "LEFT JOIN `proj.ds.saaca_cat_criteria` c" not in sql



def test_estado_en_revision_tras_voto_a_ciegas():
    resp = agrupar_inbox([
        _fila("M1", interaction_id="I1", criterion_id="C0001", estado="EN_PROGRESO"),
        _fila("M2", interaction_id="I1", criterion_id="C0002", estado="EN_PROGRESO"),
        _fila("M3", interaction_id="I2", criterion_id="C0001", estado="PENDIENTE"),
        _fila("M4", interaction_id="I2", criterion_id="C0002", estado="EN_PROGRESO"),
    ])
    estados = {i.interaction_id: i.estado for i in resp.items}
    # PENDIENTE manda: primero hay que votar a ciegas lo que falta
    assert estados == {"I1": "EN_PROGRESO", "I2": "PENDIENTE"}
