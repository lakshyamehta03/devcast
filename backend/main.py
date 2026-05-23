import logging
import re
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from routers.bookmarks import router as bookmarks_router
from routers.extract import router as extract_router
from routers.posts import router as posts_router
from routers.script import router as script_router

BACKEND_DIR = Path(__file__).parent
STATIC_DIR = BACKEND_DIR / "static"
TEMPLATES_DIR = BACKEND_DIR / "templates"


class _ScrubAuthFilter(logging.Filter):
    _PAT = re.compile(r'(?i)(authorization[:\s]+bearer\s+)\S+')

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = self._PAT.sub(r'\1[REDACTED]', str(record.msg))
        return True


_scrub = _ScrubAuthFilter()
for _name in ("uvicorn.access", "uvicorn.error", "uvicorn"):
    logging.getLogger(_name).addFilter(_scrub)

app = FastAPI()
app.include_router(bookmarks_router)
app.include_router(extract_router)
app.include_router(posts_router)
app.include_router(script_router)
templates = Jinja2Templates(directory=TEMPLATES_DIR)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/episode/{id}")
def episode_page(request: Request, id: str):
    return templates.TemplateResponse(request, "episode.html", {"id": id})


# Static mount MUST be registered last so the routes above win first.
# See ADR 007 (route-order rule).
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
