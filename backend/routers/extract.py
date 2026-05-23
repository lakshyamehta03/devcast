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


class _PostInput(BaseModel):
    id: str
    url: str
    summary: str


class _ExtractRequest(BaseModel):
    jina_key: str
    posts: list[_PostInput]


async def _fetch_jina_markdown(url: str, jina_key: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{JINA_BASE}/{url}",
                headers={"Authorization": f"Bearer {jina_key}"},
            )
            if resp.status_code == 200:
                return resp.text
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


@router.post("/api/extract")
async def extract(request: Request, body: _ExtractRequest):
    auth = _require_auth_header(request)

    result_posts = []
    for post in body.posts:
        content = None
        source = None

        markdown = await _fetch_jina_markdown(post.url, body.jina_key)
        if markdown:
            cleaned = await _gpt4o_clean(markdown)
            if cleaned and _word_count(cleaned) >= 500:
                content = cleaned
                source = "jina_clean"

        if content is None:
            comment_texts = await _fetch_top_comments(post.id, auth)
            parts = [post.summary] + comment_texts
            content = "\n\n".join(p for p in parts if p)
            source = "fallback"

        result_posts.append({"id": post.id, "content": content, "source": source})

    total_words = sum(_word_count(p["content"]) for p in result_posts)
    if total_words < 100:
        return JSONResponse(
            status_code=400,
            content={
                "error": "insufficient_content",
                "user_message": "Couldn't extract enough content from your selection — try different articles.",
            },
        )

    return {"posts": result_posts}
