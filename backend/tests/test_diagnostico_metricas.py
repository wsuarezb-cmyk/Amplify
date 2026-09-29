"""
Fase 3.1 — filtros, métricas y contexto del diagnóstico.

Las fórmulas deben coincidir con frontend/src/utils/aggregations.js y los
filtros con PitchDataContext.jsx: cada test documenta la regla replicada.
"""

import json

import pytest

from backend.services.diagnostico import filtros as F
from backend.services.diagnostico import metricas as M
from backend.services.diagnostico.contexto import ContextoInsuficiente, construir_contexto
from backend.services.pitch_reporting_service import _EXTRACTO_COLUMNS

COLS = _EXTRACTO_COLUMNS
COL = {c: i for i, c in enumerate(COLS)}


def interaccion(iid, criterios, *, fecha="2026-09-10", score=80.0, defectuosa=False,
                agente="ana@f.com", nombre="Ana Pérez", depto="GSC", pais="CO",
                tipo="EMAIL", tip1="Pagos", tip2="Liquidación", manager="lu@f.com"):
    """
    Filas de una interacción. criterios = [(id, resultado, categoria)].
    Marca es_primera_fila_interaccion en la primera fila y es_primera_fila_categoria
    en la primera fila evaluable (no N/A / NO_EVALUADO) de cada categoría, como la vista.
    """
    filas, vistas = [], set()
    err_cat = {}
    for _, res, cat in criterios:
        if res in ("CUMPLE", "NO_CUMPLE"):
            err_cat[cat] = err_cat.get(cat, False) or res == "NO_CUMPLE"
    for n, (cid, res, cat) in enumerate(criterios):
        evaluable = res in ("CUMPLE", "NO_CUMPLE")
        primera_cat = evaluable and cat not in vistas
        if primera_cat:
            vistas.add(cat)
        d = {c: None for c in COLS}
        d.update({
            "interaction_id": iid, "tipo_interaccion": tipo, "numero_caso": f"N{iid}",
            "pais": pais, "nombre_agente": nombre, "email_agente": agente, "departamento": depto,
            "nombre_manager": "Lucía", "email_manager": manager,
            "tipificacion_nivel_1": tip1, "tipificacion_nivel_2": tip2,
            "fecha_evaluacion": fecha, "score_interaccion": score, "es_defectuosa": defectuosa,
            "es_primera_fila_interaccion": n == 0, "es_primera_fila_categoria": primera_cat,
            "id_criterio": cid, "nombre_criterio": f"Criterio {cid}",
            "tipo_error": "NON_CRITICAL" if cat == "NON_CRITICAL" else "CRITICAL",
            "categoria_error": cat, "resultado": res, "mecanismo_evaluacion": "AUTO_IA",
            "tiene_error_en_categoria": err_cat.get(cat, False) if evaluable else None,
        })
        filas.append([d[c] for c in COLS])
    return filas


def _norm(**kw):
    base = {"fecha_start": "2026-09-01", "fecha_end": "2026-09-30"}
    base.update(kw)
    return F.normalizar(base)


# ── Normalización y período ─────────────────────────────────────────────────

def test_hash_no_depende_del_orden_ni_de_vacios():
    a = F.normalizar({"fecha_start": "2026-09-01", "fecha_end": "2026-09-30", "pais": ["CO", "CL", ""]})
    b = F.normalizar({"fecha_end": "2026-09-30", "fecha_start": "2026-09-01", "pais": ["CL", "CO", "CO"]})
    assert F.hash_filtros(a) == F.hash_filtros(b)
    assert F.hash_filtros(a) != F.hash_filtros(F.normalizar({**a, "pais": ["CO"]}))


@pytest.mark.parametrize("ini, fin, msg", [
    ("", "2026-09-30", "período"),
    ("2026-09-30", "2026-09-01", "anterior"),
    ("2026-01-01", "2026-09-30", "92"),
    ("01/09/2026", "2026-09-30", "formato"),
])
def test_validar_periodo_rechaza(ini, fin, msg):
    with pytest.raises(ValueError, match=msg):
        F.validar_periodo(F.normalizar({"fecha_start": ini, "fecha_end": fin}))


def test_validar_periodo_acepta_92_dias():
    F.validar_periodo(F.normalizar({"fecha_start": "2026-07-01", "fecha_end": "2026-09-30"}))


# ── Filtros (réplica de filteredRows / criterionRows) ───────────────────────

DATA = (
    interaccion("I1", [("C1", "CUMPLE", "ECU"), ("C2", "NO_CUMPLE", "ECN")], score=50.0, defectuosa=True)
    + interaccion("I2", [("C1", "CUMPLE", "ECU"), ("C3", "N/A", "ECU")], score=100.0, pais="CL")
    + interaccion("I3", [("C2", "CUMPLE", "ECN")], score=None, fecha="2026-08-15")
)


def test_filtro_de_fechas_como_texto():
    filtered, _ = F.aplicar(DATA, COL, _norm())
    assert {r[COL["interaction_id"]] for r in filtered} == {"I1", "I2"}


def test_filtro_por_criterio_conserva_toda_la_interaccion():
    filtered, criterion = F.aplicar(DATA, COL, _norm(id_criterio=["C2"]))
    # I1 tiene C2 → se conservan sus 2 filas; I2 no tiene C2
    assert [(r[COL["interaction_id"]], r[COL["id_criterio"]]) for r in filtered] == [("I1", "C1"), ("I1", "C2")]
    # criterionRows: solo la fila del criterio filtrado
    assert [r[COL["id_criterio"]] for r in criterion] == ["C2"]


def test_filtro_de_lista_por_pais():
    filtered, criterion = F.aplicar(DATA, COL, _norm(pais=["CL"]))
    assert {r[COL["interaction_id"]] for r in filtered} == {"I2"}
    assert criterion is filtered                  # sin filtro de criterio, son las mismas filas


# ── Métricas (réplica de aggregations.js) ───────────────────────────────────

def test_kpis_como_compute_kpis():
    k = M.kpis(DATA, COL)
    assert k["interacciones"] == 3
    assert k["calidad_ponderada"] == 75.0         # (50+100)/2: el score nulo de I3 no cuenta
    assert k["pct_defectuosas"] == pytest.approx(100 / 3)   # 1 de 3 (denominador: todas)
    # ECU: I1 y I2 sin error → 100%; ECN: I1 con error, I3 sin error → 50%
    acc = k["accuracy_por_categoria"]
    assert acc["ECU"] == {"total": 2, "con_error": 0, "pct_accuracy": 100.0}
    assert acc["ECN"] == {"total": 2, "con_error": 1, "pct_accuracy": 50.0}


def test_por_criterio_excluye_na_y_ordena_peor_primero():
    crit = M.por_criterio(DATA, COL)
    assert [c["id_criterio"] for c in crit] == ["C2", "C1"]     # C2: 50%, C1: 100%; C3 solo N/A → fuera
    assert crit[0]["total"] == 2 and crit[0]["pct_cumple"] == 50.0 and crit[0]["pct_no_cumple"] == 50.0


def test_por_dimension_nivel_interaccion():
    dims = {d["key"]: d for d in M.por_dimension(DATA, COL, "pais")}
    assert dims["CO"]["interacciones"] == 2 and dims["CO"]["calidad_ponderada"] == 50.0
    assert dims["CL"]["pct_defectuosas"] == 0.0


@pytest.mark.parametrize("calidad, esperado", [
    (90.8, "BUENO"), (90.0, "BUENO"), (89.9, "REGULAR"), (85.0, "REGULAR"), (84.9, "CRITICO"), (None, None),
])
def test_semaforo_del_diagnostico(calidad, esperado):
    assert M.semaforo(calidad) == esperado


def test_criterios_evaluados_por_tipo():
    data = (interaccion("E1", [("C1", "CUMPLE", "ECU"), ("C2", "NO_CUMPLE", "ECN"), ("C3", "N/A", "ECU")])
            + interaccion("R1", [("C8", "NO_CUMPLE", "ECN")], tipo="TASK_RECONTACT"))
    assert M.criterios_evaluados_por(data, COL, "tipo_interaccion") == {"EMAIL": 2, "TASK_RECONTACT": 1}


def test_filtro_de_correo_sin_distinguir_mayusculas():
    norm = _norm(email_agente=["Ana@Falabella.COM"])
    assert norm["email_agente"] == ["ana@falabella.com"]
    data = interaccion("I9", [("C1", "CUMPLE", "ECU")], agente="ana@falabella.com")
    filtered, _ = F.aplicar(data, COL, norm)
    assert len(filtered) == 1


def test_redondeo_half_up_no_bancario():
    assert M.redondear(2.25) == 2.3                # round() de Python daría 2.2
    assert M.redondear(66.66666) == 66.7
    assert M.redondear(None) is None


# ── Contexto ────────────────────────────────────────────────────────────────

def _muchas(n, **kw):
    filas = []
    for i in range(n):
        filas += interaccion(f"{kw.get('agente', 'x')}-{i}", [("C1", "CUMPLE" if i % 4 else "NO_CUMPLE", "ECU")], **kw)
    return filas


def test_contexto_insuficiente_bajo_20_interacciones():
    with pytest.raises(ContextoInsuficiente, match="20"):
        construir_contexto(COLS, _muchas(19), _norm())


def test_contexto_persona_con_referencias_de_equipo_y_operacion():
    data = (_muchas(25, agente="ana@f.com", nombre="Ana Pérez", depto="GSC")
            + _muchas(30, agente="beto@f.com", nombre="Beto", depto="GSC", score=60.0)
            + _muchas(30, agente="caro@f.com", nombre="Caro", depto="WEB", score=90.0))
    ctx = construir_contexto(COLS, data, _norm(email_agente=["ana@f.com"]))

    assert ctx["alcance"] == {"tipo": "PERSONA", "etiqueta": "Ana Pérez"}
    assert ctx["valoracion"] == "CRITICO"                          # calidad 80% (< 85) en el semáforo
    assert ctx["clusters"]["tipo_interaccion"][0]["criterios_evaluados"] == 1
    assert ctx["kpis"]["alcance"]["interacciones"] == 25
    assert ctx["kpis"]["equipo"]["nombre"] == "GSC"
    assert ctx["kpis"]["equipo"]["interacciones"] == 55
    assert ctx["kpis"]["operacion"]["interacciones"] == 85
    c1 = ctx["criterios"][0]
    assert {"pct_cumple", "pct_cumple_operacion", "pct_cumple_equipo"} <= set(c1)
    assert ctx["filtros"] == {"Agente": ["Ana Pérez"]}


def test_contexto_equipo_compara_agentes_sin_correos():
    data = _muchas(25, agente="ana@f.com", nombre="Ana", depto="GSC") + _muchas(25, agente="beto@f.com", nombre="Beto", depto="GSC")
    ctx = construir_contexto(COLS, data, _norm(departamento=["GSC"]))
    assert ctx["alcance"]["tipo"] == "EQUIPO"
    assert {a["label"] for a in ctx["clusters"]["agente"]} == {"Ana", "Beto"}
    assert "@" not in json.dumps(ctx, ensure_ascii=False)     # los correos nunca viajan a la IA


def test_contexto_general_y_redondeo():
    ctx = construir_contexto(COLS, _muchas(21, score=66.66666), _norm())
    assert ctx["alcance"]["tipo"] == "GENERAL"
    assert ctx["kpis"]["alcance"]["calidad_ponderada"] == 66.7
    assert "equipo" in ctx["clusters"] and "agente" not in ctx["clusters"]
    assert ctx["tendencia_semanal"][0]["semana"] == "2026-09-07"     # lunes de la semana del 10-09
