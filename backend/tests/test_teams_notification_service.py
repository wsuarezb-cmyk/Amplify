import json
from datetime import datetime, timezone
from urllib.error import URLError

import pytest

from backend.services.teams_notification_service import (
    TeamsNotificationError, TeamsNotificationService, build_teams_payload,
    normalize_recipients,
)


def reconciliation():
    return {
        "reconciliation_id": "REC-1",
        "audience_id": "AUD-1",
        "template": "weekly_campaign",
        "uploaded_at": datetime(2026, 11, 19, 14, 0, tzinfo=timezone.utc),
        "uploaded_by": "operator@falabella.com",
        "expected_sellers": 100,
        "present_sellers": 93,
        "missing_sellers": 7,
        "seller_coverage_rate": 0.93,
        "expected_contacts": 120,
        "present_contacts": 110,
        "missing_contacts": 10,
    }


def test_normalize_recipients_deduplicates_and_checks_configured_domain():
    assert normalize_recipients(
        [" First.Last@Falabella.com ", "first.last@falabella.com", "second@falabella.com"],
        "falabella.com",
    ) == ["first.last@falabella.com", "second@falabella.com"]


@pytest.mark.parametrize("recipients,domains", [
    ([], "falabella.com"),
    (["not-an-email"], "falabella.com"),
    (["person@example.com"], "falabella.com"),
    (["person@falabella.com"], ""),
])
def test_normalize_recipients_rejects_empty_invalid_or_unauthorized(recipients, domains):
    with pytest.raises((ValueError, TeamsNotificationError)):
        normalize_recipients(recipients, domains)


def test_normalize_recipients_rejects_malformed_domain_configuration():
    for domain in [".falabella.com", "falabella..com", "-falabella.com", "falabella-"]:
        with pytest.raises(TeamsNotificationError, match="dominios autorizados"):
            normalize_recipients(["ana@falabella.com"], domain)


def test_normalize_recipients_enforces_maximum_after_deduplication():
    with pytest.raises(ValueError, match="hasta 1 destinatarios"):
        normalize_recipients(["one@falabella.com", "two@falabella.com"], "falabella.com", 1)


def test_normalize_recipients_rejects_emails_longer_than_rfc_limit():
    with pytest.raises(ValueError, match="Revisa los correos"):
        normalize_recipients([f"{'a' * 250}@falabella.com"], "falabella.com")


def test_build_payload_has_real_multiple_mentions_and_only_reconciliation_summary():
    payload = build_teams_payload(
        reconciliation(), ["ana.lopez@falabella.com", "pablo@falabella.com"],
        "operator@falabella.com",
        {"ana.lopez@falabella.com": "Ana María López"},
    )
    card = payload["adaptive_card"]
    entities = card["msteams"]["entities"]

    assert len(entities) == 2
    assert entities[0]["text"] == "<at>Ana María López</at>"
    assert entities[0]["mentioned"]["id"] == "ana.lopez@falabella.com"
    assert "Sellers presentes en archivo" in str(card)
    assert payload["missing_contacts"] == 10
    assert "file" not in payload and "content_base64" not in payload


def test_notify_posts_card_to_https_webhook_and_does_not_log_secret_or_recipients(caplog):
    calls = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def opener(request, timeout):
        calls.append((request, timeout))
        return Response()

    service = TeamsNotificationService(
        "https://flow.example.test/trigger?sig=private",
        "falabella.com", opener=opener,
    )
    result = service.notify(reconciliation(), ["ana@falabella.com"], "operator@falabella.com")
    request, timeout = calls[0]
    body = json.loads(request.data)

    assert request.method == "POST"
    assert request.get_header("Content-type") == "application/json"
    assert timeout == 15
    assert body["reconciliation_id"] == "REC-1"
    assert result["status"] == "accepted"
    assert "sig=private" not in caplog.text
    assert "ana@falabella.com" not in caplog.text


def test_notify_rejects_missing_or_non_https_webhook_without_posting():
    for webhook_url in ["", "http://flow.example.test/trigger", "https://["]:
        service = TeamsNotificationService(webhook_url, "falabella.com")
        with pytest.raises(TeamsNotificationError, match="no está configurada"):
            service.notify(reconciliation(), ["ana@falabella.com"], "operator@falabella.com")


def test_notify_converts_transport_errors_to_safe_message(caplog):
    def opener(_request, timeout):
        raise URLError("private response detail")

    service = TeamsNotificationService(
        "https://flow.example.test/trigger?sig=private", "falabella.com", opener=opener,
    )
    with pytest.raises(TeamsNotificationError, match="Intenta nuevamente"):
        service.notify(reconciliation(), ["ana@falabella.com"], "operator@falabella.com")

    assert "sig=private" not in caplog.text
    assert "private response detail" not in caplog.text
    assert "ana@falabella.com" not in caplog.text


def test_notify_uses_directory_names_and_falls_back_to_email_alias():
    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    payloads = []

    def opener(request, timeout):
        payloads.append(json.loads(request.data))
        return Response()

    service = TeamsNotificationService("https://flow.example.test/hook", "falabella.com", opener=opener)
    service.notify(
        reconciliation(), ["ana@falabella.com", "jose.perez@falabella.com"],
        "operator@falabella.com", {"ana@falabella.com": "Ana María"},
    )

    mentions = payloads[0]["adaptive_card"]["msteams"]["entities"]
    assert mentions[0]["mentioned"]["name"] == "Ana María"
    assert mentions[1]["mentioned"]["name"] == "Jose Perez"


def test_mention_text_escapes_special_characters_in_directory_names():
    payload = build_teams_payload(
        reconciliation(), ["ana@falabella.com"], "operator@falabella.com",
        {"ana@falabella.com": "Ana <Team> & Ops"},
    )

    assert payload["adaptive_card"]["msteams"]["entities"][0]["text"] == "<at>Ana &lt;Team&gt; &amp; Ops</at>"