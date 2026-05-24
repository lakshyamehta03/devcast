import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _body(**kwargs):
    base = {
        "content_documents": [{"id": "p1", "content": "word " * 300, "extraction_method": "jina_clean"}],
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


# ---------------------------------------------------------------------------
# Script streaming tests
# ---------------------------------------------------------------------------

def test_script_returns_event_stream():
    tokens = ["Alex: ", "Hello ", "world.\n", "Jordan: ", "Thanks."]
    with patch("routers.script._call_openai", _make_fake_openai(tokens)):
        resp = client.post("/api/script", json=_body())

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]


def test_script_streams_chunks_in_order():
    tokens = ["Alex: ", "Hello ", "world.\n", "Jordan: ", "Thanks."]
    with patch("routers.script._call_openai", _make_fake_openai(tokens)):
        resp = client.post("/api/script", json=_body())

    events = _parse_sse(resp.text)
    chunks = [e for e in events if e["event"] == "chunk"]
    assert len(chunks) == len(tokens)
    reconstructed = "".join(e["data"]["text"] for e in chunks)
    assert reconstructed == "Alex: Hello world.\nJordan: Thanks."


def test_script_last_event_is_done():
    tokens = ["Alex: ", "Hello.\n", "Jordan: ", "Thanks."]
    with patch("routers.script._call_openai", _make_fake_openai(tokens)):
        resp = client.post("/api/script", json=_body())

    events = _parse_sse(resp.text)
    assert events[-1]["event"] == "done"
    assert events[-1]["data"] == {}


def test_script_emits_error_on_openai_failure():
    async def _failing(messages):
        raise RuntimeError("OpenAI boom")
        yield  # make it an async generator

    with patch("routers.script._call_openai", _failing):
        resp = client.post("/api/script", json=_body())

    events = _parse_sse(resp.text)
    error_events = [e for e in events if e["event"] == "error"]
    assert len(error_events) == 1
    assert error_events[0]["data"]["phase"] == "script_gen"
    done_events = [e for e in events if e["event"] == "done"]
    assert len(done_events) == 0


# ---------------------------------------------------------------------------
# Meta endpoint tests
# ---------------------------------------------------------------------------

def _make_fake_openai_response(title: str, description: str):
    mock_response = MagicMock()
    mock_response.choices[0].message.content = json.dumps({"title": title, "description": description})
    return mock_response


def test_meta_returns_title_and_description():
    fake_response = _make_fake_openai_response("Test Title", "Test description.")

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=fake_response)

    with patch("routers.script.AsyncOpenAI", return_value=mock_client):
        resp = client.post("/api/script/meta", json={"script": "Alex: Hello.\nJordan: Hi."})

    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Test Title"
    assert data["description"] == "Test description."


def test_meta_returns_500_on_openai_failure():
    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=RuntimeError("OpenAI boom"))

    with patch("routers.script.AsyncOpenAI", return_value=mock_client):
        resp = client.post("/api/script/meta", json={"script": "Alex: Hello.\nJordan: Hi."})

    assert resp.status_code == 500
    data = resp.json()
    assert data["error"] == "meta_gen"
    assert "user_message" in data
