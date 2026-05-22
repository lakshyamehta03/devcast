# ADR 007: Monorepo layout with single-container dev and prod integration

## Context

DevCast has two halves — a React + Vite frontend and a FastAPI backend. They have to coexist in one repo, be ergonomic to develop locally, and ship as one deployable artifact on AWS App Runner. The frontend additionally has to coexist with a Jinja2-rendered share page, and the share page's URL pattern (`/episode/{id}`) sits inside the same path namespace the React SPA wants to claim.

Three layers of integration to settle:

1. **Repo layout** — where the two halves live in source.
2. **Local dev experience** — how the two processes run together without CORS or port juggling.
3. **Production serving** — how one container serves three things (API routes, server-rendered share pages, the compiled SPA).

## Decision

### Repo layout

```
podcast/
├── backend/        # FastAPI app, Jinja2 templates, Python deps
├── frontend/       # React + Vite + Tailwind v4 + shadcn/ui source
├── docs/adr/       # ADRs
├── Dockerfile      # multi-stage: build frontend, then bundle into backend image
├── PRD.md
└── CLAUDE.md
```

A single Dockerfile at the repo root with **two build stages**:

- **Stage 1 (`node`):** install frontend deps, run `vite build` → produces `frontend/dist/`.
- **Stage 2 (`python:3.12-slim`):** install ffmpeg via `apt-get`, install Python deps, copy `backend/` in, copy `frontend/dist/` to `backend/static/`, set `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]`.

One image, one container, one App Runner service.

### Dev-mode integration

Two processes run side by side:

- **uvicorn** on `:8080` with `--reload`, run from `backend/`.
- **Vite dev server** on `:5173` with HMR, run from `frontend/`.

The browser only talks to `:5173`. Vite's dev config proxies `/api/*` and `/episode/*` to `http://localhost:8080`, so the React code uses same-origin URLs identical to production. No CORS configuration in FastAPI, no `withCredentials` gymnastics, no port awareness in client code.

A root-level convenience script (npm or Makefile) starts both processes together; either is fine — left to implementer's preference.

### Production serving

In production, only FastAPI/uvicorn runs. It handles three kinds of request, **registered in this exact order** to avoid the static-mount greedy-match footgun:

1. `GET /api/*` and `POST /api/*` — API routes (extract, script, episodes/finalize, episodes/{id}, bookmarks proxy, comments proxy).
2. `GET /episode/{id}` — Jinja2-rendered share page (fetches metadata sidecar from S3, renders with OG/Twitter meta tags).
3. **Catch-all static mount** at `/` using `StaticFiles(directory="static", html=True)`. The `html=True` flag enables SPA-fallback: any unmatched path returns `index.html`, so client-side routes resolve in the browser.

If route order is reversed, the `StaticFiles` mount swallows `/episode/{id}` and returns the SPA shell instead of the SSR Jinja page — link unfurls would silently break. The route-order rule is non-negotiable and worth a code comment at the registration site.

## Consequences

- One repo, one image, one URL, one TLS cert, one set of logs. Operationally the simplest viable shape.
- No CORS configuration needed in FastAPI (same-origin in prod; dev proxy handles same-origin illusion locally).
- Vite's build output (`frontend/dist/`) is gitignored; it only exists inside the Docker image or transiently for local prod-like testing.
- The Dockerfile bumps in size compared to a Python-only image (Node base layer in stage 1, ffmpeg in stage 2), but the runtime image is just the Python+ffmpeg layer; Node tooling is discarded after stage 1.
- The route-order requirement is a tripwire. Mitigation: keep API routes and the Jinja `/episode/{id}` handler in a single `routes.py` registered before the static mount in `main.py`, plus a brief comment at the static mount line.
- If we ever want to serve the SPA from a CDN (CloudFront, Vercel) and keep FastAPI as a pure API, this decision is reversible: stop copying `frontend/dist` into the image, drop the static mount, and host `dist/` separately. The dev proxy and API routes stay the same.
