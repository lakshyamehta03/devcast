from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_healthz_returns_ok():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_root_returns_spa_shell():
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert '<div id="root">' in response.text


def test_share_page_route_wins_over_static_mount():
    response = client.get("/episode/abc123")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    # the id appears in the rendered body — proves Jinja rendered, not static
    assert "abc123" in response.text
    # and the SPA shell did NOT win — proves the route was registered
    # before the StaticFiles mount, per ADR 007's route-order rule
    assert '<div id="root">' not in response.text


def test_unknown_api_route_returns_404_json():
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert "application/json" in response.headers["content-type"]
    body = response.json()
    assert "detail" in body


# ---------------------------------------------------------------------------
# _ScrubAuthFilter — Authorization header redacted from log records
# ---------------------------------------------------------------------------

def test_scrub_auth_filter_redacts_bearer_token():
    import logging
    from main import _ScrubAuthFilter
    f = _ScrubAuthFilter()
    record = logging.makeLogRecord({"msg": "GET /api/bookmarks Authorization: Bearer supersecrettoken123"})
    f.filter(record)
    assert "supersecrettoken123" not in record.msg
    assert "[REDACTED]" in record.msg
