"""
Modelos Pydantic del Glosario — catálogo de criterios de SAACA consolidado.

saaca_cat_criteria guarda una fila por VERSIÓN de criterio; el Glosario
muestra cada criterio una sola vez (su versión vigente) con el historial.
Fechas serializadas como string ISO (YYYY-MM-DD).
"""

from typing import Optional

from pydantic import BaseModel, Field


class CriterioVersion(BaseModel):
    """Una fila de saaca_cat_criteria (una versión del criterio)."""

    criteria_version: Optional[int] = None
    criterion_name: Optional[str] = None
    is_active: bool = False
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None       # NULL = sin fecha de término
    updated_at: Optional[str] = None


class CriterioTipoInteraccion(BaseModel):
    """Dónde aplica el criterio (saaca_cat_criteria_mapping, sin filas HUMANO)."""

    interaction_type: str
    mechanism: str                       # AUTO_IA / AUTO_IA_RAG / AUTO_REGLA / ML
    notes: Optional[str] = None
    is_active: bool = False


class CriterioGlosario(BaseModel):
    criterion_id: str
    estado: str                          # ACTIVO (versión activa y vigente) / INACTIVO
    # Datos de la versión vigente (o la más reciente si ninguna está activa)
    criterion_name: Optional[str] = None
    criterion_description: Optional[str] = None
    error_type: Optional[str] = None     # CRITICAL / NON_CRITICAL
    error_category: Optional[str] = None # ECU / ECN / ECC / NON_CRITICAL
    criterion_weight: Optional[float] = None
    criteria_version: Optional[int] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    historial: list[CriterioVersion] = Field(default_factory=list)   # versión desc
    tipos_interaccion: list[CriterioTipoInteraccion] = Field(default_factory=list)


class GlosarioResponse(BaseModel):
    fecha_carga: str                     # ISO timestamp de cuándo se cacheó
    criterios: list[CriterioGlosario] = Field(default_factory=list)
    tipos_interaccion: list[str] = Field(default_factory=list)   # con mapping activo
