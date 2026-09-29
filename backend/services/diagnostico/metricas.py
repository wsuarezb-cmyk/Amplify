"""
Métricas del diagnóstico — réplica EXACTA de frontend/src/utils/aggregations.js
(computeKpis, byCriterion, byDimension), para que el reporte muestre las mismas
cifras que el tablero con los mismos filtros. Si cambia una fórmula allá, debe
cambiar aquí (y sus tests).

Filas = listas posicionales del extracto; `col` = índice de cada columna.
Grano: una fila por (interaction_id, id_criterio). Los campos de interacción se
cuentan una vez con es_primera_fila_interaccion; el accuracy por categoría con
es_primera_fila_categoria + tiene_error_en_categoria.
"""

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional


def redondear(x: Optional[float], decimales: int = 1) -> Optional[float]:
    """Redondeo 'half up' como toFixed de JS en la mayoría de los casos (no bancario)."""
    if x is None:
        return None
    q = Decimal(1).scaleb(-decimales)
    return float(Decimal(str(x)).quantize(q, rounding=ROUND_HALF_UP))


# Semáforo de la calidad ponderada (definido por Calidad): ≥90 Bueno, ≥85
# Regular, <85 Crítico — mismos umbrales que SCORE_THRESHOLDS en
# frontend/src/utils/scores.js. Cambiar en ambos lugares.
_SEMAFORO = ((90, "BUENO"), (85, "REGULAR"), (0, "CRITICO"))


def semaforo(calidad: Optional[float]) -> Optional[str]:
    if calidad is None:
        return None
    return next(etiqueta for umbral, etiqueta in _SEMAFORO if calidad >= umbral)


def criterios_evaluados_por(rows: list[list], col: dict[str, int], key: str) -> dict:
    """Cantidad de criterios distintos con CUMPLE/NO_CUMPLE por valor de `key`.
    Explica por qué la calidad ponderada es más extrema en tipos con pocos criterios."""
    i_key, i_id, i_res = col[key], col["id_criterio"], col["resultado"]
    mapa: dict = {}
    for r in rows:
        if r[i_res] in ("CUMPLE", "NO_CUMPLE") and r[i_id]:
            mapa.setdefault(r[i_key] if r[i_key] is not None else "(sin dato)", set()).add(r[i_id])
    return {k: len(v) for k, v in mapa.items()}


def kpis(rows: list[list], col: dict[str, int]) -> dict:
    """computeKpis: score ponderado, % defectuosas, volumen y accuracy por categoría."""
    i_pri, i_score, i_def = col["es_primera_fila_interaccion"], col["score_interaccion"], col["es_defectuosa"]
    i_pcat, i_cat, i_err = col["es_primera_fila_categoria"], col["categoria_error"], col["tiene_error_en_categoria"]

    n_inter = n_score = n_def = 0
    score_sum = 0.0
    cat: dict[str, list[int]] = {}      # categoria → [total, con_error]

    for r in rows:
        if r[i_pri]:
            n_inter += 1
            if r[i_score] is not None:
                score_sum += r[i_score]
                n_score += 1
            if r[i_def]:
                n_def += 1
        if r[i_pcat] and r[i_cat]:
            c = cat.setdefault(r[i_cat], [0, 0])
            c[0] += 1
            if r[i_err]:
                c[1] += 1

    return {
        "interacciones": n_inter,
        "calidad_ponderada": score_sum / n_score if n_score else None,
        "pct_defectuosas": n_def / n_inter * 100 if n_inter else None,
        "n_defectuosas": n_def,
        "accuracy_por_categoria": {
            k: {"total": t, "con_error": e, "pct_accuracy": (t - e) / t * 100 if t else None}
            for k, (t, e) in cat.items()
        },
    }


def por_criterio(rows: list[list], col: dict[str, int]) -> list[dict]:
    """byCriterion: base CUMPLE/NO_CUMPLE (N/A y NO_EVALUADO fuera), peor primero."""
    i_id, i_res = col["id_criterio"], col["resultado"]
    mapa: dict[str, dict] = {}
    for r in rows:
        cid = r[i_id]
        if not cid:
            continue
        c = mapa.get(cid)
        if c is None:
            c = mapa[cid] = {
                "id_criterio": cid,
                "nombre_criterio": r[col["nombre_criterio"]],
                "tipo_error": r[col["tipo_error"]],
                "categoria_error": r[col["categoria_error"]],
                "cumple": 0, "no_cumple": 0,
            }
        if r[i_res] == "CUMPLE":
            c["cumple"] += 1
        elif r[i_res] == "NO_CUMPLE":
            c["no_cumple"] += 1

    salida = []
    for c in mapa.values():
        base = c["cumple"] + c["no_cumple"]
        if base == 0:
            continue
        pct = c["cumple"] / base * 100
        salida.append({**c, "total": base, "pct_cumple": pct, "pct_no_cumple": 100 - pct})
    return sorted(salida, key=lambda c: c["pct_cumple"])     # sort estable, como JS


def por_dimension(rows: list[list], col: dict[str, int], key: str, label_key: Optional[str] = None) -> list[dict]:
    """byDimension: agrupador de nivel interacción (sin ordenar, como en JS)."""
    i_pri, i_score, i_def = col["es_primera_fila_interaccion"], col["score_interaccion"], col["es_defectuosa"]
    i_key = col[key]
    i_lab = col[label_key] if label_key else None
    mapa: dict = {}
    for r in rows:
        if not r[i_pri]:
            continue
        k = r[i_key] if r[i_key] is not None else "(sin dato)"
        d = mapa.get(k)
        if d is None:
            etiqueta = r[i_lab] if i_lab is not None and r[i_lab] is not None else k
            d = mapa[k] = {"key": k, "label": etiqueta, "n": 0, "score_sum": 0.0, "n_score": 0, "def": 0}
        d["n"] += 1
        if r[i_score] is not None:
            d["score_sum"] += r[i_score]
            d["n_score"] += 1
        if r[i_def]:
            d["def"] += 1
    return [
        {
            "key": d["key"],
            "label": d["label"],
            "interacciones": d["n"],
            "calidad_ponderada": d["score_sum"] / d["n_score"] if d["n_score"] else None,
            "pct_defectuosas": d["def"] / d["n"] * 100 if d["n"] else None,
        }
        for d in mapa.values()
    ]


def top_por_volumen(filas: list[dict], n: int) -> list[dict]:
    """Orden de las vistas del tablero (Comparativa, TipificacionDrill): volumen desc."""
    return sorted(filas, key=lambda d: d["interacciones"], reverse=True)[:n]


def por_semana(rows: list[list], col: dict[str, int]) -> list[dict]:
    """Tendencia semanal (lunes de cada semana) a nivel interacción — solo para la narrativa."""
    i_pri, i_fecha = col["es_primera_fila_interaccion"], col["fecha_evaluacion"]
    i_score, i_def = col["score_interaccion"], col["es_defectuosa"]
    mapa: dict[str, list] = {}
    for r in rows:
        if not r[i_pri] or not r[i_fecha]:
            continue
        d = date.fromisoformat(r[i_fecha][:10])
        semana = (d - timedelta(days=d.weekday())).isoformat()
        s = mapa.setdefault(semana, [0, 0.0, 0, 0])       # n, score_sum, n_score, def
        s[0] += 1
        if r[i_score] is not None:
            s[1] += r[i_score]
            s[2] += 1
        if r[i_def]:
            s[3] += 1
    return [
        {
            "semana": k,
            "interacciones": n,
            "calidad_ponderada": ss / ns if ns else None,
            "pct_defectuosas": d / n * 100 if n else None,
        }
        for k, (n, ss, ns, d) in sorted(mapa.items())
    ]
