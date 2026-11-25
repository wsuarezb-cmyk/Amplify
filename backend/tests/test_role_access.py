import pytest
from fastapi import HTTPException
from starlette.requests import Request

from backend.dependencies import require_trace_access
from backend.models.auth import UserContext


def make_request(method, path):
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "server": ("testserver", 80),
        "client": ("testclient", 50000),
    })


@pytest.mark.parametrize("role", ["ADMIN", "OPERATOR"])
def test_admin_and_operator_can_access_all_trace_routes(role):
    user = UserContext(user_id="1", email="user@example.com", full_name="User", role=role)

    assert require_trace_access(make_request("POST", "/api/trace/send-alerts/reconcile"), user) is user


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/trace/sends/summary"),
        ("GET", "/api/trace/sends/detail"),
        ("GET", "/api/trace/sends/export"),
        ("POST", "/api/trace/audiences/search"),
    ],
)
def test_viewer_can_access_send_tracking_routes(method, path):
    user = UserContext(user_id="1", email="user@example.com", full_name="User", role="VIEWER")

    assert require_trace_access(make_request(method, path), user) is user


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/trace/audiences/options"),
        ("POST", "/api/trace/audiences/dataset"),
        ("GET", "/api/trace/audiences/history"),
        ("POST", "/api/trace/send-alerts/reconcile"),
        ("GET", "/api/trace/contacts/daily-volume"),
    ],
)
def test_viewer_is_denied_other_trace_routes(method, path):
    user = UserContext(user_id="1", email="user@example.com", full_name="User", role="VIEWER")

    with pytest.raises(HTTPException) as error:
        require_trace_access(make_request(method, path), user)

    assert error.value.status_code == 403