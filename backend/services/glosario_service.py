"""
GlosarioService — catálogo de criterios de SAACA para la pestaña Glosario.

  - Lee TODAS las versiones de saaca_cat_criteria y consolida una entrada por
    criterio (versión vigente + historial) con la misma prioridad que
    _catalogo_canonico() de calibracion_service: activa y vigente primero,
    luego mayor criteria_version, luego updated_at.
  - Lee saaca_cat_criteria_mapping SIN las filas HUMANO (son internas de Pitch,
    no de SAACA).
  - Caché diaria en memoria de proceso, mismo patrón que el extracto de
    Reportería: el catálogo cambia rara vez y lo consultan todos los roles.
"""

import logging
from datetime import date, datetime, timezone

from backend.connectors.bigquery_connector import BigQueryConnector
from backend.models.glosario import (
    CriterioGlosario,
    CriterioTipoInteraccion,
    CriterioVersion,
    GlosarioResponse,
)

logger = logging.getLogger(__name__)

_CRITERIA_TABLE = "saaca_cat_criteria"
_MAPPING_TABLE  = "saaca_cat_criteria_mapping"

# Un payload por fecha; cada instancia de Cloud Run calienta el suyo.
_cache: dict[str, GlosarioResponse] = {}


def _es_vigente(row: dict, hoy: str) -> bool:
    """Activa y dentro de vigencia (valid_to NULL o no vencido). Fechas ISO comparables como texto."""
    return bool(row.get("is_active")) and (row.get("valid_to") is None or row["valid_to"] >= hoy)


def consolidar_catalogo(
    rows_criterios: list[dict], rows_mapping: list[dict], hoy: str | None = None,
) -> tuple[list[CriterioGlosario], list[str]]:
    """
    Agrupa las versiones por criterion_id y elige la vigente.

    Retorna (criterios ordenados por id, tipos de interacción con mapping activo).
    """
    hoy = hoy or date.today().isoformat()

    versiones: dict[str, list[dict]] = {}
    for r in rows_criterios:
        versiones.setdefault(r["criterion_id"], []).append(r)

    mapping: dict[str, list[CriterioTipoInteraccion]] = {}
    tipos_activos: set[str] = set()
    for m in rows_mapping:
        mapping.setdefault(m["criterion_id"], []).append(CriterioTipoInteraccion(
            interaction_type=m["interaction_type"],
            mechanism=m["mechanism"],
            notes=m.get("notes"),
            is_active=bool(m.get("is_active")),
        ))
        if m.get("is_active"):
            tipos_activos.add(m["interaction_type"])

    criterios: list[CriterioGlosario] = []
    for cid, filas in versiones.items():
        vigente = max(filas, key=lambda r: (
            _es_vigente(r, hoy), r.get("criteria_version") or 0, r.get("updated_at") or "",
        ))
        historial = sorted(filas, key=lambda r: r.get("criteria_version") or 0, reverse=True)
        criterios.append(CriterioGlosario(
            criterion_id=cid,
            estado="ACTIVO" if _es_vigente(vigente, hoy) else "INACTIVO",
            criterion_name=vigente.get("criterion_name"),
            criterion_description=vigente.get("criterion_description"),
            error_type=vigente.get("error_type"),
            error_category=vigente.get("error_category"),
            criterion_weight=vigente.get("criterion_weight"),
            criteria_version=vigente.get("criteria_version"),
            valid_from=vigente.get("valid_from"),
            valid_to=vigente.get("valid_to"),
            historial=[
                CriterioVersion(**{k: h.get(k) for k in CriterioVersion.model_fields if k in h})
                for h in historial
            ],
            tipos_interaccion=sorted(
                mapping.get(cid, []), key=lambda t: (not t.is_active, t.interaction_type),
            ),
        ))

    criterios.sort(key=lambda c: c.criterion_id)
    return criterios, sorted(tipos_activos)


class GlosarioService:

    def __init__(self, bq: BigQueryConnector) -> None:
        self.bq = bq

    def get_glosario(self, force_refresh: bool = False) -> GlosarioResponse:
        cache_key = date.today().isoformat()
        if not force_refresh and cache_key in _cache:
            return _cache[cache_key]

        criteria_t = self.bq.full_table_id(_CRITERIA_TABLE)
        mapping_t  = self.bq.full_table_id(_MAPPING_TABLE)

        rows_criterios = self.bq.query(
            f"""
            SELECT
              criterion_id, criterion_name, criterion_description,
              error_type, error_category, criterion_weight, criteria_version,
              CAST(valid_from AS STRING) AS valid_from,
              CAST(valid_to   AS STRING) AS valid_to,
              is_active,
              CAST(updated_at AS STRING) AS updated_at
            FROM `{criteria_t}`
            """,
            timeout_s=30,
        )
        rows_mapping = self.bq.query(
            f"""
            SELECT criterion_id, interaction_type, mechanism, notes, is_active
            FROM `{mapping_t}`
            WHERE mechanism != 'HUMANO'
            """,
            timeout_s=30,
        )

        criterios, tipos = consolidar_catalogo(rows_criterios, rows_mapping, hoy=cache_key)
        payload = GlosarioResponse(
            fecha_carga=datetime.now(timezone.utc).isoformat(),
            criterios=criterios,
            tipos_interaccion=tipos,
        )

        _cache.clear()
        _cache[cache_key] = payload
        logger.info("Glosario cargado y cacheado: %d criterios (key=%s)", len(criterios), cache_key)
        return payload
