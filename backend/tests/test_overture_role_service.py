from types import SimpleNamespace

import pytest
from starlette.requests import Request
from starlette.responses import Response

from backend.auth import middleware as auth_middleware
from backend.connectors.overture_postgres_connector import OverturePostgresConnector
from backend.services import overture_role_service


class FakeCursor:
    def __init__(self, row):
        self.row = row
        self.query = None
        self.params = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params):
        self.query = query
        self.params = params

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self, cursor):
        self.fake_cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self):
        return self.fake_cursor


def test_connector_uses_read_only_parameterized_role_query(monkeypatch):
    cursor = FakeCursor((12, "operator"))
    captured = {}

    def connect(**kwargs):
        captured.update(kwargs)
        return FakeConnection(cursor)

    monkeypatch.setitem(__import__("sys").modules, "psycopg", SimpleNamespace(connect=connect))
    connector = OverturePostgresConnector(
        host="/cloudsql/instance",
        database="postgres",
        port=5432,
        credentials='user = "reader"\npassword = "$literal-secret-value"',
        connect_timeout_s=5,
    )

    assert connector.get_user_role("ana@example.com", "amplify") == (12, "operator")
    assert captured == {
        "host": "/cloudsql/instance",
        "dbname": "postgres",
        "port": 5432,
        "user": "reader",
        "password": "$literal-secret-value",
        "connect_timeout": 5,
        "options": "-c statement_timeout=5000",
    }
    assert "%s" in cursor.query
    assert cursor.params == ("ana@example.com", "amplify")
    assert "JOIN accesos.roles_app" in cursor.query


def test_connector_rejects_missing_secret_fields():
    with pytest.raises(RuntimeError, match="user y password"):
        OverturePostgresConnector(
            host="/cloudsql/instance",
            database="postgres",
            port=5432,
            credentials='user = "reader"',
            connect_timeout_s=5,
        )


@pytest.mark.parametrize(
    ("db_role", "expected_role"),
    [("admin", "ADMIN"), ("VIEWER", "VIEWER"), ("operator", "OPERATOR")],
)
def test_get_overture_user_maps_supported_roles(monkeypatch, db_role, expected_role):
    class FakeOvertureConnector:
        def get_user_role(self, email, app_name):
            assert email == "ana@example.com"
            assert app_name == "amplify"
            return 12, db_role

    monkeypatch.setattr(overture_role_service, "_get_connector", lambda: FakeOvertureConnector())
    monkeypatch.setattr(
        overture_role_service,
        "get_settings",
        lambda: SimpleNamespace(OVERTURE_ROLES_APP="amplify"),
    )
    overture_role_service._cache.clear()

    user = overture_role_service.get_overture_user_by_email(" Ana@Example.com ")

    assert user is not None
    assert user.user_id == "12"
    assert user.email == "ana@example.com"
    assert user.full_name == "ana@example.com"
    assert user.role == expected_role


def test_get_overture_user_denies_unmapped_roles(monkeypatch):
    class FakeOvertureConnector:
        def get_user_role(self, _email, _app_name):
            return 12, "unknown-role"

    monkeypatch.setattr(overture_role_service, "_get_connector", lambda: FakeOvertureConnector())
    monkeypatch.setattr(
        overture_role_service,
        "get_settings",
        lambda: SimpleNamespace(OVERTURE_ROLES_APP="amplify"),
    )
    overture_role_service._cache.clear()

    assert overture_role_service.get_overture_user_by_email("ana@example.com") is None


def test_get_overture_user_denies_users_without_assignment(monkeypatch):
    class FakeOvertureConnector:
        def get_user_role(self, _email, _app_name):
            return None

    monkeypatch.setattr(overture_role_service, "_get_connector", lambda: FakeOvertureConnector())
    monkeypatch.setattr(
        overture_role_service,
        "get_settings",
        lambda: SimpleNamespace(OVERTURE_ROLES_APP="amplify"),
    )
    overture_role_service._cache.clear()

    assert overture_role_service.get_overture_user_by_email("ana@example.com") is None


def _request(headers):
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/auth/me",
        "raw_path": b"/api/auth/me",
        "query_string": b"",
        "headers": [(key.lower().encode(), value.encode()) for key, value in headers.items()],
        "server": ("testserver", 80),
        "client": ("testclient", 50000),
    })


@pytest.mark.parametrize(
    ("headers", "dev_bypass", "expected_source"),
    [
        ({"X-Goog-Authenticated-User-Email": "accounts.google.com:ana@example.com"}, True, "overture"),
        ({}, True, "bigquery"),
    ],
)
def test_middleware_uses_overture_for_iap_and_bigquery_for_dev(
    monkeypatch, headers, dev_bypass, expected_source,
):
    calls = []
    user = object()
    settings = SimpleNamespace(DEV_AUTH_BYPASS=dev_bypass, DEV_USER_EMAIL="ana@example.com")
    monkeypatch.setattr(auth_middleware, "get_settings", lambda: settings)
    monkeypatch.setattr(
        auth_middleware,
        "get_overture_user_by_email",
        lambda email: calls.append(("overture", email)) or user,
    )
    monkeypatch.setattr(auth_middleware, "get_bq", lambda: "fake-bq")
    monkeypatch.setattr(
        auth_middleware,
        "get_user_by_email",
        lambda bq, email: calls.append(("bigquery", bq, email)) or user,
    )

    async def call_next(request):
        assert request.state.user is user
        return Response(status_code=200)

    middleware = auth_middleware.AuthMiddleware(app=lambda *_args: None)
    response = __import__("asyncio").run(middleware.dispatch(_request(headers), call_next))

    assert response.status_code == 200
    assert calls[0][0] == expected_source


def test_safe_error_detail_redacts_sql_password():
    detail = auth_middleware._safe_error_detail(
        RuntimeError("password rejected: literal-secret"),
        'user = "reader"\npassword = "literal-secret"',
    )

    assert detail == "password rejected: [REDACTED]"
    assert "literal-secret" not in detail