from typing import Optional

from fastapi import APIRouter, Query, Request

from proxy import DAILY_DEV_BASE, _forward_response, _proxy_get, _require_auth_header

router = APIRouter()


@router.get("/api/posts/{post_id}/comments")
async def get_post_comments(
    request: Request,
    post_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = None,
    sort: Optional[str] = None,
):
    auth = _require_auth_header(request)

    params: dict = {"limit": limit}
    if cursor:
        params["cursor"] = cursor
    if sort:
        params["sort"] = sort

    resp = await _proxy_get(f"{DAILY_DEV_BASE}/posts/{post_id}/comments", auth, params)
    return _forward_response(resp)
