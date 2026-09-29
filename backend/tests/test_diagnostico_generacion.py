"""Fase 3.2 — muestras, prompt, render y orquestación del diagnóstico (IA y BQ falsas)."""

import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.connectors.genai_connector import GenAIAuthError, GenAIError, GenAIResultado
from backend.routers.pitch_diagnostico import _http_error
from backend.services.diagnostico import filtros as F
from backend.services.diagnostico.contexto import construir_contexto
from backend.services.diagnostico.muestras import obtener_muestras
from backend.services.diagnostico.prompt import (
    LIMITES, DiagnosticoIA, acotar, construir_user_prompt,
)
from backend.services.diagnostico.render import render_html
from backend.services.diagnostico.service import DiagnosticoService, FeatureNoConfigurada
from backend.tests.conftest import FakeBQ, param_values
from backend.tests.test_diagnostico_metricas import COLS, _muchas, _norm


def _diag(**over) -> DiagnosticoIA:
    base = {
        "resumen_ejecutivo": [f"Punto {i}" for i in range(7)],
        "comentario_indicadores": "Indicadores estables.",
        "comentario_clusters": "CO concentra el volumen.",
        "comentario_criterios": "C1 es el criterio más débil.",
        "hallazgos": [{"titulo": "Motivo mal elegido", "descripcion": "d", "evidencia": "e",
                       "causa_probable": "c", "casos_ejemplo": ["N1", "INVENTADO"]}],
        "reconocimientos": [{"titulo": "Buen trato", "descripcion": "d", "evidencia": "e"}],
        "oportunidades": [{"titulo": "o", "descripcion": "d", "criterio_o_proceso": "C1",
                           "impacto": "ALTO", "frecuencia": "MEDIA"}],
        "plan_accion": [{"accion": "a", "criterio_o_proceso": "C1", "indicador": "% cumplimiento C1",
                         "meta": "90%", "plazo": "30 días", "responsable": "LIDER"}],
        "conclusiones": "Conclusión.",
    }
    base.update(over)
    return DiagnosticoIA.model_validate(base)


def _contexto_persona():
    data = _muchas(25, agente="ana@f.com", nombre="Ana Pérez", depto="GSC") + _muchas(25, agente="b@f.com", nombre="Beto", depto="GSC")
    return construir_contexto(COLS, data, _norm(email_agente=["ana@f.com"])), data


# ── Muestras ────────────────────────────────────────────────────────────────

def test_muestras_filtran_como_reporteria_y_reparten_por_criterio():
    bq = FakeBQ([[]])
    obtener_muestras(bq, F.normalizar({"fecha_start": "2026-09-01", "fecha_end": "2026-09-30",
                                       "email_agente": ["ana@f.com"], "id_criterio": ["C1"]}))
    sql, params = bq.queries[0]
    assert "resultado IN ('CUMPLE', 'NO_CUMPLE')" in sql
    assert "LOWER(email_agente) IN UNNEST(@f_email_agente)" in sql
    assert "id_criterio IN UNNEST(@f_id_criterio)" in sql
    assert "PARTITION BY resultado, id_criterio ORDER BY RAND()" in sql
    assert param_values(params, "f_email_agente") == ["ana@f.com"]
    assert param_values(params, "pais") is None                 # filtros vacíos no se envían


def test_muestras_correo_sin_distinguir_mayusculas():
    bq = FakeBQ([[]])
    obtener_muestras(bq, F.normalizar({"fecha_start": "2026-09-01", "fecha_end": "2026-09-30",
                                       "email_agente": ["Ana@Falabella.com"]}))
    sql, params = bq.queries[0]
    assert "LOWER(email_agente) IN UNNEST(@f_email_agente)" in sql
    assert param_values(params, "f_email_agente") == ["ana@falabella.com"]


# ── Prompt ──────────────────────────────────────────────────────────────────

def test_user_prompt_incluye_alcance_tono_y_datos():
    ctx, _ = _contexto_persona()
    prompt = construir_user_prompt(ctx, [{"numero_caso": "N1", "observacion_saaca": "Motivo incorrecto"}])
    assert "PERSONA — Ana Pérez" in prompt
    assert "FEEDBACK 1:1" in prompt
    assert '"calidad_ponderada"' in prompt and "Motivo incorrecto" in prompt
    assert "@" not in prompt                                    # sin correos hacia la IA
    assert "Valoración general (semáforo de calidad ponderada): CRITICO" in prompt


def test_instrucciones_explican_indicadores_y_sesgo_de_ejemplos():
    from backend.services.diagnostico.prompt import SYSTEM_INSTRUCTION
    for texto in ("Calidad ponderada", "criterios_evaluados", "% Defectuosas",
                  "Accuracy por categoría", "No indican frecuencia", "2 puntos porcentuales"):
        assert texto in SYSTEM_INSTRUCTION
    assert "valoracion_general" not in DiagnosticoIA.model_fields         # la decide el código


def test_acotar_limita_listas_y_descarta_casos_inventados():
    d = acotar(_diag(), casos_validos={"N1"})
    assert len(d.resumen_ejecutivo) == LIMITES["resumen_ejecutivo"]
    assert d.hallazgos[0].casos_ejemplo == ["N1"]


def test_schema_es_estricto_compatible():
    schema = DiagnosticoIA.model_json_schema()
    assert set(schema["required"]) == set(DiagnosticoIA.model_fields)   # todo requerido


# ── Render ──────────────────────────────────────────────────────────────────

def _html(diag=None, ctx=None):
    ctx = ctx or _contexto_persona()[0]
    return render_html(ctx, diag or acotar(_diag(), {"N1"}), n_muestras=40, modelo="gemini-x",
                       prompt_version="diag-v1", generado_en=datetime(2026, 9, 28, tzinfo=timezone.utc),
                       generado_por="ana@f.com")


def test_render_tablas_desde_el_contexto():
    ctx, _ = _contexto_persona()
    html = _html(ctx=ctx)
    assert "Diagnóstico de calidad — Ana Pérez" in html
    assert f"{ctx['kpis']['alcance']['calidad_ponderada']:.1f}%" in html
    assert "Equipo GSC" in html                                 # columna de referencia de equipo
    assert "Crítico" in html and "Caso N1" in html               # semáforo: 80% (< 85) → Crítico


def test_render_escapa_texto_de_la_ia():
    html = _html(diag=_diag(conclusiones="<script>alert(1)</script>"))
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


# ── Servicio (orquestación) ─────────────────────────────────────────────────

class FakeGenAI:
    model = "gemini-x"

    def __init__(self, diag=None, error=None):
        self.diag, self.error, self.llamadas = diag or _diag(), error, []

    def generar(self, system, user, schema, **kw):
        self.llamadas.append((system, user, schema))
        if self.error:
            raise self.error
        return GenAIResultado(parsed=self.diag, texto="{}", prompt_tokens=20000, output_tokens=3000)


def _servicio(genai=None, jwt="x"):
    _, data = _contexto_persona()
    extracto = SimpleNamespace(columns=COLS, data=data)
    bq = FakeBQ([[{"numero_caso": "N1", "observacion_saaca": "obs", "resultado": "NO_CUMPLE"}]])
    settings = SimpleNamespace(KAIROS_JWT=jwt, DIAGNOSTICO_CUOTA_MENSUAL=5)
    return DiagnosticoService(bq, settings, genai=genai, extracto_fn=lambda: extracto)


def test_generar_html_flujo_completo():
    ia = FakeGenAI()
    html, meta = _servicio(ia).generar_html(
        {"fecha_start": "2026-09-01", "fecha_end": "2026-09-30", "email_agente": ["ana@f.com"]}, usuario="ana@f.com",
    )
    assert "<!doctype html>" in html and "Caso N1" in html
    assert meta["alcance"]["tipo"] == "PERSONA" and meta["n_interacciones"] == 25
    assert meta["n_muestras"] == 1 and meta["prompt_version"] == "diag-v2"
    assert meta["costo_estimado_usd"] == pytest.approx(20000 / 1e6 * 0.30 + 3000 / 1e6 * 2.50)
    assert len(meta["filtros_hash"]) == 64
    assert ia.llamadas[0][2] is DiagnosticoIA


def test_sin_jwt_la_feature_no_esta_configurada():
    with pytest.raises(FeatureNoConfigurada):
        _servicio(genai=None, jwt="").generar_html({"fecha_start": "2026-09-01", "fecha_end": "2026-09-30"})


def test_periodo_invalido_no_llama_a_la_ia():
    ia = FakeGenAI()
    with pytest.raises(ValueError):
        _servicio(ia).generar_html({"fecha_start": "", "fecha_end": ""})
    assert ia.llamadas == []


# ── Traducción de errores HTTP ──────────────────────────────────────────────

@pytest.mark.parametrize("exc, status", [
    (FeatureNoConfigurada("x"), 503),
    (GenAIAuthError("x"), 503),
    (GenAIError("x"), 502),
    (ValueError("x"), 422),
    (RuntimeError("x"), 500),
])
def test_errores_http(exc, status):
    assert _http_error(exc).status_code == status
