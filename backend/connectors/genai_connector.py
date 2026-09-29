"""
GenAIConnector — chat con Gemini vía el GenAI Gateway corporativo (Kairos).

Réplica mínima de saaca/connectors/vertex_connector.py (mismo gateway, mismo
endpoint y JWT del proyecto de calidad), solo con lo que Pitch necesita:
chat con salida estructurada (json_schema strict). Lecciones de SAACA que se
conservan:
  - Formato OpenAI de bajo nivel vía _api_client.request(path=""): las APIs de
    alto nivel del SDK (models.generate_content) NO sirven contra rutas -oai.
  - El endpoint y el `model` del body son un PAR: el gateway responde 400
    "cannot use own model" si no coinciden.
  - Retener el genai.Client (DT-003): si queda sin referencias, el recolector
    cierra su httpx y la siguiente llamada falla con "client has been closed".
Lo que SAACA no tenía y aquí sí: timeout explícito y reintentos reales ante
429 / 5xx / timeout (401/403 no se reintenta: JWT vencido o sin permiso).
"""

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_TIMEOUT_S_DEFAULT = 120
_MAX_INTENTOS_DEFAULT = 3
_ESPERA_BASE_S = 2          # backoff: 2s, 4s, …


class GenAIError(RuntimeError):
    """Fallo del servicio de IA (no reintentable o reintentos agotados)."""


class GenAIAuthError(GenAIError):
    """401/403: JWT vencido o sin permiso — requiere renovar el secret."""


@dataclass
class GenAIResultado:
    parsed: BaseModel
    texto: str
    prompt_tokens: int
    output_tokens: int


def _codigo_http(exc: Exception) -> Optional[int]:
    """Código HTTP de un error del SDK (google.genai.errors.APIError expone .code)."""
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    try:
        return int(code) if code is not None else None
    except (TypeError, ValueError):
        return None


def _es_reintentable(exc: Exception) -> bool:
    code = _codigo_http(exc)
    if code is not None:
        return code == 429 or code >= 500
    # Sin código HTTP: timeouts y errores de red de httpx
    nombre = type(exc).__name__.lower()
    return "timeout" in nombre or "connect" in nombre or "network" in nombre


def build_api_client(base_url: str, jwt: str, timeout_s: int = _TIMEOUT_S_DEFAULT):
    """
    genai.Client apuntando al endpoint COMPLETO del gateway. Se devuelve el
    Client entero para que quien lo use lo retenga (DT-003).
    """
    from google import genai
    from google.genai import types
    from google.oauth2.credentials import Credentials

    return genai.Client(
        vertexai=True,
        project=None,
        location=None,
        credentials=Credentials(token=jwt),
        http_options=types.HttpOptions(
            base_url=base_url,
            headers={"Authorization": f"Bearer {jwt}"},
            timeout=timeout_s * 1000,        # milisegundos
        ),
    )


class GenAIConnector:

    def __init__(
        self,
        jwt: str,
        gateway_base: str,
        chat_endpoint: str,
        model: str,
        timeout_s: int = _TIMEOUT_S_DEFAULT,
        max_intentos: int = _MAX_INTENTOS_DEFAULT,
        api_client: Any = None,           # inyectable en tests
    ) -> None:
        self.model = model
        self.chat_url = f"{gateway_base.rstrip('/')}/chat/{chat_endpoint}"
        self.max_intentos = max_intentos
        if api_client is None:
            self._raw_client = build_api_client(self.chat_url, jwt, timeout_s)   # retenido (DT-003)
            self._api_client = self._raw_client._api_client
        else:
            self._raw_client = None
            self._api_client = api_client

    @classmethod
    def desde_settings(cls, settings) -> "GenAIConnector":
        return cls(
            jwt=settings.KAIROS_JWT,
            gateway_base=settings.KAIROS_GATEWAY_BASE,
            chat_endpoint=settings.KAIROS_CHAT_ENDPOINT,
            model=settings.GENAI_MODEL,
        )

    def generar(
        self,
        system: str,
        user: str,
        schema: type[T],
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> GenAIResultado:
        """Chat con salida estructurada: el modelo no puede emitir algo fuera del schema."""
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "strict": True,
                    "schema": schema.model_json_schema(),
                },
            },
        }

        data = self._post_con_reintentos(body)
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise GenAIError(f"Respuesta del gateway sin contenido: {str(data)[:200]}") from exc

        try:
            parsed = schema.model_validate_json(content)
        except ValidationError as exc:
            raise GenAIError(f"La respuesta no cumple el schema {schema.__name__}: {exc}") from exc

        usage = data.get("usage", {}) or {}
        return GenAIResultado(
            parsed=parsed,
            texto=content,
            prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
            output_tokens=int(usage.get("completion_tokens", 0) or 0),
        )

    def _post_con_reintentos(self, body: dict) -> dict:
        for intento in range(1, self.max_intentos + 1):
            try:
                resp = self._api_client.request(http_method="POST", path="", request_dict=body)
                raw = resp.body
                return json.loads(raw) if isinstance(raw, (str, bytes)) else raw
            except Exception as exc:
                code = _codigo_http(exc)
                if code in (401, 403):
                    raise GenAIAuthError(
                        f"El gateway de IA rechazó la credencial ({code}): el JWT puede estar vencido."
                    ) from exc
                if intento < self.max_intentos and _es_reintentable(exc):
                    espera = _ESPERA_BASE_S * (2 ** (intento - 1))
                    logger.warning(
                        "GenAI: intento %d/%d falló (%s) — reintento en %ds",
                        intento, self.max_intentos, code or type(exc).__name__, espera,
                    )
                    time.sleep(espera)
                    continue
                raise GenAIError(f"Fallo del servicio de IA: {str(exc)[:300]}") from exc
        raise GenAIError("Fallo del servicio de IA: reintentos agotados")   # inalcanzable
