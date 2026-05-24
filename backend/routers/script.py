import json
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

router = APIRouter()


class _ContentDocument(BaseModel):
    id: str
    content: str
    extraction_method: str


class _ScriptRequest(BaseModel):
    content_documents: list[_ContentDocument]


class _MetaRequest(BaseModel):
    script: str


async def _call_openai(messages: list) -> AsyncGenerator[str, None]:
    client = AsyncOpenAI()
    stream = await client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token:
            yield token


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _stream_script(body: _ScriptRequest) -> AsyncGenerator[str, None]:
    parts = [
        f"=== ARTICLE {i+1} ===\n{doc.content}"
        for i, doc in enumerate(body.content_documents)
    ]
    content_block = "\n\n".join(parts)
    messages = [
        {
            "role": "system",
            "content": (
                "You are writing a two-host technical podcast script between two senior engineers who know this space well.\n\n"
                "OUTPUT FORMAT: every line is exactly 'Alex: <line>' or 'Jordan: <line>'. "
                "No title, no description, no separator lines, no markdown, nothing else.\n\n"
                "HOSTS:\n"
                "- Alex: pragmatic, has shipped systems at scale, trusts data over theory, "
                "occasionally gets something wrong and corrects mid-conversation.\n"
                "- Jordan: strong opinions on correctness and design, has seen things break in production, "
                "pushes back on oversimplifications but also builds on ideas they agree with.\n\n"
                "CONVERSATION DYNAMICS — this is the most important part:\n"
                "- Both hosts ask questions AND make assertions. Neither is purely the explainer or purely the skeptic.\n"
                "- Mix turn types: a claim, then a build-on, then a question, then a disagreement, then an agreement with a caveat. "
                "Avoid any pattern that repeats more than twice in a row.\n"
                "- When they agree, they add something new — not just 'yes exactly'. When they disagree, they stay specific — "
                "cite the actual trade-off or failure mode, not a generic objection.\n"
                "- Either host can introduce a new angle, bring up a prior art, or call out something the article glosses over.\n\n"
                "RULES:\n"
                "- Maintain the technical depth of the source material. Use specific terms, code patterns, "
                "architecture names, and trade-offs from the article.\n"
                "- No small talk, no pleasantries, no 'thanks for having me', no 'great question', "
                "no 'that's a wrap'. Jump straight into the topic and end on a substantive point.\n"
                "- Unequal turn lengths are fine — a 3-sentence point followed by a 1-sentence "
                "challenge is better than forced balance.\n"
                "- If multiple articles are provided, weave ideas from all of them into a single coherent conversation — "
                "don't treat them as separate segments. Find the connecting thread or tension between them.\n"
                "- Aim for approximately 1000 words."
            ),
        },
        {"role": "user", "content": content_block},
    ]

    try:
        async for token in _call_openai(messages):
            yield _sse("chunk", {"text": token})
    except Exception:
        yield _sse("error", {"phase": "script_gen", "user_message": "Script generation failed. Please try again."})
        return

    yield _sse("done", {})


@router.post("/api/script")
async def script(body: _ScriptRequest):
    return StreamingResponse(_stream_script(body), media_type="text/event-stream")


@router.post("/api/script/meta")
async def script_meta(body: _MetaRequest):
    client = AsyncOpenAI()
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Given this podcast script, generate a title (50-80 chars, no quotes, no markdown) "
                        "and a description (140-160 chars, plain text, suitable for Open Graph meta tags). "
                        'Return JSON: {"title": "...", "description": "..."}.'
                    ),
                },
                {"role": "user", "content": body.script},
            ],
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return {"title": result["title"], "description": result["description"]}
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"error": "meta_gen", "user_message": "Failed to generate episode metadata. Please try again."},
        )
