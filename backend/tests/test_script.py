import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _body(**kwargs):
    base = {
        "posts": [{"id": "p1", "content": "word " * 300, "source": "jina_clean"}],
        "post_meta": [{"id": "p1", "title": "How React Server Components Work"}],
    }
    base.update(kwargs)
    return base


def _parse_sse(text: str) -> list[dict]:
    events, current = [], {}
    for line in text.splitlines():
        if line.startswith("event:"):
            current["event"] = line[6:].strip()
        elif line.startswith("data:"):
            current["data"] = json.loads(line[5:].strip())
        elif line == "" and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events


def _make_fake_openai(tokens: list[str]):
    async def _fake(messages):
        for t in tokens:
            yield t
    return _fake


_HAPPY_TOKENS = list(
    "TITLE: How React Server Components Work\n"
    "DESCRIPTION: A deep dive into RSC architecture and why it matters.\n"
    "---\n"
    "Alex: Welcome to DevCast.\n"
    "Jordan: Thanks for having me.\n"
)


# ---------------------------------------------------------------------------
# Cycle 1 — tracer bullet: endpoint exists and returns text/event-stream
# ---------------------------------------------------------------------------

def test_script_returns_event_stream():
    with patch("routers.script._call_openai", _make_fake_openai(_HAPPY_TOKENS)):
        resp = client.post("/api/script", json=_body())

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]


# ---------------------------------------------------------------------------
# Cycle 2 — first event is meta with title and description from GPT header
# ---------------------------------------------------------------------------

def test_script_first_event_is_meta_with_title_and_description():
    with patch("routers.script._call_openai", _make_fake_openai(_HAPPY_TOKENS)):
        resp = client.post("/api/script", json=_body())

    events = _parse_sse(resp.text)
    assert events[0]["event"] == "meta"
    assert events[0]["data"]["title"] == "How React Server Components Work"
    assert events[0]["data"]["description"] == "A deep dive into RSC architecture and why it matters."


# ---------------------------------------------------------------------------
# Cycle 3 — chunk events carry the script body tokens in order
# ---------------------------------------------------------------------------

def test_script_chunk_events_reconstruct_body_in_order():
    with patch("routers.script._call_openai", _make_fake_openai(_HAPPY_TOKENS)):
        resp = client.post("/api/script", json=_body())

    events = _parse_sse(resp.text)
    chunks = [e["data"]["text"] for e in events if e["event"] == "chunk"]
    body = "".join(chunks)
    assert "Alex: Welcome to DevCast." in body
    assert "Jordan: Thanks for having me." in body
    # meta must come before any chunk
    first_chunk_idx = next(i for i, e in enumerate(events) if e["event"] == "chunk")
    assert events[0]["event"] == "meta"
    assert first_chunk_idx > 0


# ---------------------------------------------------------------------------
# Cycle 4 — final event is done
# ---------------------------------------------------------------------------

def test_script_last_event_is_done():
    with patch("routers.script._call_openai", _make_fake_openai(_HAPPY_TOKENS)):
        resp = client.post("/api/script", json=_body())

    events = _parse_sse(resp.text)
    assert events[-1]["event"] == "done"
    assert events[-1]["data"] == {}


# ---------------------------------------------------------------------------
# Cycle 5 — fallback meta when no --- arrives in 400 token-chunks
# ---------------------------------------------------------------------------

def test_script_emits_fallback_meta_when_separator_missing():
    # 500 tokens with no --- separator — model went off-format
    off_format_tokens = ["word "] * 500

    with patch("routers.script._call_openai", _make_fake_openai(off_format_tokens)):
        resp = client.post("/api/script", json=_body())

    events = _parse_sse(resp.text)
    assert events[0]["event"] == "meta"
    assert events[0]["data"]["title"] == "How React Server Components Work"
    assert events[0]["data"]["description"] == "A podcast on How React Server Components Work"
    # body still streams after fallback
    chunks = [e for e in events if e["event"] == "chunk"]
    assert len(chunks) > 0
