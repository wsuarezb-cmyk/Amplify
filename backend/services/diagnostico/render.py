"""
Render del diagnóstico: HTML autocontenido e imprimible (Ctrl+P → PDF).

  - Tablas y cifras: SIEMPRE desde el contexto calculado (contexto.py).
  - Narrativa: desde DiagnosticoIA, escapada (la IA no puede inyectar HTML).
Estilo con los colores/tipografías del design system de Pitch, embebido.
"""

from datetime import datetime
from html import escape
from typing import Optional

from backend.services.diagnostico.prompt import DiagnosticoIA

_CATEGORIAS = [
    ("ECU", "Accuracy ECU (seller)"), ("ECN", "Accuracy ECN (negocio)"),
    ("ECC", "Accuracy ECC (cumplimiento)"), ("NON_CRITICAL", "Accuracy no crítico"),
]
_CLUSTERS = [
    ("pais", "País"), ("equipo", "Equipo"), ("tipo_interaccion", "Tipo de interacción"), ("agente", "Agente"),
]
# Semáforo del tablero (metricas.semaforo): etiqueta, color, fondo
_VALORACION = {
    "BUENO": ("Bueno", "#1B7F3B", "#E6F4EA"),
    "REGULAR": ("Regular", "#9A5B00", "#FFF4E0"),
    "CRITICO": ("Crítico", "#B3261E", "#FDECEA"),
    None: ("Sin dato", "#616161", "#F1F1F1"),
}
_RESPONSABLE = {"AGENTE": "Agente", "LIDER": "Líder", "CALIDAD": "Calidad"}

_CSS = """
:root{--p:#E97132;--pd:#B8541F;--pl:#FDF0E8;--fg:#1A1A1A;--mu:#616161;--bd:#E0E0E0;--bg:#FAFAFA}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 Inter,Arial,sans-serif}
.page{max-width:960px;margin:0 auto;padding:32px 40px;background:#fff}
h1{font:800 26px Montserrat,Arial,sans-serif;margin:0 0 4px}h2{font:700 18px Montserrat,Arial,sans-serif;
margin:32px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--p)}h3{font-size:15px;margin:14px 0 4px}
.meta{color:var(--mu);font-size:13px}.aviso{background:var(--pl);border-left:4px solid var(--p);padding:10px 14px;
margin:16px 0;font-size:13px}.badge{display:inline-block;padding:3px 12px;border-radius:999px;font-weight:700;font-size:13px}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:13px}th{text-align:left;background:var(--bg);
color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:7px 8px;border-bottom:1px solid var(--bd)}
td{padding:6px 8px;border-bottom:1px solid #F0F0F0;vertical-align:top}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bar{height:8px;background:#EEE;border-radius:4px;min-width:90px}.bar i{display:block;height:8px;border-radius:4px;background:var(--p)}
.card{border:1px solid var(--bd);border-radius:8px;padding:12px 14px;margin:10px 0}.card p{margin:4px 0}
.lbl{color:var(--mu);font-size:12px;font-weight:600}.tag{display:inline-block;background:#F1F1F1;border-radius:4px;
padding:1px 7px;font-size:11px;margin-right:4px}.coment{color:#333;margin:8px 0 4px}ul{margin:6px 0;padding-left:20px}
footer{margin-top:36px;color:var(--mu);font-size:12px;border-top:1px solid var(--bd);padding-top:10px}
@media print{body{background:#fff}.page{padding:0;max-width:none}h2{break-after:avoid}.card,tr{break-inside:avoid}}
"""


def _e(x) -> str:
    return escape("" if x is None else str(x))


def _pct(x: Optional[float]) -> str:
    return "—" if x is None else f"{x:.1f}%"


def _num(x: Optional[int]) -> str:
    return "—" if x is None else f"{x:,}".replace(",", ".")


def _tabla(encabezados: list[str], filas: list[list[str]], numericas: set[int] = frozenset()) -> str:
    th = "".join(f"<th>{_e(h)}</th>" for h in encabezados)
    trs = "".join(
        "<tr>" + "".join(f'<td class="n">{c}</td>' if i in numericas else f"<td>{c}</td>"
                         for i, c in enumerate(fila)) + "</tr>"
        for fila in filas
    )
    return f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"


def _bloque_kpis(kpis: dict) -> str:
    columnas = [("alcance", "Alcance")]
    if "equipo" in kpis:
        columnas.append(("equipo", f"Equipo {kpis['equipo'].get('nombre', '')}".strip()))
    columnas.append(("operacion", "Operación"))

    def fila(etiqueta, valor):
        return [_e(etiqueta)] + [valor(kpis[k]) for k, _ in columnas]

    filas = [
        fila("Interacciones evaluadas", lambda k: _num(k["interacciones"])),
        fila("Calidad ponderada", lambda k: _pct(k["calidad_ponderada"])),
        fila("% Defectuosas", lambda k: _pct(k["pct_defectuosas"])),
    ]
    for cat, etiqueta in _CATEGORIAS:
        if any(cat in kpis[k]["accuracy_por_categoria"] for k, _ in columnas):
            filas.append(fila(etiqueta, lambda k, c=cat: _pct(k["accuracy_por_categoria"].get(c, {}).get("pct_accuracy"))))
    return _tabla(["Indicador"] + [n for _, n in columnas], filas, set(range(1, len(columnas) + 1)))


def _bloque_dimension(filas: list[dict]) -> str:
    con_criterios = bool(filas) and "criterios_evaluados" in filas[0]
    encabezados = ["", "Interacciones", "Calidad ponderada", "% Defectuosas"]
    if con_criterios:
        encabezados.append("Criterios evaluados")
    return _tabla(
        encabezados,
        [[_e(d["label"]), _num(d["interacciones"]), _pct(d["calidad_ponderada"]), _pct(d["pct_defectuosas"])]
         + ([_num(d["criterios_evaluados"])] if con_criterios else [])
         for d in filas],
        {1, 2, 3, 4},
    )


def _bloque_criterios(criterios: list[dict], con_equipo: bool) -> str:
    encabezados = ["Criterio", "Tipo", "Evaluaciones", "% Cumplimiento", "", "Operación"]
    if con_equipo:
        encabezados.append("Equipo")
    filas = []
    for c in criterios:
        pct = c["pct_cumple"] or 0
        fila = [
            f"<b>{_e(c['id_criterio'])}</b> {_e(c['nombre_criterio'])}",
            _e("Crítico" if c["tipo_error"] == "CRITICAL" else "No crítico"),
            _num(c["total"]), _pct(c["pct_cumple"]),
            f'<div class="bar"><i style="width:{max(0.0, min(pct, 100.0)):.1f}%"></i></div>',
            _pct(c.get("pct_cumple_operacion")),
        ]
        if con_equipo:
            fila.append(_pct(c.get("pct_cumple_equipo")))
        filas.append(fila)
    return _tabla(encabezados, filas, {2, 3, 5, 6})


def _lista(items: list[str]) -> str:
    return "<ul>" + "".join(f"<li>{_e(i)}</li>" for i in items) + "</ul>"


def render_html(
    contexto: dict, diag: DiagnosticoIA, *, n_muestras: int, modelo: str,
    prompt_version: str, generado_en: datetime, generado_por: Optional[str] = None,
) -> str:
    alcance, periodo, kpis = contexto["alcance"], contexto["periodo"], contexto["kpis"]
    etiqueta_val, color_val, fondo_val = _VALORACION.get(contexto.get("valoracion"), _VALORACION[None])
    filtros = "; ".join(f"{_e(k)}: {_e(', '.join(v))}" for k, v in contexto["filtros"].items()) or "Sin filtros adicionales"
    titulo = f"Diagnóstico de calidad — {alcance['etiqueta']}"

    partes = [
        f"<h1>{_e(titulo)}</h1>",
        f'<div class="meta">Período {_e(periodo["desde"])} a {_e(periodo["hasta"])} · '
        f'{_num(kpis["alcance"]["interacciones"])} interacciones evaluadas · Filtros: {filtros}</div>',
        '<div class="aviso">Generado con IA a partir de evaluaciones automáticas de SAACA. Las cifras '
        "se calculan con las mismas fórmulas del tablero de Pitch; los textos son interpretación de la IA "
        "y deben revisarse con criterio antes de compartirlos.</div>",

        "<h2>1. Resumen ejecutivo</h2>",
        f'<p>Calidad ponderada: <span class="badge" style="color:{color_val};background:{fondo_val}">'
        f"{_e(etiqueta_val)}</span> <span class=\"meta\">(semáforo: 90% o más Bueno, "
        "85% a 90% Regular, menos de 85% Crítico)</span></p>",
        _lista(diag.resumen_ejecutivo),

        "<h2>2. Indicadores clave</h2>",
        _bloque_kpis(kpis),
        f'<p class="coment">{_e(diag.comentario_indicadores)}</p>',

        "<h2>3. Desempeño por clusters</h2>",
    ]
    for key, etiqueta in _CLUSTERS:
        filas = contexto["clusters"].get(key)
        if filas:
            partes += [f"<h3>{_e(etiqueta)}</h3>", _bloque_dimension(filas)]
    partes.append(f'<p class="coment">{_e(diag.comentario_clusters)}</p>')

    partes += [
        "<h2>4. Cumplimiento por criterio</h2>",
        '<p class="meta">De menor a mayor cumplimiento. Base: evaluaciones CUMPLE / NO CUMPLE.</p>',
        _bloque_criterios(contexto["criterios"], "equipo" in kpis),
        f'<p class="coment">{_e(diag.comentario_criterios)}</p>',

        "<h2>5. Procesos más gestionados</h2>",
        "<h3>Tipificación N2</h3>", _bloque_dimension(contexto["procesos"]["tipificacion_nivel_2"]),
        "<h3>Tipificación N1</h3>", _bloque_dimension(contexto["procesos"]["tipificacion_nivel_1"]),

        "<h2>6. Hallazgos cualitativos</h2>",
    ]
    for h in diag.hallazgos:
        casos = "".join(f'<span class="tag">Caso {_e(c)}</span>' for c in h.casos_ejemplo)
        partes.append(
            f'<div class="card"><h3>{_e(h.titulo)}</h3><p>{_e(h.descripcion)}</p>'
            f'<p><span class="lbl">Evidencia:</span> {_e(h.evidencia)}</p>'
            f'<p><span class="lbl">Causa probable:</span> {_e(h.causa_probable)}</p>'
            + (f"<p>{casos}</p>" if casos else "") + "</div>"
        )

    partes.append("<h2>7. Reconocimientos</h2>")
    for r in diag.reconocimientos:
        partes.append(
            f'<div class="card"><h3>{_e(r.titulo)}</h3><p>{_e(r.descripcion)}</p>'
            f'<p><span class="lbl">Evidencia:</span> {_e(r.evidencia)}</p></div>'
        )

    partes += [
        "<h2>8. Oportunidades de mejora</h2>",
        _tabla(
            ["Oportunidad", "Criterio / proceso", "Impacto", "Frecuencia"],
            [[f"<b>{_e(o.titulo)}</b><br>{_e(o.descripcion)}", _e(o.criterio_o_proceso),
              _e(o.impacto.capitalize()), _e(o.frecuencia.capitalize())] for o in diag.oportunidades],
        ),
        "<h2>9. Plan de acción</h2>",
        _tabla(
            ["Acción", "Criterio / proceso", "Indicador", "Meta", "Plazo", "Responsable"],
            [[_e(a.accion), _e(a.criterio_o_proceso), _e(a.indicador), _e(a.meta), _e(a.plazo),
              _e(_RESPONSABLE[a.responsable])] for a in diag.plan_accion],
        ),
        "<h2>10. Conclusiones</h2>",
        f"<p>{_e(diag.conclusiones)}</p>",

        "<h2>Nota metodológica</h2>",
        "<p class=\"meta\">Calidad ponderada: promedio del score ponderado de cada interacción "
        "(criterios N/A y NO EVALUADO excluidos); en tipos de interacción con pocos criterios evaluados "
        "cada interacción queda cerca de 0% o 100%, por lo que sus valores son más extremos. "
        "% Defectuosas: interacciones con al menos un criterio "
        "crítico NO CUMPLE sobre el total. Accuracy por categoría: interacciones sin error en la categoría. "
        "Operación: todas las interacciones del mismo período, sin otros filtros"
        + ("; Equipo: el equipo del agente en el período" if "equipo" in kpis else "")
        + f". Hallazgos cualitativos basados en {n_muestras} evaluaciones de ejemplo elegidas al azar.</p>",

        "<h2>Anexo: tendencia semanal</h2>",
        _tabla(
            ["Semana (lunes)", "Interacciones", "Calidad ponderada", "% Defectuosas"],
            [[_e(s["semana"]), _num(s["interacciones"]), _pct(s["calidad_ponderada"]), _pct(s["pct_defectuosas"])]
             for s in contexto["tendencia_semanal"]],
            {1, 2, 3},
        ),
        f"<footer>Pitch · generado el {generado_en.strftime('%d/%m/%Y %H:%M')} UTC"
        + (f" por {_e(generado_por)}" if generado_por else "")
        + f" · modelo {_e(modelo)} · prompt {_e(prompt_version)}</footer>",
    ]

    return (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{_e(titulo)}</title>"
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Montserrat:wght@700;800&display=swap" rel="stylesheet">'
        f"<style>{_CSS}</style></head><body><div class=\"page\">{''.join(partes)}</div></body></html>"
    )
