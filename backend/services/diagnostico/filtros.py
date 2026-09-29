"""
Filtros del diagnóstico — réplica exacta de filteredRows / criterionRows de
frontend/src/contexts/PitchDataContext.jsx, más normalización y hash para la
reutilización de reportes.

Las filas son listas posicionales del extracto columnar (ExtractoResponse):
no se hidratan a dicts para no multiplicar la memoria con ~250k filas.
"""

import hashlib
import json
from datetime import date

# Filtros de lista, en el mismo orden que EMPTY_FILTERS del frontend.
LIST_FILTERS = (
    "pais", "departamento", "tipo_interaccion", "id_criterio",
    "tipificacion_nivel_1", "tipificacion_nivel_2", "nombre_tipificacion",
    "email_agente", "email_manager", "mecanismo_evaluacion",
    "numero_caso", "interaction_id", "seller_code",
)
# Seleccionan interacciones (se conservan TODAS sus filas), no filas.
ROW_LEVEL_FILTERS = ("id_criterio", "mecanismo_evaluacion")
_INTERACTION_FILTERS = tuple(k for k in LIST_FILTERS if k not in ROW_LEVEL_FILTERS)
# Correos: se comparan sin distinguir mayúsculas (un correo escrito a mano con
# "@Falabella.com" debe encontrar al mismo agente). Única diferencia con el
# tablero, que compara exacto porque sus valores vienen de los propios datos.
CASE_INSENSITIVE_FILTERS = ("email_agente", "email_manager")

MAX_DIAS = 92


def normalizar(filtros: dict) -> dict:
    """Forma canónica: fechas como texto, listas sin vacíos/duplicados y ordenadas."""
    norm = {
        "fecha_start": (filtros.get("fecha_start") or "").strip(),
        "fecha_end":   (filtros.get("fecha_end") or "").strip(),
    }
    for k in LIST_FILTERS:
        valores = {str(v).strip() for v in (filtros.get(k) or []) if v is not None and str(v).strip()}
        if k in CASE_INSENSITIVE_FILTERS:
            valores = {v.lower() for v in valores}
        norm[k] = sorted(valores)
    return norm


def hash_filtros(norm: dict) -> str:
    """Clave de reutilización: mismos filtros normalizados ⇒ mismo hash."""
    canon = json.dumps(norm, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def validar_periodo(norm: dict) -> None:
    """Fechas obligatorias y rango acotado (mismo espíritu que el export CSV)."""
    if not norm["fecha_start"] or not norm["fecha_end"]:
        raise ValueError("Selecciona un período (fecha desde y hasta) para generar el diagnóstico.")
    try:
        d0 = date.fromisoformat(norm["fecha_start"])
        d1 = date.fromisoformat(norm["fecha_end"])
    except ValueError as exc:
        raise ValueError("Fechas inválidas: usa el formato AAAA-MM-DD.") from exc
    if d1 < d0:
        raise ValueError("La fecha hasta no puede ser anterior a la fecha desde.")
    if (d1 - d0).days + 1 > MAX_DIAS:
        raise ValueError(f"El período máximo del diagnóstico es de {MAX_DIAS} días.")


def aplicar(data: list[list], col: dict[str, int], norm: dict) -> tuple[list[list], list[list]]:
    """
    Retorna (filtered_rows, criterion_rows) con la misma semántica del tablero:
      - filtered_rows: nivel interacción; con filtros de criterio/mecanismo se
        conservan TODAS las filas de las interacciones que tienen alguna fila
        que matchea (para que KPIs de interacción y categoría no se trunquen).
      - criterion_rows: filtered_rows recortado a las filas del criterio/mecanismo.
    """
    f_start, f_end = norm["fecha_start"], norm["fecha_end"]
    i_fecha = col["fecha_evaluacion"]
    activos = [(col[k], set(norm[k])) for k in _INTERACTION_FILTERS
               if norm[k] and k not in CASE_INSENSITIVE_FILTERS]
    activos_ci = [(col[k], set(norm[k])) for k in CASE_INSENSITIVE_FILTERS if norm[k]]

    def pred(r) -> bool:
        fecha = r[i_fecha] or ""
        if f_start and fecha < f_start:
            return False
        if f_end and fecha > f_end:
            return False
        return (all(r[i] in valores for i, valores in activos)
                and all((r[i] or "").lower() in valores for i, valores in activos_ci))

    crit = set(norm["id_criterio"])
    mec = set(norm["mecanismo_evaluacion"])
    i_crit, i_mec, i_iid = col["id_criterio"], col["mecanismo_evaluacion"], col["interaction_id"]

    def match_fila(r) -> bool:
        return (not crit or r[i_crit] in crit) and (not mec or r[i_mec] in mec)

    base = [r for r in data if pred(r)]
    if not crit and not mec:
        return base, base

    ids = {r[i_iid] for r in base if match_fila(r)}
    filtered = [r for r in base if r[i_iid] in ids]
    return filtered, [r for r in filtered if match_fila(r)]


def solo_periodo(norm: dict) -> dict:
    """Mismos filtros de fecha y ninguno más: referencia 'total de la operación'."""
    ref = normalizar({})
    ref["fecha_start"], ref["fecha_end"] = norm["fecha_start"], norm["fecha_end"]
    return ref
