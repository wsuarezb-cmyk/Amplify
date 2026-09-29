"""Tarea 1.4 — flujo de dos pasos: voto a ciegas → revisión frente a SAACA → confirmación."""

import pytest

from backend.models.pitch import (
    CalibracionCriterioEval,
    CalibracionVotoCiego,
    ConfirmarRequest,
    EvaluarRequest,
    RevisionCriterio,
)
from backend.services.calibracion_service import (
    CalibracionService,
    requiere_observacion,
    validar_confirmacion,
)
from backend.tests.conftest import FakeBQ, param_values

EMAIL = "auditor@falabella.com"


def _rev(cid="C0008", ciego="CUMPLE", saaca="CUMPLE", muestra_id="M1"):
    return {
        "muestra_id": muestra_id, "criterion_id": cid, "interaction_type": "TASK_RECONTACT",
        "resultado_ciego": ciego, "resultado_saaca": saaca,
        "criterion_name": "Motivo recontacto", "criterion_description": "Desc",
        "error_type": "CRITICAL", "observacion_saaca": "El motivo no corresponde.",
    }


_CTX  = [{"case_id": "K1", "numero_caso": "123", "pais": "CO",
          "nombre_agente": "A", "email_agente": "a@x.com", "departamento": "GSC"}]
_META = [{"criterion_id": "C0008", "criterion_name": "Motivo recontacto",
          "error_type": "CRITICAL", "error_category": "ECN", "criterion_weight": 5.0}]


# ── Regla de observación obligatoria ────────────────────────────────────────

@pytest.mark.parametrize("ciego, saaca, final, esperado", [
    ("CUMPLE",    "CUMPLE",    "CUMPLE",    False),  # acuerdo sin cambio
    ("NO_CUMPLE", "CUMPLE",    "NO_CUMPLE", True),   # desacuerdo, mantiene su voto
    ("NO_CUMPLE", "CUMPLE",    "CUMPLE",    True),   # cambió de opinión tras leer a SAACA
    ("CUMPLE",    "CUMPLE",    "NO_CUMPLE", True),   # cambió y queda en desacuerdo
])
def test_requiere_observacion(ciego, saaca, final, esperado):
    assert requiere_observacion(ciego, saaca, final) is esperado


def _revision(**kw):
    return {"C0008": RevisionCriterio(**{k: v for k, v in _rev(**kw).items() if k != "interaction_type"})}


def test_desacuerdo_sin_observacion_se_rechaza():
    with pytest.raises(ValueError, match="obligatoria"):
        validar_confirmacion(_revision(ciego="NO_CUMPLE", saaca="CUMPLE"),
                             [CalibracionCriterioEval(criterion_id="C0008", result_label="NO_CUMPLE")])


def test_observacion_demasiado_corta_se_rechaza():
    with pytest.raises(ValueError):
        validar_confirmacion(_revision(ciego="NO_CUMPLE", saaca="CUMPLE"),
                             [CalibracionCriterioEval(criterion_id="C0008", result_label="NO_CUMPLE",
                                                      observation="  ok ")])


def test_acuerdo_sin_observacion_se_acepta():
    validar_confirmacion(_revision(ciego="CUMPLE", saaca="CUMPLE"),
                         [CalibracionCriterioEval(criterion_id="C0008", result_label="CUMPLE")])


def test_desacuerdo_con_observacion_se_acepta():
    validar_confirmacion(_revision(ciego="NO_CUMPLE", saaca="CUMPLE"),
                         [CalibracionCriterioEval(criterion_id="C0008", result_label="NO_CUMPLE",
                                                  observation="El seller sí adjuntó el archivo.")])


# ── Paso 1: voto a ciegas ───────────────────────────────────────────────────

def _evaluar_request(*votos):
    return EvaluarRequest(
        interaction_id="I1", interaction_type="TASK_RECONTACT",
        evaluations=[CalibracionVotoCiego(criterion_id=c, result_label=r) for c, r in votos],
    )


def test_voto_a_ciegas_queda_en_progreso_sin_escribir_eval_detail():
    bq = FakeBQ([
        [{"muestra_id": "M1", "criterion_id": "C0008", "estado": "PENDIENTE"}],  # pendientes
        [_rev(ciego="NO_CUMPLE", saaca="CUMPLE")],                                # revisión
    ])
    resp = CalibracionService(bq).evaluar(_evaluar_request(("C0008", "NO_CUMPLE")), EMAIL)

    assert bq.inserts == []                                   # nada en saaca_eval_detail
    assert len(bq.updates) == 1
    upd = bq.updates[0]
    assert "estado = 'EN_PROGRESO'" in upd["set"]
    assert "resultado_ciego" in upd["set"]
    assert "estado = 'PENDIENTE'" in upd["where"]
    assert param_values(upd["params"], "cumple") == []        # votó NO_CUMPLE
    assert resp.revision.criterios[0].resultado_saaca == "CUMPLE"
    assert resp.revision.criterios[0].observacion_saaca == "El motivo no corresponde."


def test_voto_a_ciegas_rechaza_si_ya_voto():
    bq = FakeBQ([
        [],                                                                       # sin pendientes
        [{"muestra_id": "M1", "criterion_id": "C0008", "estado": "EN_PROGRESO"}], # ya votado
    ])
    with pytest.raises(ValueError, match="revisión"):
        CalibracionService(bq).evaluar(_evaluar_request(("C0008", "CUMPLE")), EMAIL)
    assert bq.updates == []


def test_voto_a_ciegas_exige_todos_los_criterios_pendientes():
    bq = FakeBQ([[
        {"muestra_id": "M1", "criterion_id": "C0001", "estado": "PENDIENTE"},
        {"muestra_id": "M2", "criterion_id": "C0002", "estado": "PENDIENTE"},
    ]])
    with pytest.raises(ValueError, match="faltan"):
        CalibracionService(bq).evaluar(_evaluar_request(("C0001", "CUMPLE")), EMAIL)


def test_revision_usa_snapshot_de_la_muestra_y_solo_en_progreso():
    bq = FakeBQ([[]])
    CalibracionService(bq).get_revision("I1", EMAIL)
    sql, _ = bq.queries[0]
    assert "m.resultado_auto_snapshot AS resultado_saaca" in sql
    assert "m.estado = 'EN_PROGRESO'" in sql
    assert "e.resultado      = m.resultado_auto_snapshot" in sql


# ── Paso 2: confirmación ────────────────────────────────────────────────────

def _confirmar_request(*evals):
    return ConfirmarRequest(
        interaction_id="I1", interaction_type="TASK_RECONTACT",
        evaluations=[CalibracionCriterioEval(criterion_id=c, result_label=r, observation=o)
                     for c, r, o in evals],
    )


def test_confirmar_inserta_voto_final_y_completa():
    bq = FakeBQ([
        [_rev(ciego="NO_CUMPLE", saaca="CUMPLE")],   # revisión
        _CTX, [{"criteria_version": 2}], _META,      # contexto, versión, metadata
    ])
    resp = CalibracionService(bq).confirmar(
        _confirmar_request(("C0008", "CUMPLE", "Tras leer a SAACA, el motivo es correcto.")), EMAIL,
    )

    _, filas = bq.inserts[0]
    assert len(filas) == 1
    fila = filas[0]
    assert fila["mechanism"] == "HUMANO"
    assert fila["result_label"] == "CUMPLE"            # voto final, no el ciego
    assert fila["observation"] == "Tras leer a SAACA, el motivo es correcto."
    assert fila["eval_reference_id"] == "M1"
    assert fila["criteria_version"] == 2
    assert "estado = 'COMPLETADO'" in bq.updates[0]["set"]
    assert (resp.coincidencias, resp.cambios_de_voto) == (1, 1)
    assert resp.estado_muestra_inconsistente is False


def test_confirmar_desacuerdo_sin_observacion_no_escribe():
    bq = FakeBQ([[_rev(ciego="NO_CUMPLE", saaca="CUMPLE")]])
    with pytest.raises(ValueError, match="obligatoria"):
        CalibracionService(bq).confirmar(_confirmar_request(("C0008", "NO_CUMPLE", None)), EMAIL)
    assert bq.inserts == []
    assert bq.updates == []


def test_confirmar_sin_voto_a_ciegas_se_rechaza():
    bq = FakeBQ([
        [],                                                                     # sin revisión
        [{"muestra_id": "M1", "criterion_id": "C0008", "estado": "PENDIENTE"}], # aún pendiente
    ])
    with pytest.raises(ValueError, match="voto a ciegas"):
        CalibracionService(bq).confirmar(_confirmar_request(("C0008", "CUMPLE", None)), EMAIL)


def test_confirmar_payload_repetido_una_sola_fila_humano():
    bq = FakeBQ([[_rev()], _CTX, [], _META])
    resp = CalibracionService(bq).confirmar(
        _confirmar_request(("C0008", "CUMPLE", None), ("C0008", "CUMPLE", None)), EMAIL,
    )
    _, filas = bq.inserts[0]
    assert len(filas) == 1
    assert resp.criterios_evaluados == 1


def test_confirmar_sin_evaluacion_auto_deja_criteria_version_nula():
    # La columna es INT64: el antiguo default 'v1' rompía el Load Job.
    bq = FakeBQ([[_rev()], _CTX, [], _META])
    CalibracionService(bq).confirmar(_confirmar_request(("C0008", "CUMPLE", None)), EMAIL)
    _, filas = bq.inserts[0]
    assert filas[0]["criteria_version"] is None


def test_confirmar_marca_defectuosa_si_critico_no_cumple():
    bq = FakeBQ([[_rev(ciego="NO_CUMPLE", saaca="NO_CUMPLE")], _CTX, [], _META])
    resp = CalibracionService(bq).confirmar(_confirmar_request(("C0008", "NO_CUMPLE", None)), EMAIL)
    assert resp.is_defective is True
    assert bq.inserts[0][1][0]["is_defective_transaction"] is True


# ── Comparación final ───────────────────────────────────────────────────────

def test_comparacion_usa_snapshot_como_veredicto_auto():
    bq = FakeBQ([[]])
    CalibracionService(bq).get_comparacion("I1", EMAIL)
    sql, _ = bq.queries[0]
    assert "COALESCE(m.resultado_auto_snapshot, v.resultado_auto) AS resultado_auto" in sql
    assert "SELECT DISTINCT" in sql
