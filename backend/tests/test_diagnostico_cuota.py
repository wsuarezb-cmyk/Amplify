"""Fase 3.3 — cuota mensual y registro de diagnósticos (sin almacenamiento de archivos)."""

from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from backend.connectors.genai_connector import GenAIError
from backend.routers.pitch_diagnostico import nombre_archivo
from backend.services.diagnostico.repositorio import RepositorioDiagnosticos, inicio_de_mes
from backend.services.diagnostico.service import CuotaAgotada, DiagnosticoService
from backend.tests.conftest import FakeBQ, param_values
from backend.tests.test_diagnostico_generacion import FakeGenAI
from backend.tests.test_diagnostico_metricas import COLS, _muchas

FILTROS = {"fecha_start": "2026-09-01", "fecha_end": "2026-09-30", "email_agente": ["ana@f.com"]}


class FakeRepo:
    def __init__(self, usados=0, falla_registro=False):
        self.usados, self.falla_registro, self.registros = usados, falla_registro, []

    def usados_en_mes(self, email, ahora=None):
        return self.usados

    def registrar(self, **kw):
        if self.falla_registro:
            raise RuntimeError("BQ caído")
        self.registros.append(kw)
        return "id"


def _svc(repo, ia=None, limite=5):
    data = _muchas(25, agente="ana@f.com", nombre="Ana")
    bq = FakeBQ([[{"numero_caso": "N1", "observacion_saaca": "obs", "resultado": "NO_CUMPLE"}]])
    return DiagnosticoService(
        bq, SimpleNamespace(KAIROS_JWT="x", DIAGNOSTICO_CUOTA_MENSUAL=limite),
        genai=ia or FakeGenAI(), extracto_fn=lambda: SimpleNamespace(columns=COLS, data=data),
        repositorio=repo,
    )


# ── Cuota ───────────────────────────────────────────────────────────────────

def test_cuota_usuario_y_admin():
    svc = _svc(FakeRepo(usados=2))
    assert svc.cuota("ana@f.com", es_admin=False) == {"limite": 5, "usados": 2, "restantes": 3, "ilimitada": False}
    assert svc.cuota("ana@f.com", es_admin=True)["ilimitada"] is True


def test_cuota_agotada_no_llama_a_la_ia_ni_registra():
    repo, ia = FakeRepo(usados=5), FakeGenAI()
    with pytest.raises(CuotaAgotada, match="5"):
        _svc(repo, ia).generar_para_usuario(FILTROS, "ana@f.com", es_admin=False)
    assert ia.llamadas == [] and repo.registros == []


def test_admin_sin_limite():
    repo = FakeRepo(usados=99)
    html, _ = _svc(repo).generar_para_usuario(FILTROS, "admin@f.com", es_admin=True)
    assert "<!doctype html>" in html
    assert repo.registros[0]["status"] == "OK"


# ── Registro ────────────────────────────────────────────────────────────────

def test_ok_se_registra_con_metadatos():
    repo = FakeRepo()
    _, meta = _svc(repo).generar_para_usuario(FILTROS, "ana@f.com", es_admin=False)
    reg = repo.registros[0]
    assert reg["status"] == "OK" and reg["email"] == "ana@f.com"
    assert reg["meta"]["prompt_tokens"] == 20000 and reg["norm"]["email_agente"] == ["ana@f.com"]


def test_fallo_de_ia_se_registra_como_error_y_se_propaga():
    repo = FakeRepo()
    with pytest.raises(GenAIError):
        _svc(repo, FakeGenAI(error=GenAIError("timeout"))).generar_para_usuario(FILTROS, "ana@f.com", False)
    assert repo.registros[0]["status"] == "ERROR"
    assert "timeout" in repo.registros[0]["error"]


def test_error_del_usuario_no_se_registra():
    repo = FakeRepo()
    with pytest.raises(ValueError):
        _svc(repo).generar_para_usuario({**FILTROS, "email_agente": ["nadie@f.com"]}, "ana@f.com", False)
    assert repo.registros == []                   # 0 interacciones: no consume ni registra


def test_si_falla_el_registro_igual_se_entrega_el_diagnostico():
    html, _ = _svc(FakeRepo(falla_registro=True)).generar_para_usuario(FILTROS, "ana@f.com", False)
    assert "<!doctype html>" in html


# ── Repositorio (SQL y fila) ────────────────────────────────────────────────

def test_usados_en_mes_cuenta_solo_ok_desde_el_dia_1():
    bq = FakeBQ([[{"n": 3}]])
    n = RepositorioDiagnosticos(bq).usados_en_mes("Ana@F.com", ahora=datetime(2026, 9, 28, 15, tzinfo=timezone.utc))
    sql, params = bq.queries[0]
    assert n == 3
    assert "status = 'OK'" in sql and "LOWER(created_by) = LOWER(@email)" in sql
    assert param_values(params, "desde") == datetime(2026, 9, 1, tzinfo=timezone.utc)


def test_inicio_de_mes():
    assert inicio_de_mes(datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc)) == datetime(2026, 12, 1, tzinfo=timezone.utc)


def test_registrar_arma_la_fila():
    bq = FakeBQ()
    norm = {"fecha_start": "2026-09-01", "fecha_end": "2026-09-30", "pais": ["CO"]}
    RepositorioDiagnosticos(bq).registrar(
        email="ana@f.com", status="ERROR", norm=norm, error="x" * 2000,
        creado_en=datetime(2026, 9, 28, tzinfo=timezone.utc),
    )
    tabla, filas = bq.inserts[0]
    fila = filas[0]
    assert tabla == "proj.ds.pitch_diagnosticos_ia"
    assert fila["status"] == "ERROR" and len(fila["error_message"]) == 1000
    assert fila["fecha_start"] == date(2026, 9, 1)
    assert "gcs_path" not in fila and "expires_at" not in fila       # sin almacenamiento


def test_nombre_de_archivo_seguro():
    meta = {"alcance": {"etiqueta": "Equipo FRONT OFFICE · Manager Lucía"},
            "filtros_norm": {"fecha_start": "2026-09-01", "fecha_end": "2026-09-30"}}
    assert nombre_archivo(meta) == "diagnostico_equipo-front-office-manager-luc-a_2026-09-01_2026-09-30.html"
