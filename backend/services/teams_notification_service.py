"""Secure sender for Trace reconciliation summaries to the configured Teams flow."""

import json
from html import escape
import logging
import re
import uuid
from datetime import date, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$")
_DOMAIN_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_https_opener = build_opener(_NoRedirectHandler).open


class TeamsNotificationError(RuntimeError):
    """Safe-to-display Teams notification failure, without webhook response details."""


def _normalized_domains(value: str) -> set[str]:
    domains = {item.strip().lower().lstrip("@") for item in (value or "").split(",") if item.strip()}
    if not domains or any(
        len(domain) > 253
        or len(domain.split(".")) < 2
        or any(not _DOMAIN_LABEL_RE.fullmatch(label) or len(label) > 63 for label in domain.split("."))
        for domain in domains
    ):
        raise TeamsNotificationError("La lista de dominios autorizados no está configurada correctamente.")
    return domains


def normalize_recipients(recipients: list[str], allowed_domains: str,
                         max_recipients: int = 20) -> list[str]:
    domains = _normalized_domains(allowed_domains)
    normalized = []
    seen = set()
    for recipient in recipients:
        email = recipient.strip().lower()
        if len(email) > 254 or not _EMAIL_RE.fullmatch(email):
            raise ValueError("Revisa los correos ingresados.")
        if email.rsplit("@", 1)[1] not in domains:
            raise ValueError("Solo se permiten correos de dominios corporativos autorizados.")
        if email not in seen:
            seen.add(email)
            normalized.append(email)
    if not normalized:
        raise ValueError("Agrega al menos un destinatario.")
    if len(normalized) > max_recipients:
        raise ValueError(f"Puedes agregar hasta {max_recipients} destinatarios.")
    return normalized


def _display_name(email: str, directory_names: dict[str, str] | None = None) -> str:
    if directory_names and directory_names.get(email.lower()):
        return directory_names[email.lower()]
    local_part = email.split("@", 1)[0].split("+", 1)[0]
    name = re.sub(r"[._-]+", " ", local_part).strip()
    return name.title() or email


def _isoformat(value) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value or "")


def build_teams_payload(reconciliation: dict, recipients: list[str], requested_by: str,
                        directory_names: dict[str, str] | None = None) -> dict:
    recipient_entries = [
        {"email": email, "name": _display_name(email, directory_names)} for email in recipients
    ]
    mentions = [
        {
            "type": "mention",
            "text": f"<at>{escape(recipient['name'], quote=False)}</at>",
            "mentioned": {"id": recipient["email"], "name": recipient["name"]},
        }
        for recipient in recipient_entries
    ]
    greeting = "Hola " + ", ".join(item["text"] for item in mentions)
    facts = [
        {"title": "Audiencia", "value": str(reconciliation["audience_id"])},
        {"title": "Template", "value": str(reconciliation["template"])},
        {"title": "Fecha de conciliación", "value": _isoformat(reconciliation.get("uploaded_at"))},
        {"title": "Solicitado por", "value": requested_by},
        {"title": "Sellers esperados", "value": str(reconciliation["expected_sellers"])},
        {"title": "Sellers presentes en archivo", "value": str(reconciliation["present_sellers"])},
        {"title": "Sellers no presentes en archivo", "value": str(reconciliation["missing_sellers"])},
        {"title": "Contactos esperados", "value": str(reconciliation["expected_contacts"])},
        {"title": "Contactos presentes en archivo", "value": str(reconciliation["present_contacts"])},
        {"title": "Contactos no presentes en archivo", "value": str(reconciliation["missing_contacts"])},
    ]
    coverage = reconciliation.get("seller_coverage_rate")
    if coverage is not None:
        facts.append({"title": "Cobertura de sellers", "value": f"{coverage:.1%}"})

    card = {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
            {"type": "TextBlock", "text": "Resultado de conciliación de envío", "weight": "Bolder", "size": "Medium", "wrap": True},
            {"type": "TextBlock", "text": f"{greeting}. Tu solicitud fue procesada. Los conteos indican presencia en el archivo de envío, no entrega.", "wrap": True},
            {"type": "FactSet", "facts": facts},
        ],
        "msteams": {"entities": mentions},
    }
    return {
        "reconciliation_id": reconciliation["reconciliation_id"],
        "recipients": recipient_entries,
        "audience_id": reconciliation["audience_id"],
        "template": reconciliation["template"],
        "requested_by": requested_by,
        "processed_at": _isoformat(reconciliation.get("uploaded_at")),
        "expected_sellers": reconciliation["expected_sellers"],
        "present_sellers": reconciliation["present_sellers"],
        "missing_sellers": reconciliation["missing_sellers"],
        "seller_coverage_rate": coverage,
        "expected_contacts": reconciliation["expected_contacts"],
        "present_contacts": reconciliation["present_contacts"],
        "missing_contacts": reconciliation["missing_contacts"],
        "adaptive_card": card,
    }


class TeamsNotificationService:
    def __init__(self, webhook_url: str, allowed_domains: str,
                 max_recipients: int = 20, timeout_seconds: int = 15,
                 opener=_https_opener) -> None:
        self.webhook_url = webhook_url
        self.allowed_domains = allowed_domains
        self.max_recipients = max_recipients
        self.timeout_seconds = timeout_seconds
        self.opener = opener

    def validate_configuration(self) -> None:
        try:
            url = urlsplit(self.webhook_url or "")
        except ValueError:
            raise TeamsNotificationError("La notificación por Teams no está configurada.") from None
        if url.scheme != "https" or not url.netloc or url.username or url.password:
            raise TeamsNotificationError("La notificación por Teams no está configurada.")

    def notify(self, reconciliation: dict, recipients: list[str], requested_by: str,
               directory_names: dict[str, str] | None = None) -> dict:
        self.validate_configuration()
        normalized = normalize_recipients(
            recipients, self.allowed_domains, self.max_recipients,
        )
        payload = build_teams_payload(reconciliation, normalized, requested_by, directory_names)
        request_id = str(uuid.uuid4())
        request = Request(
            self.webhook_url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with self.opener(request, timeout=self.timeout_seconds):
                pass
        except (HTTPError, URLError, TimeoutError, OSError):
            logger.warning(
                "Trace Teams notification failed: reconciliation_id=%s recipient_count=%d request_id=%s",
                reconciliation["reconciliation_id"], len(normalized), request_id,
            )
            raise TeamsNotificationError(
                "No fue posible enviar la notificación. Intenta nuevamente."
            ) from None

        logger.info(
            "Trace Teams notification accepted by Power Automate: reconciliation_id=%s recipient_count=%d request_id=%s",
            reconciliation["reconciliation_id"], len(normalized), request_id,
        )
        return {"status": "accepted", "request_id": request_id}


def service_from_settings(settings) -> TeamsNotificationService:
    return TeamsNotificationService(
        webhook_url=settings.TRACE_TEAMS_ALERT_WEBHOOK_URL,
        allowed_domains=settings.TRACE_TEAMS_ALLOWED_EMAIL_DOMAINS,
        max_recipients=settings.TRACE_TEAMS_MAX_RECIPIENTS,
        timeout_seconds=settings.TRACE_TEAMS_TIMEOUT_SECONDS,
    )