"""Fase 2 — Glosario: catálogo de SAACA consolidado (versión vigente + historial)."""

import pytest

from backend.services import glosario_service
from backend.services.glosario_service import GlosarioService, consolidar_catalogo
from backend.tests.conftest import FakeBQ

HOY = "2026-09-28"


def _version(cid, version, activo, valid_from="2026-01-01", valid_to=None, nombre=None, **extra):
    return {
        "criterion_id": cid, "criteria_version": version, "is_active": activo,
        "valid_from": valid_from, "valid_to": valid_to,
        "criterion_name": nombre or f"Criterio {cid}", "criterion_description": f"Desc {cid} v{version}",
        "error_type": "CRITICAL", "error_category": "ECN", "criterion_weight": 5.0,
        "updated_at": f"{valid_from} 00:00:00+00", **extra,
    }


def _map(cid, tipo, mecanismo="AUTO_IA", activo=True, notes=None):
    return {"criterion_id": cid, "interaction_type": tipo, "mechanism": mecanismo,
            "is_active": activo, "notes": notes}


@pytest.fixture(autouse=True)
def _limpiar_cache():
    glosario_service._cache.clear()
    yield
    glosario_service._cache.clear()


# ── consolidar_catalogo ─────────────────────────────────────────────────────

def test_criterio_reactivado_aparece_una_vez_con_historial():
    # Caso real C0008: v1 inactiva (2026-01-01) + v2 activa (2026-09-07).
    criterios, _ = consolidar_catalogo(
        [_version("C0008", 1, False), _version("C0008", 2, True, valid_from="2026-09-07")],
        [_map("C0008", "TASK_RECONTACT")], hoy=HOY,
    )
    assert len(criterios) == 1
    c = criterios[0]
    assert (c.estado, c.criteria_version, c.criterion_description) == ("ACTIVO", 2, "Desc C0008 v2")
    assert [h.criteria_version for h in c.historial] == [2, 1]


def test_version_activa_gana_aunque_haya_una_mayor_inactiva():
    criterios, _ = consolidar_catalogo(
        [_version("C0007", 1, True), _version("C0007", 2, False)], [], hoy=HOY,
    )
    assert (criterios[0].estado, criterios[0].criteria_version) == ("ACTIVO", 1)


def test_sin_version_activa_es_inactivo_y_muestra_la_mas_reciente():
    criterios, _ = consolidar_catalogo(
        [_version("C0099", 1, False), _version("C0099", 2, False)], [], hoy=HOY,
    )
    assert (criterios[0].estado, criterios[0].criteria_version) == ("INACTIVO", 2)


def test_valid_to_vencido_no_cuenta_como_vigente():
    criterios, _ = consolidar_catalogo(
        [_version("C0010", 1, True, valid_to="2026-08-05")], [], hoy=HOY,
    )
    assert criterios[0].estado == "INACTIVO"


def test_valid_to_futuro_sigue_vigente():
    criterios, _ = consolidar_catalogo(
        [_version("C0010", 1, True, valid_to="2026-12-31")], [], hoy=HOY,
    )
    assert criterios[0].estado == "ACTIVO"


def test_tipos_de_interaccion_por_criterio_y_globales():
    criterios, tipos = consolidar_catalogo(
        [_version("C0001", 1, True), _version("C0013", 1, True)],
        [
            _map("C0001", "TASK_INFO_REQUEST"),
            _map("C0001", "EMAIL", notes="N/A por na_reason"),
            _map("C0013", "EMAIL", mecanismo="AUTO_IA_RAG"),
            _map("C0001", "CASE", activo=False),                 # mapping inactivo
        ],
        hoy=HOY,
    )
    c1 = criterios[0]
    # activos primero, ordenados por tipo; el inactivo queda al final
    assert [(t.interaction_type, t.is_active) for t in c1.tipos_interaccion] == [
        ("EMAIL", True), ("TASK_INFO_REQUEST", True), ("CASE", False),
    ]
    assert c1.tipos_interaccion[0].notes == "N/A por na_reason"
    assert criterios[1].tipos_interaccion[0].mechanism == "AUTO_IA_RAG"
    assert tipos == ["EMAIL", "TASK_INFO_REQUEST"]           # CASE solo tenía mapping inactivo


def test_criterios_ordenados_por_id():
    criterios, _ = consolidar_catalogo(
        [_version("C0012", 1, True), _version("C0002", 1, True)], [], hoy=HOY,
    )
    assert [c.criterion_id for c in criterios] == ["C0002", "C0012"]


# ── Servicio: SQL y caché ───────────────────────────────────────────────────

def test_mapping_excluye_filas_humano():
    bq = FakeBQ([[], []])
    GlosarioService(bq).get_glosario()
    sql_mapping, _ = bq.queries[1]
    assert "mechanism != 'HUMANO'" in sql_mapping


def test_catalogo_lee_todas_las_versiones():
    bq = FakeBQ([[], []])
    GlosarioService(bq).get_glosario()
    sql_criterios, _ = bq.queries[0]
    assert "is_active = TRUE" not in sql_criterios          # sin filtrar: hace falta el historial


def test_cache_del_dia_y_force_refresh():
    bq = FakeBQ([[_version("C0001", 1, True)], [], [_version("C0001", 1, True)], []])
    svc = GlosarioService(bq)
    primero = svc.get_glosario()
    assert svc.get_glosario() is primero                    # misma respuesta, sin nuevas consultas
    assert len(bq.queries) == 2
    svc.get_glosario(force_refresh=True)
    assert len(bq.queries) == 4
