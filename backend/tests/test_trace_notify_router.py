from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import HTTPException

from backend.models.auth import UserContext
from backend.models.trace import TraceTeamsNotifyRequest
from backend.routers import trace


class ReconciliationService:
    def __init__(self, reconciliation):
        self.reconciliation = reconciliation
        self.bq = object()

    def get_send_reconciliation(self, reconciliation_id):
        self.reconciliation_id = reconciliation_id
        return self.reconciliation


def test_notify_teams_returns_404_for_unknown_reconciliation():
    service = ReconciliationService(None)
    user = UserContext(user_id="u1", email="operator@falabella.com", full_name="Operator", role="ADMIN")

    with pytest.raises(HTTPException) as error:
        trace.notify_send_reconciliation_teams(
            UUID("d665a3ec-adc1-43c6-b2f4-dbd35697f3ea"),
            TraceTeamsNotifyRequest(recipients=["ana@falabella.com"]), service, user,
        )

    assert error.value.status_code == 404


def test_notify_teams_uses_persisted_reconciliation_and_authenticated_user(monkeypatch):
    reconciliation = {
        "reconciliation_id": "REC-1", "audience_id": "AUD-1", "template": "weekly",
        "expected_sellers": 10, "present_sellers": 9, "missing_sellers": 1,
        "expected_contacts": 11, "present_contacts": 10, "missing_contacts": 1,
        "seller_coverage_rate": 0.9, "status": "COMPLETED",
    }
    service = ReconciliationService(reconciliation)
    user = UserContext(user_id="u1", email="operator@falabella.com", full_name="Operator", role="ADMIN")
    captured = {}

    class NotificationService:
        def validate_configuration(self):
            pass

        def notify(self, actual_reconciliation, recipients, requested_by, directory_names):
            captured.update({
                "reconciliation": actual_reconciliation, "recipients": recipients,
                "requested_by": requested_by, "directory_names": directory_names,
            })
            return {"status": "accepted", "request_id": "request-1"}

    monkeypatch.setattr(trace, "get_settings", lambda: SimpleNamespace(
        TRACE_TEAMS_ALLOWED_EMAIL_DOMAINS="falabella.com",
        TRACE_TEAMS_MAX_RECIPIENTS=20,
    ))
    monkeypatch.setattr(trace, "get_teams_notification_service", lambda _settings: NotificationService())
    monkeypatch.setattr(trace, "get_display_names_by_email", lambda _bq, _emails: {"ana@falabella.com": "Ana"})

    result = trace.notify_send_reconciliation_teams(
        UUID("d665a3ec-adc1-43c6-b2f4-dbd35697f3ea"),
        TraceTeamsNotifyRequest(recipients=[" ANA@Falabella.com "]), service, user,
    )

    assert result["status"] == "accepted"
    assert captured["reconciliation"] is reconciliation
    assert captured["recipients"] == ["ana@falabella.com"]
    assert captured["requested_by"] == "operator@falabella.com"
    assert captured["directory_names"] == {"ana@falabella.com": "Ana"}