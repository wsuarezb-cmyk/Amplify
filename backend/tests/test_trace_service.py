import csv
import io
from datetime import date, datetime

import pytest

from backend.services.trace_service import (
    TraceService, _aggregate_seller_rollups, inspect_send_csv, normalize_email,
    parse_send_csv, parse_trace_input,
)


class TraceFakeBQ:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.responses = []
        self.queries = []
        self.inserts = []
        self.dml = []

    def query(self, sql, params=None, timeout_s=None):
        self.queries.append((sql, params or [], timeout_s))
        if self.responses:
            return self.responses.pop(0)
        return list(self.rows)

    def insert_rows_dml(self, table_id, rows):
        self.inserts.append((table_id, rows))

    def execute_dml(self, sql, params=None):
        self.dml.append((sql, params or []))
        return 1


def contact(seller, email=None, phone=None, **values):
    return {"src_id": seller, "email": email, "phone": phone, **values}


def test_send_csv_parser_accepts_marketing_cloud_headers_and_counts_email_quality():
    parsed = parse_send_csv(
        "C:\\exports\\mc.csv", "text/csv; charset=utf-8",
        b"Subscriber Key,Email Address\r\nS1, One+tag@example.com \r\nS2,one+tag@example.com\r\nS3,bad\r\nS4,\r\n",
    )

    result = inspect_send_csv(parsed, "Email Address")
    assert parsed["file_name"] == "mc.csv"
    assert parsed["columns"] == ["Subscriber Key", "Email Address"]
    assert parsed["email_column_candidates"] == ["Subscriber Key", "Email Address"]
    assert parsed["preferred_email_column"] == "Email Address"
    assert result["file_rows"] == 4
    assert result["valid_emails"] == 2
    assert result["distinct_valid_emails"] == 1
    assert result["duplicate_emails"] == 1
    assert result["invalid_emails"] == 1
    assert result["empty_emails"] == 1
    assert result["emails"] == ["one+tag@example.com", "one+tag@example.com"]
    assert normalize_email("  A+B@Example.com ") == "a+b@example.com"


def test_send_csv_parser_rejects_bad_extension_mime_size_encoding_and_binary():
    invalid_files = [
        ("mc.xlsx", "text/csv", b"Email Address\na@example.com", 1024),
        ("mc.csv", "application/json", b"Email Address\na@example.com", 1024),
        ("mc.csv", "text/csv", b"Email Address\na@example.com", 4),
        ("mc.csv", "text/csv", b"Email Address\n\xff", 1024),
        ("mc.csv", "text/csv", b"Email Address\n\x00", 1024),
    ]
    for file_name, content_type, content, max_bytes in invalid_files:
        try:
            parse_send_csv(file_name, content_type, content, max_bytes)
        except ValueError:
            pass
        else:
            raise AssertionError("El archivo CSV inválido debía rechazarse")


def test_send_csv_parser_requires_header_and_consistent_column_count():
    for content in [b"", b"\r\n", b"Email,Country\na@example.com"]:
        try:
            parse_send_csv("mc.csv", "text/csv", content)
        except ValueError:
            pass
        else:
            raise AssertionError("El CSV inválido debía rechazarse")


def test_send_alert_reconciliation_conciles_contacts_sellers_and_persists_summary():
    bq = TraceFakeBQ()
    bq.responses = [
        [{"audience_id": "A1", "template": "campaign", "created_by": "creator",
          "member_sellers": 3, "member_contacts": 4, "final_sellers": 3, "final_contacts": 4}],
        [],
        [
            {"seller_id": "S1", "email": "one@example.com", "email_normalized": "one@example.com", "row_id": "r1"},
            {"seller_id": "S1", "email": "two@example.com", "email_normalized": "two@example.com", "row_id": "r2"},
            {"seller_id": "S2", "email": "three@example.com", "email_normalized": "three@example.com", "row_id": "r3"},
            {"seller_id": "S3", "email": None, "email_normalized": None, "row_id": "r4"},
        ],
    ]
    service = TraceService(
        bq, audit_table_id="project.dataset.trace_audience_history",
        reconciliation_table_id="project.dataset.trace_send_reconciliation_history",
    )
    content = (
        b"Email Address\r\none@example.com\r\none@example.com\r\n"
        b"extra@example.com\r\nbad\r\n\r\n"
    )

    result = service.reconcile_send_csv(
        "A1", "mc.csv", "text/csv", content, "Email Address", "operator@example.com",
    )

    assert result["expected_sellers"] == 3
    assert result["present_sellers"] == 1
    assert result["missing_sellers"] == 2
    assert result["expected_contacts"] == 4
    assert result["present_contacts"] == 1
    assert result["missing_contacts"] == 3
    assert result["unexpected_contacts"] == 1
    assert result["valid_emails"] == 3
    assert result["invalid_emails"] == 1
    assert result["empty_emails"] == 1
    assert result["duplicate_emails"] == 1
    assert result["details"]["partial_sellers"][0]["seller_id"] == "S1"
    assert result["details"]["duplicates"][0]["email"] == "one@example.com"
    assert any(alert["severity"] == "critical" for alert in result["alerts"])
    table_id, stored_rows = bq.inserts[0]
    assert table_id == "project.dataset.trace_send_reconciliation_history"
    assert len(stored_rows) == 1
    assert stored_rows[0]["audience_id"] == "A1"
    assert stored_rows[0]["uploaded_by"] == "operator@example.com"
    assert "one@example.com" not in str(stored_rows[0])
    assert "extra@example.com" not in str(stored_rows[0])


def test_send_alert_repeat_upload_requires_confirmation_before_persisting():
    bq = TraceFakeBQ()
    bq.responses = [
        [{"audience_id": "A1", "template": "campaign", "created_by": "creator",
          "member_sellers": 1, "member_contacts": 1, "final_sellers": 1, "final_contacts": 1}],
        [{"reconciliation_id": "R1"}],
    ]
    service = TraceService(
        bq, audit_table_id="project.dataset.trace_audience_history",
        reconciliation_table_id="project.dataset.trace_send_reconciliation_history",
    )

    try:
        service.reconcile_send_csv(
            "A1", "mc.csv", "text/csv", b"Email Address\na@example.com\n",
            "Email Address", "operator@example.com",
        )
    except PermissionError as error:
        assert "Confirma la repetición" in str(error)
    else:
        raise AssertionError("La repetición debía requerir confirmación")
    assert bq.inserts == []


def test_send_alert_validation_returns_quality_metadata_without_email_values():
    bq = TraceFakeBQ()
    bq.responses = [
        [{"audience_id": "A1", "template": "campaign", "member_sellers": 1, "member_contacts": 1}],
        [],
    ]
    service = TraceService(
        bq, audit_table_id="project.dataset.trace_audience_history",
        reconciliation_table_id="project.dataset.trace_send_reconciliation_history",
    )

    result = service.validate_send_csv(
        "A1", "mc.csv", "text/csv", b"Email Address\nprivate@example.com\n", "Email Address",
    )

    assert result["columns"] == ["Email Address"]
    assert result["email_quality"]["valid_emails"] == 1
    assert result["previous_reconciliation_id"] is None
    assert "private@example.com" not in str(result)


def test_get_send_reconciliation_returns_only_summary_fields_from_audit():
    bq = TraceFakeBQ()
    bq.responses = [[{
        "reconciliation_id": "REC-1", "audience_id": "A1", "template": "campaign",
        "expected_sellers": 10, "present_sellers": 8, "missing_sellers": 2,
        "expected_contacts": 12, "present_contacts": 9, "missing_contacts": 3,
        "seller_coverage_rate": 0.8,
    }]]
    service = TraceService(
        bq, audit_table_id="project.dataset.trace_audience_history",
        reconciliation_table_id="project.dataset.trace_send_reconciliation_history",
    )

    result = service.get_send_reconciliation("REC-1")

    assert result["reconciliation_id"] == "REC-1"
    assert result["missing_sellers"] == 2
    assert "missing_seller_ids" not in bq.queries[0][0]
    assert "email" not in bq.queries[0][0].lower()
    assert "FROM `project.dataset.trace_send_reconciliation_history`" in bq.queries[0][0]
    assert bq.queries[0][1][0].value == "REC-1"


def test_history_table_configuration_errors_are_actionable():
    for table_id, message in [
        ("", "Falta configurar TRACE_AUDIENCE_HISTORY_TABLE"),
        ("project.dataset.table/invalid", "debe tener formato proyecto.dataset.tabla"),
    ]:
        try:
            TraceService._checked_table_id(table_id)
        except ValueError as error:
            assert message in str(error)
        else:
            raise AssertionError("La configuración inválida debía rechazarse")


def test_parser_deduplicates_and_preserves_full_names():
    parsed = parse_trace_input("  Ana   María López;\nJuan Pérez ; Ana María López ", "name")

    assert parsed["identifiers"] == ["Ana María López", "Juan Pérez"]
    assert parsed["received"] == 3
    assert parsed["duplicates"] == 1


def test_preview_applies_filters_and_reconciles_missing_ids_and_contacts():
    bq = TraceFakeBQ([
        contact("S1", "one@example.com", None, contacto="Comercial", tiene_venta_12m=1),
        contact("S1", None, "123", contacto="Seller Full Access", tiene_venta_12m=1),
        contact("S2", None, None, contacto="Comercial", tiene_venta_12m=None),
    ])
    service = TraceService(bq)

    result = service.preview("S1 S1 S2 MISSING", "seller_id", {"has_sales": ["1"]})

    assert result["input"] == {
        "received": 4, "valid_unique": 3, "invalid": [], "duplicates": 1,
    }
    assert result["matching"]["found_sellers"] == 2
    assert result["matching"]["not_found_values"] == ["MISSING"]
    assert result["matching"]["sellers_with_multiple_contacts"] == 1
    assert result["matching"]["sellers_without_contact"] == 1
    assert result["result"] == {"eligible_sellers": 1, "final_contacts": 2}
    assert result["reconciliation_ok"] is True
    assert any(alert["code"] == "FILTER_NULLS_PRESENT" for alert in result["alerts"])
    assert any(alert["requires_confirmation"] for alert in result["alerts"])
    assert bq.queries[0][1][0].values == ["S1", "S2", "MISSING"]
    assert "S1" not in bq.queries[0][0]


def test_name_search_is_exact_and_normalizes_whitespace():
    bq = TraceFakeBQ([contact("S1", "one@example.com", Nombre="Ana María López")])
    result = TraceService(bq).preview("Ana   María López", "name", {})

    assert result["matching"]["found_identifiers"] == 1
    assert result["matching"]["not_found_identifiers"] == 0
    assert "REGEXP_REPLACE(TRIM(Nombre), r'\\s+', ' ')" in bq.queries[0][0]


def test_export_writes_exact_csv_header_and_audit_without_identifiers():
    bq = TraceFakeBQ([contact("S1", 'one,quoted@example.com', '123', flag_or0_sin_login_3m=1)])
    service = TraceService(bq, audit_table_id="project.dataset.trace_audience_history")

    output, filename, preview = service.export(
        "S1", "seller_id", {}, "campaign-01", False, "user@example.com",
    )

    rows = list(csv.reader(io.StringIO(output)))
    assert rows[0] == ["email", "seller_id", "phone"]
    assert rows[1] == ["one,quoted@example.com", "S1", "123"]
    assert filename.endswith(".csv")
    assert preview["result"]["final_contacts"] == 1
    table_id, audit_rows = next(
        (table_id, rows) for table_id, rows in bq.inserts
        if table_id == "project.dataset.trace_audience_history"
    )
    assert table_id == "project.dataset.trace_audience_history"
    assert audit_rows[0]["created_by"] == "user@example.com"
    assert audit_rows[0]["template"] == "campaign-01"
    assert isinstance(audit_rows[0]["created_at"], datetime)
    assert isinstance(audit_rows[0]["created_date"], date)
    assert "S1" not in str(audit_rows[0])
    assert "one,quoted@example.com" not in str(audit_rows[0])
    members_table, member_rows = next(
        (table_id, rows) for table_id, rows in bq.inserts
        if table_id == "bi-fcom-drmb-sell-in-sbx.crm_sellers.trace_audience_members"
    )
    assert members_table == "bi-fcom-drmb-sell-in-sbx.crm_sellers.trace_audience_members"
    assert len(member_rows) == 1
    assert member_rows[0]["audience_id"] == audit_rows[0]["audience_id"]
    assert member_rows[0]["email"] == rows[1][0]
    assert member_rows[0]["seller_id"] == rows[1][1]
    assert member_rows[0]["phone"] == rows[1][2]
    assert member_rows[0]["email_normalized"] == "one,quoted@example.com"
    assert member_rows[0]["row_id"]
    assert len(bq.queries) == 1
    assert bq.inserts[1] == ("project.dataset.trace_audience_history", audit_rows)


def test_export_cleans_up_members_when_audience_history_insert_fails():
    class FailingAuditBQ(TraceFakeBQ):
        def insert_rows_dml(self, table_id, rows):
            if table_id.endswith("trace_audience_history"):
                raise RuntimeError("audit unavailable")
            super().insert_rows_dml(table_id, rows)

    bq = FailingAuditBQ()
    service = TraceService(
        bq,
        audit_table_id="project.dataset.trace_audience_history",
        members_table_id="project.dataset.trace_audience_members",
    )
    service._fetch_contacts = lambda identifiers, search_type: [contact("S1", "one@example.com")]
    service.preview = lambda *args, **kwargs: {
        "reconciliation_ok": True,
        "result": {"final_contacts": 1, "eligible_sellers": 1},
        "alerts": [],
        "input": {"valid_unique": 1},
        "matching": {"found_sellers": 1},
        "stages": [],
    }

    with pytest.raises(RuntimeError, match="No se pudo registrar"):
        service.export("S1", "seller_id", {}, "campaign", False, "user@example.com")

    assert len(bq.inserts) == 1
    assert bq.inserts[0][0].endswith("trace_audience_members")
    assert "DELETE FROM `project.dataset.trace_audience_members`" in bq.dml[0][0]
    assert bq.dml[0][1][0].value == bq.inserts[0][1][0]["audience_id"]


def test_audience_send_summary_uses_member_sellers_and_historical_statuses():
        bq = TraceFakeBQ()
        bq.responses = [
                [{"audience_id": "A1", "template": "campaign", "member_sellers": 2,
                    "member_contacts": 3, "final_sellers": 2, "final_contacts": 3}],
                [{"expected_sellers": 2, "sellers_sent_from_audience": 1,
                    "sellers_with_open_from_audience": 1, "sellers_with_click_from_audience": 0,
                    "sellers_missing_from_history": 1, "sellers_sent_outside_audience": 1}],
        ]
        service = TraceService(bq, audit_table_id="project.dataset.trace_audience_history")

        result = service._audience_send_summary("campaign", "A1", None, None, None, None, None)

        assert result["expected_sellers"] == 2
        assert result["sellers_sent_from_audience"] == 1
        assert result["sellers_missing_from_history"] == 1
        assert result["sellers_sent_outside_audience"] == 1
        assert result["send_rate"] == 0.5
        assert bq.queries[0][1][0].value == "A1"
        assert any(param.name == "seller_id" and param.value is None for param in bq.queries[1][1])


def test_search_audiences_is_paginated_and_only_returns_saved_members():
        bq = TraceFakeBQ()
        bq.responses = [[{"total": 1}], [{"audience_id": "A1", "member_sellers": 2}]]

        result = TraceService(
                bq, audit_table_id="project.dataset.trace_audience_history",
        ).search_audiences("campaign", "user@example.com", None, None, 2, 20)

        assert result["total"] == 1
        assert result["page"] == 2
        assert "EXISTS" in bq.queries[0][0]
        assert "LIMIT @limit OFFSET @offset" in bq.queries[1][0]
        assert [param.value for param in bq.queries[0][1]] == ["campaign", "user@example.com"]


def test_search_audiences_can_include_legacy_rows_without_member_snapshots():
    bq = TraceFakeBQ()
    bq.responses = [[{"total": 1}], [{"audience_id": "A1", "has_members": False}]]

    result = TraceService(
        bq, audit_table_id="project.dataset.trace_audience_history",
    ).search_audiences(None, None, None, None, 1, 20, members_only=False)

    assert result["items"][0]["has_members"] is False
    assert "LEFT JOIN" in bq.queries[1][0]
    assert "EXISTS" not in bq.queries[0][0]


def test_download_requires_explicit_confirmation_for_large_missing_share():
    bq = TraceFakeBQ([contact("S1", "one@example.com")])
    service = TraceService(bq, audit_table_id="project.dataset.trace_audience_history")

    try:
        service.export("S1 M1 M2 M3 M4", "seller_id", {}, "campaign", False, "user")
    except PermissionError as error:
        assert "Confirma" in str(error)
    else:
        raise AssertionError("La advertencia de más del 20% debía bloquear la descarga")


def test_unselected_operational_filter_does_not_change_eligibility():
    bq = TraceFakeBQ([
        contact("S1", "one@example.com", flag_or0_sin_login_3m=1),
        contact("S2", "two@example.com", flag_or0_sin_login_3m=None),
        contact("S3", "three@example.com", flag_or0_sin_login_3m=0),
    ])

    service = TraceService(bq)
    result = service.preview("S1 S2 S3", "seller_id", {})

    assert result["result"] == {"eligible_sellers": 3, "final_contacts": 3}
    assert not any(stage["rule"] == "operational_exclusion" for stage in result["stages"])

    filtered = service.preview("S1 S2 S3", "seller_id", {"operational_exclusion": ["KEEP"]})
    assert filtered["result"] == {"eligible_sellers": 1, "final_contacts": 1}
    assert filtered["reconciliation_ok"] is True


def test_sellers_without_contact_channels_remain_eligible():
    bq = TraceFakeBQ([
        contact("S1", "one@example.com"),
        contact("S2"),
    ])

    result = TraceService(bq).preview("S1 S2", "seller_id", {})

    assert result["result"] == {"eligible_sellers": 2, "final_contacts": 1}
    assert result["reconciliation_ok"] is True


def test_send_summary_and_detail_share_parameterized_filters():
    bq = TraceFakeBQ()
    bq.responses = [
                [{"has_sent": True, "has_open": False, "has_click": False}],
                [{"contacts_processed": 1, "contacts_without_seller": 0, "unclassified_contacts": 0,
                    "contacts_sent": 1, "contacts_not_sent": 0, "first_date": date(2026, 11, 1),
                    "last_date": date(2026, 11, 1)}],
                [{"job_id": "J1", "job_date": date(2026, 11, 1)}], [{"cause": "Sin causa", "sellers": 0, "contacts": 0}],
                [], [{"total": 1}], [{"id_seller": "S1"}],
    ]
    service = TraceService(bq)
    template = "t' OR 1=1"

    service.sends_summary(template, "S1", "ENVIADO")
    detail = service.sends_detail(template, "S1", "ENVIADO", 2, 25)

    for sql, params, _ in bq.queries:
        assert template not in sql
        assert "id_seller = @seller_id" in sql
        assert "estado_envio = @status" in sql
        assert [parameter.name for parameter in params[:3]] == ["template", "seller_id", "status"]
        assert [parameter.value for parameter in params[:3]] == [template, "S1", "Enviado"]
    assert detail["total"] == 1
    assert bq.queries[6][1][-2].value == 25
    assert bq.queries[6][1][-1].value == 25


def test_send_filters_parameterize_country_dates_and_job():
    where, params = TraceService._send_filters(
        "summer-campaign", None, None, ["CL_Sellers", "PE_Sellers"],
        "2026-11-01", "2026-11-10", "job-42",
    )

    assert "pais IN UNNEST(@countries)" in where
    assert "DATE(fecha) BETWEEN @date_from AND @date_to" in where
    assert "CAST(id_jobenvio AS STRING) = @job_id" in where
    assert "summer-campaign" not in where
    assert [parameter.name for parameter in params] == [
        "template", "countries", "date_from", "date_to", "job_id",
    ]
    assert params[1].values == ["CL_Sellers", "PE_Sellers"]
    assert params[2].value == date(2026, 11, 1)
    assert params[3].value == date(2026, 11, 10)
    assert params[4].value == "job-42"


def test_send_filters_require_complete_ordered_date_range():
    for date_from, date_to, message in [
        ("2026-11-01", None, "Selecciona ambas fechas"),
        (None, "2026-11-10", "Selecciona ambas fechas"),
        ("2026-11-11", "2026-11-10", "no puede ser posterior"),
    ]:
        try:
            TraceService._send_filters("template", None, None, date_from=date_from, date_to=date_to)
        except ValueError as error:
            assert message in str(error)
        else:
            raise AssertionError("El rango inválido debía rechazarse")


def test_sends_export_includes_all_rows_and_reuses_all_filters():
    bq = TraceFakeBQ()
    bq.responses = [[
        {"job_id": "J1", "id_seller": "S1", "email": "=formula@example.com",
         "template": "campaign", "estado_envio": "Not Sent",
         "normalized_status": "NO_ENVIADO", "causa": "Sin contacto",
         "fecha": date(2026, 11, 1), "open": "Not Open", "clic": "Not Click"},
    ]]

    content, filename = TraceService(bq).sends_export(
        "campaign", "S1", "NO_ENVIADO", ["CL_Sellers"],
        "2026-11-01", "2026-11-10", "J1",
    )

    rows = list(csv.reader(io.StringIO(content)))
    assert rows[0] == [
        "Job ID", "Seller ID", "Email", "Template", "Estado original",
        "Estado", "Causa", "Fecha", "Apertura", "Clic",
    ]
    assert rows[1][0:2] == ["J1", "S1"]
    assert rows[1][2] == "'=formula@example.com"
    assert rows[1][5] == "NO_ENVIADO"
    assert filename.startswith("seguimiento_envios_") and filename.endswith(".csv")
    sql, params, timeout = bq.queries[0]
    assert "ORDER BY fecha DESC" in sql and "LIMIT" not in sql
    assert [parameter.name for parameter in params] == [
        "template", "seller_id", "status", "countries", "date_from", "date_to", "job_id",
    ]
    assert timeout == 120


def test_seller_rollups_are_exclusive_and_interactions_require_sent_status():
    result = _aggregate_seller_rollups([
        {"has_sent": True, "has_open": False, "has_click": False},
        {"has_sent": False, "has_open": True, "has_click": True},
        {"has_sent": True, "has_open": False, "has_click": False},
        {"has_sent": False, "has_open": False, "has_click": False},
        {"has_sent": True, "has_open": True, "has_click": True},
    ])

    assert result["sellers_processed"] == 5
    assert result["sellers_sent"] == 3
    assert result["sellers_not_sent"] == 2
    assert result["sellers_with_open"] == 1
    assert result["sellers_with_click"] == 1
    assert round(result["open_rate"], 2) == 33.33
    assert round(result["click_rate"], 2) == 33.33
    assert result["ctor"] == 100
    assert result["reconciliation_ok"] is True


def test_seller_rollups_return_empty_rates_when_denominators_are_zero():
    result = _aggregate_seller_rollups([])

    assert result["sellers_processed"] == result["sellers_sent"] == result["sellers_not_sent"] == 0
    assert result["open_rate"] is None
    assert result["click_rate"] is None
    assert result["ctor"] is None
    assert result["reconciliation_ok"] is True

def test_dataset_returns_explicit_columns_once_and_reconciles_inputs():
    bq = TraceFakeBQ([contact("S1", "one@example.com", None, contacto="Comercial", Pais="Chile")])

    result = TraceService(bq).dataset("S1 S1 MISSING", "seller_id")

    assert len(bq.queries) == 1
    assert "SELECT *" not in bq.queries[0][0]
    assert result["dataset"]["columns"][0] == "src_id"
    assert result["dataset"]["rows"][0][0] == "S1"
    assert result["matching"]["not_found_values"] == ["MISSING"]
    assert result["input"]["duplicates"] == 1
    assert result["input_reconciled"] is True
