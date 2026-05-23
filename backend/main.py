from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

BACKEND_DIR = Path(__file__).parent
STATIC_DIR = BACKEND_DIR / "static"
TEMPLATES_DIR = BACKEND_DIR / "templates"

app = FastAPI()
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
