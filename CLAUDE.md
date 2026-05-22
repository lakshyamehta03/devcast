# DevCast

A web app that turns daily.dev bookmarks into two-host AI podcast episodes with permanent shareable URLs.

## Architecture

**Backend:** FastAPI on AWS App Runner (Docker, includes ffmpeg). Single server handles API routes and serves the React SPA static files. Share pages (`/episode/{id}`) are Jinja2 SSR for proper Open Graph unfurls.

**Frontend:** React + Vite + Tailwind v4 + shadcn/ui + Framer Motion. Dark-first design. Built assets served by FastAPI `StaticFiles`.

**Storage:** AWS S3 public bucket only. Each episode stored as `episodes/{ulid}.mp3` (audio) and `episodes/{ulid}.json` (metadata). S3 Lifecycle transitions objects to STANDARD_IA after 30 days.

## Key Decisions

- **Session-only, no accounts.** Three BYOK keys stored in `sessionStorage`: daily.dev PAT, Gemini API key, Jina API key. Keys are never persisted server-side.
- **Two-host dialogue.** Fixed voices: Host A = `Charon`, Host B = `Aoede` via `gemini-2.5-pro-preview-tts`.
- **Script generation** runs server-side via GPT-4o. Hard 750-word limit with one automatic retry.
- **TTS runs browser-side** using the user's Gemini key. Raw PCM is POSTed to the server, transcoded to MP3 via ffmpeg in-memory, and uploaded to S3.
- **Script is streamed** to the browser via SSE (typewriter effect) so users see it appear before approving.
- **No TTL, no deletion** in v1. Share URLs are permanent. Ownership cannot be proven without accounts.
- **Content extraction** uses Jina (`r.jina.ai/{url}`). Raw markdown is cleaned by a server-side GPT-4o call to extract only the article body (stripping nav, footers, sidebars, and other non-article noise). Falls back to daily.dev `summary` + top upvoted comments if cleaned text is <500 words.

See `PRD.md` for the full product spec and user stories.

## Architectural Decision Records

All architectural decisions live in `docs/adr/`. Each ADR is a short Markdown file named `NNN-title.md` and follows the format: **Context → Decision → Consequences**. Before making a significant architectural change, write or update the relevant ADR first.

## Project Structure (intended)

```
/
├── backend/          # FastAPI app
├── frontend/         # React + Vite app
├── docs/
│   └── adr/          # Architectural Decision Records
├── PRD.md            # Product requirements
└── CLAUDE.md         # This file
```
