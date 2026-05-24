import json
from unittest.mock import MagicMock, patch

import pytest
from bs4 import BeautifulSoup
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

EPISODE_META = {
    "id": "01HX1234",
    "title": "How React Server Components Work",
    "description": "A deep dive into RSC architecture and streaming.",
    "script": "Alex: Welcome to DevCast.\nJordan: Thanks for having me.\nAlex: Today we're diving into RSC.",
    "audio_url": "https://devcast-episodes.s3.us-east-1.amazonaws.com/episodes/01HX1234.mp3",
    "duration_s": 240,
    "source_bookmarks": [
        {
            "id": "p1",
            "title": "Understanding RSC",
            "url": "https://example.com/rsc",
            "publisher_name": "Dev.to",
            "image": "https://example.com/rsc.jpg",
        }
    ],
    "created_at": "2026-05-24T12:00:00Z",
}


def _mock_s3_get(meta_json):
    mock = MagicMock()
    mock.get_object.return_value = {
        "Body": MagicMock(read=MagicMock(return_value=json.dumps(meta_json).encode()))
    }
    return mock


def _mock_s3_not_found():
    mock = MagicMock()
    mock.get_object.side_effect = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "Not found"}},
        "GetObject",
    )
    return mock


def _mock_s3_error():
    mock = MagicMock()
    mock.get_object.side_effect = ClientError(
        {"Error": {"Code": "InternalError", "Message": "Oops"}},
        "GetObject",
    )
    return mock


# ---------------------------------------------------------------------------
# Share page tests
# ---------------------------------------------------------------------------


def test_share_page_renders_og_tags():
    with patch("routers.episodes._s3", _mock_s3_get(EPISODE_META)):
        response = client.get("/episode/01HX1234")
    assert response.status_code == 200
    soup = BeautifulSoup(response.text, "html.parser")

    assert soup.find("meta", property="og:title")["content"] == EPISODE_META["title"]
    assert soup.find("meta", property="og:description")["content"] == EPISODE_META["description"]
    assert soup.find("meta", property="og:image")["content"] == EPISODE_META["source_bookmarks"][0]["image"]
    assert soup.find("meta", property="og:audio")["content"] == EPISODE_META["audio_url"]
    assert soup.find("meta", attrs={"name": "twitter:card"})["content"] == "summary_large_image"


def test_share_page_audio_src_matches_stored_url():
    with patch("routers.episodes._s3", _mock_s3_get(EPISODE_META)):
        response = client.get("/episode/01HX1234")
    assert response.status_code == 200
    soup = BeautifulSoup(response.text, "html.parser")
    audio = soup.find("audio")
    assert audio is not None
    assert audio["src"] == EPISODE_META["audio_url"]


def test_share_page_transcript_appears_in_body():
    with patch("routers.episodes._s3", _mock_s3_get(EPISODE_META)):
        response = client.get("/episode/01HX1234")
    assert response.status_code == 200
    soup = BeautifulSoup(response.text, "html.parser")
    transcript_text = soup.find("div", class_="transcript").get_text()
    assert "Welcome to DevCast" in transcript_text
    assert "Thanks for having me" in transcript_text
    assert "Today we're diving into RSC" in transcript_text


def test_share_page_source_attribution_links():
    with patch("routers.episodes._s3", _mock_s3_get(EPISODE_META)):
        response = client.get("/episode/01HX1234")
    assert response.status_code == 200
    soup = BeautifulSoup(response.text, "html.parser")

    src = EPISODE_META["source_bookmarks"][0]
    link = soup.find("a", href=src["url"])
    assert link is not None
    assert src["title"] in link.get_text()


def test_share_page_404_on_missing_episode():
    with patch("routers.episodes._s3", _mock_s3_not_found()):
        response = client.get("/episode/nonexistent")
    assert response.status_code == 404
    assert "Episode not found" in response.text


def test_share_page_503_on_s3_error():
    with patch("routers.episodes._s3", _mock_s3_error()):
        response = client.get("/episode/01HX1234")
    assert response.status_code == 503
    assert "temporarily unavailable" in response.text.lower()


def test_share_page_og_image_fallback_for_placeholder():
    meta = dict(EPISODE_META)
    meta["source_bookmarks"] = [
        {
            "id": "p1",
            "title": "Understanding RSC",
            "url": "https://example.com/rsc",
            "publisher_name": "Dev.to",
            "image": "https://media.daily.dev/image/upload/Placeholder_vugtg4.jpg",
        }
    ]
    with patch("routers.episodes._s3", _mock_s3_get(meta)):
        response = client.get("/episode/01HX1234")
    assert response.status_code == 200
    soup = BeautifulSoup(response.text, "html.parser")
    og_image = soup.find("meta", property="og:image")["content"]
    assert og_image == "/og-default.png"


# ---------------------------------------------------------------------------
# JSON API endpoint tests
# ---------------------------------------------------------------------------


def test_json_endpoint_returns_metadata():
    with patch("routers.episodes._s3", _mock_s3_get(EPISODE_META)):
        response = client.get("/api/episodes/01HX1234")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    data = response.json()
    assert data["id"] == EPISODE_META["id"]
    assert data["title"] == EPISODE_META["title"]
    assert data["audio_url"] == EPISODE_META["audio_url"]


def test_json_endpoint_404_on_missing():
    with patch("routers.episodes._s3", _mock_s3_not_found()):
        response = client.get("/api/episodes/nonexistent")
    assert response.status_code == 404
    assert response.json() == {"detail": "Episode not found"}
