from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ManualSolicitudFields(BaseModel):
    pais: str | None = None
    proyecto: str | None = None
    fecha_envio: date
    audiencia: str | None = None
    url_sellers: str | None = None
    descripcion: str | None = None


class ManualSolicitudCreate(ManualSolicitudFields):
    area: str
    pais: str
    accion: Literal["Nuevo", "Modificación", "Replicar envío"]
    tipo_comunicado: str
    audiencia: Literal[
        "Base segmentada de sellers",
        "Base completa de sellers",
        "Sellers internacionales",
    ]

    @field_validator("area")
    @classmethod
    def validate_area(cls, value: str) -> str:
        value = value.strip()
        allowed = {"Seller Experience", "VAS", "Home Delivery", "Comercial", "Finanzas", "Producto"}
        if value in allowed:
            return value
        if value.startswith("Otras:") and value.removeprefix("Otras:").strip():
            return f"Otras: {value.removeprefix('Otras:').strip()}"
        raise ValueError("area debe ser una opción válida o especificar Otras")

    @field_validator("pais")
    @classmethod
    def validate_paises(cls, value: str) -> str:
        allowed = {"Chile", "Perú", "Colombia"}
        countries = [country.strip() for country in value.split(",")]
        if not countries or any(country not in allowed for country in countries):
            raise ValueError("pais debe incluir Chile, Perú o Colombia")
        if len(set(countries)) != len(countries):
            raise ValueError("pais no puede repetir países")
        return ", ".join(countries)

    @field_validator("tipo_comunicado")
    @classmethod
    def validate_materiales(cls, value: str) -> str:
        materials = {"Mail", "Popup", "Infografía", "Template de soporte"}
        selected = []
        other_parts = []
        for part in value.split(","):
            item = part.strip()
            if not item:
                raise ValueError("tipo_comunicado no puede tener opciones vacías")
            if other_parts:
                if item.startswith("Otras:"):
                    raise ValueError("tipo_comunicado no puede repetir Otras")
                other_parts.append(item)
            elif item.startswith("Otras:"):
                other_parts.append(item.removeprefix("Otras:").strip())
            elif item in materials:
                if item in selected:
                    raise ValueError("tipo_comunicado no puede repetir opciones")
                selected.append(item)
            else:
                raise ValueError("tipo_comunicado debe incluir opciones válidas")
        if other_parts:
            other = ", ".join(other_parts).strip()
            if not other:
                raise ValueError("tipo_comunicado debe especificar Otras")
            selected.append(f"Otras: {other}")
        if not selected:
            raise ValueError("tipo_comunicado requiere al menos una opción")
        return ", ".join(selected)


class ManualSolicitudResponse(ManualSolicitudFields):
    area: str | None = None
    accion: str | None = None
    tipo_comunicado: str | None = None
    responsable: str | None = None
    manual_solicitud_id: str
    sp_created_at: datetime
    sp_modified_at: datetime


class PlannerSolicitudResponse(BaseModel):
    sp_item_id: int
    titulo: str | None = None
    proyecto: str | None = None
    area: str | None = None
    pais: str | None = None
    pais_codigo: str | None = None
    responsable_nombre: str | None = None
    fecha_solicitud: date | None = None
    fecha_publicacion: date | None = None
    accion_solicitud: str | None = None
    tipo_comunicado: str | None = None
    audiencia: str | None = None
    url_sellers: str | None = None
    descripcion: str | None = None
    sp_created_at: datetime
    sp_modified_at: datetime
    decision_id: str | None = None
    decision_accion: str | None = None
    prioridad: str | None = None
    fecha_solicitada: date | None = None
    fecha_aprobada: date | None = None
    motivo: str | None = None
    decidido_at: datetime | None = None
    estado: str
    fecha_calendario: date | None = None


class PlannerFilterOptions(BaseModel):
    pais_codigo: list[str] = Field(default_factory=list)
    proyecto: list[str] = Field(default_factory=list)
    area: list[str] = Field(default_factory=list)
    responsable_nombre: list[str] = Field(default_factory=list)
    prioridad: list[str] = Field(default_factory=list)
    estado: list[str] = Field(default_factory=list)


class PlannerDecisionCreate(BaseModel):
    accion: Literal["AUTORIZAR", "REPROGRAMAR"]
    prioridad: Literal["ALTA", "MEDIA", "BAJA"]
    fecha_aprobada: date | None = None
    motivo: str | None = None
    decision_esperada: str | None


class PlannerDecisionResponse(BaseModel):
    sp_item_id: int
    decision_id: str
    accion: str
    prioridad: str
    fecha_aprobada: date
    estado: str


class PlannerDecisionHistory(BaseModel):
    decision_id: str
    sp_item_id: int
    accion: str
    prioridad: str
    fecha_solicitada: date | None = None
    fecha_aprobada: date
    motivo: str | None = None
    decidido_por: str
    decidido_at: datetime
    decision_anterior: str | None = None

