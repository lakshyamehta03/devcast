from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=_TEMPLATES_DIR)

router = APIRouter()


@router.get("/episode/{id}")
def episode_page(request: Request, id: str):
    return templates.TemplateResponse(request, "episode.html", {"id": id})
