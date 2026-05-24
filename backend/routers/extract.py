import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

from proxy import DAILY_DEV_BASE, _proxy_get, _require_auth_header

router = APIRouter()

JINA_BASE = "https://r.jina.ai"
_CLEAN_PROMPT = (
    "Return only the article body. Strip navigation, headers, footers, sidebars, "
    "cookie notices, author bios, related-article links, social-share widgets, and ads. "
    "Preserve paragraph structure. Output plain text."
)


# ---------------------------------------------------------------------------
# Sentinel exceptions — raised inside helpers, caught in the route handler
# ---------------------------------------------------------------------------

class _JinaAuthError(Exception):
    pass


class _JinaRateLimitError(Exception):
    pass


class _DailyDevAuthError(Exception):
    pass


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------

class _ExtractRequest(BaseModel):
    bookmark_ids: list[str]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

async def _fetch_jina_markdown(url: str, jina_key: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{JINA_BASE}/{url}",
                headers={"Authorization": f"Bearer {jina_key}"},
            )
            if resp.status_code == 401:
                raise _JinaAuthError()
            if resp.status_code == 429:
                raise _JinaRateLimitError()
            if resp.status_code == 200:
                return resp.text
    except (_JinaAuthError, _JinaRateLimitError):
        raise
    except Exception:
        pass
    return None


async def _gpt4o_clean(markdown: str) -> str | None:
    try:
        client = AsyncOpenAI()
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _CLEAN_PROMPT},
                {"role": "user", "content": markdown},
            ],
        )
        return response.choices[0].message.content
    except Exception:
        return None


async def _fetch_post_details(post_id: str, auth: str) -> dict | None:
    """Fetch post details from daily.dev API.

    Returns a bookmark metadata dict on success, None if the post is
    unreachable for non-auth reasons. Raises _DailyDevAuthError if the
    daily.dev token is rejected.
    """
    try:
        resp = await _proxy_get(
            f"{DAILY_DEV_BASE}/posts/{post_id}",
            auth,
            {},
        )
        if resp.status_code == 401:
            raise _DailyDevAuthError()
        if resp.status_code != 200:
            return None
        data = resp.json()
        source = data.get("source") or {}
        return {
            "id": post_id,
            "title": data.get("title", ""),
            "url": data.get("url", ""),
            "summary": data.get("summary", ""),
            "publisher_name": source.get("name", ""),
            "publisher_image": source.get("image"),
            "image": data.get("image"),
        }
    except _DailyDevAuthError:
        raise
    except Exception:
        return None


async def _fetch_top_comments(post_id: str, auth: str) -> list[str]:
    try:
        resp = await _proxy_get(
            f"{DAILY_DEV_BASE}/posts/{post_id}/comments",
            auth,
            {"limit": 50, "sort": "newest"},
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        comments = data.get("data", [])
        comments.sort(key=lambda c: c.get("numUpvotes", 0), reverse=True)
        return [c["content"] for c in comments[:10] if c.get("content")]
    except Exception:
        return []


def _word_count(text: str) -> int:
    return len(text.split())


# ---------------------------------------------------------------------------
# Route handler
# ---------------------------------------------------------------------------

@router.post("/api/extract")
async def extract(request: Request, body: _ExtractRequest):
    auth = _require_auth_header(request)
    jina_key = request.headers.get("X-Jina-Key", "")

    content_documents = []
    bookmarks = []

    for bookmark_id in body.bookmark_ids:
        # Fetch post details from daily.dev — auth failure is loud
        try:
            post_details = await _fetch_post_details(bookmark_id, auth)
        except _DailyDevAuthError:
            return JSONResponse(
                status_code=401,
                content={
                    "error": "dailydev_auth",
                    "user_message": "Your daily.dev token is invalid or expired.",
                },
            )

        if post_details is None:
            continue

        url = post_details["url"]
        summary = post_details["summary"]
        content = None
        extraction_method = None

        # Attempt Jina clean path — auth/rate-limit errors are loud
        if url and jina_key:
            try:
                markdown = await _fetch_jina_markdown(url, jina_key)
                if markdown:
                    cleaned = await _gpt4o_clean(markdown)
                    if cleaned and _word_count(cleaned) >= 500:
                        content = cleaned
                        extraction_method = "jina_clean"
            except _JinaAuthError:
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": "jina_auth",
                        "user_message": "Your Jina API key is invalid or expired.",
                    },
                )
            except _JinaRateLimitError:
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "jina_rate_limit",
                        "user_message": "Jina rate limit reached. Please wait and try again.",
                    },
                )

        # Silent fallback: use summary + top comments
        if content is None:
            comment_texts = await _fetch_top_comments(bookmark_id, auth)
            parts = [summary] + comment_texts
            content = "\n\n".join(p for p in parts if p)
            extraction_method = "fallback"

        content_documents.append({
            "id": bookmark_id,
            "content": content,
            "extraction_method": extraction_method,
        })
        bookmarks.append({
            "id": post_details["id"],
            "title": post_details["title"],
            "url": post_details["url"],
            "publisher_name": post_details["publisher_name"],
            "publisher_image": post_details["publisher_image"],
            "image": post_details["image"],
        })

    total_words = sum(_word_count(doc["content"]) for doc in content_documents)
    if total_words < 100:
        return JSONResponse(
            status_code=400,
            content={
                "error": "insufficient_content",
                "user_message": "Couldn't extract enough content from your selection — try different articles.",
            },
        )

    return {"content_documents": content_documents, "bookmarks": bookmarks}
