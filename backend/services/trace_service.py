import csv
import hashlib
import io
import json
import logging
import re
import time
import uuid
from collections import Counter
from datetime import date, datetime, timezone

from google.cloud.bigquery import ArrayQueryParameter, ScalarQueryParameter

logger = logging.getLogger(__name__)

CONTACTS_TABLE = "bi-fcom-drmb-sell-in-sbx.sandbox_pzamora.base_contactos_v2"
SENDS_TABLE = "bi-fcom-drmb-sell-in-sbx.crm_sellers.detalle_contactos_historico"
BATCH_SIZE = 1000
NULL_OPTION = "__NULL__"
SEND_COUNTRIES = {"CL_Sellers", "PE_Sellers", "CO_Sellers"}
DEFAULT_SEND_CSV_MAX_BYTES = 10 * 1024 * 1024
SEND_CSV_MIME_TYPES = {"text/csv", "application/vnd.ms-excel", "application/octet-stream"}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$")


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def parse_send_csv(file_name: str, content_type: str, content: bytes,
                   max_bytes: int = DEFAULT_SEND_CSV_MAX_BYTES) -> dict:
    safe_name = (file_name or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if not safe_name or not safe_name.lower().endswith(".csv"):
        raise ValueError("El archivo debe tener extensión .csv.")
    if media_type not in SEND_CSV_MIME_TYPES:
        raise ValueError("El tipo de contenido del archivo no es CSV válido.")
    if not content:
        raise ValueError("El archivo CSV está vacío.")
    if len(content) > max_bytes:
        raise ValueError(f"El archivo supera el límite de {max_bytes // (1024 * 1024)} MB.")
    if b"\x00" in content:
        raise ValueError("El archivo contiene datos binarios; carga un CSV de texto.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("El CSV debe estar codificado en UTF-8.") from exc

    try:
        reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        columns = [column.strip() for column in next(reader)]
        if not columns or not any(columns):
            raise ValueError("El CSV debe incluir encabezados.")
        if len(set(columns)) != len(columns):
            raise ValueError("El CSV contiene encabezados duplicados.")
        records = []
        for row in reader:
            if not row:
                row = [""] * len(columns)
            if len(row) != len(columns):
                raise ValueError("El CSV contiene filas con distinta cantidad de columnas.")
            records.append(row)
    except (csv.Error, StopIteration) as exc:
        raise ValueError("No se pudo interpretar el CSV o no contiene encabezados.") from exc

    def normalized_header(column: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", column.casefold()).strip()

    candidates = [
        column for column in columns
        if normalized_header(column) in {"email address", "email", "subscriber key"}
    ]
    preferred = next((column for column in candidates if normalized_header(column) == "email address"), None)
    if preferred is None:
        preferred = next((column for column in candidates if normalized_header(column) == "email"), None)
    if preferred is None and candidates:
        preferred = candidates[0]
    return {
        "file_name": safe_name,
        "file_size": len(content),
        "columns": columns,
        "email_column_candidates": candidates,
        "preferred_email_column": preferred,
        "records": records,
    }


def inspect_send_csv(parsed: dict, email_column: str) -> dict:
    if email_column not in parsed["columns"]:
        raise ValueError("Selecciona una columna válida como email.")
    index = parsed["columns"].index(email_column)
    seen = set()
    emails = []
    empty_emails = 0
    invalid_emails = 0
    duplicate_emails = 0
    for row in parsed["records"]:
        email = normalize_email(row[index])
        if not email:
            empty_emails += 1
        elif not EMAIL_RE.fullmatch(email):
            invalid_emails += 1
        else:
            emails.append(email)
            if email in seen:
                duplicate_emails += 1
            seen.add(email)
    return {
        "file_rows": len(parsed["records"]),
        "valid_emails": len(emails),
        "distinct_valid_emails": len(seen),
        "invalid_emails": invalid_emails,
        "empty_emails": empty_emails,
        "duplicate_emails": duplicate_emails,
        "emails": emails,
    }

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


def _aggregate_seller_rollups(rows: list[dict]) -> dict:
    processed = len(rows)
    sent = sum(bool(row.get("has_sent")) for row in rows)
    opened = sum(bool(row.get("has_sent")) and bool(row.get("has_open")) for row in rows)
    clicked = sum(bool(row.get("has_sent")) and bool(row.get("has_click")) for row in rows)
    not_sent = processed - sent
    return {
        "sellers_processed": processed,
        "sellers_sent": sent,
        "sellers_not_sent": not_sent,
        "sellers_with_open": opened,
        "sellers_with_click": clicked,
        "open_rate": opened / sent * 100 if sent else None,
        "click_rate": clicked / sent * 100 if sent else None,
        "ctor": clicked / opened * 100 if opened else None,
        "reconciliation_ok": processed == sent + not_sent,
    }


class TraceService:
    def __init__(self, bq, audit_table_id: str = "", snapshot_table_id: str = "",
                 not_found_alert_threshold: float = 0.20,
                 daily_drop_threshold: float = 0.20,
                 members_table_id: str = "bi-fcom-drmb-sell-in-sbx.crm_sellers.trace_audience_members",
                 reconciliation_table_id: str = "bi-fcom-drmb-sell-in-sbx.crm_sellers.trace_send_reconciliation_history"):
        self.bq = bq
        self.audit_table_id = audit_table_id
        self.snapshot_table_id = snapshot_table_id
        self.not_found_alert_threshold = not_found_alert_threshold
        self.daily_drop_threshold = daily_drop_threshold
        self.members_table_id = members_table_id
        self.reconciliation_table_id = reconciliation_table_id

    @staticmethod
    def _checked_table_id(table_id: str, setting_name: str = "TRACE_AUDIENCE_HISTORY_TABLE") -> str:
        table_id = (table_id or "").strip()
        if not table_id:
            raise ValueError(
                f"Falta configurar {setting_name} en backend/.env; "
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

    def preview(self, raw_input: str, search_type: str, filters: dict,
                _source_rows: list[dict] | None = None) -> dict:
        parsed = parse_trace_input(raw_input, search_type)
        identifiers = parsed["identifiers"]
        if not identifiers:
            raise ValueError("Ingresa al menos un identificador válido.")

        rows = _source_rows if _source_rows is not None else self._fetch_contacts(identifiers, search_type)
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
        parsed = parse_trace_input(raw_input, search_type)
        if not parsed["identifiers"]:
            raise ValueError("Ingresa al menos un identificador válido.")
        source_rows = self._fetch_contacts(parsed["identifiers"], search_type)
        preview = self.preview(raw_input, search_type, filters, _source_rows=source_rows)
        if not preview["reconciliation_ok"] or preview["result"]["final_contacts"] == 0:
            raise ValueError("La audiencia no cumple las validaciones para descargar.")
        if any(alert["requires_confirmation"] for alert in preview["alerts"]) and not confirm_warnings:
            raise PermissionError("Confirma explícitamente las advertencias antes de descargar.")
        table_id = self._checked_table_id(self.audit_table_id)
        members_table_id = self._checked_table_id(
            self.members_table_id, setting_name="TRACE_AUDIENCE_MEMBERS_TABLE",
        )

        rows, _ = self._apply_filters(
            source_rows, filters,
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
        member_rows = []
        duplicate_counts = Counter()
        for row in rows:
            seller_id = row.get("src_id") or None
            email = row.get("email") or None
            phone = row.get("phone") or None
            identity = (seller_id or "", email or "", phone or "")
            occurrence = duplicate_counts[identity]
            duplicate_counts[identity] += 1
            row_id = hashlib.sha256(
                f"{audience_id}\x1f{identity[0]}\x1f{identity[1]}\x1f{identity[2]}\x1f{occurrence}".encode("utf-8")
            ).hexdigest()
            member_rows.append({
                "audience_id": audience_id,
                "created_at": created_at,
                "created_date": created_at.date(),
                "created_by": user_email,
                "template": template.strip(),
                "seller_id": seller_id,
                "email": email,
                "phone": phone,
                "email_normalized": email.strip().lower() if email else None,
                "row_id": row_id,
            })
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
        self.bq.insert_rows_dml(members_table_id, member_rows)
        try:
            self.bq.insert_rows_dml(table_id, [audit])
        except Exception as exc:
            try:
                self.bq.execute_dml(
                    f"DELETE FROM `{members_table_id}` WHERE audience_id = @audience_id",
                    params=[ScalarQueryParameter("audience_id", "STRING", audience_id)],
                )
            except Exception:
                logger.error(
                    "Trace audience snapshot cleanup failed: audience_id=%s", audience_id,
                )
                raise RuntimeError(
                    "No se pudo completar el registro de la audiencia ni limpiar su snapshot."
                ) from exc
            logger.warning(
                "Trace audience audit insert failed; snapshot cleaned: audience_id=%s",
                audience_id,
            )
            raise RuntimeError("No se pudo registrar la audiencia exportada.") from exc
        logger.info(
            "Trace audience export completed: audience_id=%s sellers=%d contacts=%d",
            audience_id, audit["final_sellers"], audit["final_contacts"],
        )
        return buffer.getvalue(), filename, preview

    @staticmethod
    def _send_filters(template: str, seller_id: str | None, status: str | None,
                      countries: list[str] | None = None,
                      date_from: date | str | None = None,
                      date_to: date | str | None = None,
                      job_id: str | None = None) -> tuple[str, list]:
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
        selected_countries = countries or []
        unknown_countries = set(selected_countries) - SEND_COUNTRIES
        if unknown_countries:
            raise ValueError("País de envío no reconocido.")
        if selected_countries:
            clauses.append("pais IN UNNEST(@countries)")
            params.append(ArrayQueryParameter("countries", "STRING", selected_countries))
        if bool(date_from) != bool(date_to):
            raise ValueError(
                "Selecciona ambas fechas para definir el rango. Para consultar un solo día, "
                "usa la misma fecha en Desde y Hasta."
            )
        if date_from and date_to:
            start = date.fromisoformat(date_from) if isinstance(date_from, str) else date_from
            end = date.fromisoformat(date_to) if isinstance(date_to, str) else date_to
            if start > end:
                raise ValueError("La fecha Desde no puede ser posterior a la fecha Hasta.")
            clauses.append("DATE(fecha) BETWEEN @date_from AND @date_to")
            params.extend([
                ScalarQueryParameter("date_from", "DATE", start),
                ScalarQueryParameter("date_to", "DATE", end),
            ])
        if job_id:
            clauses.append("CAST(id_jobenvio AS STRING) = @job_id")
            params.append(ScalarQueryParameter("job_id", "STRING", job_id))
        return " AND ".join(clauses), params

    def sends_summary(self, template: str, seller_id: str | None = None,
                      status: str | None = None, countries: list[str] | None = None,
                      date_from: date | str | None = None,
                      date_to: date | str | None = None,
                      job_id: str | None = None,
                      audience_id: str | None = None) -> dict:
        where, params = self._send_filters(
            template, seller_id, status, countries, date_from, date_to, job_id,
        )
        seller_rows = self.bq.query(
            f"""SELECT
              COUNTIF(estado_envio = 'Enviado') > 0 AS has_sent,
              COUNTIF(open = 'Open') > 0 AS has_open,
              COUNTIF(clic = 'Clic') > 0 AS has_click
            FROM `{SENDS_TABLE}` WHERE {where} AND id_seller IS NOT NULL
            GROUP BY id_seller""",
            params=params,
            timeout_s=60,
        )
        result = _aggregate_seller_rollups(seller_rows)
        quality_rows = self.bq.query(
            f"""SELECT COUNT(*) AS contacts_processed,
              COUNTIF(id_seller IS NULL) AS contacts_without_seller,
              COUNTIF(estado_envio IS NULL OR estado_envio NOT IN ('Enviado', 'Not Sent')) AS unclassified_contacts,
              COUNTIF(estado_envio = 'Enviado') AS contacts_sent,
              COUNTIF(estado_envio = 'Not Sent') AS contacts_not_sent,
              MIN(fecha) AS first_date, MAX(fecha) AS last_date
            FROM `{SENDS_TABLE}` WHERE {where}""",
            params=params,
            timeout_s=60,
        )
        quality = quality_rows[0] if quality_rows else {}
        result.update(quality)
        if not result["reconciliation_ok"] or result["contacts_without_seller"] or result["unclassified_contacts"]:
            logger.warning(
                "Trace send data quality: processed=%d sent=%d not_sent=%d null_seller_contacts=%d unknown_status_contacts=%d",
                result["sellers_processed"], result["sellers_sent"], result["sellers_not_sent"],
                result["contacts_without_seller"], result["unclassified_contacts"],
            )
        jobs_where, jobs_params = self._send_filters(
            template, seller_id, status, countries, date_from, date_to,
        )
        jobs = self.bq.query(
            f"""SELECT CAST(id_jobenvio AS STRING) AS job_id, MIN(DATE(fecha)) AS job_date
            FROM `{SENDS_TABLE}` WHERE {jobs_where} AND id_jobenvio IS NOT NULL
            GROUP BY job_id ORDER BY job_date DESC, job_id""",
            params=jobs_params,
            timeout_s=60,
        )
        causes = self.bq.query(
                        f"""SELECT COALESCE(causa, 'Sin causa') AS cause,
                            COUNT(DISTINCT id_seller) AS sellers, COUNT(*) AS contacts
            FROM `{SENDS_TABLE}`
            WHERE {where} AND estado_envio = 'Not Sent'
                        GROUP BY cause ORDER BY sellers DESC, contacts DESC""",
            params=params,
            timeout_s=60,
        )
        country_rows = self.bq.query(
                        f"""WITH seller_country AS (
                            SELECT pais, id_seller,
                                COUNTIF(estado_envio = 'Enviado') > 0 AS has_sent,
                                COUNTIF(open = 'Open') > 0 AS has_open,
                                COUNTIF(clic = 'Clic') > 0 AS has_click
                            FROM `{SENDS_TABLE}` WHERE {where} AND id_seller IS NOT NULL AND pais IS NOT NULL
                            GROUP BY pais, id_seller
                        )
                        SELECT pais AS country, COUNT(*) AS sellers_processed,
                            COUNTIF(has_sent) AS sellers_sent, COUNTIF(NOT has_sent) AS sellers_not_sent,
                            COUNTIF(has_sent AND has_open) AS sellers_with_open,
                            COUNTIF(has_sent AND has_click) AS sellers_with_click
                        FROM seller_country GROUP BY country ORDER BY country""",
                        params=params,
                        timeout_s=60,
                )
        daily = []
        if date_from and date_to and date_from < date_to:
            daily = self.bq.query(
                                f"""WITH seller_day AS (
                                    SELECT DATE(fecha) AS report_date, id_seller,
                                        COUNTIF(estado_envio = 'Enviado') > 0 AS has_sent,
                                        COUNTIF(open = 'Open') > 0 AS has_open,
                                        COUNTIF(clic = 'Clic') > 0 AS has_click
                                    FROM `{SENDS_TABLE}` WHERE {where} AND id_seller IS NOT NULL
                                    GROUP BY report_date, id_seller
                                )
                                SELECT report_date AS date, COUNT(*) AS sellers_processed,
                                    COUNTIF(has_sent) AS sellers_sent, COUNTIF(NOT has_sent) AS sellers_not_sent,
                                    COUNTIF(has_sent AND has_open) AS sellers_with_open,
                                    COUNTIF(has_sent AND has_click) AS sellers_with_click
                                FROM seller_day GROUP BY date ORDER BY date""",
                                params=params,
                                timeout_s=60,
                        )
        audience_summary = None
        if audience_id:
            audience_summary = self._audience_send_summary(
                template, audience_id, seller_id, countries, date_from, date_to, job_id,
            )
        return {
                "template": template, "summary": result, "jobs": jobs,
                "not_sent_causes": causes, "country_performance": country_rows,
                "daily_performance": daily, "audience_summary": audience_summary,
            }

    def _audience_send_summary(self, template: str, audience_id: str,
                               seller_id: str | None, countries: list[str] | None,
                               date_from: date | str | None, date_to: date | str | None,
                               job_id: str | None) -> dict:
        history_table = self._checked_table_id(self.audit_table_id)
        members_table = self._checked_table_id(
            self.members_table_id, setting_name="TRACE_AUDIENCE_MEMBERS_TABLE",
        )
        audience_rows = self.bq.query(
            f"""SELECT h.audience_id, h.template, h.created_at, h.created_by,
              h.final_sellers, h.final_contacts,
              COUNT(DISTINCT m.seller_id) AS member_sellers,
              COUNT(DISTINCT m.row_id) AS member_contacts
            FROM `{history_table}` AS h
            JOIN `{members_table}` AS m USING (audience_id)
            WHERE h.audience_id = @audience_id
            GROUP BY h.audience_id, h.template, h.created_at, h.created_by,
              h.final_sellers, h.final_contacts""",
            params=[ScalarQueryParameter("audience_id", "STRING", audience_id)],
            timeout_s=60,
        )
        if not audience_rows:
            raise ValueError("La audiencia no existe o no tiene miembros persistidos.")
        audience = audience_rows[0]
        if audience["template"] != template:
            raise ValueError("El template no coincide con la audiencia seleccionada.")

        sent_where, sent_params = self._send_filters(
            template, seller_id, None, countries, date_from, date_to, job_id,
        )
        compare_rows = self.bq.query(
            f"""WITH expected AS (
                SELECT DISTINCT seller_id
                FROM `{members_table}`
                WHERE audience_id = @audience_id AND seller_id IS NOT NULL
                  AND (@seller_id IS NULL OR seller_id = @seller_id)
              ), sent AS (
                                SELECT id_seller AS seller_id,
                                    COUNTIF(estado_envio = 'Enviado') > 0 AS has_sent,
                                    COUNTIF(open = 'Open') > 0 AS has_open,
                                    COUNTIF(clic = 'Clic') > 0 AS has_click
                FROM `{SENDS_TABLE}` WHERE {sent_where}
                                    AND id_seller IS NOT NULL
                                GROUP BY seller_id
              )
              SELECT
                (SELECT COUNT(*) FROM expected) AS expected_sellers,
                                (SELECT COUNTIF(s.has_sent) FROM expected e LEFT JOIN sent s USING (seller_id)) AS sellers_sent_from_audience,
                                (SELECT COUNTIF(s.has_sent AND s.has_open) FROM expected e LEFT JOIN sent s USING (seller_id)) AS sellers_with_open_from_audience,
                                (SELECT COUNTIF(s.has_sent AND s.has_click) FROM expected e LEFT JOIN sent s USING (seller_id)) AS sellers_with_click_from_audience,
                                (SELECT COUNTIF(NOT COALESCE(s.has_sent, FALSE)) FROM expected e LEFT JOIN sent s USING (seller_id)) AS sellers_missing_from_history,
                                (SELECT COUNTIF(s.has_sent) FROM sent s LEFT JOIN expected e USING (seller_id) WHERE e.seller_id IS NULL) AS sellers_sent_outside_audience""",
                        params=[ScalarQueryParameter("audience_id", "STRING", audience_id)]
                        + sent_params
                        + ([] if seller_id else [ScalarQueryParameter("seller_id", "STRING", None)]),
            timeout_s=60,
        )
        matched = compare_rows[0] if compare_rows else {}
        expected = matched.get("expected_sellers", 0)
        return {
            **audience,
            **matched,
            "send_rate": matched.get("sellers_sent_from_audience", 0) / expected if expected else None,
        }

    def search_audiences(self, search: str | None, created_by: str | None,
                         created_from: date | str | None, created_to: date | str | None,
                         page: int, page_size: int, members_only: bool = True) -> dict:
        history_table = self._checked_table_id(self.audit_table_id)
        members_table = self._checked_table_id(
            self.members_table_id, setting_name="TRACE_AUDIENCE_MEMBERS_TABLE",
        )
        clauses = []
        if members_only:
            clauses.append(f"EXISTS (SELECT 1 FROM `{members_table}` AS m WHERE m.audience_id = h.audience_id)")
        params = []
        if search:
            clauses.append("(STRPOS(LOWER(h.audience_id), LOWER(@search)) > 0 OR STRPOS(LOWER(h.template), LOWER(@search)) > 0 OR STRPOS(LOWER(h.created_by), LOWER(@search)) > 0)")
            params.append(ScalarQueryParameter("search", "STRING", search.strip()))
        if created_by:
            clauses.append("LOWER(h.created_by) = LOWER(@created_by)")
            params.append(ScalarQueryParameter("created_by", "STRING", created_by.strip()))
        if created_from:
            clauses.append("h.created_date >= @created_from")
            params.append(ScalarQueryParameter("created_from", "DATE", created_from))
        if created_to:
            clauses.append("h.created_date <= @created_to")
            params.append(ScalarQueryParameter("created_to", "DATE", created_to))
        where = " AND ".join(clauses) if clauses else "TRUE"
        total_rows = self.bq.query(
            f"SELECT COUNT(*) AS total FROM `{history_table}` AS h WHERE {where}",
            params=params,
            timeout_s=60,
        )
        rows = self.bq.query(
            f"""SELECT h.audience_id, h.template, h.created_at, h.created_by,
              h.final_sellers, h.final_contacts,
              COUNT(DISTINCT m.seller_id) AS member_sellers,
                            COUNT(DISTINCT m.row_id) AS member_contacts,
                            COUNT(DISTINCT m.row_id) > 0 AS has_members
            FROM `{history_table}` AS h
                        LEFT JOIN `{members_table}` AS m USING (audience_id)
            WHERE {where}
            GROUP BY h.audience_id, h.template, h.created_at, h.created_by,
              h.final_sellers, h.final_contacts
            ORDER BY h.created_at DESC LIMIT @limit OFFSET @offset""",
            params=params + [
                ScalarQueryParameter("limit", "INT64", page_size),
                ScalarQueryParameter("offset", "INT64", (page - 1) * page_size),
            ],
            timeout_s=60,
        )
        return {"items": rows, "page": page, "page_size": page_size,
                "total": total_rows[0]["total"] if total_rows else 0}

    def _send_alert_tables(self) -> tuple[str, str, str]:
        return (
            self._checked_table_id(self.audit_table_id),
            self._checked_table_id(self.members_table_id, "TRACE_AUDIENCE_MEMBERS_TABLE"),
            self._checked_table_id(self.reconciliation_table_id, "TRACE_SEND_RECONCILIATION_HISTORY_TABLE"),
        )

    def _send_alert_audience_summary(self, audience_id: str) -> dict:
        history_table, members_table, _ = self._send_alert_tables()
        rows = self.bq.query(
            f"""SELECT h.audience_id, h.template, h.created_at, h.created_by,
              h.final_sellers, h.final_contacts,
              COUNT(DISTINCT m.seller_id) AS member_sellers,
              COUNT(DISTINCT m.row_id) AS member_contacts
            FROM `{history_table}` AS h
            JOIN `{members_table}` AS m USING (audience_id)
            WHERE h.audience_id = @audience_id
            GROUP BY h.audience_id, h.template, h.created_at, h.created_by,
              h.final_sellers, h.final_contacts""",
            params=[ScalarQueryParameter("audience_id", "STRING", audience_id)],
            timeout_s=60,
        )
        if not rows:
            raise ValueError("La audiencia no existe o no tiene miembros persistidos.")
        return rows[0]

    def validate_send_csv(self, audience_id: str, file_name: str, content_type: str,
                          content: bytes, email_column: str | None = None,
                          max_bytes: int = DEFAULT_SEND_CSV_MAX_BYTES) -> dict:
        parsed = parse_send_csv(file_name, content_type, content, max_bytes)
        audience = self._send_alert_audience_summary(audience_id)
        email_summary = inspect_send_csv(parsed, email_column) if email_column else None
        file_hash = hashlib.sha256(content).hexdigest()
        _, _, history_table = self._send_alert_tables()
        previous = self.bq.query(
            f"""SELECT reconciliation_id FROM `{history_table}`
            WHERE audience_id = @audience_id AND file_hash = @file_hash
            ORDER BY uploaded_at DESC LIMIT 1""",
            params=[
                ScalarQueryParameter("audience_id", "STRING", audience_id),
                ScalarQueryParameter("file_hash", "STRING", file_hash),
            ],
            timeout_s=30,
        )
        return {
            "audience": audience,
            "file_name": parsed["file_name"],
            "file_size": parsed["file_size"],
            "file_rows": len(parsed["records"]),
            "columns": parsed["columns"],
            "email_column_candidates": parsed["email_column_candidates"],
            "preferred_email_column": parsed["preferred_email_column"],
            "email_quality": {
                key: value for key, value in (email_summary or {}).items() if key != "emails"
            } if email_summary else None,
            "previous_reconciliation_id": previous[0]["reconciliation_id"] if previous else None,
        }

    def reconcile_send_csv(self, audience_id: str, file_name: str, content_type: str,
                           content: bytes, email_column: str, uploaded_by: str,
                           allow_duplicate: bool = False,
                           max_bytes: int = DEFAULT_SEND_CSV_MAX_BYTES) -> dict:
        parsed = parse_send_csv(file_name, content_type, content, max_bytes)
        email_summary = inspect_send_csv(parsed, email_column)
        audience = self._send_alert_audience_summary(audience_id)
        history_table, members_table, reconciliation_table = self._send_alert_tables()
        file_hash = hashlib.sha256(content).hexdigest()
        previous = self.bq.query(
            f"""SELECT reconciliation_id FROM `{reconciliation_table}`
            WHERE audience_id = @audience_id AND file_hash = @file_hash
            ORDER BY uploaded_at DESC LIMIT 1""",
            params=[
                ScalarQueryParameter("audience_id", "STRING", audience_id),
                ScalarQueryParameter("file_hash", "STRING", file_hash),
            ],
            timeout_s=30,
        )
        if previous and not allow_duplicate:
            raise PermissionError(
                "Este archivo ya fue conciliado para la audiencia. Confirma la repetición para continuar."
            )

        members = self.bq.query(
            f"""SELECT seller_id, email, email_normalized, row_id
            FROM `{members_table}` WHERE audience_id = @audience_id ORDER BY row_id""",
            params=[ScalarQueryParameter("audience_id", "STRING", audience_id)],
            timeout_s=60,
        )
        if not members:
            raise ValueError("La audiencia no existe o no tiene miembros persistidos.")

        uploaded_counts = Counter(email_summary["emails"])
        uploaded_emails = set(uploaded_counts)
        expected_emails = set()
        expected_contacts = []
        members_by_seller = {}
        present_sellers = set()
        for member in members:
            email = normalize_email(member.get("email"))
            valid_email = bool(email and EMAIL_RE.fullmatch(email))
            if valid_email:
                expected_emails.add(email)
            present = valid_email and email in uploaded_emails
            seller_id = member.get("seller_id")
            if seller_id:
                members_by_seller.setdefault(seller_id, []).append(present)
                if present:
                    present_sellers.add(seller_id)
            expected_contacts.append({
                "seller_id": seller_id,
                "email": member.get("email"),
                "status": "PRESENT" if present else "MISSING",
                "observation": "Presente en archivo de envío" if present else (
                    "La audiencia no contiene un email válido" if not valid_email
                    else "No presente en archivo de envío"
                ),
            })

        expected_sellers_set = {member.get("seller_id") for member in members if member.get("seller_id")}
        expected_sellers = len(expected_sellers_set)
        present_seller_count = len(present_sellers)
        expected_contact_count = len(expected_contacts)
        present_contact_count = sum(row["status"] == "PRESENT" for row in expected_contacts)
        missing_seller_count = expected_sellers - present_seller_count
        missing_contact_count = expected_contact_count - present_contact_count
        seller_coverage = present_seller_count / expected_sellers if expected_sellers else None
        contact_coverage = present_contact_count / expected_contact_count if expected_contact_count else None
        unexpected = sorted(uploaded_emails - expected_emails)
        duplicate_details = [
            {"seller_id": None, "email": email, "status": "DUPLICATE", "observation": f"{count} apariciones"}
            for email, count in sorted(uploaded_counts.items()) if count > 1
        ]
        column_index = parsed["columns"].index(email_column)
        invalid_details = []
        for row in parsed["records"]:
            raw_email = row[column_index].strip()
            if not raw_email or not EMAIL_RE.fullmatch(normalize_email(raw_email)):
                invalid_details.append({
                    "seller_id": None, "email": raw_email, "status": "INVALID",
                    "observation": "Email vacío" if not raw_email else "Formato de email inválido",
                })
        unexpected_details = [
            {"seller_id": None, "email": email, "status": "UNEXPECTED", "observation": "Email no esperado en la audiencia"}
            for email in unexpected
        ]
        seller_partial = []
        for seller_id, outcomes in members_by_seller.items():
            if any(outcomes) and not all(outcomes):
                seller_partial.append({
                    "seller_id": seller_id,
                    "email": None,
                    "status": "PARTIAL",
                    "observation": "Algunos contactos del seller no aparecen en el archivo",
                })

        def alert_for(label: str, expected: int, missing: int) -> dict | None:
            if not expected or not missing:
                return None
            rate = missing / expected
            critical = rate >= self.not_found_alert_threshold
            return {
                "severity": "critical" if critical else "warning",
                "message": (
                    f"Alerta crítica: el porcentaje de {label} ausentes es igual o superior al "
                    f"{self.not_found_alert_threshold:.0%}."
                    if critical else f"Advertencia: {missing} {label} esperados no aparecen en el archivo."
                ),
                "missing": missing,
                "expected": expected,
                "rate": rate,
            }

        alerts = [alert for alert in (
            alert_for("sellers", expected_sellers, missing_seller_count),
            alert_for("contactos", expected_contact_count, missing_contact_count),
        ) if alert]
        if expected_sellers and not missing_seller_count:
            alerts.append({"severity": "success", "message": "Cobertura completa: todos los sellers esperados aparecen en el archivo."})

        reconciliation_id = str(uuid.uuid4())
        uploaded_at = datetime.now(timezone.utc)
        audit = {
            "reconciliation_id": reconciliation_id,
            "audience_id": audience_id,
            "template": audience["template"],
            "uploaded_at": uploaded_at,
            "uploaded_date": uploaded_at.date(),
            "uploaded_by": uploaded_by,
            "file_name": parsed["file_name"],
            "file_hash": file_hash,
            "email_column": email_column,
            "file_rows": email_summary["file_rows"],
            "valid_emails": email_summary["valid_emails"],
            "invalid_emails": email_summary["invalid_emails"] + email_summary["empty_emails"],
            "duplicate_emails": email_summary["duplicate_emails"],
            "expected_sellers": expected_sellers,
            "present_sellers": present_seller_count,
            "missing_sellers": missing_seller_count,
            "expected_contacts": expected_contact_count,
            "present_contacts": present_contact_count,
            "missing_contacts": missing_contact_count,
            "unexpected_contacts": len(unexpected),
            "seller_coverage_rate": seller_coverage,
            "contact_coverage_rate": contact_coverage,
            "status": "COMPLETED",
        }
        self.bq.insert_rows_dml(reconciliation_table, [audit])
        logger.info(
            "Trace send reconciliation completed: reconciliation_id=%s audience_id=%s file_rows=%d valid=%d invalid=%d",
            reconciliation_id, audience_id, audit["file_rows"], audit["valid_emails"], audit["invalid_emails"],
        )
        return {
            **audit,
            "invalid_emails": email_summary["invalid_emails"],
            "empty_emails": email_summary["empty_emails"],
            "details": {
                "missing": [row for row in expected_contacts if row["status"] == "MISSING"],
                "present": [row for row in expected_contacts if row["status"] == "PRESENT"],
                "unexpected": unexpected_details,
                "duplicates": duplicate_details,
                "invalid": invalid_details,
                "partial_sellers": seller_partial,
            },
            "alerts": alerts,
            "source": "CSV cargado manualmente",
        }

    def search_send_alert_history(self, audience_id: str | None,
                                  page: int, page_size: int) -> dict:
        _, _, history_table = self._send_alert_tables()
        clauses = []
        params = []
        if audience_id:
            clauses.append("audience_id = @audience_id")
            params.append(ScalarQueryParameter("audience_id", "STRING", audience_id))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        count_rows = self.bq.query(
            f"SELECT COUNT(*) AS total FROM `{history_table}` {where}",
            params=params,
            timeout_s=30,
        )
        rows = self.bq.query(
            f"""SELECT reconciliation_id, audience_id, template, uploaded_at,
              uploaded_by, file_name, file_hash, email_column, file_rows,
              valid_emails, invalid_emails, duplicate_emails,
              expected_sellers, present_sellers, missing_sellers,
              expected_contacts, present_contacts, missing_contacts,
              unexpected_contacts, seller_coverage_rate, contact_coverage_rate, status
            FROM `{history_table}` {where}
            ORDER BY uploaded_at DESC LIMIT @limit OFFSET @offset""",
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

    def sends_detail(self, template: str, seller_id: str | None, status: str | None,
                     page: int, page_size: int, countries: list[str] | None = None,
                     date_from: date | str | None = None,
                     date_to: date | str | None = None,
                     job_id: str | None = None) -> dict:
        where, params = self._send_filters(
            template, seller_id, status, countries, date_from, date_to, job_id,
        )
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
                        f"""SELECT CAST(id_jobenvio AS STRING) AS job_id, id_seller, email,
                            template, estado_envio, causa, fecha, open, clic,
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

    def sends_export(self, template: str, seller_id: str | None, status: str | None,
                     countries: list[str] | None = None,
                     date_from: date | str | None = None,
                     date_to: date | str | None = None,
                     job_id: str | None = None) -> tuple[str, str]:
        where, params = self._send_filters(
            template, seller_id, status, countries, date_from, date_to, job_id,
        )
        rows = self.bq.query(
            f"""SELECT CAST(id_jobenvio AS STRING) AS job_id, id_seller, email,
              template, estado_envio, causa, fecha, open, clic,
              CASE estado_envio
                WHEN 'Enviado' THEN 'ENVIADO'
                WHEN 'Not Sent' THEN 'NO_ENVIADO'
                ELSE 'SIN_CLASIFICAR'
              END AS normalized_status
            FROM `{SENDS_TABLE}` WHERE {where}
            ORDER BY fecha DESC""",
            params=params,
            timeout_s=120,
        )
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Job ID", "Seller ID", "Email", "Template", "Estado original",
            "Estado", "Causa", "Fecha", "Apertura", "Clic",
        ])
        for row in rows:
            values = [
                row.get("job_id"), row.get("id_seller"), row.get("email"),
                row.get("template"), row.get("estado_envio"),
                row.get("normalized_status"), row.get("causa"), row.get("fecha"),
                row.get("open"), row.get("clic"),
            ]
            writer.writerow([
                f"'{value}" if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")) else value
                for value in values
            ])
        return output.getvalue(), f"seguimiento_envios_{date.today().isoformat()}.csv"

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