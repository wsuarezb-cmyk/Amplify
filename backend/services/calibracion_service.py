"""
CalibracionService — módulo de Calibración de Pitch.

Responsabilidades:
  - Bandeja del auditor (pitch_muestra_calibracion, aislamiento por email)
  - Generación de muestra estratificada con fórmula de Cochran (spec 6.2/6.3)
  - Evaluación en dos pasos: voto a ciegas → revisión frente a SAACA →
    voto final con escritura dual (spec 3.4)
  - Descarte con motivo obligatorio
  - Comparación AUTO vs HUMANO post-submit (vw_pitch_calibracion_comparativa)

Regla DML del proyecto: nunca streaming insert — insert_rows_dml (Load Job)
para poder hacer SELECT/UPDATE inmediato sin el streaming buffer de BQ.
"""

import logging
import math
import random
import time
import uuid
from datetime import date as _date
from datetime import datetime, timedelta, timezone

from google.cloud.bigquery import ArrayQueryParameter, ScalarQueryParameter

from backend.connectors.bigquery_connector import BigQueryConnector
from backend.models.pitch import (
    AnularBatchResponse,
    AsignacionAuditor,
    BatchListResponse,
    BatchResumen,
    CalibracionAuditorProgreso,
    CalibracionCriterioAsignado,
    CalibracionDashboardResponse,
    CalibracionInboxItem,
    CalibracionInboxResponse,
    ComparacionCriterio,
    ComparacionResponse,
    ConfirmarRequest,
    ConfirmarResponse,
    DescartarResponse,
    EstratoPreview,
    EvaluarRequest,
    EvaluarResponse,
    GenerarMuestraRequest,
    GenerarMuestraResponse,
    MuestraPreviewResponse,
    RevisionCriterio,
    RevisionResponse,
)

logger = logging.getLogger(__name__)

_MUESTRA_TABLE  = "pitch_muestra_calibracion"
_ENRICHED_TABLE = "pitch_eval_enriched"
_EVAL_TABLE     = "saaca_eval_detail"
_CRITERIA_TABLE = "saaca_cat_criteria"
_COMPARATIVA_VIEW = "vw_pitch_calibracion_comparativa"

# ── Parámetros de la fórmula de Cochran (spec 6.2, márgenes actualizados) ───
# Defaults acordados: Z al 95% de confianza, p conservador. Ajustables como
# parámetro si el equipo de procesos define otro estándar — no tocar la fórmula.
_Z = 1.96
_P = 0.5
_MARGEN_POR_CRITICIDAD = {"CRITICAL": 0.10, "NON_CRITICAL": 0.15}

# Tolerancia del resultado final respecto a capacidad_objetivo (regla ±10%).
_TOLERANCIA_CAPACIDAD = 0.10

# Ventana de re-elegibilidad de descartes: un DESCARTADO vuelve a calificar
# después de 90 días (spec — corrección confirmada).
_DIAS_EXCLUSION_DESCARTE = 90

# Ventana por defecto del mini dashboard de seguimiento (Improvement 1).
_DASHBOARD_DIAS_DEFAULT = 30

_ESTADOS_ACTIVOS = ("PENDIENTE", "EN_PROGRESO", "COMPLETADO")

# Universo de calibración: solo veredictos de SAACA comparables con un humano
# (el auditor dictamina únicamente CUMPLE/NO_CUMPLE) y solo de mecanismos
# automáticos. Filtro positivo: cualquier valor nuevo queda fuera por defecto.
_RESULTADOS_COMPARABLES = ("CUMPLE", "NO_CUMPLE")
_MECANISMOS_SAACA = ("AUTO_IA", "AUTO_IA_RAG")

# Observación mínima cuando es obligatoria (mismo umbral que el motivo de descarte).
_MIN_OBSERVACION = 5


def _validar_conjunto(asignados: set[str], enviados: set[str]) -> None:
    """Los criterios enviados deben ser exactamente los asignados en ese paso."""
    if enviados == asignados:
        return
    partes = []
    faltan = asignados - enviados
    extras = enviados - asignados
    if faltan:
        partes.append(f"faltan criterios asignados: {sorted(faltan)}")
    if extras:
        partes.append(f"criterios no asignados: {sorted(extras)}")
    raise ValueError("Evaluación incompleta — " + "; ".join(partes))


def requiere_observacion(resultado_ciego: str | None, resultado_saaca: str | None, resultado_final: str) -> bool:
    """
    La observación es obligatoria cuando hay desacuerdo: el voto final difiere
    del veredicto de SAACA, o el auditor cambió su voto tras ver a SAACA.
    """
    return resultado_final != resultado_saaca or resultado_final != resultado_ciego


def validar_confirmacion(revision: dict[str, "RevisionCriterio"], finales: list) -> None:
    """Rechaza la confirmación si falta la observación en algún criterio con desacuerdo."""
    faltantes = []
    for ev in finales:
        c = revision[ev.criterion_id]
        if requiere_observacion(c.resultado_ciego, c.resultado_saaca, ev.result_label):
            if len((ev.observation or "").strip()) < _MIN_OBSERVACION:
                faltantes.append(ev.criterion_id)
    if faltantes:
        raise ValueError(
            "La observación es obligatoria (mínimo "
            f"{_MIN_OBSERVACION} caracteres) cuando tu voto final difiere de SAACA "
            f"o cambiaste tu voto: {sorted(faltantes)}"
        )


def _catalogo_canonico(criteria_table: str) -> str:
    """
    Subconsulta con UNA fila por criterion_id.

    saaca_cat_criteria versiona los criterios (criteria_version, valid_from,
    valid_to, is_active): un JOIN directo duplica las filas de los criterios
    reactivados — C0007 y C0008 tienen v1 inactiva + v2 activa (diagnóstico
    sprint 2026-10), origen del "1/2" en la bandeja. Prioriza la versión activa
    y vigente; si no hay, la de mayor versión, para seguir mostrando nombre y
    descripción de criterios ya desactivados.
    """
    return f"""(
      SELECT * FROM `{criteria_table}`
      WHERE TRUE
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY criterion_id
        ORDER BY
          (is_active AND (valid_to IS NULL OR valid_to >= CURRENT_DATE())) DESC,
          criteria_version DESC,
          updated_at DESC
      ) = 1
    )"""


def agrupar_inbox(rows: list[dict]) -> CalibracionInboxResponse:
    """
    Agrupa las filas de la muestra (una por interaction × criterio) en items
    por interacción, con estado agregado y totales.

    Deduplica por muestra_id como salvaguarda: si algún JOIN aguas arriba
    llegara a multiplicar filas, el auditor igual ve cada criterio una sola vez.
    """
    items: dict[str, CalibracionInboxItem] = {}
    vistos: set[str] = set()
    total_asignados = 0
    total_completados = 0
    total_descartados = 0

    for r in rows:
        if r["muestra_id"] in vistos:
            continue
        vistos.add(r["muestra_id"])
        total_asignados += 1

        if r["estado"] == "COMPLETADO":
            total_completados += 1
        elif r["estado"] == "DESCARTADO":
            total_descartados += 1

        item = items.get(r["interaction_id"])
        if item is None:
            item = CalibracionInboxItem(
                interaction_id=r["interaction_id"],
                interaction_type=r["interaction_type"],
                pais=r.get("pais"),
                numero_caso=r.get("numero_caso"),
                nombre_agente=r.get("nombre_agente"),
                departamento=r.get("departamento"),
                fecha_asignacion=r.get("fecha_asignacion"),
                batch_id=r.get("batch_id"),
                estado="PENDIENTE",
            )
            items[r["interaction_id"]] = item
        item.criterios.append(CalibracionCriterioAsignado(
            muestra_id=r["muestra_id"],
            criterion_id=r["criterion_id"],
            criterion_name=r.get("criterion_name"),
            criterion_description=r.get("criterion_description"),
            error_type=r.get("error_type"),
            estado=r["estado"],
        ))

    for item in items.values():
        estados = {c.estado for c in item.criterios}
        if "PENDIENTE" in estados:
            item.estado = "PENDIENTE"          # falta el voto a ciegas
        elif "EN_PROGRESO" in estados:
            item.estado = "EN_PROGRESO"        # votó a ciegas, falta confirmar frente a SAACA
        elif estados <= {"COMPLETADO"}:
            item.estado = "COMPLETADO"
        elif estados <= {"DESCARTADO"}:
            item.estado = "DESCARTADO"
        elif estados <= {"COMPLETADO", "DESCARTADO"}:
            item.estado = "COMPLETADO"
        else:
            item.estado = "PENDIENTE"

    return CalibracionInboxResponse(
        items=list(items.values()),
        total_asignados=total_asignados,
        total_completados=total_completados,
        total_descartados=total_descartados,
    )


def _fmt_fecha(dt) -> str:
    """Formatea un TIMESTAMP de BigQuery para mensajes al usuario (UTC)."""
    return dt.strftime("%d/%m/%Y a las %H:%M") if dt else "una fecha anterior"


def cochran_n(poblacion: int, margen_error: float, z: float = _Z, p: float = _P) -> int:
    """
    Tamaño de muestra de Cochran con corrección para población finita.

        n0 = (Z² · p · (1-p)) / e²
        n  = n0 / (1 + (n0 - 1) / N)

    En el flujo de dos pasos este valor es INFORMATIVO (tamaño ideal de
    referencia); la asignación real la define asignar_capacidad().
    """
    if poblacion <= 0:
        return 0
    n0 = (z ** 2 * p * (1 - p)) / (margen_error ** 2)
    n = n0 / (1 + (n0 - 1) / poblacion)
    return min(poblacion, max(1, math.ceil(n)))


def asignar_capacidad(estratos: list[dict], capacidad: int) -> dict[str, int]:
    """
    Reparte capacidad_objetivo entre estratos (función pura, determinista).

    estratos: [{"key": str, "criticidad": "CRITICAL"|"NON_CRITICAL", "N": int}]
    Retorna {key: cantidad_asignada}.

    Reglas (ajuste de diseño confirmado):
      a) Piso mínimo por estrato activo: min(1, N).
      b) Si los pisos CRITICAL exceden la capacidad → priorizar CRITICAL por
         N descendente hasta agotar; NON_CRITICAL quedan en 0 esta ronda.
      c) Si alcanza para todo el piso CRITICAL → cubrirlo, luego mismo
         criterio (piso, prioridad por N) para NON_CRITICAL con lo restante.
      d) Sobrante tras los pisos → reparto proporcional al N de cada estrato,
         con N como tope (nunca asignar más que la población real).
      e) Resultado dentro de ±10% de la capacidad; si excede, recortar
         empezando por la parte proporcional (no los pisos) de estratos
         NON_CRITICAL con mayor cantidad asignada.
    """
    asignado: dict[str, int] = {e["key"]: 0 for e in estratos}
    pisos: dict[str, int] = {}
    if capacidad <= 0 or not estratos:
        return asignado

    criticos     = sorted((e for e in estratos if e["criticidad"] == "CRITICAL"),
                          key=lambda e: e["N"], reverse=True)
    no_criticos  = sorted((e for e in estratos if e["criticidad"] != "CRITICAL"),
                          key=lambda e: e["N"], reverse=True)

    restante = capacidad

    # ── a+b+c: pisos con prioridad CRITICAL → NON_CRITICAL, por N desc ──
    for grupo in (criticos, no_criticos):
        for e in grupo:
            if restante <= 0:
                break
            piso = min(1, e["N"])
            if piso > 0:
                asignado[e["key"]] = piso
                pisos[e["key"]] = piso
                restante -= piso

    # ── d: reparto proporcional al N, con tope N ─────────────────────────
    if restante > 0:
        # Largest-remainder con tope: cuotas proporcionales, redondeo hacia
        # abajo, y las unidades restantes a los mayores residuos con headroom.
        candidatos = [e for e in estratos if asignado[e["key"]] < e["N"]]
        while restante > 0 and candidatos:
            total_n = sum(e["N"] for e in candidatos)
            cuotas = []
            usado = 0
            for e in candidatos:
                headroom = e["N"] - asignado[e["key"]]
                exacto = restante * e["N"] / total_n
                base = min(headroom, int(exacto))
                cuotas.append((e, base, exacto - int(exacto)))
                usado += base
            for e, base, _ in cuotas:
                asignado[e["key"]] += base
            restante -= usado
            # Unidades sueltas del redondeo → mayores residuos con headroom
            if restante > 0:
                con_headroom = sorted(
                    (c for c in cuotas if asignado[c[0]["key"]] < c[0]["N"]),
                    key=lambda c: c[2], reverse=True,
                )
                if not con_headroom:
                    break  # toda la población está asignada — no hay más que repartir
                for e, _, _ in con_headroom:
                    if restante <= 0:
                        break
                    asignado[e["key"]] += 1
                    restante -= 1
            candidatos = [e for e in candidatos if asignado[e["key"]] < e["N"]]

    # ── e: recorte si el total excede capacidad +10% ─────────────────────
    # (Con el método exacto de arriba el total nunca supera la capacidad;
    #  esta salvaguarda mantiene la regla explícita del diseño.)
    limite = math.floor(capacidad * (1 + _TOLERANCIA_CAPACIDAD))
    exceso = sum(asignado.values()) - limite
    if exceso > 0:
        recortables = sorted(
            (e for e in no_criticos if asignado[e["key"]] > pisos.get(e["key"], 0)),
            key=lambda e: asignado[e["key"]], reverse=True,
        )
        for e in recortables:
            if exceso <= 0:
                break
            recorte = min(exceso, asignado[e["key"]] - pisos.get(e["key"], 0))
            asignado[e["key"]] -= recorte
            exceso -= recorte

    return asignado


class CalibracionService:

    def __init__(self, bq: BigQueryConnector) -> None:
        self.bq = bq

    def _t(self, name: str) -> str:
        return self.bq.full_table_id(name)

    # ─────────────────────────────────────────────────────────────
    # Bandeja del auditor
    # ─────────────────────────────────────────────────────────────

    def get_inbox(self, auditor_email: str) -> CalibracionInboxResponse:
        """
        Interacciones asignadas al auditor, agrupadas por interaction_id.
        Nombre, descripción y criticidad del criterio vienen del catálogo
        canónico (una fila por criterio); el contexto del caso (numero_caso,
        agente) se resuelve desde pitch_eval_enriched.

        Las filas ANULADO se excluyen: son trabajo anulado (por el líder o
        por corrección de sistema) y no deben aparecer en la bandeja — una
        interacción cuyos criterios quedaron todos anulados desaparece.
        """
        muestra  = self._t(_MUESTRA_TABLE)
        enriched = self._t(_ENRICHED_TABLE)
        criteria = self._t(_CRITERIA_TABLE)

        rows = self.bq.query(
            f"""
            SELECT
              m.muestra_id, m.batch_id, m.interaction_id, m.interaction_type,
              m.pais, m.criterion_id, m.estado,
              CAST(m.fecha_asignacion AS STRING) AS fecha_asignacion,
              c.criterion_name, c.criterion_description, c.error_type,
              e.numero_caso, e.nombre_agente, e.departamento
            FROM `{muestra}` m
            LEFT JOIN {_catalogo_canonico(criteria)} c ON c.criterion_id = m.criterion_id
            LEFT JOIN (
              SELECT interaction_id,
                     ANY_VALUE(numero_caso)   AS numero_caso,
                     ANY_VALUE(nombre_agente) AS nombre_agente,
                     ANY_VALUE(departamento)  AS departamento
              FROM `{enriched}`
              GROUP BY interaction_id
            ) e ON e.interaction_id = m.interaction_id
            WHERE LOWER(TRIM(m.auditor_email)) = LOWER(TRIM(@email))
              AND m.estado != 'ANULADO'
            ORDER BY m.fecha_asignacion DESC, m.interaction_id, m.criterion_id
            """,
            [ScalarQueryParameter("email", "STRING", auditor_email)],
            timeout_s=30,
        )
        return agrupar_inbox(rows)

    # ─────────────────────────────────────────────────────────────
    # Población elegible + Cochran (spec 6.2 / 6.3)
    # ─────────────────────────────────────────────────────────────

    def _poblacion_elegible(self, fecha_start: str, fecha_end: str) -> list[dict]:
        """
        Unidades (interaction_id, criterion_id) elegibles para calibración.

        Solo entran veredictos de SAACA comparables con un humano
        (_RESULTADOS_COMPARABLES) emitidos por un mecanismo automático
        (_MECANISMOS_SAACA), y una sola fila por (interaction_id, criterio):
        si pitch_eval_enriched trae más de una, gana la evaluación más reciente.

        Triple exclusión (corrección confirmada):
          (a) pitch_muestra_calibracion: estados activos sin límite temporal,
              y DESCARTADO solo dentro de los últimos 90 días.
          (b) saaca_eval_detail con mechanism='HUMANO' — evaluaciones humanas
              históricas que no pasaron por la tabla de muestra.
          (c) criterio activo en el catálogo (is_active del catálogo, además
              del mapping) — salvaguarda ante desfases catálogo/mapping.

        Nota: el estado ANULADO NO se filtra en ningún WHERE a propósito —
        una unidad anulada vuelve al pool elegible de inmediato (diseño
        confirmado; equivale a la ausencia de fila del diseño anterior).
        """
        enriched = self._t(_ENRICHED_TABLE)
        muestra  = self._t(_MUESTRA_TABLE)
        eval_t   = self._t(_EVAL_TABLE)
        criteria = self._t(_CRITERIA_TABLE)

        sql = f"""
        SELECT
          e.interaction_id,
          e.tipo_interaccion,
          e.pais,
          e.id_criterio,
          e.mecanismo_evaluacion,
          e.resultado,
          e.tipo_error
        FROM `{enriched}` e
        WHERE e.fecha_evaluacion BETWEEN @fecha_start AND @fecha_end
          -- Solo veredictos reales de SAACA: N/A, NO_EVALUADO o cualquier
          -- otro valor no son comparables con un humano y NUNCA entran.
          AND e.resultado IN UNNEST(@resultados_comparables)
          AND e.mecanismo_evaluacion IN UNNEST(@mecanismos_saaca)
          -- Criterio activo y vigente en alguna versión del catálogo. EXISTS
          -- (no JOIN) para no multiplicar filas con criterios versionados.
          AND EXISTS (
            SELECT 1 FROM `{criteria}` c
            WHERE c.criterion_id = e.id_criterio
              AND c.is_active = TRUE
              AND (c.valid_to IS NULL OR c.valid_to >= CURRENT_DATE())
          )
          AND NOT EXISTS (
            SELECT 1 FROM `{muestra}` m
            WHERE m.interaction_id = e.interaction_id
              AND m.criterion_id = e.id_criterio
              AND (
                m.estado IN UNNEST(@estados_activos)
                OR (m.estado = 'DESCARTADO'
                    AND m.fecha_descarte >= TIMESTAMP_SUB(
                          CURRENT_TIMESTAMP(), INTERVAL {_DIAS_EXCLUSION_DESCARTE} DAY))
              )
          )
          AND NOT EXISTS (
            SELECT 1 FROM `{eval_t}` h
            WHERE h.interaction_id = e.interaction_id
              AND h.criterion_id = e.id_criterio
              AND h.mechanism = 'HUMANO'
          )
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY e.interaction_id, e.id_criterio
          ORDER BY e.fecha_hora_evaluacion DESC
        ) = 1
        """
        params = [
            ScalarQueryParameter("fecha_start", "DATE", _date.fromisoformat(fecha_start)),
            ScalarQueryParameter("fecha_end",   "DATE", _date.fromisoformat(fecha_end)),
            ArrayQueryParameter("estados_activos", "STRING", list(_ESTADOS_ACTIVOS)),
            ArrayQueryParameter("resultados_comparables", "STRING", list(_RESULTADOS_COMPARABLES)),
            ArrayQueryParameter("mecanismos_saaca", "STRING", list(_MECANISMOS_SAACA)),
        ]
        return self.bq.query(sql, params, timeout_s=30)

    @staticmethod
    def _estratificar(poblacion: list[dict]) -> dict[str, dict]:
        """Agrupa la población por estrato criterio×mecanismo×resultado×país."""
        estratos: dict[str, dict] = {}
        for r in poblacion:
            key = f"{r['id_criterio']}|{r['mecanismo_evaluacion']}|{r['resultado']}|{r['pais']}"
            e = estratos.get(key)
            if e is None:
                criticidad = r["tipo_error"] if r["tipo_error"] in _MARGEN_POR_CRITICIDAD else "NON_CRITICAL"
                e = {"criticidad": criticidad, "unidades": []}
                estratos[key] = e
            estratos[key]["unidades"].append(r)
        return estratos

    def _cobertura(self, asignado: int, ideal: int) -> str:
        """
        Clasificación de cobertura de un estrato respecto a su n ideal de
        Cochran: COMPLETA si alcanza el ideal, PARCIAL si recibe algo menor,
        SIN_COBERTURA si queda en cero.
        """
        if asignado <= 0:
            return "SIN_COBERTURA"
        return "COMPLETA" if asignado >= ideal else "PARCIAL"

    def _calcular_asignacion(self, fecha_start: str, fecha_end: str, capacidad: int | None):
        """
        Base compartida de preview y generar: población elegible, estratos,
        n ideal de Cochran por estrato y (si hay capacidad) la asignación real.

        Retorna (estratos_dict, detalle: list[EstratoPreview], total_ideal, asignacion|None)
        """
        poblacion = self._poblacion_elegible(fecha_start, fecha_end)
        estratos = self._estratificar(poblacion)

        base = [
            {"key": key, "criticidad": e["criticidad"], "N": len(e["unidades"])}
            for key, e in estratos.items()
        ]
        ideales = {
            b["key"]: cochran_n(b["N"], _MARGEN_POR_CRITICIDAD[b["criticidad"]])
            for b in base
        }
        total_ideal = sum(ideales.values())

        asignacion = asignar_capacidad(base, capacidad) if capacidad is not None else None

        detalle = []
        for b in sorted(base, key=lambda x: x["key"]):
            key = b["key"]
            asignado = asignacion.get(key) if asignacion is not None else None
            detalle.append(EstratoPreview(
                estrato=key,
                criticidad=b["criticidad"],
                margen_error=_MARGEN_POR_CRITICIDAD[b["criticidad"]],
                poblacion=b["N"],
                muestra_ideal=ideales[key],
                asignado=asignado,
                cobertura=self._cobertura(asignado, ideales[key]) if asignado is not None else None,
            ))

        return estratos, detalle, total_ideal, asignacion

    def preview_muestra(
        self, fecha_start: str, fecha_end: str, capacidad_objetivo: int | None = None,
    ) -> MuestraPreviewResponse:
        """
        Paso informativo — no inserta nada.

        Sin capacidad_objetivo: población y tamaño ideal de Cochran (referencia).
        Con capacidad_objetivo: además, la asignación real por estrato y el
        desglose de cobertura COMPLETA/PARCIAL/SIN_COBERTURA por criticidad,
        para que el líder decida antes de confirmar.
        """
        _, detalle, total_ideal, asignacion = self._calcular_asignacion(
            fecha_start, fecha_end, capacidad_objetivo,
        )

        cobertura_resumen = None
        total_asignado = None
        if asignacion is not None:
            total_asignado = sum(asignacion.values())
            cobertura_resumen = {
                "CRITICAL":     {"COMPLETA": 0, "PARCIAL": 0, "SIN_COBERTURA": 0},
                "NON_CRITICAL": {"COMPLETA": 0, "PARCIAL": 0, "SIN_COBERTURA": 0},
            }
            for e in detalle:
                grupo = e.criticidad if e.criticidad in cobertura_resumen else "NON_CRITICAL"
                cobertura_resumen[grupo][e.cobertura] += 1

        return MuestraPreviewResponse(
            fecha_start=fecha_start,
            fecha_end=fecha_end,
            total_poblacion=sum(e.poblacion for e in detalle),
            total_muestra_ideal=total_ideal,
            capacidad_objetivo=capacidad_objetivo,
            total_asignado=total_asignado,
            cobertura_resumen=cobertura_resumen,
            estratos=detalle,
        )

    def generar_muestra(self, request: GenerarMuestraRequest, generado_por: str) -> GenerarMuestraResponse:
        """
        Confirmación del preview: recalcula la asignación por capacidad,
        selecciona al azar dentro de cada estrato según los números calculados
        y asigna a los auditores según la distribución configurada.
        Inserta vía Load Job (nunca streaming).
        """
        estratos, _, _, asignacion = self._calcular_asignacion(
            request.fecha_start, request.fecha_end, request.capacidad_objetivo,
        )
        if not estratos:
            raise ValueError(
                "No hay población elegible en el rango indicado "
                "(revisa fechas y exclusiones de muestra/evaluaciones humanas previas)."
            )

        seleccion: list[dict] = []
        for key, e in estratos.items():
            n = asignacion.get(key, 0)
            if n <= 0:
                continue
            margen = _MARGEN_POR_CRITICIDAD[e["criticidad"]]
            elegidas = random.sample(e["unidades"], n)
            for u in elegidas:
                seleccion.append({
                    **u,
                    "estrato": key,
                    "criticidad": e["criticidad"],
                    "margen_error": margen,
                })

        total_muestra = len(seleccion)
        if total_muestra == 0:
            raise ValueError("La asignación por capacidad resultó vacía — revisa capacidad_objetivo.")

        total_distribucion = sum(a.cantidad for a in request.distribucion)
        if total_distribucion != total_muestra:
            raise ValueError(
                f"La distribución por auditor suma {total_distribucion} pero la "
                f"asignación calculada es de {total_muestra} unidades. "
                "Ajusta las cantidades (usa el preview con esta capacidad para ver el total)."
            )

        # Barajar la selección para que la asignación secuencial por auditor
        # no concentre estratos en una sola persona.
        random.shuffle(seleccion)

        batch_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        rows: list[dict] = []
        por_auditor: dict[str, int] = {}

        idx = 0
        for reparto in request.distribucion:
            por_auditor[reparto.auditor_email] = reparto.cantidad
            for u in seleccion[idx: idx + reparto.cantidad]:
                rows.append({
                    "muestra_id":              str(uuid.uuid4()),
                    "batch_id":                batch_id,
                    "interaction_id":          u["interaction_id"],
                    "interaction_type":        u["tipo_interaccion"],
                    "criterion_id":            u["id_criterio"],
                    "pais":                    u["pais"],
                    "mecanismo_auto_snapshot": u["mecanismo_evaluacion"],
                    "resultado_auto_snapshot": u["resultado"],
                    "estrato":                 u["estrato"],
                    "criticidad":              u["criticidad"],
                    "margen_error_objetivo":   u["margen_error"],
                    "auditor_email":           reparto.auditor_email,
                    "fecha_asignacion":        now,
                    "estado":                  "PENDIENTE",
                    "fecha_completado":        None,
                    "motivo_descarte":         None,
                    "descartado_por":          None,
                    "fecha_descarte":          None,
                    "anulado_por":             None,
                    "fecha_anulacion":         None,
                    "_fecha_generacion":       now,
                })
            idx += reparto.cantidad

        # La respuesta se construye ANTES del insert: después del Load Job no
        # queda ninguna lógica que pueda fallar dentro del proceso. Si aún así
        # el response no llega al cliente (red/timeout), el batch_id ya quedó
        # en los logs y es visible/anulable vía list_batches / anular_batch —
        # nunca requiere limpieza manual en BQ.
        respuesta = GenerarMuestraResponse(
            batch_id=batch_id,
            total_insertados=len(rows),
            total_estratos=sum(1 for n in asignacion.values() if n > 0),
            por_auditor=por_auditor,
        )

        logger.info(
            "Generando muestra de calibración: batch=%s, unidades=%d, capacidad=%d, por=%s",
            batch_id, len(rows), request.capacidad_objetivo, generado_por,
        )
        self.bq.insert_rows_dml(self._t(_MUESTRA_TABLE), rows)
        logger.info("Muestra de calibración insertada OK: batch=%s", batch_id)

        return respuesta

    # ─────────────────────────────────────────────────────────────
    # Batches: detección y recuperación (sin intervención manual en BQ)
    # ─────────────────────────────────────────────────────────────

    def list_batches(self, limit: int = 50) -> BatchListResponse:
        """
        Batches generados con su progreso, más reciente primero.
        Permite al líder detectar un batch que sí se insertó aunque el
        response de la generación se haya perdido (red/timeout).
        """
        muestra_t = self._t(_MUESTRA_TABLE)
        rows = self.bq.query(
            f"""
            SELECT
              batch_id,
              CAST(MIN(_fecha_generacion) AS STRING)   AS fecha_generacion,
              COUNT(*)                                 AS total,
              COUNTIF(estado = 'PENDIENTE')            AS pendientes,
              COUNTIF(estado = 'EN_PROGRESO')          AS en_progreso,
              COUNTIF(estado = 'COMPLETADO')           AS completados,
              COUNTIF(estado = 'DESCARTADO')           AS descartados,
              COUNTIF(estado = 'ANULADO')              AS anulados,
              ARRAY_AGG(DISTINCT auditor_email ORDER BY auditor_email) AS auditores
            FROM `{muestra_t}`
            GROUP BY batch_id
            ORDER BY MIN(_fecha_generacion) DESC
            LIMIT {int(limit)}
            """,
            timeout_s=30,
        )
        return BatchListResponse(batches=[BatchResumen(**r) for r in rows])

    def anular_batch(self, batch_id: str, anulado_por: str) -> AnularBatchResponse:
        """
        Anula un batch: marca estado='ANULADO' SOLO en sus filas
        PENDIENTE/EN_PROGRESO, registrando anulado_por y fecha_anulacion
        (mismo patrón de rastro que DESCARTADO). Las COMPLETADO y DESCARTADO
        no se tocan.

        Las unidades ANULADO vuelven a ser elegibles de inmediato: la
        exclusión de _poblacion_elegible() solo filtra estados activos y
        DESCARTADO reciente — ANULADO queda fuera de ambos a propósito.
        """
        muestra_t = self._t(_MUESTRA_TABLE)
        estados = self.bq.query(
            f"""
            SELECT
              COUNTIF(estado IN ('PENDIENTE', 'EN_PROGRESO')) AS anulables,
              COUNTIF(estado = 'COMPLETADO')                  AS completados,
              COUNTIF(estado = 'DESCARTADO')                  AS descartados,
              COUNT(*)                                        AS total
            FROM `{muestra_t}`
            WHERE batch_id = @b
            """,
            [ScalarQueryParameter("b", "STRING", batch_id)],
            timeout_s=30,
        )[0]

        if int(estados["total"]) == 0:
            raise ValueError(f"No existe ningún batch con id {batch_id}.")
        if int(estados["anulables"]) == 0:
            raise ValueError(
                "Este batch no tiene unidades pendientes que anular "
                "(todo está completado, descartado o ya anulado)."
            )

        now_ts = datetime.now(timezone.utc)
        self.bq.update_row(
            table_id=muestra_t,
            set_clause=(
                "estado = 'ANULADO', anulado_por = @anulado_por, "
                "fecha_anulacion = @ts"
            ),
            where_clause=(
                "batch_id = @b AND estado IN ('PENDIENTE', 'EN_PROGRESO')"
            ),
            params=[
                ScalarQueryParameter("anulado_por", "STRING", anulado_por),
                ScalarQueryParameter("ts", "TIMESTAMP", now_ts),
                ScalarQueryParameter("b", "STRING", batch_id),
            ],
        )

        logger.warning(
            "Batch de calibración ANULADO: batch=%s, anuladas=%d, "
            "conservadas_completadas=%d, conservadas_descartadas=%d, por=%s",
            batch_id, estados["anulables"], estados["completados"],
            estados["descartados"], anulado_por,
        )

        return AnularBatchResponse(
            batch_id=batch_id,
            anuladas_pendientes=int(estados["anulables"]),
            conservadas_completadas=int(estados["completados"]),
            conservadas_descartadas=int(estados["descartados"]),
        )

    # ─────────────────────────────────────────────────────────────
    # Mensaje claro cuando no hay criterios activos (spec Issue 3 — UX)
    # ─────────────────────────────────────────────────────────────

    def _mensaje_sin_pendientes(self, interaction_id: str, auditor_email: str) -> str:
        """
        Distingue, para el propio auditor, entre "ya lo resolví" (con fecha)
        y "esta interacción nunca fue mía" — el bloqueo de evaluar()/descartar()
        siempre es sobre el propio historial (WHERE auditor_email = @email),
        así que nunca expone el trabajo de otra persona.
        """
        muestra_t = self._t(_MUESTRA_TABLE)
        rows = self.bq.query(
            f"""
            SELECT estado, fecha_completado, fecha_descarte, fecha_anulacion
            FROM `{muestra_t}`
            WHERE interaction_id = @iid AND LOWER(TRIM(auditor_email)) = LOWER(TRIM(@email))
            ORDER BY
              CASE estado
                WHEN 'COMPLETADO' THEN 0 WHEN 'DESCARTADO' THEN 1 WHEN 'ANULADO' THEN 2
                ELSE 3
              END,
              COALESCE(fecha_completado, fecha_descarte, fecha_anulacion) DESC
            LIMIT 1
            """,
            [
                ScalarQueryParameter("iid",   "STRING", interaction_id),
                ScalarQueryParameter("email", "STRING", auditor_email),
            ],
            timeout_s=30,
        )
        if not rows:
            return "Esta interacción no está en tu bandeja de calibración."

        r = rows[0]
        if r["estado"] == "COMPLETADO":
            return f"Ya evaluaste esta interacción el {_fmt_fecha(r['fecha_completado'])}."
        if r["estado"] == "DESCARTADO":
            return f"Ya descartaste esta interacción el {_fmt_fecha(r['fecha_descarte'])}."
        if r["estado"] == "ANULADO":
            return f"Esta asignación fue anulada el {_fmt_fecha(r['fecha_anulacion'])}."
        # No debería ocurrir: un estado activo ya habría evitado este mensaje.
        return "Esta interacción ya no tiene criterios pendientes para ti."

    # ─────────────────────────────────────────────────────────────
    # Evaluación en dos pasos: voto a ciegas → revisión → confirmación
    # (la escritura dual de spec 3.4 ocurre en confirmar)
    # ─────────────────────────────────────────────────────────────

    def _asignados(self, interaction_id: str, auditor_email: str, estados: tuple[str, ...]) -> list[dict]:
        """Filas de la muestra del auditor para la interacción, en los estados dados."""
        return self.bq.query(
            f"""
            SELECT muestra_id, criterion_id, estado
            FROM `{self._t(_MUESTRA_TABLE)}`
            WHERE interaction_id = @iid
              AND LOWER(TRIM(auditor_email)) = LOWER(TRIM(@email))
              AND estado IN UNNEST(@estados)
            """,
            [
                ScalarQueryParameter("iid",   "STRING", interaction_id),
                ScalarQueryParameter("email", "STRING", auditor_email),
                ArrayQueryParameter("estados", "STRING", list(estados)),
            ],
            timeout_s=30,
        )

    def evaluar(self, request: EvaluarRequest, auditor_email: str) -> EvaluarResponse:
        """
        Paso 1 — voto a ciegas.

        Valida que los criterios enviados sean exactamente los PENDIENTES del
        auditor, guarda el voto como borrador en la muestra (resultado_ciego,
        fecha_voto_ciego, estado EN_PROGRESO) y devuelve la revisión con el
        veredicto de SAACA. NO escribe en saaca_eval_detail: la evaluación
        HUMANO se inserta una sola vez, con el voto final, en confirmar().
        """
        pendientes = self._asignados(request.interaction_id, auditor_email, ("PENDIENTE",))
        asignados = {r["criterion_id"] for r in pendientes}
        votos = {ev.criterion_id: ev.result_label for ev in request.evaluations}

        if not asignados:
            if self._asignados(request.interaction_id, auditor_email, ("EN_PROGRESO",)):
                raise ValueError(
                    "Ya registraste tu voto a ciegas para esta interacción — "
                    "continúa con la revisión frente a SAACA."
                )
            raise ValueError(self._mensaje_sin_pendientes(request.interaction_id, auditor_email))
        _validar_conjunto(asignados, set(votos))

        cumple = [cid for cid, label in votos.items() if label == "CUMPLE"]
        self.bq.update_row(
            table_id=self._t(_MUESTRA_TABLE),
            set_clause=(
                "resultado_ciego = IF(criterion_id IN UNNEST(@cumple), 'CUMPLE', 'NO_CUMPLE'), "
                "fecha_voto_ciego = @ts, estado = 'EN_PROGRESO'"
            ),
            where_clause=(
                "interaction_id = @iid AND LOWER(TRIM(auditor_email)) = LOWER(TRIM(@email)) "
                "AND criterion_id IN UNNEST(@cids) AND estado = 'PENDIENTE'"
            ),
            params=[
                ArrayQueryParameter("cumple", "STRING", cumple),
                ScalarQueryParameter("ts",    "TIMESTAMP", datetime.now(timezone.utc)),
                ScalarQueryParameter("iid",   "STRING", request.interaction_id),
                ScalarQueryParameter("email", "STRING", auditor_email),
                ArrayQueryParameter("cids",   "STRING", sorted(votos)),
            ],
        )

        logger.info(
            "Voto a ciegas registrado — interaction=%s, auditor=%s, criterios=%d",
            request.interaction_id, auditor_email, len(votos),
        )
        return EvaluarResponse(
            success=True,
            criterios_votados=len(votos),
            revision=self.get_revision(request.interaction_id, auditor_email),
        )

    def get_revision(self, interaction_id: str, auditor_email: str) -> RevisionResponse:
        """
        Criterios EN_PROGRESO del auditor: su voto a ciegas frente al veredicto
        y la observación de SAACA. Solo existe después del voto a ciegas, así
        que nunca revela a SAACA antes de tiempo.

        El veredicto de SAACA es resultado_auto_snapshot (con el que se generó
        la muestra); la observación sale de pitch_eval_enriched para ese mismo
        veredicto, evitando mezclar corridas distintas de SAACA.
        """
        muestra_t  = self._t(_MUESTRA_TABLE)
        enriched_t = self._t(_ENRICHED_TABLE)
        criteria_t = self._t(_CRITERIA_TABLE)

        rows = self.bq.query(
            f"""
            SELECT
              m.muestra_id, m.criterion_id, m.interaction_type,
              m.resultado_ciego,
              m.resultado_auto_snapshot AS resultado_saaca,
              c.criterion_name, c.criterion_description, c.error_type,
              e.observacion_saaca
            FROM `{muestra_t}` m
            LEFT JOIN {_catalogo_canonico(criteria_t)} c ON c.criterion_id = m.criterion_id
            LEFT JOIN (
              SELECT interaction_id, id_criterio, resultado, observacion_saaca
              FROM `{enriched_t}`
              WHERE interaction_id = @iid
            ) e
              ON e.interaction_id = m.interaction_id
             AND e.id_criterio    = m.criterion_id
             AND e.resultado      = m.resultado_auto_snapshot
            WHERE m.interaction_id = @iid
              AND LOWER(TRIM(m.auditor_email)) = LOWER(TRIM(@email))
              AND m.estado = 'EN_PROGRESO'
            QUALIFY ROW_NUMBER() OVER (
              PARTITION BY m.muestra_id ORDER BY e.observacion_saaca IS NULL
            ) = 1
            ORDER BY m.criterion_id
            """,
            [
                ScalarQueryParameter("iid",   "STRING", interaction_id),
                ScalarQueryParameter("email", "STRING", auditor_email),
            ],
            timeout_s=30,
        )
        return RevisionResponse(
            interaction_id=interaction_id,
            interaction_type=rows[0].get("interaction_type") if rows else None,
            criterios=[
                RevisionCriterio(**{k: r.get(k) for k in RevisionCriterio.model_fields})
                for r in rows
            ],
        )

    def confirmar(self, request: ConfirmarRequest, auditor_email: str) -> ConfirmarResponse:
        """
        Paso 2 — voto final tras ver a SAACA.

        1. Valida criterios = los EN_PROGRESO del auditor, y observación
           obligatoria donde hay desacuerdo (validar_confirmacion).
        2. INSERT en saaca_eval_detail (mechanism='HUMANO') con el voto FINAL
           vía Load Job — job.result() confirma el commit.
        3. Solo entonces: UPDATE pitch_muestra_calibracion → COMPLETADO, con
           3 reintentos; si persiste el fallo, log INCONSISTENTE.
        """
        revision = self.get_revision(request.interaction_id, auditor_email)
        if not revision.criterios:
            if self._asignados(request.interaction_id, auditor_email, ("PENDIENTE",)):
                raise ValueError("Primero registra tu voto a ciegas para esta interacción.")
            raise ValueError(self._mensaje_sin_pendientes(request.interaction_id, auditor_email))

        por_criterio = {c.criterion_id: c for c in revision.criterios}
        finales = list({ev.criterion_id: ev for ev in request.evaluations}.values())
        _validar_conjunto(set(por_criterio), {ev.criterion_id for ev in finales})
        validar_confirmacion(por_criterio, finales)

        eval_rows, is_defective = self._filas_humano(
            request.interaction_id, request.interaction_type, auditor_email,
            finales, {cid: c.muestra_id for cid, c in por_criterio.items()},
        )
        now_ts = eval_rows[0]["evaluated_at"]

        self.bq.insert_rows_dml(self._t(_EVAL_TABLE), eval_rows)
        inconsistente = not self._marcar_completado(
            request.interaction_id, auditor_email, sorted(por_criterio), now_ts,
        )

        coincidencias = sum(1 for ev in finales if ev.result_label == por_criterio[ev.criterion_id].resultado_saaca)
        cambios = sum(1 for ev in finales if ev.result_label != por_criterio[ev.criterion_id].resultado_ciego)
        logger.info(
            "Calibración confirmada — interaction=%s, auditor=%s, criterios=%d, "
            "coincidencias=%d, cambios_de_voto=%d, defective=%s, inconsistente=%s",
            request.interaction_id, auditor_email, len(eval_rows),
            coincidencias, cambios, is_defective, inconsistente,
        )
        return ConfirmarResponse(
            success=True,
            criterios_evaluados=len(eval_rows),
            coincidencias=coincidencias,
            cambios_de_voto=cambios,
            is_defective=is_defective,
            estado_muestra_inconsistente=inconsistente,
        )

    def _filas_humano(
        self, interaction_id: str, interaction_type: str, auditor_email: str,
        evaluaciones: list, muestra_por_criterio: dict[str, str],
    ) -> tuple[list[dict], bool]:
        """Filas HUMANO para saaca_eval_detail (mismo esquema que escribe SAACA)."""
        enriched_t = self._t(_ENRICHED_TABLE)
        criteria_t = self._t(_CRITERIA_TABLE)
        eval_t     = self._t(_EVAL_TABLE)

        # ── Contexto del caso desde pitch_eval_enriched ──────────────────
        ctx_rows = self.bq.query(
            f"""
            SELECT ANY_VALUE(case_id) AS case_id, ANY_VALUE(numero_caso) AS numero_caso,
                   ANY_VALUE(pais) AS pais, ANY_VALUE(nombre_agente) AS nombre_agente,
                   ANY_VALUE(email_agente) AS email_agente, ANY_VALUE(departamento) AS departamento
            FROM `{enriched_t}`
            WHERE interaction_id = @iid
            """,
            [ScalarQueryParameter("iid", "STRING", interaction_id)],
            timeout_s=30,
        )
        ctx = ctx_rows[0] if ctx_rows else {}

        # criteria_version de la evaluación AUTO existente (consistencia de versión).
        # La columna es INT64: sin evaluación AUTO queda NULL (antes 'v1', que no
        # es un entero válido para el Load Job).
        cv_rows = self.bq.query(
            f"""
            SELECT criteria_version FROM `{eval_t}`
            WHERE interaction_id = @iid AND mechanism IN ('AUTO_REGLA', 'AUTO_IA', 'AUTO_IA_RAG')
            ORDER BY evaluated_at DESC
            LIMIT 1
            """,
            [ScalarQueryParameter("iid", "STRING", interaction_id)],
            timeout_s=30,
        )
        criteria_version = cv_rows[0]["criteria_version"] if cv_rows else None

        # ── Metadata de criterios (catálogo canónico: una fila por criterio) ──
        meta_rows = self.bq.query(
            f"""
            SELECT criterion_id, criterion_name, error_type, error_category, criterion_weight
            FROM {_catalogo_canonico(criteria_t)}
            WHERE criterion_id IN UNNEST(@ids)
            """,
            [ArrayQueryParameter("ids", "STRING", sorted(muestra_por_criterio))],
            timeout_s=30,
        )
        meta_map = {r["criterion_id"]: r for r in meta_rows}

        _score_map = {"CUMPLE": 1.0, "NO_CUMPLE": 0.0}
        is_defective = any(
            meta_map.get(ev.criterion_id, {}).get("error_type") == "CRITICAL"
            and ev.result_label == "NO_CUMPLE"
            for ev in evaluaciones
        )
        now_ts = datetime.now(timezone.utc)

        eval_rows = []
        for ev in evaluaciones:
            meta = meta_map.get(ev.criterion_id, {})
            observacion = (ev.observation or "").strip() or None
            eval_rows.append({
                "eval_detail_id":           str(uuid.uuid4()),
                "eval_run_id":              None,
                "interaction_id":           interaction_id,
                "interaction_type":         interaction_type,
                "case_id":                  ctx.get("case_id"),
                "case_number":              ctx.get("numero_caso"),
                "case_country":             ctx.get("pais"),
                "seller_geography":         None,
                "criterion_id":             ev.criterion_id,
                "criterion_name":           meta.get("criterion_name"),
                "error_type":               meta.get("error_type"),
                "error_category":           meta.get("error_category"),
                "criteria_version":         criteria_version,
                "mechanism":                "HUMANO",
                "evaluated_by":             auditor_email,
                "model_version":            None,
                "prompt_version":           None,
                "result_label":             ev.result_label,
                "result_score":             _score_map[ev.result_label],
                # is_defective se marca a nivel interacción — igual en todas las filas
                "is_defective_transaction": is_defective,
                "weight_applied":           meta.get("criterion_weight"),
                "observation":              observacion,
                "eval_suggestion":          None,
                "na_reason":                None,
                "eval_reference_id":        muestra_por_criterio[ev.criterion_id],
                "owner_id":                 None,
                "owner_name":               ctx.get("nombre_agente"),
                "owner_email":              ctx.get("email_agente"),
                "owner_department":         ctx.get("departamento"),
                "evaluated_at":             now_ts,
            })
        return eval_rows, is_defective

    def _marcar_completado(
        self, interaction_id: str, auditor_email: str,
        criterion_ids: list[str], ts: datetime,
    ) -> bool:
        """UPDATE de la muestra con 3 reintentos y backoff. False si quedó inconsistente."""
        muestra_t = self._t(_MUESTRA_TABLE)
        for intento in range(1, 4):
            try:
                self.bq.update_row(
                    table_id=muestra_t,
                    set_clause="estado = 'COMPLETADO', fecha_completado = @ts",
                    where_clause=(
                        "interaction_id = @iid AND LOWER(TRIM(auditor_email)) = LOWER(TRIM(@email)) "
                        "AND criterion_id IN UNNEST(@cids) "
                        "AND estado IN ('PENDIENTE', 'EN_PROGRESO')"
                    ),
                    params=[
                        ScalarQueryParameter("ts",    "TIMESTAMP", ts),
                        ScalarQueryParameter("iid",   "STRING", interaction_id),
                        ScalarQueryParameter("email", "STRING", auditor_email),
                        ArrayQueryParameter("cids",   "STRING", criterion_ids),
                    ],
                )
                return True
            except Exception as exc:
                logger.warning(
                    "UPDATE pitch_muestra_calibracion falló (intento %d/3): %s",
                    intento, exc,
                )
                if intento < 3:
                    time.sleep(2 ** intento)  # backoff: 2s, 4s

        # Nunca fallar silencioso: la evaluación HUMANO ya está persistida,
        # pero la muestra quedó sin marcar — registrar para revisión manual.
        logger.error(
            "INCONSISTENTE — evaluación HUMANO persistida pero muestra sin actualizar: "
            "interaction_id=%s, criterion_ids=%s, auditor=%s, timestamp=%s",
            interaction_id, criterion_ids, auditor_email, ts.isoformat(),
        )
        return False

    # ─────────────────────────────────────────────────────────────
    # Descarte
    # ─────────────────────────────────────────────────────────────

    def descartar(self, interaction_id: str, motivo: str, auditor_email: str) -> DescartarResponse:
        """Marca DESCARTADO todos los criterios pendientes de la interacción para el auditor."""
        muestra_t = self._t(_MUESTRA_TABLE)

        pendientes = self.bq.query(
            f"""
            SELECT COUNT(*) AS n FROM `{muestra_t}`
            WHERE interaction_id = @iid AND LOWER(TRIM(auditor_email)) = LOWER(TRIM(@email))
              AND estado IN ('PENDIENTE', 'EN_PROGRESO')
            """,
            [
                ScalarQueryParameter("iid",   "STRING", interaction_id),
                ScalarQueryParameter("email", "STRING", auditor_email),
            ],
            timeout_s=30,
        )
        n = int(pendientes[0]["n"]) if pendientes else 0
        if n == 0:
            raise ValueError(self._mensaje_sin_pendientes(interaction_id, auditor_email))

        now_ts = datetime.now(timezone.utc)
        self.bq.update_row(
            table_id=muestra_t,
            set_clause=(
                "estado = 'DESCARTADO', motivo_descarte = @motivo, "
                "descartado_por = @email, fecha_descarte = @ts"
            ),
            where_clause=(
                "interaction_id = @iid AND LOWER(TRIM(auditor_email)) = LOWER(TRIM(@email)) "
                "AND estado IN ('PENDIENTE', 'EN_PROGRESO')"
            ),
            params=[
                ScalarQueryParameter("motivo", "STRING", motivo),
                ScalarQueryParameter("email",  "STRING", auditor_email),
                ScalarQueryParameter("ts",     "TIMESTAMP", now_ts),
                ScalarQueryParameter("iid",    "STRING", interaction_id),
            ],
        )

        logger.info(
            "Descarte de calibración — interaction=%s, auditor=%s, criterios=%d",
            interaction_id, auditor_email, n,
        )
        return DescartarResponse(success=True, criterios_descartados=n)

    # ─────────────────────────────────────────────────────────────
    # Comparación post-submit (revelado del modo ciego)
    # ─────────────────────────────────────────────────────────────

    def get_comparacion(self, interaction_id: str, auditor_email: str) -> ComparacionResponse:
        """
        AUTO vs HUMANO por criterio, con el voto final ya confirmado.

        El veredicto AUTO de referencia es el snapshot de la muestra (el mismo
        que vio el auditor en la revisión); la vista queda como respaldo para
        evaluaciones humanas sin fila de muestra. DISTINCT porque la vista
        repite filas si el par se muestreó más de una vez (JOIN con la muestra).
        """
        view      = self._t(_COMPARATIVA_VIEW)
        muestra_t = self._t(_MUESTRA_TABLE)
        rows = self.bq.query(
            f"""
            SELECT DISTINCT
              v.criterion_id, v.criterion_name,
              COALESCE(m.resultado_auto_snapshot, v.resultado_auto) AS resultado_auto,
              v.observacion_auto, v.mecanismo_auto,
              v.resultado_humano, v.observacion_humana,
              COALESCE(m.resultado_auto_snapshot, v.resultado_auto) = v.resultado_humano AS coincide
            FROM `{view}` v
            LEFT JOIN (
              SELECT interaction_id, criterion_id,
                     ANY_VALUE(resultado_auto_snapshot) AS resultado_auto_snapshot
              FROM `{muestra_t}`
              WHERE interaction_id = @iid
                AND LOWER(TRIM(auditor_email)) = LOWER(TRIM(@email))
                AND estado = 'COMPLETADO'
              GROUP BY interaction_id, criterion_id
            ) m
              ON m.interaction_id = v.interaction_id AND m.criterion_id = v.criterion_id
            WHERE v.interaction_id = @iid AND LOWER(TRIM(v.auditor_email)) = LOWER(TRIM(@email))
            ORDER BY v.criterion_id
            """,
            [
                ScalarQueryParameter("iid",   "STRING", interaction_id),
                ScalarQueryParameter("email", "STRING", auditor_email),
            ],
            timeout_s=30,
        )
        return ComparacionResponse(
            interaction_id=interaction_id,
            total_criterios=len(rows),
            coincidencias=sum(1 for r in rows if r.get("coincide")),
            criterios=[ComparacionCriterio(**r) for r in rows],
        )

    # ─────────────────────────────────────────────────────────────
    # Mini dashboard de seguimiento (Improvement 1)
    # ─────────────────────────────────────────────────────────────

    def get_dashboard(
        self,
        auditor_email: str,
        es_lider: bool,
        fecha_start: str | None = None,
        fecha_end: str | None = None,
    ) -> CalibracionDashboardResponse:
        """
        Progreso de calibración + % de acuerdo humano-SAACA.

        LIDER_QUALITY+: totales globales y desglose por auditor.
        AUDITOR: mismo aislamiento que /inbox — totales acotados a su propio
        email, sin desglose por auditor (nunca ve el trabajo de otro).
        """
        end   = _date.fromisoformat(fecha_end) if fecha_end else _date.today()
        start = (
            _date.fromisoformat(fecha_start) if fecha_start
            else end - timedelta(days=_DASHBOARD_DIAS_DEFAULT)
        )

        muestra_t     = self._t(_MUESTRA_TABLE)
        comparativa_t = self._t(_COMPARATIVA_VIEW)
        filtro_email  = "" if es_lider else "AND LOWER(TRIM(auditor_email)) = LOWER(TRIM(@email))"

        progreso_rows = self.bq.query(
            f"""
            SELECT
              auditor_email,
              COUNT(*)                                        AS asignados,
              COUNTIF(estado = 'COMPLETADO')                  AS completados,
              COUNTIF(estado IN ('PENDIENTE', 'EN_PROGRESO')) AS pendientes,
              COUNTIF(estado = 'DESCARTADO')                  AS descartados
            FROM `{muestra_t}`
            WHERE estado != 'ANULADO'
              AND DATE(fecha_asignacion) BETWEEN @start AND @end
              {filtro_email}
            GROUP BY auditor_email
            ORDER BY auditor_email
            """,
            [
                ScalarQueryParameter("start", "DATE", start),
                ScalarQueryParameter("end",   "DATE", end),
                ScalarQueryParameter("email", "STRING", auditor_email),
            ],
            timeout_s=30,
        )

        acuerdo_rows = self.bq.query(
            f"""
            SELECT
              auditor_email,
              COUNT(*)          AS total_calibrados,
              COUNTIF(coincide) AS coincidencias
            FROM `{comparativa_t}`
            WHERE resultado_humano IS NOT NULL
              AND DATE(fecha_evaluacion_humana) BETWEEN @start AND @end
              {filtro_email}
            GROUP BY auditor_email
            """,
            [
                ScalarQueryParameter("start", "DATE", start),
                ScalarQueryParameter("end",   "DATE", end),
                ScalarQueryParameter("email", "STRING", auditor_email),
            ],
            timeout_s=30,
        )
        acuerdo_map = {r["auditor_email"]: r for r in acuerdo_rows}

        por_auditor: list[CalibracionAuditorProgreso] = []
        total_asignados = total_completados = total_pendientes = total_descartados = 0
        total_calibrados_global = coincidencias_global = 0

        for r in progreso_rows:
            asignados   = int(r["asignados"])
            completados = int(r["completados"])
            pendientes  = int(r["pendientes"])
            descartados = int(r["descartados"])
            total_asignados   += asignados
            total_completados += completados
            total_pendientes  += pendientes
            total_descartados += descartados

            ac = acuerdo_map.get(r["auditor_email"])
            total_calibrados = int(ac["total_calibrados"]) if ac else 0
            coincidencias     = int(ac["coincidencias"]) if ac else 0
            total_calibrados_global += total_calibrados
            coincidencias_global    += coincidencias

            por_auditor.append(CalibracionAuditorProgreso(
                auditor_email=r["auditor_email"],
                asignados=asignados,
                completados=completados,
                pendientes=pendientes,
                descartados=descartados,
                pct_avance=(completados / asignados * 100) if asignados > 0 else None,
                pct_acuerdo=(coincidencias / total_calibrados * 100) if total_calibrados > 0 else None,
            ))

        return CalibracionDashboardResponse(
            fecha_start=start.isoformat(),
            fecha_end=end.isoformat(),
            total_asignados=total_asignados,
            total_completados=total_completados,
            total_pendientes=total_pendientes,
            total_descartados=total_descartados,
            pct_avance=(total_completados / total_asignados * 100) if total_asignados > 0 else None,
            pct_acuerdo=(
                coincidencias_global / total_calibrados_global * 100
            ) if total_calibrados_global > 0 else None,
            por_auditor=por_auditor if es_lider else [],
        )
