"""
Modelos Pydantic del módulo Pitch (Reportería + Calibración).

Reportería:
  - El extracto viaja en formato columnar (columns + data) para reducir el
    tamaño del JSON: ~173k filas × 28 columnas hacen inviable repetir las
    claves por fila. Sigue siendo un modelo tipado, no un dict crudo.

Calibración:
  - La unidad de trabajo es (interaction_id, criterion_id) — una fila de
    pitch_muestra_calibracion. La bandeja agrupa por interacción.
"""

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────────────────────
# Reportería — extracto diario
# ─────────────────────────────────────────────────────────────

class ExtractoResponse(BaseModel):
    """Payload completo de vw_pitch_dashboard_extracto (carga única diaria).

    data es una lista de filas posicionales alineadas con columns.
    Fechas serializadas como string ISO (YYYY-MM-DD).
    """

    fecha_carga: str                     # ISO timestamp de cuándo se cacheó el payload
    total_filas: int
    columns: list[str]
    data: list[list[Any]]


class InteractionCriterionDetail(BaseModel):
    """Un criterio evaluado de la interacción — desde pitch_eval_enriched (CON observación)."""

    id_criterio: Optional[str] = None
    nombre_criterio: Optional[str] = None
    tipo_error: Optional[str] = None          # CRITICAL / NON_CRITICAL
    categoria_error: Optional[str] = None     # ECU / ECN / ECC / NON_CRITICAL
    resultado: Optional[str] = None           # N/A / NO_EVALUADO / NO_CUMPLE / CUMPLE
    score_criterio: Optional[float] = None
    observacion_saaca: Optional[str] = None
    peso_aplicado: Optional[float] = None
    peso_relativo_criterio: Optional[float] = None
    mecanismo_evaluacion: Optional[str] = None
    fecha_hora_evaluacion: Optional[str] = None


class CalibracionKpiResponse(BaseModel):
    """Meta-indicador de acuerdo humano-SAACA para la card de Reportería.

    Ventana móvil fija (default 90 días por fecha de evaluación humana),
    independiente de los filtros del dashboard: la calibración tiene otro
    grano temporal y volumen bajo. No mezcla HUMANO en las métricas AUTO.
    """

    ventana_dias: int
    total_calibrados: int          # criterios con evaluación humana en la ventana
    coincidencias: int
    pct_acuerdo: Optional[float] = None


class InteractionDetailPitchResponse(BaseModel):
    """Drilldown de una interacción — SIEMPRE desde pitch_eval_enriched, nunca desde la vista."""

    interaction_id: str
    tipo_interaccion: Optional[str] = None
    numero_caso: Optional[str] = None
    pais: Optional[str] = None
    nombre_agente: Optional[str] = None
    departamento: Optional[str] = None
    nombre_manager: Optional[str] = None
    score_interaccion: Optional[float] = None
    es_defectuosa: Optional[bool] = None
    criterios: list[InteractionCriterionDetail] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────
# Calibración — bandeja del auditor
# ─────────────────────────────────────────────────────────────

class CalibracionCriterioAsignado(BaseModel):
    """Un criterio asignado dentro de una interacción de la muestra."""

    muestra_id: str
    criterion_id: str
    criterion_name: Optional[str] = None
    criterion_description: Optional[str] = None   # del catálogo canónico
    error_type: Optional[str] = None              # CRITICAL / NON_CRITICAL
    estado: str                     # PENDIENTE / EN_PROGRESO / COMPLETADO / DESCARTADO


class CalibracionInboxItem(BaseModel):
    """Una interacción asignada al auditor, con sus criterios de la muestra."""

    interaction_id: str
    interaction_type: str
    pais: Optional[str] = None
    numero_caso: Optional[str] = None
    nombre_agente: Optional[str] = None
    departamento: Optional[str] = None
    fecha_asignacion: Optional[str] = None
    batch_id: Optional[str] = None
    criterios: list[CalibracionCriterioAsignado] = Field(default_factory=list)
    # agregado: PENDIENTE si falta el voto a ciegas, EN_PROGRESO si falta confirmar
    # tras ver a SAACA, COMPLETADO/DESCARTADO si todo está cerrado.
    estado: str


class CalibracionInboxResponse(BaseModel):
    items: list[CalibracionInboxItem] = Field(default_factory=list)
    total_asignados: int = 0        # criterios totales asignados (histórico)
    total_completados: int = 0
    total_descartados: int = 0


# ─────────────────────────────────────────────────────────────
# Calibración — flujo de dos pasos
#   1. POST /evaluar   → voto a ciegas (sin observación), queda EN_PROGRESO
#   2. GET  /revision  → voto a ciegas + veredicto y observación de SAACA
#   3. POST /confirmar → voto final + observación (obligatoria si hay
#                        desacuerdo) → saaca_eval_detail (HUMANO) → COMPLETADO
# ─────────────────────────────────────────────────────────────

# El auditor SOLO dictamina CUMPLE o NO_CUMPLE: la unidad de calibración es un
# (interaction, criterion) con veredicto real de la IA — N/A y NO_EVALUADO
# están excluidos del universo desde la query de población, y por lo tanto
# tampoco existen como respuesta humana válida.
_RESULT_LABELS_HUMANO = {"CUMPLE", "NO_CUMPLE"}


def _validar_label(v: str) -> str:
    if v not in _RESULT_LABELS_HUMANO:
        raise ValueError(f"result_label debe ser uno de {sorted(_RESULT_LABELS_HUMANO)}")
    return v


class CalibracionVotoCiego(BaseModel):
    """Paso 1: solo el veredicto — la observación se pide tras ver a SAACA."""

    criterion_id: str
    result_label: str

    check_label = field_validator("result_label")(_validar_label)


class CalibracionCriterioEval(BaseModel):
    """Paso 2: voto final (puede diferir del voto a ciegas) + observación."""

    criterion_id: str
    result_label: str
    observation: Optional[str] = None

    check_label = field_validator("result_label")(_validar_label)


class EvaluarRequest(BaseModel):
    interaction_id: str
    interaction_type: str
    evaluations: list[CalibracionVotoCiego] = Field(min_length=1)


class RevisionCriterio(BaseModel):
    """Un criterio en revisión: voto a ciegas del auditor vs veredicto de SAACA."""

    muestra_id: str
    criterion_id: str
    criterion_name: Optional[str] = None
    criterion_description: Optional[str] = None
    error_type: Optional[str] = None
    resultado_ciego: Optional[str] = None
    # Veredicto de SAACA con el que se generó la muestra (resultado_auto_snapshot):
    # es el comparable oficial, no la vista (que puede elegir otra corrida).
    resultado_saaca: Optional[str] = None
    observacion_saaca: Optional[str] = None


class RevisionResponse(BaseModel):
    interaction_id: str
    interaction_type: Optional[str] = None
    criterios: list[RevisionCriterio] = Field(default_factory=list)


class EvaluarResponse(BaseModel):
    """Respuesta del paso 1: el voto quedó guardado y se revela a SAACA."""

    success: bool
    criterios_votados: int
    revision: RevisionResponse


class ConfirmarRequest(BaseModel):
    interaction_id: str
    interaction_type: str
    evaluations: list[CalibracionCriterioEval] = Field(min_length=1)


class ConfirmarResponse(BaseModel):
    success: bool
    criterios_evaluados: int
    coincidencias: int              # voto final == veredicto SAACA
    cambios_de_voto: int            # voto final != voto a ciegas
    is_defective: bool
    # True si el INSERT en saaca_eval_detail quedó confirmado pero el UPDATE
    # de pitch_muestra_calibracion falló tras los reintentos (spec 3.4).
    estado_muestra_inconsistente: bool = False


class DescartarRequest(BaseModel):
    interaction_id: str
    motivo: str = Field(min_length=5, description="Motivo obligatorio del descarte")


class DescartarResponse(BaseModel):
    success: bool
    criterios_descartados: int


class ComparacionCriterio(BaseModel):
    """AUTO vs HUMANO por criterio — desde vw_pitch_calibracion_comparativa (post-submit)."""

    criterion_id: str
    criterion_name: Optional[str] = None
    resultado_auto: Optional[str] = None
    observacion_auto: Optional[str] = None
    mecanismo_auto: Optional[str] = None
    resultado_humano: Optional[str] = None
    observacion_humana: Optional[str] = None
    coincide: Optional[bool] = None


class ComparacionResponse(BaseModel):
    interaction_id: str
    total_criterios: int
    coincidencias: int
    criterios: list[ComparacionCriterio] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────
# Calibración — generación de muestra (Cochran por estrato)
# ─────────────────────────────────────────────────────────────

class EstratoPreview(BaseModel):
    estrato: str                    # criterio|mecanismo|resultado|país
    criticidad: str                 # CRITICAL / NON_CRITICAL
    margen_error: float
    poblacion: int                  # N elegible del estrato
    muestra_ideal: int              # n de Cochran con corrección finita (referencia)
    # Presentes solo cuando el preview se calcula con capacidad_objetivo:
    asignado: Optional[int] = None
    cobertura: Optional[str] = None  # COMPLETA / PARCIAL / SIN_COBERTURA vs muestra_ideal


class CoberturaResumen(BaseModel):
    """Conteo de estratos por nivel de cobertura, dado capacidad_objetivo."""

    COMPLETA: int = 0
    PARCIAL: int = 0
    SIN_COBERTURA: int = 0


class MuestraPreviewResponse(BaseModel):
    fecha_start: str
    fecha_end: str
    total_poblacion: int
    total_muestra_ideal: int        # tamaño ideal Cochran — informativo
    # Presentes solo cuando el preview se calcula con capacidad_objetivo:
    capacidad_objetivo: Optional[int] = None
    total_asignado: Optional[int] = None
    cobertura_resumen: Optional[dict[str, CoberturaResumen]] = None  # por criticidad
    estratos: list[EstratoPreview] = Field(default_factory=list)


class AsignacionAuditor(BaseModel):
    auditor_email: str
    cantidad: int = Field(gt=0)


class GenerarMuestraRequest(BaseModel):
    fecha_start: str                # YYYY-MM-DD sobre fecha_evaluacion
    fecha_end: str
    capacidad_objetivo: int = Field(gt=0, description="Capacidad real del equipo para el período")
    distribucion: list[AsignacionAuditor] = Field(min_length=1)


class GenerarMuestraResponse(BaseModel):
    batch_id: str
    total_insertados: int
    total_estratos: int
    por_auditor: dict[str, int] = Field(default_factory=dict)


# ─────────────────────────────────────────────────────────────
# Calibración — batches generados (detección y recuperación)
# ─────────────────────────────────────────────────────────────

class BatchResumen(BaseModel):
    """Un batch generado con su progreso — para detectar generaciones cuyo
    response se perdió (red/timeout) y poder anularlas desde la app."""

    batch_id: str
    fecha_generacion: Optional[str] = None
    total: int
    pendientes: int
    en_progreso: int
    completados: int
    descartados: int
    anulados: int
    auditores: list[str] = Field(default_factory=list)


class BatchListResponse(BaseModel):
    batches: list[BatchResumen] = Field(default_factory=list)


class AnularBatchResponse(BaseModel):
    """Resultado de anular un batch: las filas PENDIENTE/EN_PROGRESO pasan a
    estado ANULADO (con anulado_por + fecha_anulacion, mismo patrón que
    DESCARTADO); lo completado y descartado se conserva intacto."""

    batch_id: str
    anuladas_pendientes: int
    conservadas_completadas: int
    conservadas_descartadas: int


# ─────────────────────────────────────────────────────────────
# Calibración — mini dashboard de seguimiento (Improvement 1)
# ─────────────────────────────────────────────────────────────

class CalibracionAuditorProgreso(BaseModel):
    """Progreso de un auditor dentro de la ventana consultada."""

    auditor_email: str
    asignados: int
    completados: int
    pendientes: int
    descartados: int
    pct_avance: Optional[float] = None
    pct_acuerdo: Optional[float] = None   # None si no tiene criterios calibrados aún


class CalibracionDashboardResponse(BaseModel):
    """
    Resumen de progreso de calibración.

    Para AUDITOR, los totales ya están acotados a su propio email (mismo
    aislamiento que /inbox) y `por_auditor` viene vacío. Para LIDER_QUALITY+,
    los totales son globales y `por_auditor` trae el desglose por persona.
    """

    fecha_start: str
    fecha_end: str
    total_asignados: int
    total_completados: int
    total_pendientes: int
    total_descartados: int
    pct_avance: Optional[float] = None
    pct_acuerdo: Optional[float] = None
    por_auditor: list[CalibracionAuditorProgreso] = Field(default_factory=list)
