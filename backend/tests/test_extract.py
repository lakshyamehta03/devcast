from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

AUTH = {"Authorization": "Bearer daily-dev-pat"}
JINA_KEY = "jina-key-123"


def _post_body(posts=None):
    return {
        "jina_key": JINA_KEY,
        "posts": posts or [{"id": "p1", "url": "https://example.com/article", "summary": "A great article"}],
    }


def _long_text(word_count: int) -> str:
    return " ".join(["word"] * word_count)


# ---------------------------------------------------------------------------
# Cycle 1 — tracer bullet: Jina clean succeeds >500 words → source="jina_clean"
# ---------------------------------------------------------------------------

def test_extract_jina_clean_returns_jina_clean_source():
    clean_text = _long_text(600)
    with (
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=_long_text(800))),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=clean_text)),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=[])),
    ):
        resp = client.post("/api/extract", json=_post_body(), headers=AUTH)

    assert resp.status_code == 200
    posts = resp.json()["posts"]
    assert len(posts) == 1
    assert posts[0]["id"] == "p1"
    assert posts[0]["source"] == "jina_clean"
    assert posts[0]["content"] == clean_text


# ---------------------------------------------------------------------------
# Cycle 2 — cleaned text <500 words → fallback with summary + comments
# ---------------------------------------------------------------------------

def test_extract_short_clean_triggers_fallback():
    comment_texts = [_long_text(60), _long_text(60)]
    with (
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=_long_text(800))),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=_long_text(200))),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=comment_texts)),
    ):
        resp = client.post("/api/extract", json=_post_body(), headers=AUTH)

    assert resp.status_code == 200
    post = resp.json()["posts"][0]
    assert post["source"] == "fallback"
    assert "A great article" in post["content"]
    assert comment_texts[0] in post["content"]


# ---------------------------------------------------------------------------
# Cycle 3 — GPT-4o returns None → fallback
# ---------------------------------------------------------------------------

def test_extract_gpt4o_error_triggers_fallback():
    with (
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=_long_text(800))),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=None)),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=[_long_text(120)])),
    ):
        resp = client.post("/api/extract", json=_post_body(), headers=AUTH)

    assert resp.status_code == 200
    assert resp.json()["posts"][0]["source"] == "fallback"


# ---------------------------------------------------------------------------
# Cycle 4 — Jina returns None (non-200 or network error) → fallback
# ---------------------------------------------------------------------------

def test_extract_jina_failure_triggers_fallback():
    with (
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=None)),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=_long_text(600))),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=[_long_text(120)])),
    ):
        resp = client.post("/api/extract", json=_post_body(), headers=AUTH)

    assert resp.status_code == 200
    assert resp.json()["posts"][0]["source"] == "fallback"


# ---------------------------------------------------------------------------
# Cycle 5 — comments fetch returns [] → fallback uses only summary
# ---------------------------------------------------------------------------

def test_extract_comments_failure_fallback_uses_summary_only():
    summary = _long_text(120)
    posts = [{"id": "p1", "url": "https://example.com/article", "summary": summary}]
    with (
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=None)),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=None)),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=[])),
    ):
        resp = client.post("/api/extract", json=_post_body(posts), headers=AUTH)

    assert resp.status_code == 200
    post = resp.json()["posts"][0]
    assert post["source"] == "fallback"
    assert post["content"] == summary


# ---------------------------------------------------------------------------
# Cycle 6 — total words across all posts <100 → 400 insufficient_content
# ---------------------------------------------------------------------------

def test_extract_insufficient_total_content_returns_400():
    with (
        patch("routers.extract._fetch_jina_markdown", new=AsyncMock(return_value=None)),
        patch("routers.extract._gpt4o_clean", new=AsyncMock(return_value=None)),
        patch("routers.extract._fetch_top_comments", new=AsyncMock(return_value=[])),
    ):
        resp = client.post("/api/extract", json=_post_body(), headers=AUTH)

    assert resp.status_code == 400
    body = resp.json()
    assert body["error"] == "insufficient_content"
    assert "try different articles" in body["user_message"]
