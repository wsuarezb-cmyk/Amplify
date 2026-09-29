"""
Modelos Pydantic del Diagnóstico IA.

DiagnosticoFiltros replica la forma de los filtros de Reportería
(EMPTY_FILTERS en frontend/src/contexts/PitchDataContext.jsx): el frontend
envía su estado de filtros tal cual.
"""

from pydantic import BaseModel, Field


class DiagnosticoFiltros(BaseModel):
    fecha_start: str = ""
    fecha_end: str = ""
    pais: list[str] = Field(default_factory=list)
    departamento: list[str] = Field(default_factory=list)
    tipo_interaccion: list[str] = Field(default_factory=list)
    id_criterio: list[str] = Field(default_factory=list)
    tipificacion_nivel_1: list[str] = Field(default_factory=list)
    tipificacion_nivel_2: list[str] = Field(default_factory=list)
    nombre_tipificacion: list[str] = Field(default_factory=list)
    email_agente: list[str] = Field(default_factory=list)
    email_manager: list[str] = Field(default_factory=list)
    mecanismo_evaluacion: list[str] = Field(default_factory=list)
    numero_caso: list[str] = Field(default_factory=list)
    interaction_id: list[str] = Field(default_factory=list)
    seller_code: list[str] = Field(default_factory=list)
