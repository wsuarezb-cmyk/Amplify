"""
Pydantic schemas compartidos de la API de Pitch.

Los modelos específicos de Reportería y Calibración viven en models/pitch.py;
aquí quedan los transversales: health, catálogo de criterios y hilo del caso.
"""

from typing import Optional
from pydantic import BaseModel


# ─────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    bq_connected: bool
    dataset: str
    error: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Catálogo de criterios (saaca_cat_criteria)
# ─────────────────────────────────────────────────────────────

class CriterionCatalogItem(BaseModel):
    criterion_id: str
    criterion_name: str
    criterion_description: Optional[str] = None
    error_type: str
    error_category: str
    criterion_weight: Optional[float] = None


# ─────────────────────────────────────────────────────────────
# Hilo del caso (contexto para Calibración)
# ─────────────────────────────────────────────────────────────

class CaseThreadResponse(BaseModel):
    case_number: str
    total_tasks: int
    seller_thread_text: Optional[str] = None
    internal_thread_text: Optional[str] = None
