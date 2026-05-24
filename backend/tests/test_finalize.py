import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

# 1 second of silence: 24000 samples × 2 bytes/sample = 48000 bytes
SILENT_PCM = b"\x00" * 48000

_VALID_METADATA = {
    "title": "Test Episode",
    "description": "A test episode description.",
    "script": "Alex: Hi there.\nJordan: Hello!",
    "source_bookmarks": [],
}


def _post_finalize(metadata: dict = _VALID_METADATA, audio: bytes = SILENT_PCM):
    metadata_str = json.dumps(metadata)
    return client.post(
        "/api/episodes/finalize",
        files={
            "metadata": ("metadata.json", metadata_str, "application/json"),
            "audio": ("audio.pcm", audio, "application/octet-stream"),
        },
    )


def _mock_s3():
    return MagicMock()


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


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------


def test_finalize_returns_event_stream():
    with patch("routers.finalize._s3", _mock_s3()):
        resp = _post_finalize()
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]


def test_finalize_emits_events_in_order():
    with patch("routers.finalize._s3", _mock_s3()):
        resp = _post_finalize()
    events = _parse_sse(resp.text)
    event_names = [e["event"] for e in events]
    assert event_names == ["upload_received", "transcoding", "s3_audio", "s3_metadata", "complete"]


def test_finalize_complete_has_episode_url():
    with patch("routers.finalize._s3", _mock_s3()):
        resp = _post_finalize()
    events = _parse_sse(resp.text)
    complete = next(e for e in events if e["event"] == "complete")
    assert "episode_id" in complete["data"]
    assert "episode_url" in complete["data"]
    episode_id = complete["data"]["episode_id"]
    assert complete["data"]["episode_url"] == f"/episode/{episode_id}"


def test_finalize_produces_valid_mp3():
    mock = _mock_s3()
    with patch("routers.finalize._s3", mock):
        resp = _post_finalize()
    assert resp.status_code == 200

    # Find the MP3 put_object call (key ends with .mp3)
    mp3_call = None
    for call in mock.put_object.call_args_list:
        if call.kwargs.get("Key", "").endswith(".mp3"):
            mp3_call = call
            break
    assert mp3_call is not None, "No put_object call for .mp3 found"
    mp3_bytes = mp3_call.kwargs["Body"]
    # MP3 files start with ID3 tag or sync word 0xfffb / 0xfffa
    assert mp3_bytes[:3] == b"ID3" or mp3_bytes[:2] in (b"\xff\xfb", b"\xff\xfa", b"\xff\xf3", b"\xff\xf2")


def test_finalize_s3_keys_and_headers():
    mock = _mock_s3()
    with patch("routers.finalize._s3", mock):
        resp = _post_finalize()
    assert resp.status_code == 200

    calls_by_key = {}
    for call in mock.put_object.call_args_list:
        key = call.kwargs["Key"]
        calls_by_key[key.split(".")[-1]] = call.kwargs

    # MP3 upload
    assert "mp3" in calls_by_key
    mp3_kwargs = calls_by_key["mp3"]
    assert mp3_kwargs["ContentType"] == "audio/mpeg"
    assert mp3_kwargs["CacheControl"] == "public, max-age=31536000, immutable"
    assert mp3_kwargs["Key"].startswith("episodes/")

    # JSON upload
    assert "json" in calls_by_key
    json_kwargs = calls_by_key["json"]
    assert json_kwargs["ContentType"] == "application/json"
    assert json_kwargs["CacheControl"] == "public, max-age=60"
    assert json_kwargs["Key"].startswith("episodes/")


def test_finalize_metadata_sidecar_shape():
    mock = _mock_s3()
    with patch("routers.finalize._s3", mock):
        resp = _post_finalize()
    assert resp.status_code == 200

    json_call = None
    for call in mock.put_object.call_args_list:
        if call.kwargs.get("Key", "").endswith(".json"):
            json_call = call
            break
    assert json_call is not None
    sidecar = json.loads(json_call.kwargs["Body"].decode())

    assert "id" in sidecar
    assert sidecar["title"] == _VALID_METADATA["title"]
    assert sidecar["description"] == _VALID_METADATA["description"]
    assert sidecar["script"] == _VALID_METADATA["script"]
    assert "audio_url" in sidecar
    assert "duration_s" in sidecar
    assert sidecar["source_bookmarks"] == _VALID_METADATA["source_bookmarks"]
    assert "created_at" in sidecar
    # audio_url should contain the episode id
    assert sidecar["id"] in sidecar["audio_url"]


def test_finalize_400_on_missing_metadata_fields():
    incomplete = {"description": "No title here.", "script": "Alex: Hi.", "source_bookmarks": []}
    resp = _post_finalize(metadata=incomplete)
    assert resp.status_code == 400
    data = resp.json()
    assert data["error"] == "invalid_metadata"
    assert "user_message" in data
