"""
Contexto de datos del diagnóstico: todo lo que el reporte muestra en tablas y
lo que la IA recibe como evidencia cuantitativa. Puro (sin BQ ni IA): recibe
el extracto columnar y los filtros normalizados.

Incluye referencias para que el feedback sea individualizado y comparable:
  - operación: mismos filtros de período, sin ningún otro filtro;
  - equipo (solo alcance PERSONA): el departamento del agente en el período.
"""

from collections import Counter

from backend.services.diagnostico import filtros as F
from backend.services.diagnostico import metricas as M

MIN_INTERACCIONES = 20
TOP_CLUSTERS = 10
TOP_AGENTES = 15

# Etiquetas legibles de los filtros (sin correos: se reemplazan por nombres).
_ETIQUETA_FILTRO = {
    "pais": "País", "departamento": "Equipo", "tipo_interaccion": "Tipo de interacción",
    "id_criterio": "Criterio", "tipificacion_nivel_1": "Tipificación N1",
    "tipificacion_nivel_2": "Tipificación N2", "nombre_tipificacion": "Tipificación N3",
    "email_agente": "Agente", "email_manager": "Manager",
    "mecanismo_evaluacion": "Mecanismo", "numero_caso": "N° de caso",
    "interaction_id": "ID de interacción", "seller_code": "Seller",
}


class ContextoInsuficiente(ValueError):
    """El alcance filtrado no tiene volumen suficiente para un diagnóstico útil."""


def _nombres(data: list[list], col: dict[str, int], email_key: str, nombre_key: str, emails: list[str]) -> dict:
    """email (normalizado en minúsculas) → nombre, buscando en el extracto (los correos no viajan a la IA)."""
    pendientes, i_e, i_n = set(emails), col[email_key], col[nombre_key]
    salida: dict[str, str] = {}
    for r in data:
        if not pendientes:
            break
        email = (r[i_e] or "").lower()
        if email in pendientes and r[i_n]:
            salida[email] = r[i_n]
            pendientes.discard(email)
    return salida


def detectar_alcance(norm: dict, nombres_agente: dict, nombres_manager: dict) -> dict:
    """PERSONA si filtra un único agente; EQUIPO si filtra agentes, equipos o managers; si no, GENERAL."""
    agentes, equipos, managers = norm["email_agente"], norm["departamento"], norm["email_manager"]
    if len(agentes) == 1:
        return {"tipo": "PERSONA", "etiqueta": nombres_agente.get(agentes[0], "Agente")}
    if agentes or equipos or managers:
        partes = []
        if equipos:
            partes.append("Equipo " + ", ".join(equipos))
        if managers:
            partes.append("Manager " + ", ".join(nombres_manager.get(m, "—") for m in managers))
        if agentes:
            partes.append(f"{len(agentes)} agentes")
        return {"tipo": "EQUIPO", "etiqueta": " · ".join(partes)}
    paises = norm["pais"]
    return {"tipo": "GENERAL", "etiqueta": "Operación" + (f" {', '.join(paises)}" if paises else "")}


def _filtros_legibles(norm: dict, nombres_agente: dict, nombres_manager: dict) -> dict:
    salida = {}
    for k in F.LIST_FILTERS:
        valores = norm[k]
        if not valores:
            continue
        if k == "email_agente":
            valores = [nombres_agente.get(v, "Agente") for v in valores]
        elif k == "email_manager":
            valores = [nombres_manager.get(v, "Manager") for v in valores]
        salida[_ETIQUETA_FILTRO[k]] = valores
    return salida


def _con_referencia(criterios: list[dict], **referencias: list[dict]) -> list[dict]:
    """Agrega a cada criterio el % de cumplimiento de las referencias (operación, equipo)."""
    mapas = {nombre: {c["id_criterio"]: c["pct_cumple"] for c in lista} for nombre, lista in referencias.items()}
    return [
        {**c, **{f"pct_cumple_{nombre}": mapa.get(c["id_criterio"]) for nombre, mapa in mapas.items()}}
        for c in criterios
    ]


def _redondear(obj):
    if isinstance(obj, float):
        return M.redondear(obj)
    if isinstance(obj, dict):
        return {k: _redondear(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_redondear(v) for v in obj]
    return obj


def construir_contexto(columns: list[str], data: list[list], norm: dict) -> dict:
    """Arma el contexto completo. Lanza ContextoInsuficiente si hay poco volumen."""
    col = {c: i for i, c in enumerate(columns)}
    filtered, criterion = F.aplicar(data, col, norm)
    k_alcance = M.kpis(filtered, col)
    if k_alcance["interacciones"] < MIN_INTERACCIONES:
        raise ContextoInsuficiente(
            f"Con estos filtros hay {k_alcance['interacciones']} interacciones evaluadas; "
            f"se necesitan al menos {MIN_INTERACCIONES} para un diagnóstico confiable. "
            "Amplía el período o los filtros."
        )

    nombres_agente = _nombres(data, col, "email_agente", "nombre_agente", norm["email_agente"])
    nombres_manager = _nombres(data, col, "email_manager", "nombre_manager", norm["email_manager"])
    alcance = detectar_alcance(norm, nombres_agente, nombres_manager)

    # Referencia de la operación: mismo período, sin otros filtros
    operacion, _ = F.aplicar(data, col, F.solo_periodo(norm))
    criterios_op = M.por_criterio(operacion, col)
    kpis = {"alcance": k_alcance, "operacion": M.kpis(operacion, col)}
    referencias = {"operacion": criterios_op}

    n_criterios = M.criterios_evaluados_por(filtered, col, "tipo_interaccion")
    tipos = M.top_por_volumen(M.por_dimension(filtered, col, "tipo_interaccion"), TOP_CLUSTERS)
    for t in tipos:
        t["criterios_evaluados"] = n_criterios.get(t["key"], 0)
    clusters = {
        "pais": M.top_por_volumen(M.por_dimension(filtered, col, "pais"), TOP_CLUSTERS),
        "tipo_interaccion": tipos,
    }

    if alcance["tipo"] == "PERSONA":
        # Equipo de referencia: el departamento más frecuente del agente en el período
        i_dep = col["departamento"]
        equipo = Counter(r[i_dep] for r in filtered if r[i_dep]).most_common(1)
        if equipo:
            nombre_equipo = equipo[0][0]
            filas_equipo = [r for r in operacion if r[i_dep] == nombre_equipo]
            kpis["equipo"] = {**M.kpis(filas_equipo, col), "nombre": nombre_equipo}
            referencias["equipo"] = M.por_criterio(filas_equipo, col)
    else:
        clusters["equipo"] = M.top_por_volumen(M.por_dimension(filtered, col, "departamento"), TOP_CLUSTERS)
        if alcance["tipo"] == "EQUIPO":
            clusters["agente"] = M.top_por_volumen(
                M.por_dimension(filtered, col, "email_agente", "nombre_agente"), TOP_AGENTES,
            )
            for a in clusters["agente"]:
                a.pop("key")                      # sin correos: solo el nombre (label)

    contexto = {
        "alcance": alcance,
        # Calculada en código con el semáforo del tablero: la IA no la decide.
        "valoracion": M.semaforo(k_alcance["calidad_ponderada"]),
        "periodo": {"desde": norm["fecha_start"], "hasta": norm["fecha_end"]},
        "filtros": _filtros_legibles(norm, nombres_agente, nombres_manager),
        "kpis": kpis,
        "criterios": _con_referencia(M.por_criterio(criterion, col), **referencias),
        "clusters": clusters,
        "procesos": {
            "tipificacion_nivel_1": M.top_por_volumen(M.por_dimension(filtered, col, "tipificacion_nivel_1"), 8),
            "tipificacion_nivel_2": M.top_por_volumen(M.por_dimension(filtered, col, "tipificacion_nivel_2"), TOP_CLUSTERS),
        },
        "tendencia_semanal": M.por_semana(filtered, col),
    }
    return _redondear(contexto)
