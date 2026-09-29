"""Fase 3.0 — conector de IA (gateway Kairos), con dobles: nunca toca la red."""

import json

import pytest
from pydantic import BaseModel

from backend.connectors import genai_connector
from backend.connectors.genai_connector import GenAIAuthError, GenAIConnector, GenAIError


class Ping(BaseModel):
    ok: bool
    mensaje: str


class _Resp:
    def __init__(self, body):
        self.body = body


class _ErrorHTTP(Exception):
    def __init__(self, code):
        super().__init__(f"HTTP {code}")
        self.code = code


class FakeApiClient:
    """Doble de genai _api_client: devuelve/lanza en el orden encolado."""

    def __init__(self, *respuestas):
        self.respuestas = list(respuestas)
        self.bodies = []

    def request(self, http_method, path, request_dict):
        self.bodies.append(request_dict)
        r = self.respuestas.pop(0)
        if isinstance(r, Exception):
            raise r
        return _Resp(r)


def _ok(content='{"ok": true, "mensaje": "hola"}', pt=10, ct=5):
    return json.dumps({"choices": [{"message": {"content": content}}],
                       "usage": {"prompt_tokens": pt, "completion_tokens": ct}})


def _conn(api):
    return GenAIConnector(jwt="x", gateway_base="https://gw/base/", chat_endpoint="fal-ep",
                          model="gemini-x", api_client=api)


@pytest.fixture(autouse=True)
def _sin_esperas(monkeypatch):
    monkeypatch.setattr(genai_connector.time, "sleep", lambda s: None)


# ── GenAIConnector ──────────────────────────────────────────────────────────

def test_body_formato_openai_con_schema_estricto():
    api = FakeApiClient(_ok())
    conn = _conn(api)
    r = conn.generar("sistema", "usuario", Ping)

    body = api.bodies[0]
    assert conn.chat_url == "https://gw/base/chat/fal-ep"
    assert body["model"] == "gemini-x"                       # par con el endpoint
    assert [m["role"] for m in body["messages"]] == ["system", "user"]
    rf = body["response_format"]
    assert rf["type"] == "json_schema" and rf["json_schema"]["strict"] is True
    assert rf["json_schema"]["name"] == "Ping"
    assert r.parsed == Ping(ok=True, mensaje="hola")
    assert (r.prompt_tokens, r.output_tokens) == (10, 5)


def test_reintenta_429_y_5xx_luego_exito():
    api = FakeApiClient(_ErrorHTTP(429), _ErrorHTTP(503), _ok())
    r = _conn(api).generar("s", "u", Ping)
    assert r.parsed.ok is True
    assert len(api.bodies) == 3


def test_401_no_se_reintenta():
    api = FakeApiClient(_ErrorHTTP(401), _ok())
    with pytest.raises(GenAIAuthError):
        _conn(api).generar("s", "u", Ping)
    assert len(api.bodies) == 1


def test_400_no_se_reintenta():
    api = FakeApiClient(_ErrorHTTP(400), _ok())
    with pytest.raises(GenAIError):
        _conn(api).generar("s", "u", Ping)
    assert len(api.bodies) == 1


def test_reintentos_agotados():
    api = FakeApiClient(_ErrorHTTP(500), _ErrorHTTP(500), _ErrorHTTP(500))
    with pytest.raises(GenAIError):
        _conn(api).generar("s", "u", Ping)
    assert len(api.bodies) == 3


def test_respuesta_fuera_de_schema_es_error():
    api = FakeApiClient(_ok(content='{"otro": 1}'))
    with pytest.raises(GenAIError, match="schema"):
        _conn(api).generar("s", "u", Ping)
