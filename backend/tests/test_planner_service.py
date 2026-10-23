from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from backend.models.planner import ManualSolicitudCreate, PlannerDecisionCreate
from backend.services.planner_service import (
    MANUAL_SCHEMA,
    PlannerDecisionConflict,
    PlannerService,
)
from backend.tests.conftest import param_values


SETTINGS = SimpleNamespace(
    BQ_PROJECT_ID="test-project",
    PLANNER_DATASET="planner_dataset",
    PLANNER_TIMEZONE="America/Bogota",
)


def test_lista_consulta_tabla_manual_sin_campos_personales(fake_bq):
    now = datetime(2026, 10, 23, tzinfo=timezone.utc)
    fake_bq.responses = [[{
        "manual_solicitud_id": "id-1",
        "pais": "Colombia, Chile",
        "proyecto": "Fplus max",
        "fecha_envio": date(2026, 10, 31),
        "audiencia": "Base completa de sellers",
        "sp_created_at": now,
        "sp_modified_at": now,
    }]]

    result = PlannerService(fake_bq, SETTINGS).list_manual_requests()

    sql, params = fake_bq.queries[0]
    assert "test-project.planner_dataset.comunicaciones_solicitudes_manuales_amplify" in sql
    assert "creado_por_email" not in sql
    assert params == []
    assert result[0].proyecto == "Fplus max"
    assert not hasattr(result[0], "creado_por_email")


def test_crear_inserta_con_load_job_y_no_retorna_correo(fake_bq):
    body = ManualSolicitudCreate(
        area="Seller Experience",
        pais="Chile, Perú",
        proyecto="Fplus max",
        accion="Nuevo",
        tipo_comunicado="Mail, Popup",
        fecha_envio=date(2026, 10, 31),
        audiencia="Base segmentada de sellers",
    )

    result = PlannerService(fake_bq, SETTINGS).create_manual_request(
        body, "persona@ejemplo.com", "Persona Ejemplo"
    )

    table_id, rows = fake_bq.inserts[0]
    row = rows[0]
    assert table_id == "test-project.planner_dataset.comunicaciones_solicitudes_manuales_amplify"
    assert fake_bq.insert_schemas[0] == MANUAL_SCHEMA
    assert row["creado_por_email"] == "persona@ejemplo.com"
    assert row["pais"] == "Chile, Perú"
    assert row["area"] == "Seller Experience"
    assert row["accion"] == "Nuevo"
    assert row["tipo_comunicado"] == "Mail, Popup"
    assert row["audiencia"] == "Base segmentada de sellers"
    assert row["responsable"] == "Persona Ejemplo"
    assert row["fecha_envio"] == date(2026, 10, 31)
    assert row["is_deleted"] is False
    assert result.manual_solicitud_id == row["manual_solicitud_id"]
    assert not hasattr(result, "creado_por_email")


def test_fecha_envio_es_requerida():
    with pytest.raises(ValueError):
        ManualSolicitudCreate(
            area="VAS",
            pais="Colombia",
            accion="Nuevo",
            tipo_comunicado="Mail",
            audiencia="Base completa de sellers",
        )


def test_opciones_del_formulario_solo_aceptan_valores_validos():
    with pytest.raises(ValueError):
        ManualSolicitudCreate(
            area="VAS",
            pais="Chile, Chile",
            accion="Nuevo",
            tipo_comunicado="Mail",
            fecha_envio=date(2026, 10, 31),
            audiencia="Base completa de sellers",
        )
    with pytest.raises(ValueError):
        ManualSolicitudCreate(
            area="VAS",
            pais="Chile",
            accion="Nuevo",
            tipo_comunicado="Mail",
            fecha_envio=date(2026, 10, 31),
            audiencia="Otra audiencia",
        )
    with pytest.raises(ValueError):
        ManualSolicitudCreate(
            area="Otras",
            pais="Chile",
            accion="Nuevo",
            tipo_comunicado="Mail",
            fecha_envio=date(2026, 10, 31),
            audiencia="Base completa de sellers",
        )


def test_lista_aprobable_lee_la_vista_y_parametriza_filtros(fake_bq):
    now = datetime(2026, 10, 23, tzinfo=timezone.utc)
    fake_bq.responses = [[{
        "sp_item_id": 17,
        "titulo": "Fplus max",
        "proyecto": "Fplus max",
        "pais_codigo": "CL,PE",
        "sp_created_at": now,
        "sp_modified_at": now,
        "estado": "PENDIENTE",
    }]]

    result = PlannerService(fake_bq, SETTINGS).list_approval_requests(
        estado="PENDIENTE",
        pais_codigo="CL",
        proyecto="Fplus max",
        desde=date(2026, 10, 1),
        hasta=date(2026, 10, 31),
    )

    sql, params = fake_bq.queries[0]
    assert "test-project.planner_dataset.vw_planner_solicitudes" in sql
    assert "creado_por_email" not in sql and "decidido_por_email" not in sql
    assert "@pais_codigo" in sql and "@proyecto" in sql
    assert param_values(params, "estado") == "PENDIENTE"
    assert param_values(params, "pais_codigo") == "CL"
    assert param_values(params, "desde") == date(2026, 10, 1)
    assert result[0].sp_item_id == 17
    assert result[0].estado == "PENDIENTE"


def test_calendario_restringe_fecha_final_y_usa_fechas_parametrizadas(fake_bq):
    fake_bq.responses = [[]]
    desde, hasta = date(2026, 10, 1), date(2026, 10, 31)

    result = PlannerService(fake_bq, SETTINGS).list_calendar_requests(desde, hasta)

    sql, params = fake_bq.queries[0]
    assert result == []
    assert "fecha_calendario BETWEEN @desde AND @hasta" in sql
    assert param_values(params, "desde") == desde
    assert param_values(params, "hasta") == hasta


def test_filtros_descompone_paises_y_no_expone_correos(fake_bq):
    fake_bq.responses = [[
        {"pais_codigo": "CL,PE", "proyecto": "A", "area": "VAS", "responsable_nombre": "Ana", "prioridad": "ALTA", "estado": "PENDIENTE"},
        {"pais_codigo": "CO", "proyecto": "A", "area": "Comercial", "responsable_nombre": None, "prioridad": None, "estado": "AUTORIZADA"},
    ]]

    result = PlannerService(fake_bq, SETTINGS).get_approval_filter_options()

    assert result.pais_codigo == ["CL", "CO", "PE"]
    assert result.proyecto == ["A"]
    assert result.responsable_nombre == ["Ana"]
    assert result.prioridad == ["ALTA"]
    assert result.estado == ["PENDIENTE", "AUTORIZADA"]
    assert "creado_por_email" not in fake_bq.queries[0][0]


def test_autorizar_guarda_fecha_fuente_y_concurrencia_parametrizada(fake_bq):
    modified_at = datetime(2026, 10, 23, tzinfo=timezone.utc)
    requested_date = date(2026, 10, 31)
    fake_bq.responses = [[{
        "sp_item_id": 17,
        "decision_id": None,
        "fecha_publicacion": requested_date,
        "sp_modified_at": modified_at,
    }]]
    body = PlannerDecisionCreate(
        accion="AUTORIZAR",
        prioridad="ALTA",
        fecha_aprobada=date(2099, 1, 1),
        decision_esperada=None,
    )

    result = PlannerService(fake_bq, SETTINGS).create_decision(
        17, body, "planner.user@example.test"
    )

    sql, params = fake_bq.dml_queries[0]
    assert result.fecha_aprobada == requested_date
    assert result.estado == "AUTORIZADA"
    assert "INSERT INTO `test-project.planner_dataset.comunicaciones_decisiones_amplify`" in sql
    assert "@decision_esperada IS NOT DISTINCT FROM" in sql
    assert param_values(params, "fecha_aprobada") == requested_date
    assert param_values(params, "decidido_por_email") == "planner.user@example.test"
    assert param_values(params, "decision_anterior") is None


def test_reprogramar_exige_fecha_futura_y_motivo(fake_bq):
    fake_bq.responses = [[{
        "sp_item_id": 17,
        "decision_id": None,
        "fecha_publicacion": date(2026, 10, 31),
        "sp_modified_at": datetime(2026, 10, 23, tzinfo=timezone.utc),
    }]]
    body = PlannerDecisionCreate(
        accion="REPROGRAMAR",
        prioridad="MEDIA",
        fecha_aprobada=date(2020, 1, 1),
        motivo="Cambio solicitado",
        decision_esperada=None,
    )

    with pytest.raises(ValueError, match="anterior a hoy"):
        PlannerService(fake_bq, SETTINGS).create_decision(17, body, "planner.user@example.test")
    assert fake_bq.dml_queries == []


def test_decision_desactualizada_devuelve_conflicto_sin_insertar(fake_bq):
    fake_bq.responses = [[{
        "sp_item_id": 17,
        "decision_id": "decision-actual",
        "fecha_publicacion": date(2026, 10, 31),
        "sp_modified_at": datetime(2026, 10, 23, tzinfo=timezone.utc),
    }]]
    body = PlannerDecisionCreate(
        accion="AUTORIZAR",
        prioridad="ALTA",
        decision_esperada=None,
    )

    with pytest.raises(PlannerDecisionConflict):
        PlannerService(fake_bq, SETTINGS).create_decision(17, body, "planner.user@example.test")
    assert fake_bq.dml_queries == []


def test_historial_enmascara_el_correo_del_analista(fake_bq):
    fake_bq.responses = [
        [{"sp_item_id": 17}],
        [{
            "decision_id": "decision-1",
            "sp_item_id": 17,
            "accion": "AUTORIZAR",
            "prioridad": "ALTA",
            "fecha_solicitada": date(2026, 10, 31),
            "fecha_aprobada": date(2026, 10, 31),
            "motivo": None,
            "decidido_por_email": "planner.user@example.test",
            "decidido_at": datetime(2026, 10, 23, tzinfo=timezone.utc),
            "decision_anterior": None,
        }],
    ]

    history = PlannerService(fake_bq, SETTINGS).get_decision_history(17)

    assert history[0].decidido_por == "p•••@example.test"
    assert not hasattr(history[0], "decidido_por_email")
    with pytest.raises(ValueError):
        ManualSolicitudCreate(
            area="VAS",
            pais="Chile",
            accion="Modificación",
            tipo_comunicado="Otras",
            fecha_envio=date(2026, 10, 31),
            audiencia="Base completa de sellers",
        )
