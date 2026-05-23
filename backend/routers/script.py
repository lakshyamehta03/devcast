import json
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

router = APIRouter()


class _PostContent(BaseModel):
    id: str
    content: str
    source: str


class _PostMeta(BaseModel):
    id: str
    title: str


class _ScriptRequest(BaseModel):
    posts: list[_PostContent]
    post_meta: list[_PostMeta]


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
    content_block = "\n\n".join(p.content for p in body.posts)
    messages = [
        {
            "role": "system",
            "content": (
                "You are generating a two-host podcast script. "
                "Output in this exact format:\n\n"
                "TITLE: <50-80 chars, no quotes, no markdown>\n"
                "DESCRIPTION: <140-160 chars, plain text>\n"
                "---\n"
                "Alex: <line>\n"
                "Jordan: <line>\n"
                "...\n\n"
                "Alex is the lead/summarizer. Jordan is the skeptic/clarifier. "
                "Keep the dialogue under 750 words. No prefatory text or closing remarks."
            ),
        },
        {"role": "user", "content": content_block},
    ]

    state = "header"
    buffer = ""
    token_count = 0
    title = ""
    description = ""

    fallback_title = body.post_meta[0].title[:80] if body.post_meta else "Daily Digest"
    fallback_desc = f"A podcast on {body.post_meta[0].title}"[:160] if body.post_meta else "A podcast episode."

    async for token in _call_openai(messages):
        token_count += 1

        if state == "header":
            buffer += token
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if line.startswith("TITLE:"):
                    title = line[6:].strip()
                elif line.startswith("DESCRIPTION:"):
                    description = line[12:].strip()
                elif line == "---":
                    yield _sse("meta", {"title": title, "description": description})
                    state = "body"
                    if buffer:
                        yield _sse("chunk", {"text": buffer})
                        buffer = ""
                    break

            if state == "header" and token_count >= 400:
                yield _sse("meta", {"title": fallback_title, "description": fallback_desc})
                state = "body"
                if buffer:
                    yield _sse("chunk", {"text": buffer})
                    buffer = ""

        else:
            yield _sse("chunk", {"text": token})

    yield _sse("done", {})


@router.post("/api/script")
async def script(body: _ScriptRequest):
    return StreamingResponse(_stream_script(body), media_type="text/event-stream")
