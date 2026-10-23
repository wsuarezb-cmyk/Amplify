from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from google.cloud.bigquery import ScalarQueryParameter, SchemaField

from backend.config import Settings
from backend.connectors.bigquery_connector import BigQueryConnector
from backend.models.planner import (
    ManualSolicitudCreate,
    PlannerDecisionCreate,
    PlannerDecisionHistory,
    PlannerDecisionResponse,
    ManualSolicitudResponse,
    PlannerFilterOptions,
    PlannerSolicitudResponse,
)


MANUAL_TABLE = "comunicaciones_solicitudes_manuales_amplify"
DECISION_TABLE = "comunicaciones_decisiones_amplify"
APPROVAL_VIEW = "vw_planner_solicitudes"
APPROVAL_COLUMNS = """
    sp_item_id,
    titulo,
    proyecto,
    area,
    pais,
    pais_codigo,
    responsable_nombre,
    fecha_solicitud,
    fecha_publicacion,
    accion_solicitud,
    tipo_comunicado,
    audiencia,
    url_sellers,
    descripcion,
    sp_created_at,
    sp_modified_at,
    decision_id,
    decision_accion,
    prioridad,
    fecha_solicitada,
    fecha_aprobada,
    motivo,
    decidido_at,
    estado,
    fecha_calendario
"""
APPROVAL_FILTERS = """
    (@estado IS NULL OR estado = @estado)
    AND (@pais_codigo IS NULL OR @pais_codigo IN UNNEST(SPLIT(COALESCE(pais_codigo, ''), ',')))
    AND (@proyecto IS NULL OR proyecto = @proyecto)
    AND (@area IS NULL OR area = @area)
    AND (@responsable_nombre IS NULL OR responsable_nombre = @responsable_nombre)
    AND (@prioridad IS NULL OR prioridad = @prioridad)
"""
MANUAL_SCHEMA = [
    SchemaField("manual_solicitud_id", "STRING", mode="REQUIRED"),
    SchemaField("area", "STRING"),
    SchemaField("pais", "STRING"),
    SchemaField("proyecto", "STRING"),
    SchemaField("accion", "STRING"),
    SchemaField("tipo_comunicado", "STRING"),
    SchemaField("fecha_envio", "DATE", mode="REQUIRED"),
    SchemaField("audiencia", "STRING"),
    SchemaField("url_sellers", "STRING"),
    SchemaField("descripcion", "STRING"),
    SchemaField("responsable", "STRING"),
    SchemaField("creado_por_email", "STRING", mode="REQUIRED"),
    SchemaField("sp_created_at", "TIMESTAMP", mode="REQUIRED"),
    SchemaField("sp_modified_at", "TIMESTAMP", mode="REQUIRED"),
    SchemaField("fecha_cargue", "TIMESTAMP", mode="REQUIRED"),
    SchemaField("is_deleted", "BOOL", mode="REQUIRED"),
]


class PlannerDecisionConflict(Exception):
    pass


class PlannerService:
    def __init__(self, bq: BigQueryConnector, settings: Settings):
        self.bq = bq
        self.table_id = (
            f"{settings.BQ_PROJECT_ID}.{settings.PLANNER_DATASET}.{MANUAL_TABLE}"
        )
        self.view_id = (
            f"{settings.BQ_PROJECT_ID}.{settings.PLANNER_DATASET}.{APPROVAL_VIEW}"
        )
        self.decision_table_id = (
            f"{settings.BQ_PROJECT_ID}.{settings.PLANNER_DATASET}.{DECISION_TABLE}"
        )
        try:
            self.timezone = ZoneInfo(settings.PLANNER_TIMEZONE)
        except ZoneInfoNotFoundError:
            if settings.PLANNER_TIMEZONE != "America/Bogota":
                raise
            self.timezone = timezone(timedelta(hours=-5))

    @staticmethod
    def _mask_email(email: str) -> str:
        local, separator, domain = email.partition("@")
        if not separator or not local or not domain:
            return "•••"
        return f"{local[0]}•••@{domain}"

    def create_decision(
        self,
        sp_item_id: int,
        body: PlannerDecisionCreate,
        decided_by_email: str,
    ) -> PlannerDecisionResponse:
        rows = self.bq.query(
            f"""SELECT sp_item_id, decision_id, fecha_publicacion, sp_modified_at
FROM `{self.view_id}`
WHERE sp_item_id = @sp_item_id""",
            params=[ScalarQueryParameter("sp_item_id", "INT64", sp_item_id)],
        )
        if not rows:
            raise LookupError("Solicitud no encontrada")

        request = rows[0]
        previous_id = request.get("decision_id")
        if previous_id != body.decision_esperada:
            raise PlannerDecisionConflict("La solicitud fue decidida por otra persona; recárgala")

        requested_date = request.get("fecha_publicacion")
        if body.accion == "AUTORIZAR":
            if requested_date is None:
                raise ValueError("La solicitud no tiene fecha solicitada; debes reprogramarla")
            approved_date = requested_date
            reason = None
        else:
            if body.fecha_aprobada is None:
                raise ValueError("La nueva fecha es obligatoria para reprogramar")
            reason = (body.motivo or "").strip()
            if not reason:
                raise ValueError("El motivo es obligatorio para reprogramar")
            if body.fecha_aprobada < datetime.now(self.timezone).date():
                raise ValueError("La nueva fecha no puede ser anterior a hoy")
            approved_date = body.fecha_aprobada

        decision_id = str(uuid4())
        decided_at = datetime.now(timezone.utc)
        params = [
            ScalarQueryParameter("decision_id", "STRING", decision_id),
            ScalarQueryParameter("sp_item_id", "INT64", sp_item_id),
            ScalarQueryParameter("accion", "STRING", body.accion),
            ScalarQueryParameter("prioridad", "STRING", body.prioridad),
            ScalarQueryParameter("fecha_solicitada", "DATE", requested_date),
            ScalarQueryParameter("fecha_aprobada", "DATE", approved_date),
            ScalarQueryParameter("motivo", "STRING", reason),
            ScalarQueryParameter("decidido_por_email", "STRING", decided_by_email),
            ScalarQueryParameter("decidido_at", "TIMESTAMP", decided_at),
            ScalarQueryParameter("decision_anterior", "STRING", previous_id),
            ScalarQueryParameter("decision_esperada", "STRING", body.decision_esperada),
            ScalarQueryParameter("sp_modified_at", "TIMESTAMP", request["sp_modified_at"]),
        ]
        inserted = self.bq.execute_dml(
            f"""INSERT INTO `{self.decision_table_id}` (
  decision_id, sp_item_id, accion, prioridad, fecha_solicitada,
  fecha_aprobada, motivo, decidido_por_email, decidido_at, decision_anterior
)
SELECT
  @decision_id, @sp_item_id, @accion, @prioridad, @fecha_solicitada,
  @fecha_aprobada, @motivo, @decidido_por_email, @decidido_at, @decision_anterior
WHERE EXISTS (
  SELECT 1
  FROM `{self.view_id}`
  WHERE sp_item_id = @sp_item_id
    AND sp_modified_at = @sp_modified_at
)
AND @decision_esperada IS NOT DISTINCT FROM (
  SELECT ARRAY_AGG(decision_id ORDER BY decidido_at DESC, decision_id DESC LIMIT 1)[SAFE_OFFSET(0)]
  FROM `{self.decision_table_id}`
  WHERE sp_item_id = @sp_item_id
)""",
            params=params,
        )
        if inserted != 1:
            raise PlannerDecisionConflict("La solicitud cambió mientras se guardaba; recárgala")

        return PlannerDecisionResponse(
            sp_item_id=sp_item_id,
            decision_id=decision_id,
            accion=body.accion,
            prioridad=body.prioridad,
            fecha_aprobada=approved_date,
            estado="AUTORIZADA" if body.accion == "AUTORIZAR" else "REPROGRAMADA",
        )

    def get_decision_history(self, sp_item_id: int) -> list[PlannerDecisionHistory]:
        request = self.bq.query(
            f"SELECT sp_item_id FROM `{self.view_id}` WHERE sp_item_id = @sp_item_id",
            params=[ScalarQueryParameter("sp_item_id", "INT64", sp_item_id)],
        )
        if not request:
            raise LookupError("Solicitud no encontrada")
        rows = self.bq.query(
            f"""SELECT
  decision_id,
  sp_item_id,
  accion,
  prioridad,
  fecha_solicitada,
  fecha_aprobada,
  motivo,
  decidido_por_email,
  decidido_at,
  decision_anterior
FROM `{self.decision_table_id}`
WHERE sp_item_id = @sp_item_id
ORDER BY decidido_at DESC, decision_id DESC""",
            params=[ScalarQueryParameter("sp_item_id", "INT64", sp_item_id)],
        )
        return [
            PlannerDecisionHistory(
                **{key: value for key, value in row.items() if key != "decidido_por_email"},
                decidido_por=self._mask_email(row["decidido_por_email"]),
            )
            for row in rows
        ]

    @staticmethod
    def _approval_params(
        estado: str | None = None,
        pais_codigo: str | None = None,
        proyecto: str | None = None,
        area: str | None = None,
        responsable_nombre: str | None = None,
        prioridad: str | None = None,
        desde: date | None = None,
        hasta: date | None = None,
    ) -> list[ScalarQueryParameter]:
        return [
            ScalarQueryParameter("estado", "STRING", estado),
            ScalarQueryParameter("pais_codigo", "STRING", pais_codigo),
            ScalarQueryParameter("proyecto", "STRING", proyecto),
            ScalarQueryParameter("area", "STRING", area),
            ScalarQueryParameter("responsable_nombre", "STRING", responsable_nombre),
            ScalarQueryParameter("prioridad", "STRING", prioridad),
            ScalarQueryParameter("desde", "DATE", desde),
            ScalarQueryParameter("hasta", "DATE", hasta),
        ]

    def list_approval_requests(
        self,
        *,
        estado: str | None = None,
        pais_codigo: str | None = None,
        proyecto: str | None = None,
        area: str | None = None,
        responsable_nombre: str | None = None,
        prioridad: str | None = None,
        desde: date | None = None,
        hasta: date | None = None,
    ) -> list[PlannerSolicitudResponse]:
        rows = self.bq.query(
            f"""SELECT {APPROVAL_COLUMNS}
FROM `{self.view_id}`
WHERE {APPROVAL_FILTERS}
  AND (@desde IS NULL OR fecha_publicacion >= @desde)
  AND (@hasta IS NULL OR fecha_publicacion <= @hasta)
ORDER BY
  CASE WHEN estado IN ('PENDIENTE', 'MODIFICADA') THEN 0 ELSE 1 END,
  fecha_publicacion,
  sp_item_id""",
            params=self._approval_params(
                estado, pais_codigo, proyecto, area, responsable_nombre, prioridad, desde, hasta
            ),
        )
        return [PlannerSolicitudResponse(**row) for row in rows]

    def list_calendar_requests(
        self,
        desde: date,
        hasta: date,
        *,
        estado: str | None = None,
        pais_codigo: str | None = None,
        proyecto: str | None = None,
        area: str | None = None,
        responsable_nombre: str | None = None,
        prioridad: str | None = None,
    ) -> list[PlannerSolicitudResponse]:
        rows = self.bq.query(
            f"""SELECT {APPROVAL_COLUMNS}
FROM `{self.view_id}`
WHERE fecha_calendario BETWEEN @desde AND @hasta
  AND {APPROVAL_FILTERS}
ORDER BY fecha_calendario, sp_item_id""",
            params=self._approval_params(
                estado, pais_codigo, proyecto, area, responsable_nombre, prioridad,
                desde, hasta,
            ),
        )
        return [PlannerSolicitudResponse(**row) for row in rows]

    def get_approval_filter_options(self) -> PlannerFilterOptions:
        rows = self.bq.query(
            f"""SELECT DISTINCT
  pais_codigo,
  proyecto,
  area,
  responsable_nombre,
  prioridad,
  estado
FROM `{self.view_id}`"""
        )
        paises: set[str] = set()
        projects: set[str] = set()
        areas: set[str] = set()
        responsables: set[str] = set()
        priorities: set[str] = set()
        statuses: set[str] = set()
        for row in rows:
            paises.update(code.strip() for code in (row.get("pais_codigo") or "").split(",") if code.strip())
            for column, target in (
                ("proyecto", projects),
                ("area", areas),
                ("responsable_nombre", responsables),
                ("prioridad", priorities),
                ("estado", statuses),
            ):
                value = row.get(column)
                if value:
                    target.add(value)
        priority_order = [value for value in ("ALTA", "MEDIA", "BAJA") if value in priorities]
        status_order = [
            value for value in ("PENDIENTE", "MODIFICADA", "AUTORIZADA", "REPROGRAMADA")
            if value in statuses
        ]
        return PlannerFilterOptions(
            pais_codigo=sorted(paises),
            proyecto=sorted(projects),
            area=sorted(areas),
            responsable_nombre=sorted(responsables),
            prioridad=priority_order + sorted(priorities.difference(priority_order)),
            estado=status_order + sorted(statuses.difference(status_order)),
        )

    def list_manual_requests(self) -> list[ManualSolicitudResponse]:
        rows = self.bq.query(
            f"""SELECT
  manual_solicitud_id,
  area,
  pais,
  proyecto,
  accion,
  tipo_comunicado,
  fecha_envio,
  audiencia,
  url_sellers,
  descripcion,
  responsable,
  sp_created_at,
  sp_modified_at
FROM `{self.table_id}`
WHERE is_deleted = FALSE
ORDER BY fecha_envio"""
        )
        return [ManualSolicitudResponse(**row) for row in rows]

    def create_manual_request(
        self, body: ManualSolicitudCreate, creator_email: str, responsible_name: str
    ) -> ManualSolicitudResponse:
        now = datetime.now(timezone.utc)
        request_id = str(uuid4())
        row = {
            "manual_solicitud_id": request_id,
            **body.model_dump(),
            "responsable": responsible_name,
            "creado_por_email": creator_email,
            "sp_created_at": now,
            "sp_modified_at": now,
            "fecha_cargue": now,
            "is_deleted": False,
        }
        self.bq.insert_rows_dml(self.table_id, [row], schema=MANUAL_SCHEMA)
        response = {key: value for key, value in row.items() if key != "creado_por_email"}
        response.pop("fecha_cargue")
        response.pop("is_deleted")
        return ManualSolicitudResponse(**response)
