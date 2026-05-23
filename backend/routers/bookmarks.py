from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response

router = APIRouter()

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


def _check_no_pat_in_query(request: Request) -> None:
    if any(k.lower() == "authorization" for k in request.query_params):
        raise HTTPException(
            status_code=400,
            detail="PAT must be sent in the Authorization header, not the query string",
        )


@router.get("/api/bookmarks")
async def get_bookmarks(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = None,
):
    _check_no_pat_in_query(request)
    auth = request.headers.get("Authorization", "")
    if not auth:
        raise HTTPException(status_code=401, detail="Authorization header required")

    params: dict = {"limit": limit}
    if cursor:
        params["cursor"] = cursor

    resp = await _proxy_get(f"{DAILY_DEV_BASE}/bookmarks/", auth, params)
    return _forward_response(resp)


@router.get("/api/posts/{post_id}/comments")
async def get_post_comments(
    request: Request,
    post_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = None,
    sort: Optional[str] = None,
):
    auth = request.headers.get("Authorization", "")
    if not auth:
        raise HTTPException(status_code=401, detail="Authorization header required")

    params: dict = {"limit": limit}
    if cursor:
        params["cursor"] = cursor
    if sort:
        params["sort"] = sort

    resp = await _proxy_get(f"{DAILY_DEV_BASE}/posts/{post_id}/comments", auth, params)
    return _forward_response(resp)
