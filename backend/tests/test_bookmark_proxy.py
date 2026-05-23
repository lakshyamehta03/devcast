import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _resp(status: int, body: dict, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code=status,
        content=json.dumps(body).encode(),
        headers={"content-type": "application/json", **(headers or {})},
    )


# ---------------------------------------------------------------------------
# Cycle 1 — tracer bullet: happy-path forwarding
# ---------------------------------------------------------------------------

def test_bookmarks_happy_path_returns_daily_dev_body():
    body = {"data": [{"id": "p1", "title": "Post 1"}], "pagination": {"hasNextPage": False}}
    with patch("routers.bookmarks._proxy_get", new=AsyncMock(return_value=_resp(200, body))):
        response = client.get("/api/bookmarks?limit=10", headers={"Authorization": "Bearer mytoken"})

    assert response.status_code == 200
    assert response.json()["data"][0]["title"] == "Post 1"


# ---------------------------------------------------------------------------
# Cycle 2 — 401 forwarding
# ---------------------------------------------------------------------------

def test_bookmarks_forwards_401_from_daily_dev():
    with patch("routers.bookmarks._proxy_get", new=AsyncMock(return_value=_resp(401, {"error": "Unauthorized"}))):
        response = client.get("/api/bookmarks", headers={"Authorization": "Bearer bad-token"})

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Cycle 3 — 429 forwarding with Retry-After
# ---------------------------------------------------------------------------

def test_bookmarks_forwards_429_with_retry_after():
    with patch(
        "routers.bookmarks._proxy_get",
        new=AsyncMock(return_value=_resp(429, {"error": "Too Many Requests"}, {"retry-after": "30"})),
    ):
        response = client.get("/api/bookmarks", headers={"Authorization": "Bearer mytoken"})

    assert response.status_code == 429
    assert response.headers["retry-after"] == "30"


# ---------------------------------------------------------------------------
# Cycle 4 — reject PAT in query string
# ---------------------------------------------------------------------------

def test_bookmarks_rejects_pat_in_query_string():
    response = client.get("/api/bookmarks?authorization=Bearer+mytoken")
    assert response.status_code == 400
    assert "header" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Cycle 5 — comments endpoint happy path
# ---------------------------------------------------------------------------

def test_comments_happy_path_forwards_post_id_and_sort():
    body = {"data": [{"id": "c1", "content": "Great post!"}], "pagination": {"hasNextPage": False}}
    mock_proxy = AsyncMock(return_value=_resp(200, body))

    with patch("routers.bookmarks._proxy_get", new=mock_proxy):
        response = client.get(
            "/api/posts/abc123/comments?sort=newest&limit=5",
            headers={"Authorization": "Bearer mytoken"},
        )

    assert response.status_code == 200
    assert response.json()["data"][0]["content"] == "Great post!"
    # verify the correct URL and params were forwarded
    call_args = mock_proxy.call_args
    assert "abc123" in call_args.args[0]
    assert call_args.args[2].get("sort") == "newest"
    assert call_args.args[2].get("limit") == 5
