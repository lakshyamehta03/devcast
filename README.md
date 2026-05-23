# DevCast

Turn your daily.dev bookmarks into a two-host AI podcast episode in about a minute, then share a permanent link.

DevCast is a session-based, bring-your-own-keys web app: paste your daily.dev PAT, Gemini API key, and Jina API key; select up to two saved articles; DevCast generates a dialogue script (Alex & Jordan), synthesizes it to audio via Gemini TTS, and gives you a public URL with rich Open Graph unfurls for Slack, X, and Discord.

See [`PRD.md`](PRD.md) for the full product spec and [`docs/adr/`](docs/adr/) for the architectural decisions.

## At a glance

- **Backend** — FastAPI under uvicorn, single container, deploys to AWS ECS Express Mode (see [ADR 013](docs/adr/013-ecs-express-mode-not-app-runner.md))
- **Frontend** — React + Vite + Tailwind v4 + shadcn/ui + Framer Motion, built into the same container ([ADR 007](docs/adr/007-monorepo-single-container.md))
- **Storage** — AWS S3 public bucket only, no database. MP3 + JSON metadata sidecar per episode ([ADR 004](docs/adr/004-s3-only-no-database.md))
- **No accounts** — keys live in browser sessionStorage; share URLs are unguessable ULIDs

## Running locally

### Prerequisites

- **Python 3.12+** (managed by `uv`)
- **Node 20+** (for the frontend build)
- **uv** — `brew install uv` or [the official installer](https://docs.astral.sh/uv/)
- **An AWS profile** with read/write access to your DevCast S3 bucket (not required until slice #6 lands)
- **An OpenAI API key** — used server-side for content cleaning and script generation

### First-time setup

```sh
git clone https://github.com/lakshyamehta03/devcast.git
cd devcast

# backend deps (uv creates backend/.venv)
cd backend && uv sync && cd ..

# frontend deps
cd frontend && npm install && cd ..

# config
cp backend/.env.example backend/.env
# edit backend/.env with real values for OPENAI_API_KEY, DEVCAST_S3_BUCKET,
# AWS_REGION, AWS_PROFILE
```

### Run dev (two terminals)

```sh
# terminal 1 — backend on :8080 with auto-reload
cd backend && uv run uvicorn main:app --reload --port 8080
```

```sh
# terminal 2 — frontend on :5173 with HMR
cd frontend && npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api/*` and `/episode/*` to the backend, so the browser sees one origin (no CORS).

### Run tests

```sh
cd backend && uv run pytest
```

Frontend tests (vitest + React Testing Library, per [ADR 012](docs/adr/012-frontend-navigation-pagination-and-testing.md)) arrive with the first feature slice that has components worth testing.

### Verify the production container shape

```sh
# from repo root
docker build -t devcast:test .
docker run --rm -p 8080:8080 devcast:test &
sleep 3 && curl http://localhost:8080/healthz
# {"ok":true}
```

## Bring your own keys

DevCast asks the end-user for three keys at runtime; they're held in browser `sessionStorage` only and cleared when the tab closes.

| Key | Used for | Free-tier limit |
|-----|----------|-----------------|
| daily.dev PAT | Fetching your bookmarks. **Requires daily.dev Plus subscription.** Get it at <https://app.daily.dev/settings/api>. | n/a |
| Gemini API key | Browser-side TTS (`gemini-2.5-pro-preview-tts`). | ~500k chars/month |
| Jina API key | Article content extraction via `r.jina.ai/{url}`. | 1M tokens/month |

DevCast also uses an **OpenAI API key server-side** (yours, set as `OPENAI_API_KEY` on the deployed service) for the GPT-4o content-cleaning pass and the two-host script generation. See [ADR 009](docs/adr/009-secrets-and-aws-credentials.md) for the secrets model.

## Deploying

v1 deploys are manual: build the image locally, push to ECR, create / update the ECS Express Mode service via the AWS Console. See [#10](https://github.com/lakshyamehta03/devcast/issues/10) for the step-by-step procedure. GitHub Actions–based CI/CD lands with [#9](https://github.com/lakshyamehta03/devcast/issues/9).

## Project layout

```
podcast/
├── backend/                  FastAPI + uv-managed Python deps
│   ├── main.py               app entry point
│   ├── pyproject.toml        deps + pytest config
│   ├── uv.lock               pinned versions
│   ├── static/               served by FastAPI's StaticFiles mount
│   ├── templates/            Jinja2 SSR templates
│   ├── tests/                pytest
│   └── .env.example
├── frontend/                 Vite + React + TS + Tailwind v4 + shadcn
├── docs/adr/                 architectural decision records
├── Dockerfile                multi-stage: Node build → Python+ffmpeg runtime
├── .dockerignore
├── PRD.md                    product requirements
└── CLAUDE.md                 codebase guidance for AI assistants
```

## Roadmap

Tracked as [GitHub issues](https://github.com/lakshyamehta03/devcast/issues):

| # | Slice | Status |
|---|-------|--------|
| [#1](https://github.com/lakshyamehta03/devcast/issues/1) | Project scaffold | done |
| [#2](https://github.com/lakshyamehta03/devcast/issues/2) | Key onboarding wizard | next |
| [#3](https://github.com/lakshyamehta03/devcast/issues/3) | Bookmark feed + daily.dev proxy | queued |
| [#4](https://github.com/lakshyamehta03/devcast/issues/4) | Content extraction API | queued |
| [#5](https://github.com/lakshyamehta03/devcast/issues/5) | Script generation + preview | queued |
| [#6](https://github.com/lakshyamehta03/devcast/issues/6) | TTS pipeline + finalize + progress UI | queued |
| [#7](https://github.com/lakshyamehta03/devcast/issues/7) | Share page | queued |
| [#8](https://github.com/lakshyamehta03/devcast/issues/8) | Test suite completion | queued |
| [#10](https://github.com/lakshyamehta03/devcast/issues/10) | First production deploy | queued |
| [#9](https://github.com/lakshyamehta03/devcast/issues/9) | CI/CD pipeline | queued |
