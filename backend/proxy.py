from typing import Optional

import httpx
from fastapi import HTTPException, Request, Response

DAILY_DEV_BASE = "https://api.daily.dev/public/v1"


async def _proxy_get(url: str, auth: str, params: dict) -> httpx.Response:
    async with httpx.AsyncClient() as client:
        return await client.get(url, headers={"Authorization": auth}, params=params)


def _forward_response(resp: httpx.Response) -> Response:
    headers = {}
    if "retry-after" in resp.headers:
        headers["retry-after"] = resp.headers["retry-after"]
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=headers,
        media_type=resp.headers.get("content-type", "application/json"),
    )


def _require_auth_header(request: Request) -> str:
    if any(k.lower() == "authorization" for k in request.query_params):
        raise HTTPException(
            status_code=400,
            detail="PAT must be sent in the Authorization header, not the query string",
        )
    auth = request.headers.get("Authorization", "")
    if not auth:
        raise HTTPException(status_code=401, detail="Authorization header required")
    return auth
