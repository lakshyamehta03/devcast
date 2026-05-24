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
    content_block = "\n\n".join(doc.content for doc in body.content_documents)
    messages = [
        {
            "role": "system",
            "content": (
                "You are generating a two-host podcast script. "
                "Output ONLY the dialogue — no title, no description, no separator lines. "
                "Format every line as either 'Alex: <line>' or 'Jordan: <line>'. "
                "Alex is the lead/summarizer. Jordan is the skeptic/clarifier. "
                "Aim for approximately 1000 words of dialogue. "
                "No prefatory text, no closing remarks, no markdown."
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
