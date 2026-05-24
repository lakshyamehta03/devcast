from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

AUTH = {"Authorization": "Bearer daily-dev-pat"}
JINA_HEADERS = {"X-Jina-Key": "jina-key-123"}
ALL_HEADERS = {**AUTH, **JINA_HEADERS}

# ---------------------------------------------------------------------------
# Fixtures — shapes derived from real daily.dev API responses (bookmarks.json)
# ---------------------------------------------------------------------------

_POST_RESPONSE = {
    "id": "1kpk91osr",
    "title": "AI job title rebranding is just semantics",
    "url": "https://idiallo.com/blog/you-are-an-ai-enabled-engineer-now",
    "image": "https://media.daily.dev/image/upload/placeholder",
    "summary": "A reflection on the AI-driven wave of job title rebranding on LinkedIn.",
    "type": "article",
    "publishedAt": None,
    "createdAt": "2026-05-18T12:00:04.738Z",
    "source": {
        "id": "idiallo",
        "name": "Ibrahim Diallo",
        "handle": "idiallo",
        "image": "https://media.daily.dev/image/upload/logos/idiallo",
    },
    "tags": ["ai", "career", "personal-branding"],
    "readTime": 5,
    "numUpvotes": 51,
    "numComments": 11,
    "author": None,
}


def _make_post_proxy_response(status_code: int = 200, data: dict | None = None) -> MagicMock:
    """Build a mock httpx.Response for the /posts/{id} endpoint."""
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = status_code
    mock_resp.json.return_value = data if data is not None else _POST_RESPONSE
    return mock_resp


def _long_text(word_count: int) -> str:
    return " ".join(["word"] * word_count)


def _request_body(bookmark_ids=None):
    return {"bookmark_ids": bookmark_ids or ["1kpk91osr"]}


# ---------------------------------------------------------------------------
# Cycle 1 — Jina clean succeeds >500 words → extraction_method="jina_clean"
#           response includes bookmarks array with publisher metadata
# ---------------------------------------------------------------------------

def test_extract_jina_clean_returns_jina_clean_extraction_method():
    clean_text = _long_text(600)
    with (
        patch("routers.extract._proxy_get", new=AsyncMock(return_value=_make_post_proxy_response())),
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=_long_text(800))),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=clean_text)),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=[])),
    ):
        resp = client.post("/api/extract", json=_request_body(), headers=ALL_HEADERS)

    assert resp.status_code == 200
    body = resp.json()

    # content_documents
    docs = body["content_documents"]
    assert len(docs) == 1
    assert docs[0]["id"] == "1kpk91osr"
    assert docs[0]["extraction_method"] == "jina_clean"
    assert docs[0]["content"] == clean_text

    # bookmarks array with publisher metadata
    bms = body["bookmarks"]
    assert len(bms) == 1
    assert bms[0]["id"] == "1kpk91osr"
    assert bms[0]["title"] == _POST_RESPONSE["title"]
    assert bms[0]["url"] == _POST_RESPONSE["url"]
    assert bms[0]["publisher_name"] == "Ibrahim Diallo"
    assert bms[0]["publisher_image"] == _POST_RESPONSE["source"]["image"]
    assert bms[0]["image"] == _POST_RESPONSE["image"]


# ---------------------------------------------------------------------------
# Cycle 2 — cleaned text <500 words → silent fallback, extraction_method="fallback"
# ---------------------------------------------------------------------------

def test_extract_short_clean_triggers_silent_fallback():
    comment_texts = [_long_text(60), _long_text(60)]
    with (
        patch("routers.extract._proxy_get", new=AsyncMock(return_value=_make_post_proxy_response())),
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=_long_text(800))),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=_long_text(200))),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=comment_texts)),
    ):
        resp = client.post("/api/extract", json=_request_body(), headers=ALL_HEADERS)

    assert resp.status_code == 200
    doc = resp.json()["content_documents"][0]
    assert doc["extraction_method"] == "fallback"
    assert _POST_RESPONSE["summary"] in doc["content"]
    assert comment_texts[0] in doc["content"]


# ---------------------------------------------------------------------------
# Cycle 3 — Jina returns 401 → loud 401 with jina_auth error
# ---------------------------------------------------------------------------

def test_extract_jina_401_returns_loud_jina_auth_error():
    from routers.extract import _JinaAuthError

    with (
        patch("routers.extract._proxy_get", new=AsyncMock(return_value=_make_post_proxy_response())),
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(side_effect=_JinaAuthError())),
    ):
        resp = client.post("/api/extract", json=_request_body(), headers=ALL_HEADERS)

    assert resp.status_code == 401
    body = resp.json()
    assert body["error"] == "jina_auth"
    assert "Jina API key" in body["user_message"]


# ---------------------------------------------------------------------------
# Cycle 4 — daily.dev returns 401 on post fetch → loud 401 with dailydev_auth error
# ---------------------------------------------------------------------------

def test_extract_dailydev_401_returns_loud_dailydev_auth_error():
    with (
        patch("routers.extract._proxy_get", new=AsyncMock(
            return_value=_make_post_proxy_response(status_code=401)
        )),
    ):
        resp = client.post("/api/extract", json=_request_body(), headers=ALL_HEADERS)

    assert resp.status_code == 401
    body = resp.json()
    assert body["error"] == "dailydev_auth"
    assert "daily.dev token" in body["user_message"]


# ---------------------------------------------------------------------------
# Cycle 5 — GPT-4o clean returns None → silent fallback
# ---------------------------------------------------------------------------

def test_extract_gpt4o_error_triggers_silent_fallback():
    with (
        patch("routers.extract._proxy_get", new=AsyncMock(return_value=_make_post_proxy_response())),
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=_long_text(800))),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=None)),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=[_long_text(120)])),
    ):
        resp = client.post("/api/extract", json=_request_body(), headers=ALL_HEADERS)

    assert resp.status_code == 200
    assert resp.json()["content_documents"][0]["extraction_method"] == "fallback"


# ---------------------------------------------------------------------------
# Cycle 6 — Jina fetch returns None (non-200 or network error) → silent fallback
# ---------------------------------------------------------------------------

def test_extract_jina_failure_triggers_silent_fallback():
    with (
        patch("routers.extract._proxy_get", new=AsyncMock(return_value=_make_post_proxy_response())),
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=None)),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=_long_text(600))),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=[_long_text(120)])),
    ):
        resp = client.post("/api/extract", json=_request_body(), headers=ALL_HEADERS)

    assert resp.status_code == 200
    assert resp.json()["content_documents"][0]["extraction_method"] == "fallback"


# ---------------------------------------------------------------------------
# Cycle 7 — total words across all documents <100 → 400 insufficient_content
# ---------------------------------------------------------------------------

def test_extract_insufficient_total_content_returns_400():
    with (
        patch("routers.extract._proxy_get", new=AsyncMock(return_value=_make_post_proxy_response())),
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=None)),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=None)),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=[])),
    ):
        # summary is short, no comments → total words < 100
        thin_post = {**_POST_RESPONSE, "summary": "Short."}
        with patch("routers.extract._proxy_get", new=AsyncMock(
            return_value=_make_post_proxy_response(data=thin_post)
        )):
            resp = client.post("/api/extract", json=_request_body(), headers=ALL_HEADERS)

    assert resp.status_code == 400
    body = resp.json()
    assert body["error"] == "insufficient_content"
    assert "try different articles" in body["user_message"]
