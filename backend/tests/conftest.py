"""
Shared test configuration.

Provides an autouse fixture that patches the S3 client used by routers.episodes
with a minimal stub so tests that don't explicitly mock S3 (e.g. test_scaffold.py)
don't require real AWS credentials.  The stub returns a bare-minimum episode whose
`id` field matches whatever key was requested, satisfying the scaffold assertion
that the episode id appears in the rendered share page.
"""

import json
from unittest.mock import MagicMock, patch

import pytest


def _make_minimal_episode(episode_id: str) -> dict:
    return {
        "id": episode_id,
        "title": f"Episode {episode_id}",
        "description": "Test episode",
        "script": "Alex: Hello.\nJordan: Hi.",
        "audio_url": f"https://devcast-episodes.s3.us-east-1.amazonaws.com/episodes/{episode_id}.mp3",
        "duration_s": 60,
        "source_bookmarks": [],
        "created_at": "2026-01-01T00:00:00Z",
    }


def _build_s3_stub():
    """Return a MagicMock S3 client that infers the episode id from the Key argument."""
    stub = MagicMock()

    def _get_object(Bucket, Key):
        # Key is "episodes/{id}.json"
        episode_id = Key.removeprefix("episodes/").removesuffix(".json")
        meta = _make_minimal_episode(episode_id)
        return {"Body": MagicMock(read=MagicMock(return_value=json.dumps(meta).encode()))}

    stub.get_object.side_effect = _get_object
    return stub


@pytest.fixture(autouse=True, scope="session")
def _auto_mock_s3():
    """Patch routers.episodes._s3 for the entire test session with a credential-free stub.

    Individual tests that need specific S3 behaviour (e.g. NoSuchKey errors) can
    override this by calling `patch("routers.episodes._s3", ...)` inside their own
    `with` block — the innermost patch wins.
    """
    with patch("routers.episodes._s3", _build_s3_stub()):
        yield
