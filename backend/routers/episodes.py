import json
import os
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=_TEMPLATES_DIR)

_s3 = boto3.client("s3")
_BUCKET = os.environ.get("S3_BUCKET", "devcast-episodes")

router = APIRouter()


def _parse_transcript(script: str) -> list[dict]:
    lines = []
    for line in script.split("\n"):
        line = line.strip()
        if not line:
            continue
        if ":" in line and line.split(":")[0] in ("Alex", "Jordan"):
            speaker, text = line.split(":", 1)
            lines.append({"speaker": speaker.strip(), "text": text.strip()})
        else:
            lines.append({"speaker": None, "text": line})
    return lines


def _og_image(source_bookmarks: list) -> str:
    if source_bookmarks:
        first = source_bookmarks[0]
        img = first.get("image")
        if img and not ("media.daily.dev" in img and "Placeholder" in img):
            return img
    return "/og-default.png"


def _fetch_episode(id: str):
    """Fetch episode JSON from S3. Returns (meta_dict, error_code) where error_code is None on success."""
    try:
        response = _s3.get_object(Bucket=_BUCKET, Key=f"episodes/{id}.json")
        body = response["Body"].read()
        return json.loads(body), None
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "NoSuchKey":
            return None, "NoSuchKey"
        return None, "S3Error"
    except NoCredentialsError:
        return None, "S3Error"


@router.get("/episode/{id}")
def episode_page(request: Request, id: str):
    meta, err = _fetch_episode(id)
    if err == "NoSuchKey":
        return templates.TemplateResponse(
            request, "episode_404.html", {"id": id}, status_code=404
        )
    if err:
        return templates.TemplateResponse(
            request, "episode_503.html", {"id": id}, status_code=503
        )

    source_bookmarks = meta.get("source_bookmarks", [])
    return templates.TemplateResponse(
        request,
        "episode.html",
        {
            "id": id,
            "title": meta.get("title", ""),
            "description": meta.get("description", ""),
            "audio_url": meta.get("audio_url", ""),
            "og_image": _og_image(source_bookmarks),
            "transcript_lines": _parse_transcript(meta.get("script", "")),
            "source_bookmarks": source_bookmarks,
        },
    )


@router.get("/api/episodes/{id}")
def episode_json(id: str):
    meta, err = _fetch_episode(id)
    if err == "NoSuchKey":
        return JSONResponse(status_code=404, content={"detail": "Episode not found"})
    if err:
        return JSONResponse(status_code=503, content={"detail": "Storage temporarily unavailable"})
    return JSONResponse(content=meta)
