import csv
import io
import json
import logging
import re
import time
import uuid
from collections import Counter
from datetime import datetime, timezone

from google.cloud.bigquery import ArrayQueryParameter, ScalarQueryParameter

logger = logging.getLogger(__name__)

CONTACTS_TABLE = "bi-fcom-drmb-sell-in-sbx.sandbox_pzamora.base_contactos_v2"
SENDS_TABLE = "bi-fcom-drmb-sell-in-sbx.crm_sellers.detalle_contactos_historico"
BATCH_SIZE = 1000
NULL_OPTION = "__NULL__"

# Columnas mínimas que la pantalla necesita para filtrar, graficar y conciliar en memoria.
DATASET_COLUMNS = [
    "src_id", "contacto", "email", "phone", "Pais", "geography", "tipo_seller",
    "tiene_venta_12m", "tiene_catalogo", "estado_sellers_sx", "mc_held_status",
    "desuscritos_mc", "Seller_Delist", "flag_or0_sin_login_3m",
]

SEARCH_COLUMNS = {
    "seller_id": "src_id",
    "rut": "Rut",
    "email": "email",
    "phone": "phone",
    "name": "Nombre",
}

FILTER_COLUMNS = {
    "contact_type": ("contacto", "Tipo de contacto"),
    "has_sales": ("tiene_venta_12m", "Tiene venta"),
    "seller_segment": ("tipo_seller", "Segmento del seller"),
    "has_catalog": ("tiene_catalogo", "Tiene catálogo"),
    "seller_status": ("estado_sellers_sx", "Estado seller"),
    "held": ("mc_held_status", "HELD"),
    "unsubscribed": ("desuscritos_mc", "Desuscrito"),
    "seller_delist": ("Seller_Delist", "Seller delist"),
    "geography": ("geography", "Geografía"),
    "country": ("Pais", "País"),
    "operational_exclusion": ("flag_or0_sin_login_3m", "Exclusión operacional"),
}

FILTER_CATALOGS = {
    "contact_type": [
        "Comercial", "Representante Bodega", "Seller Full Access",
        "Seller Order Access", "Representante legal", "Seller API Access",
        "FSC - Seller Setup", "Seller API Order Access", "Seller Developer",
        "Seller Catalog Access", "Seller API Product Access",
    ],
    "has_sales": [("1", "Sí"), ("0", "No")],
    "seller_segment": ["Autogestionado", "Híbrido", "Cartera asesorada"],
    "has_catalog": [("1", "Sí"), ("0", "No")],
    "seller_status": ["Activo", "Inactivo", "Riesgo", "Nuevo"],
    "unsubscribed": [("activo_mc", "Activo"), ("unsubscribed", "Desuscrito")],
    "seller_delist": ["Seller delist", "Seller OK"],
    "geography": ["National", "International"],
    "country": ["Chile", "Perú", "Colombia"],
    "operational_exclusion": [
        ("EXCLUDE", "Excluir"), ("KEEP", "Mantener"),
    ],
}


def parse_trace_input(raw_input: str, search_type: str = "seller_id") -> dict:
    separator = r"[,;\n\r\t]+" if search_type == "name" else r"[,;\s]+"
    received = [value for value in re.split(separator, raw_input or "") if value]
    if search_type == "name":
        received = [_normalized_name(value) for value in received]
    unique = list(dict.fromkeys(received))
    return {
        "received": len(received),
        "valid_unique": len(unique),
        "invalid": [],
        "duplicates": len(received) - len(unique),
        "identifiers": unique,
    }


def _normalized_name(value: str) -> str:
    return " ".join((value or "").split())


def _row_category(key: str, row: dict) -> str:
    column = FILTER_COLUMNS[key][0]
    value = row.get(column)
    if key == "operational_exclusion":
        if value is None:
            return NULL_OPTION
        return "EXCLUDE" if str(value) == "1" else "KEEP"
    if value is None:
        return NULL_OPTION
    return str(value)


def _option(value: str, label: str | None = None) -> dict:
    return {"value": value, "label": label or value}


class TraceService:
    def __init__(self, bq, audit_table_id: str = "", snapshot_table_id: str = "",
                 not_found_alert_threshold: float = 0.20,
                 daily_drop_threshold: float = 0.20):
        self.bq = bq
        self.audit_table_id = audit_table_id
        self.snapshot_table_id = snapshot_table_id
        self.not_found_alert_threshold = not_found_alert_threshold
        self.daily_drop_threshold = daily_drop_threshold

    @staticmethod
    def _checked_table_id(table_id: str) -> str:
        table_id = (table_id or "").strip()
        if not table_id:
            raise ValueError(
                "Falta configurar TRACE_AUDIENCE_HISTORY_TABLE en backend/.env; "
                "consulta docs/trace-setup.md antes de exportar."
            )
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", table_id):
            raise ValueError(
                "TRACE_AUDIENCE_HISTORY_TABLE debe tener formato proyecto.dataset.tabla."
            )
        return table_id

    def get_filter_options(self) -> dict:
        options = {}
        for key, values in FILTER_CATALOGS.items():
            options[key] = [_option(NULL_OPTION, "Sin dato")]
            for entry in values:
                value, label = entry if isinstance(entry, tuple) else (entry, entry)
                option = _option(value, label)
                if key == "operational_exclusion" and value == "EXCLUDE":
                    option["disabled"] = True
                    option["label"] = "Excluir (siempre fuera de audiencia)"
                options[key].append(option)

        held_rows = self.bq.query(
            f"SELECT DISTINCT mc_held_status AS value FROM `{CONTACTS_TABLE}` "
            "WHERE mc_held_status IS NOT NULL ORDER BY value",
            timeout_s=30,
        )
        options["held"] = [_option(NULL_OPTION, "Sin dato")]
        options["held"].extend(_option(str(row["value"])) for row in held_rows)
        return options

    def _fetch_contacts(self, identifiers: list[str], search_type: str) -> list[dict]:
        if search_type not in SEARCH_COLUMNS:
            raise ValueError("Tipo de búsqueda no soportado.")
        if not identifiers:
            return []

        search_column = SEARCH_COLUMNS[search_type]
        normalized = search_type == "name"
        expression = (
            r"REGEXP_REPLACE(TRIM(Nombre), r'\s+', ' ')"
            if normalized else f"CAST({search_column} AS STRING)"
        )
        columns = ["src_id", "email", "phone", search_column] + [
            value[0] for value in FILTER_COLUMNS.values()
        ]
        select_columns = ", ".join(dict.fromkeys(columns))
        rows = []
        for offset in range(0, len(identifiers), BATCH_SIZE):
            batch = identifiers[offset:offset + BATCH_SIZE]
            values = [_normalized_name(value) for value in batch] if normalized else batch
            rows.extend(self.bq.query(
                f"SELECT {select_columns} FROM `{CONTACTS_TABLE}` "
                f"WHERE {expression} IN UNNEST(@search_values)",
                params=[ArrayQueryParameter("search_values", "STRING", values)],
                timeout_s=60,
            ))
        return rows

    def _apply_filters(self, rows: list[dict], filters: dict) -> tuple[list[dict], list[dict]]:
        unknown = set(filters) - set(FILTER_COLUMNS)
        if unknown:
            raise ValueError("Se recibió un filtro de Trace no reconocido.")

        current = rows
        stages = []
        for key in FILTER_COLUMNS:
            selected = filters.get(key) or []
            if not selected:
                continue
            if key == "operational_exclusion":
                if "EXCLUDE" in selected:
                    raise ValueError("Los sellers marcados para exclusión operacional no son elegibles.")
            before_sellers = {row.get("src_id") for row in current if row.get("src_id") is not None}
            selected_values = set(selected)
            filtered = [row for row in current if _row_category(key, row) in selected_values]
            after_sellers = {row.get("src_id") for row in filtered if row.get("src_id") is not None}
            if key == "operational_exclusion" or before_sellers != after_sellers or len(current) != len(filtered) or selected:
                stages.append({
                "rule": key,
                "label": FILTER_COLUMNS[key][1],
                "before_sellers": len(before_sellers),
                "remaining_sellers": len(after_sellers),
                "excluded_sellers": len(before_sellers - after_sellers),
                "variation_percent": round(
                    (len(after_sellers) - len(before_sellers)) * 100 / len(before_sellers), 2
                ) if before_sellers else None,
                "before_contacts": len(current),
                "remaining_contacts": len(filtered),
                "excluded_contacts": len(current) - len(filtered),
                })
            current = filtered

        return current, stages

    def dataset(self, raw_input: str, search_type: str) -> dict:
        started = time.monotonic()
        parsed = parse_trace_input(raw_input, search_type)
        identifiers = parsed["identifiers"]
        if not identifiers:
            raise ValueError("Ingresa al menos un identificador válido.")

        rows = self._fetch_contacts(identifiers, search_type)
        search_column = SEARCH_COLUMNS[search_type]
        matched = set()
        for row in rows:
            value = row.get(search_column)
            if value is not None:
                matched.add(_normalized_name(str(value)) if search_type == "name" else str(value))
        requested = set(identifiers)
        not_found = sorted(requested - matched)
        found_count = len(requested & matched)
        logger.info(
            "Trace dataset loaded: ids=%d rows=%d duration_ms=%d",
            len(identifiers), len(rows), (time.monotonic() - started) * 1000,
        )
        return {
            "input": {key: parsed[key] for key in ("received", "valid_unique", "invalid", "duplicates")},
            "search_type": search_type,
            "matching": {
                "found_identifiers": found_count,
                "not_found_identifiers": len(not_found),
                "not_found_values": not_found,
            },
            "input_reconciled": found_count + len(not_found) == parsed["valid_unique"],
            "not_found_alert_threshold": self.not_found_alert_threshold,
            "dataset": {
                "columns": DATASET_COLUMNS,
                "rows": [[row.get(column) for column in DATASET_COLUMNS] for row in rows],
            },
        }

    def preview(self, raw_input: str, search_type: str, filters: dict) -> dict:
        parsed = parse_trace_input(raw_input, search_type)
        identifiers = parsed["identifiers"]
        if not identifiers:
            raise ValueError("Ingresa al menos un identificador válido.")

        rows = self._fetch_contacts(identifiers, search_type)
        matched_identifiers = set()
        for row in rows:
            source_value = row.get(SEARCH_COLUMNS[search_type])
            if source_value is None:
                continue
            matched = str(source_value)
            if search_type == "name":
                matched = _normalized_name(matched)
            matched_identifiers.add(matched)
        requested = {
            _normalized_name(value) if search_type == "name" else value
            for value in identifiers
        }
        not_found = sorted(requested - matched_identifiers)
        found_sellers = {row.get("src_id") for row in rows if row.get("src_id") is not None}
        contact_counts = Counter(row.get("src_id") for row in rows if row.get("src_id") is not None)

        filtered, stages = self._apply_filters(rows, filters)
        sellers_before_channels = {
            row.get("src_id") for row in filtered if row.get("src_id") is not None
        }
        contacts = [row for row in filtered if row.get("email") or row.get("phone")]
        eligible_sellers = {row.get("src_id") for row in filtered if row.get("src_id") is not None}
        final_sellers = {row.get("src_id") for row in contacts if row.get("src_id") is not None}
        stages.append({
            "rule": "contact_channel",
            "label": "Sin canal de contacto",
            "before_sellers": len(sellers_before_channels),
            "remaining_sellers": len(final_sellers),
            "excluded_sellers": len(sellers_before_channels - final_sellers),
            "variation_percent": round(
                (len(final_sellers) - len(sellers_before_channels)) * 100 / len(sellers_before_channels), 2
            ) if sellers_before_channels else None,
            "before_contacts": len(filtered),
            "remaining_contacts": len(contacts),
            "excluded_contacts": len(filtered) - len(contacts),
        })

        excluded_sellers = sum(
            stage["excluded_sellers"] for stage in stages
            if stage["rule"] != "contact_channel"
        )
        matched_count = len(matched_identifiers & requested)
        input_reconciled = matched_count + len(not_found) == parsed["valid_unique"]
        reconciliation_ok = (
            input_reconciled
            and len(found_sellers) == len(eligible_sellers) + excluded_sellers
        )
        alerts = []
        if not_found:
            alerts.append({
                "code": "IDENTIFIERS_NOT_FOUND",
                "severity": "warning",
                "requires_confirmation": (
                    search_type == "seller_id"
                    and len(not_found) / len(identifiers) > self.not_found_alert_threshold
                ),
                "message": f"{len(not_found)} identificadores no aparecen en la base maestra.",
            })
        selected_filter_nulls = any(
            values and any(_row_category(key, row) == NULL_OPTION for row in rows)
            for key, values in filters.items()
        )
        if selected_filter_nulls:
            alerts.append({
                "code": "FILTER_NULLS_PRESENT",
                "severity": "warning",
                "requires_confirmation": False,
                "message": "Hay registros con valores sin dato en filtros aplicados.",
            })
        if not reconciliation_ok:
            alerts.append({
                "code": "COUNTS_NOT_RECONCILED",
                "severity": "error",
                "requires_confirmation": False,
                "message": "Los conteos de sellers no concilian; no se puede descargar.",
            })
        if not final_sellers:
            alerts.append({
                "code": "EMPTY_AUDIENCE",
                "severity": "error",
                "requires_confirmation": False,
                "message": "La audiencia final no contiene sellers elegibles.",
            })
        if not contacts:
            alerts.append({
                "code": "NO_CONTACTS",
                "severity": "error",
                "requires_confirmation": False,
                "message": "La audiencia final no contiene contactos con email o teléfono.",
            })

        return {
            "input": {key: parsed[key] for key in ("received", "valid_unique", "invalid", "duplicates")},
            "search_type": search_type,
            "matching": {
                "found_identifiers": len(matched_identifiers & requested),
                "not_found_identifiers": len(not_found),
                "not_found_values": not_found,
                "found_sellers": len(found_sellers),
                "contacts": len(rows),
                "sellers_without_contact": len(
                    found_sellers - {
                        row.get("src_id") for row in rows
                        if row.get("src_id") is not None and (row.get("email") or row.get("phone"))
                    }
                ),
                "sellers_with_multiple_contacts": sum(1 for count in contact_counts.values() if count > 1),
            },
            "stages": stages,
            "result": {
                "eligible_sellers": len(eligible_sellers),
                "final_contacts": len(contacts),
            },
            "alerts": alerts,
            "reconciliation_ok": reconciliation_ok,
        }

    def export(self, raw_input: str, search_type: str, filters: dict, template: str,
               confirm_warnings: bool, user_email: str) -> tuple[str, str, dict]:
        if not template.strip():
            raise ValueError("El nombre del template es obligatorio.")
        preview = self.preview(raw_input, search_type, filters)
        if not preview["reconciliation_ok"] or preview["result"]["final_contacts"] == 0:
            raise ValueError("La audiencia no cumple las validaciones para descargar.")
        if any(alert["requires_confirmation"] for alert in preview["alerts"]) and not confirm_warnings:
            raise PermissionError("Confirma explícitamente las advertencias antes de descargar.")
        table_id = self._checked_table_id(self.audit_table_id)

        parsed = parse_trace_input(raw_input, search_type)
        rows, _ = self._apply_filters(
            self._fetch_contacts(parsed["identifiers"], search_type), filters
        )
        rows = [row for row in rows if row.get("email") or row.get("phone")]
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer, lineterminator="\n")
        writer.writerow(["email", "seller_id", "phone"])
        for row in rows:
            writer.writerow([row.get("email") or "", row.get("src_id") or "", row.get("phone") or ""])

        audience_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc)
        filename = f"trace_audience_{created_at:%Y%m%dT%H%M%SZ}_{audience_id[:8]}.csv"
        audit = {
            "audience_id": audience_id,
            "created_at": created_at,
            "created_date": created_at.date(),
            "created_by": user_email,
            "template": template.strip(),
            "search_type": search_type,
            "initial_sellers": preview["input"]["valid_unique"],
            "found_sellers": preview["matching"]["found_sellers"],
            "final_sellers": preview["result"]["eligible_sellers"],
            "final_contacts": len(rows),
            "filters_json": json.dumps(filters, ensure_ascii=False),
            "exclusions_json": json.dumps(preview["stages"], ensure_ascii=False),
            "warnings_json": json.dumps(preview["alerts"], ensure_ascii=False),
            "export_file_name": filename,
            "status": "EXPORTED",
        }
        self.bq.insert_rows_dml(table_id, [audit])
        logger.info(
            "Trace audience export completed: audience_id=%s sellers=%d contacts=%d",
            audience_id, audit["final_sellers"], audit["final_contacts"],
        )
        return buffer.getvalue(), filename, preview

    @staticmethod
    def _send_filters(template: str, seller_id: str | None, status: str | None) -> tuple[str, list]:
        clauses = ["template = @template"]
        params = [ScalarQueryParameter("template", "STRING", template)]
        if seller_id:
            clauses.append("id_seller = @seller_id")
            params.append(ScalarQueryParameter("seller_id", "STRING", seller_id))
        if status:
            status_map = {"ENVIADO": "Enviado", "NO_ENVIADO": "Not Sent"}
            if status not in status_map:
                raise ValueError("Estado de envío no reconocido.")
            clauses.append("estado_envio = @status")
            params.append(ScalarQueryParameter("status", "STRING", status_map[status]))
        return " AND ".join(clauses), params

    def sends_summary(self, template: str, seller_id: str | None = None,
                      status: str | None = None) -> dict:
        where, params = self._send_filters(template, seller_id, status)
        rows = self.bq.query(
            f"""SELECT
              COUNT(*) AS contacts_processed,
              COUNT(DISTINCT id_seller) AS sellers_processed,
              COUNTIF(estado_envio = 'Enviado') AS contacts_sent,
              COUNT(DISTINCT IF(estado_envio = 'Enviado', id_seller, NULL)) AS sellers_sent,
              COUNTIF(estado_envio = 'Not Sent') AS contacts_not_sent,
              COUNT(DISTINCT IF(estado_envio = 'Not Sent', id_seller, NULL)) AS sellers_not_sent,
              COUNTIF(estado_envio IS NULL OR estado_envio NOT IN ('Enviado', 'Not Sent')) AS unclassified,
              COUNTIF(open = 'Open') AS opens,
              COUNTIF(clic = 'Clic') AS clicks,
              MIN(fecha) AS first_date,
              MAX(fecha) AS last_date
            FROM `{SENDS_TABLE}` WHERE {where}""",
            params=params,
            timeout_s=60,
        )
        result = rows[0] if rows else {}
        causes = self.bq.query(
            f"""SELECT COALESCE(causa, 'Sin causa') AS cause, COUNT(*) AS contacts
            FROM `{SENDS_TABLE}`
            WHERE {where} AND estado_envio = 'Not Sent'
            GROUP BY cause ORDER BY contacts DESC""",
            params=params,
            timeout_s=60,
        )
        return {"template": template, "summary": result, "not_sent_causes": causes}

    def sends_detail(self, template: str, seller_id: str | None, status: str | None,
                     page: int, page_size: int) -> dict:
        where, params = self._send_filters(template, seller_id, status)
        count_rows = self.bq.query(
            f"SELECT COUNT(*) AS total FROM `{SENDS_TABLE}` WHERE {where}",
            params=params,
            timeout_s=60,
        )
        detail_params = params + [
            ScalarQueryParameter("limit", "INT64", page_size),
            ScalarQueryParameter("offset", "INT64", (page - 1) * page_size),
        ]
        rows = self.bq.query(
            f"""SELECT id_seller, email, template, estado_envio, causa, fecha, open, clic,
              CASE estado_envio
                WHEN 'Enviado' THEN 'ENVIADO'
                WHEN 'Not Sent' THEN 'NO_ENVIADO'
                ELSE 'SIN_CLASIFICAR'
              END AS normalized_status
            FROM `{SENDS_TABLE}` WHERE {where}
            ORDER BY fecha DESC LIMIT @limit OFFSET @offset""",
            params=detail_params,
            timeout_s=60,
        )
        total = count_rows[0]["total"] if count_rows else 0
        return {"items": rows, "page": page, "page_size": page_size, "total": total}

    def audience_history(self, template: str | None, created_by: str | None,
                         created_from: str | None, created_to: str | None,
                         page: int, page_size: int) -> dict:
        table_id = self._checked_table_id(self.audit_table_id)
        clauses, params = [], []
        if template:
            clauses.append("template = @template")
            params.append(ScalarQueryParameter("template", "STRING", template))
        if created_by:
            clauses.append("created_by = @created_by")
            params.append(ScalarQueryParameter("created_by", "STRING", created_by))
        if created_from:
            clauses.append("created_date >= @created_from")
            params.append(ScalarQueryParameter("created_from", "DATE", created_from))
        if created_to:
            clauses.append("created_date <= @created_to")
            params.append(ScalarQueryParameter("created_to", "DATE", created_to))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        count_rows = self.bq.query(
            f"SELECT COUNT(*) AS total FROM `{table_id}` {where}",
            params=params,
            timeout_s=60,
        )
        rows = self.bq.query(
            f"""SELECT audience_id, created_at, created_by, template, search_type,
              initial_sellers, found_sellers, final_sellers, final_contacts,
              filters_json, exclusions_json, warnings_json, export_file_name, status
            FROM `{table_id}` {where}
            ORDER BY created_at DESC LIMIT @limit OFFSET @offset""",
            params=params + [
                ScalarQueryParameter("limit", "INT64", page_size),
                ScalarQueryParameter("offset", "INT64", (page - 1) * page_size),
            ],
            timeout_s=60,
        )
        return {
            "items": rows,
            "page": page,
            "page_size": page_size,
            "total": count_rows[0]["total"] if count_rows else 0,
        }

    def daily_volume_status(self) -> dict:
        if not self.snapshot_table_id:
            return {"available": False, "message": "Snapshot diario no configurado."}
        table_id = self._checked_table_id(self.snapshot_table_id)
        rows = self.bq.query(
            f"""SELECT snapshot_date, total_rows, distinct_sellers, total_contacts
            FROM `{table_id}` ORDER BY snapshot_date DESC LIMIT 2""",
            timeout_s=30,
        )
        if not rows:
            return {"available": True, "current": None, "previous": None, "alert": False}
        current = rows[0]
        previous = rows[1] if len(rows) > 1 else None
        alert = False
        if previous:
            for metric in ("distinct_sellers", "total_contacts"):
                prior = previous.get(metric) or 0
                if prior and (prior - (current.get(metric) or 0)) / prior >= self.daily_drop_threshold:
                    alert = True
        return {"available": True, "current": current, "previous": previous, "alert": alert}

    def capture_daily_volume(self) -> dict:
        table_id = self._checked_table_id(self.snapshot_table_id)
        counts = self.bq.query(
            f"""SELECT COUNT(*) AS total_rows,
              COUNT(DISTINCT src_id) AS distinct_sellers,
              COUNTIF(email IS NOT NULL OR phone IS NOT NULL) AS total_contacts
            FROM `{CONTACTS_TABLE}`""",
            timeout_s=120,
        )
        if not counts:
            raise RuntimeError("BigQuery no devolvió el conteo diario de contactos.")
        values = counts[0]
        snapshot_date = datetime.now(timezone.utc).date()
        params = [
            ScalarQueryParameter("snapshot_date", "DATE", snapshot_date),
            ScalarQueryParameter("total_rows", "INT64", values["total_rows"]),
            ScalarQueryParameter("distinct_sellers", "INT64", values["distinct_sellers"]),
            ScalarQueryParameter("total_contacts", "INT64", values["total_contacts"]),
        ]
        self.bq.query(
            f"""MERGE `{table_id}` AS target
            USING (SELECT @snapshot_date AS snapshot_date) AS source
            ON target.snapshot_date = source.snapshot_date
            WHEN MATCHED THEN UPDATE SET
              captured_at = CURRENT_TIMESTAMP(),
              total_rows = @total_rows,
              distinct_sellers = @distinct_sellers,
              total_contacts = @total_contacts
            WHEN NOT MATCHED THEN INSERT
              (snapshot_date, captured_at, total_rows, distinct_sellers, total_contacts)
            VALUES
              (@snapshot_date, CURRENT_TIMESTAMP(), @total_rows, @distinct_sellers, @total_contacts)""",
            params=params,
            timeout_s=60,
        )
        return self.daily_volume_status()