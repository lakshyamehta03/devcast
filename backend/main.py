import logging
import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from routers.bookmarks import router as bookmarks_router
from routers.episodes import router as episodes_router
from routers.extract import router as extract_router
from routers.posts import router as posts_router
from routers.script import router as script_router

BACKEND_DIR = Path(__file__).parent
STATIC_DIR = BACKEND_DIR / "static"


class _ScrubAuthFilter(logging.Filter):
    _PAT = re.compile(r'(?i)(authorization[:\s]+bearer\s+|x-jina-key[:\s]+)\S+')

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = self._PAT.sub(r'\1[REDACTED]', str(record.msg))
        return True


_scrub = _ScrubAuthFilter()
for _name in ("uvicorn.access", "uvicorn.error", "uvicorn"):
    logging.getLogger(_name).addFilter(_scrub)

app = FastAPI()
app.include_router(bookmarks_router)
app.include_router(episodes_router)
app.include_router(extract_router)
app.include_router(posts_router)
app.include_router(script_router)


@app.get("/healthz")
def healthz():
    return {"ok": True}


# Static mount MUST be registered last so the routes above win first.
# See ADR 007 (route-order rule).
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
