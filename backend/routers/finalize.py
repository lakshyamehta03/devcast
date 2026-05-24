import json
import os
import subprocess
from datetime import datetime
from typing import AsyncGenerator

import boto3
from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from ulid import ULID

router = APIRouter()

_s3 = boto3.client("s3")
_BUCKET = os.environ.get("S3_BUCKET", "devcast-episodes")
_REGION = os.environ.get("AWS_REGION", "us-east-1")

_REQUIRED_FIELDS = {"title", "description", "script", "source_bookmarks"}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _finalize_stream(
    ulid_str: str,
    metadata: dict,
    audio_bytes: bytes,
) -> AsyncGenerator[str, None]:
    duration_s = round(len(audio_bytes) / 48000)

    yield _sse("upload_received", {})

    # Transcode PCM → MP3 via ffmpeg
    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-f", "s16le",
                "-ar", "24000",
                "-ac", "1",
                "-i", "pipe:0",
                "-b:a", "128k",
                "-f", "mp3",
                "pipe:1",
            ],
            input=audio_bytes,
            capture_output=True,
        )
        yield _sse("transcoding", {})
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg exited {proc.returncode}: {proc.stderr.decode()}")
        mp3_bytes = proc.stdout
    except Exception as exc:
        yield _sse("error", {"phase": "transcoding", "user_message": "Audio transcoding failed. Please try again."})
        return

    # Upload MP3 to S3
    try:
        _s3.put_object(
            Bucket=_BUCKET,
            Key=f"episodes/{ulid_str}.mp3",
            Body=mp3_bytes,
            ContentType="audio/mpeg",
            CacheControl="public, max-age=31536000, immutable",
        )
        yield _sse("s3_audio", {})
    except Exception:
        yield _sse("error", {"phase": "s3_audio", "user_message": "Failed to upload audio. Please try again."})
        return

    # Build metadata sidecar
    audio_url = f"https://{_BUCKET}.s3.{_REGION}.amazonaws.com/episodes/{ulid_str}.mp3"
    sidecar = {
        "id": ulid_str,
        "title": metadata["title"],
        "description": metadata["description"],
        "script": metadata["script"],
        "audio_url": audio_url,
        "duration_s": duration_s,
        "source_bookmarks": metadata["source_bookmarks"],
        "created_at": datetime.utcnow().isoformat() + "Z",
    }

    # Upload JSON sidecar to S3
    try:
        _s3.put_object(
            Bucket=_BUCKET,
            Key=f"episodes/{ulid_str}.json",
            Body=json.dumps(sidecar).encode(),
            ContentType="application/json",
            CacheControl="public, max-age=60",
        )
        yield _sse("s3_metadata", {})
    except Exception:
        yield _sse("error", {"phase": "s3_metadata", "user_message": "Failed to upload metadata. Please try again."})
        return

    yield _sse("complete", {"episode_id": ulid_str, "episode_url": f"/episode/{ulid_str}"})


@router.post("/api/episodes/finalize")
async def finalize(
    metadata: UploadFile,
    audio: UploadFile,
):
    # Parse and validate metadata
    try:
        meta = json.loads(await metadata.read())
    except (json.JSONDecodeError, ValueError):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_metadata", "user_message": "Metadata must be valid JSON."},
        )

    missing = _REQUIRED_FIELDS - set(meta.keys())
    if missing:
        missing_list = ", ".join(sorted(missing))
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_metadata",
                "user_message": f"Missing required metadata fields: {missing_list}.",
            },
        )

    audio_bytes = await audio.read()
    ulid_str = str(ULID())

    return StreamingResponse(
        _finalize_stream(ulid_str, meta, audio_bytes),
        media_type="text/event-stream",
    )
