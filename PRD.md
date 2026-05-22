# DevCast — Product Requirements Document

## Problem Statement

Developers who use daily.dev save articles they intend to read, but rarely find uninterrupted time to read them. Bookmarked posts pile up unread. There is no way to passively consume the insights from saved developer content — during a commute, a workout, or time away from a screen.

## Solution

DevCast is a web app that turns a developer's daily.dev bookmarks into a generated podcast episode. The user selects up to two saved posts, and DevCast produces a two-host dialogue podcast script using the full article content, then synthesizes it into high-quality audio via Google Gemini TTS. The resulting episode lives at a permanent public URL the user can share with anyone — no account required on either end.

The product is session-based: users bring their own API keys (daily.dev PAT, Gemini API key, Jina API key), all free-tier obtainable. No keys are stored server-side. The generated episode (audio + transcript) is stored permanently and publicly accessible.

## User Stories

1. As a developer, I want to paste my daily.dev Personal Access Token so that DevCast can fetch my bookmarked posts.
2. As a developer, I want clear step-by-step instructions on where to obtain my daily.dev PAT so that I am not blocked by key acquisition.
3. As a developer, I want to paste my Gemini API key so that audio generation uses my own free-tier quota.
4. As a developer, I want to paste my Jina API key so that content extraction uses my own free-tier quota.
5. As a developer, I want clear step-by-step instructions for obtaining each of the three required keys so that onboarding takes under two minutes.
6. As a developer, I want my pasted keys to persist across page refreshes within the same browser tab so that I do not need to re-enter them if I accidentally refresh.
7. As a developer, I want my keys to be cleared when I close the browser tab so that they are not stored long-term in my browser.
8. As a developer, I want to see my bookmarked posts displayed as a visual grid so that I can quickly identify which articles to podcast-ify.
9. As a developer, I want each bookmark card to show the article title, source name, estimated read time, upvote count, and thumbnail so that I can make an informed selection.
10. As a developer, I want to select up to two bookmarks for a single episode so that the podcast covers a focused set of topics.
11. As a developer, I want the UI to prevent selecting more than two posts so that I am not confused about the limit.
12. As a developer, I want to click "Generate Podcast!" to trigger the full pipeline so that I can start the generation with a single action.
13. As a developer, I want the app to extract the full text of each selected article via Jina so that the podcast script has depth beyond the summary.
14. As a developer, I want the app to gracefully fall back to the daily.dev post summary and top upvoted community comments if Jina extraction returns fewer than 500 words (e.g., paywalled or JS-rendered articles) so that the episode is never empty.
15. As a developer, I want the podcast script to be generated as a two-host dialogue between two named hosts so that the episode feels like a real podcast rather than a text-to-speech reading.
16. As a developer, I want the script generation to stream word-by-word into the preview panel (typewriter effect) so that I have immediate feedback and am not staring at a blank spinner.
17. As a developer, I want the generated script to be kept under 750 words so that the resulting audio fits within five minutes.
18. As a developer, I want to read the full script before committing to audio generation so that I can judge whether the content is worth producing.
19. As a developer, I want an "Approve & Generate Audio" button on the script preview so that I control when the expensive TTS step runs.
20. As a developer, I want a "Regenerate Script" option on the preview so that I can get a different take without re-selecting my articles.
21. As a developer, I want a staged progress bar during audio generation that shows distinct phases (Generating audio, Uploading, Transcoding, Saving) so that I know the system is working and roughly how far along it is.
22. As a developer, I want the audio generation progress bar to start moving immediately when I click "Generate Audio" so that I am not left wondering if anything happened.
23. As a developer, I want the app to call Gemini TTS directly from my browser using my Gemini key so that audio bytes never travel through a third-party server unnecessarily.
24. As a developer, I want the two podcast hosts to use distinct, high-quality voices so that the dialogue is easy to follow.
25. As a developer, I want the server to transcode the raw PCM audio to MP3 so that I receive a universally playable audio file.
26. As a developer, I want to be automatically redirected to the episode share page when generation is complete so that I can immediately hear and share the result.
27. As a developer, I want the episode share page to include an audio player at the top so that anyone visiting the link can play the podcast immediately.
28. As a developer, I want the episode share page to show the full transcript below the player so that listeners can follow along or scan the content.
29. As a developer, I want the share page to display the source article titles and links so that listeners can read the originals.
30. As a developer, I want the share page URL to be permanent and publicly accessible without any login so that I can share it anywhere.
31. As a developer, I want the share page to have proper Open Graph metadata (title, description, image) so that links unfurl richly in Slack, X, and Discord.
32. As a developer, I want the episode share URL to be copyable with one click so that sharing is frictionless.
33. As any person receiving a shared DevCast link, I want to play the episode without signing up or installing anything so that the link works for anyone.
34. As any person receiving a shared DevCast link, I want to see the episode transcript so that I can read rather than listen if I prefer.
35. As any person receiving a shared DevCast link, I want to see which daily.dev articles inspired the episode so that I can read them too.

## Implementation Decisions

### Modules

#### 1. Key Onboarding Module (frontend)
A three-step onboarding wizard shown on first visit (before any bookmark data is fetched). Collects the daily.dev PAT, Gemini API key, and Jina API key. Each step includes a direct link and numbered instructions for obtaining that key. Keys are written to `sessionStorage` on completion and read on subsequent steps. If all three keys are present in `sessionStorage`, the wizard is skipped and the user lands directly on the bookmark selection view.

#### 2. Bookmark Feed Module (frontend + API proxy)
Fetches `GET /api/bookmarks` from the DevCast backend, which proxies to daily.dev's `GET /bookmarks/`. The user's PAT is passed as `Authorization: Bearer <PAT>` on each call and forwarded unchanged by the proxy (see [ADR 002](docs/adr/002-proxy-dailydev-via-fastapi.md)). Renders results as a card grid. Each card shows: thumbnail, title, source name/logo, read time, upvote count, tag chips. Cards are selectable; selecting a second card when two are already selected replaces the oldest selection. A "Generate Podcast!" CTA is enabled only when one or two cards are selected. Pagination is supported via the cursor returned in the `pagination` envelope.

#### 3. Content Extraction Module (backend)
FastAPI endpoint that accepts an array of post objects (id, url, summary, top comments). For each post, calls `https://r.jina.ai/{url}` with the user's Jina API key as `Authorization: Bearer`. The raw markdown returned by Jina is passed through a server-side GPT-4o call that extracts only the article body — stripping navigation, headers, footers, sidebars, cookie notices, author bios, related-article links, and any other non-article content. If the cleaned text is under 500 words (e.g. paywalled, JS-rendered, or extraction noise), falls back to the post's `summary` field concatenated with the text of the top 5–10 comments fetched from `GET /posts/{id}/comments` (the API only supports `oldest`/`newest` sort — the backend must fetch up to 50 comments and sort by `numUpvotes` descending before taking the top N). A cleaning-call failure or a Jina auth failure also triggers the fallback path. Returns structured content documents per post. See [ADR 005](docs/adr/005-gpt4o-content-cleaning.md).

#### 4. Script Generation Module (backend)
FastAPI streaming endpoint at `/api/script`. Receives the content documents from the extraction module. Calls GPT-4o via the OpenAI API (server-side key) with a system prompt that instructs it to write a two-host dialogue podcast script under 750 words. Hosts are named `Alex` (lead/summarizer, voiced by Charon) and `Jordan` (skeptic/clarifier, voiced by Aoede), with consistent labels across the script — see [ADR 006](docs/adr/006-host-names-and-voice-mapping.md). Speaker turns are unequal by design — depth and narrative coherence take priority over balance. After the full response is buffered, a word count check is performed; if over 750 words, a single retry is made with an instruction to trim to under 750 words preserving the best insights. If the retry is *still* over 750 words, the script is truncated server-side at the last sentence boundary before word 750, with any incomplete trailing speaker turn dropped — necessary because Gemini's multi-speaker TTS has a ~5-minute audio cap beyond which it cuts off or behaves unpredictably. See [ADR 011](docs/adr/011-failure-model-v1.md).

The same GPT-4o call also produces an episode title (50–80 chars) and an OG description (140–160 chars), emitted as a strict header block before the script:

```
TITLE: <…>
DESCRIPTION: <…>
---
Alex: <…>
Jordan: <…>
```

The endpoint exposes a Server-Sent Events stream with two named event types — `meta` (emitted once with `{title, description}`) and `chunk` (emitted many times with `{text}` script slices) — terminated by a `done` event. The FastAPI handler parses the `TITLE`/`DESCRIPTION` header out of the GPT stream and forwards subsequent tokens as `chunk` events. If GPT goes off-format (no `---` separator within 400 tokens), the backend synthesizes a fallback title and description from source post titles and proceeds. See [ADR 003](docs/adr/003-script-sse-meta-and-chunk-events.md).

#### 5. Script Preview Module (frontend)
Receives the SSE stream from the script generation module and renders it with a typewriter animation. Once streaming completes, reveals two actions: "Approve & Generate Audio" and "Regenerate Script". Regenerate re-calls the script generation endpoint without re-running content extraction (content documents are held in React state).

#### 6. TTS Generation Module (frontend)
Calls `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent` directly from the browser using the user's Gemini API key. The script text (with `Alex:` / `Jordan:` speaker labels inline) is sent as the prompt; a `multiSpeakerVoiceConfig.speakerVoiceConfigs` array maps `{speaker: "Alex", voiceName: "Charon"}` and `{speaker: "Jordan", voiceName: "Aoede"}` — see [ADR 006](docs/adr/006-host-names-and-voice-mapping.md). Gemini treats the labels as speaker-switch markers and does not pronounce them. The API response contains base64-encoded LINEAR16 PCM audio at 24kHz mono. Decodes to `ArrayBuffer`.

#### 7. Audio Upload & Transcode Module (backend)
FastAPI endpoint at `POST /api/episodes/finalize` accepting a `multipart/form-data` body with two parts: `metadata` (JSON — title, description, script, source_posts) and `audio` (raw LINEAR16 PCM bytes at 24 kHz mono). Server-side: generates a fresh ULID, computes `duration_s = round(len(pcm_bytes) / 48000)`, runs ffmpeg in a subprocess with stdin/stdout piping (no disk writes):
```
ffmpeg -f s16le -ar 24000 -ac 1 -i pipe:0 -b:a 128k -f mp3 pipe:1
```
Uploads the MP3 bytes to S3 at `episodes/{ulid}.mp3`, then writes the metadata sidecar JSON to S3 at `episodes/{ulid}.json`. The response is a Server-Sent Events stream with named events `upload_received`, `transcoding`, `s3_audio`, `s3_metadata`, and finally `complete` (carrying `{episode_id, episode_url}`). See [ADR 010](docs/adr/010-finalize-upload-and-sse-protocol.md).

#### 8. Episode Storage Module (backend)
S3-only storage. The finalize endpoint writes two objects per episode:
- `episodes/{ulid}.mp3` — transcoded audio (written by Module 7)
- `episodes/{ulid}.json` — episode metadata

JSON shape:
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "script": "string",
  "audio_url": "string",
  "duration_s": "number | null",
  "source_posts": [{ "id": "string", "title": "string", "url": "string", "source_name": "string", "image": "string | null" }],
  "created_at": "string"
}
```
Episode retrieval reads `episodes/{id}.json` directly from S3. No database. No user identity stored.

#### 9. Share Page Module (backend + Jinja template)
FastAPI route at `/episode/{id}` returns a server-rendered Jinja2 HTML page. Fetches the metadata sidecar from `episodes/{id}.json` in S3 via boto3 (404 → "Episode not found" Jinja page, 503 → "Temporarily unavailable" Jinja page per [ADR 011](docs/adr/011-failure-model-v1.md)). Includes full Open Graph meta tags (og:title, og:description, og:image, og:audio, twitter:card). Page layout: audio player at top, full transcript below, source attribution cards at bottom (showing each post's title, source name, and a link to the article `url`). The `<audio>` element uses the S3 public URL as `src`. No JavaScript required to render the page — player controls use the native HTML5 audio element styled with CSS.

**OG image rule:** if the first source post has a non-null `image` whose URL does *not* match the daily.dev placeholder pattern (`media.daily.dev/.../Placeholder`), use that image. Otherwise fall back to a static `og-default.png` bundled with the frontend assets and served from `/og-default.png`. No per-episode image generation in v1; a future on-demand `/og/{id}.png` composite endpoint is a clean v1.5 upgrade with no schema change.

#### 10. Progress UI Module (frontend)
Staged progress bar component driven by two sources:
- **TTS phase (0–70%)**: timer-based easing curve advancing over estimated TTS duration (~12s), capped at 69% until TTS resolves.
- **Server phase (70–100%)**: SSE events from the Audio Upload & Transcode module snap the bar to defined checkpoints (upload received → 75%, transcoding → 85%, S3 audio upload → 93%, S3 metadata write → 98%, complete → 100%).

### Infrastructure
- **Backend**: FastAPI under uvicorn on Amazon ECS Express Mode (Fargate) — see [ADR 001](docs/adr/001-uvicorn-not-mangum.md) for the uvicorn-not-Mangum choice and [ADR 013](docs/adr/013-ecs-express-mode-not-app-runner.md) for the deploy-target choice. Image built from a multi-stage Dockerfile, pushed to Amazon ECR. Container includes ffmpeg via `apt-get`. 1 vCPU / 2 GB RAM starting configuration, auto-scaling enabled.
- **Object storage**: AWS S3 bucket with anonymous `GetObject` granted on `episodes/*` via bucket policy (`BucketOwnerEnforced` ownership; `Block Public Access` partially disabled to permit the policy). Each episode stored at `episodes/{ulid}.mp3` (audio, `Cache-Control: public, max-age=31536000, immutable`) and `episodes/{ulid}.json` (metadata, `Cache-Control: public, max-age=60`). S3 Lifecycle rule: transition to STANDARD_IA after 30 days. No `ListBucket`, no enumeration; ULIDs make URLs unguessable. See [ADR 008](docs/adr/008-s3-bucket-public-access.md).
- **Frontend**: React + Vite + Tailwind v4 + shadcn/ui. Built static assets served by FastAPI `StaticFiles` mount at `/` with SPA fallback (`html=True`). Share pages served by Jinja2 at `/episode/{id}`. Route registration order is API → Jinja → static mount, to prevent the static mount from swallowing `/episode/{id}`. See [ADR 007](docs/adr/007-monorepo-single-container.md).
- **Repo & deploy shape**: monorepo with top-level `backend/` and `frontend/`. A single multi-stage `Dockerfile` builds the React app, then bundles `frontend/dist/` into the FastAPI image under `backend/static/`. One container, one App Runner service. Dev uses Vite (`:5173` with HMR) proxying `/api/*` and `/episode/*` to uvicorn (`:8080`) for a same-origin illusion that matches prod. See [ADR 007](docs/adr/007-monorepo-single-container.md).
- **Key storage**: Browser `sessionStorage` only. No key is persisted server-side.
  - **Gemini key**: sent directly to Google from the browser (Gemini TTS supports browser-origin calls).
  - **Jina key**: sent to FastAPI on each `/api/extract` call, held in memory for the duration of the request only.
  - **daily.dev PAT**: sent to FastAPI as an `Authorization: Bearer` header on each `/api/bookmarks` and `/api/posts/{id}/comments` proxy call, forwarded unchanged to daily.dev, then discarded. daily.dev's CORS policy blocks direct browser calls, so a proxy is required — see [ADR 002](docs/adr/002-proxy-dailydev-via-fastapi.md). The `Authorization` header is excluded from server access logs and is never accepted via query string or request body.

### API Contracts (backend routes)
- `GET /api/bookmarks` — proxy for daily.dev `GET /bookmarks/` (forwards `Authorization` header, passes through `limit`/`cursor`)
- `GET /api/posts/{id}/comments` — proxy for daily.dev `GET /posts/{id}/comments` (forwards `Authorization` header)
- `POST /api/extract` — accepts post metadata + Jina key, returns content documents
- `POST /api/script` (streaming) — accepts content documents, streams GPT-4o output as SSE with two named event types: `meta` (once, `{title, description}`) and `chunk` (many, `{text}` script slices), terminated by `done`
- `POST /api/episodes/finalize` (streaming) — accepts PCM blob + script + metadata, streams progress events, returns `{episode_id, episode_url}`
- `GET /episode/{id}` — server-rendered share page (Jinja2)
- `GET /api/episodes/{id}` — JSON episode metadata (for the share page audio player hydration if needed)

## Testing Decisions

Good tests verify observable behavior at module boundaries — what goes in, what comes out — without asserting on internal implementation details like which sub-function was called or how many times a helper ran.

### Modules to test

**Content Extraction Module** — unit tests with mocked HTTP and mocked OpenAI. Verify: full Jina response passes through GPT-4o cleaning and returns extracted text; GPT-4o cleaned text <500 words triggers fallback; fallback correctly concatenates summary + top-N comments; Jina auth error triggers fallback rather than crashing.

**Script Generation Module** — integration tests with a real OpenAI call (or a recorded cassette). Verify: output is always under 750 words; output contains two distinct speaker labels; retry fires when first response exceeds limit; streaming response flushes tokens incrementally.

**Audio Upload & Transcode Module** — unit tests with synthetic PCM input. Verify: ffmpeg subprocess is called with correct arguments; output is valid MP3 bytes (check magic bytes `ID3` or `FF FB`); S3 upload receives the MP3 bytes (mocked boto3); episode JSON is written to S3 at `episodes/{id}.json` with correct fields; SSE events fire in the correct order.

**Episode Storage Module** — unit tests with mocked S3 (mocked boto3). Verify: metadata JSON is written to `episodes/{id}.json`; read-by-ID fetches and deserializes correctly; `source_posts` array is stored and retrieved faithfully; missing S3 key returns 404.

**Share Page Module** — snapshot or HTML-assertion tests. Verify: OG tags are present and populated; `<audio src>` matches the stored audio URL; transcript text appears in the HTML body.

## Out of Scope

- User accounts, authentication, or login of any kind
- Per-user episode history or "my episodes" listing
- Episode deletion (no ownership proof without accounts)
- Custom voice selection (fixed to Charon + Aoede)
- Podcast RSS feed generation
- CloudFront CDN (deferred — public S3 bucket used in v1)
- Mobile native app
- Podcast hosting / submission to Apple Podcasts / Spotify
- More than two source articles per episode
- Re-generation of audio for an existing episode
- Comment-only episodes (no article selected)
- Any daily.dev endpoints beyond `/bookmarks/` and `/posts/{id}/comments`

## Further Notes

- The daily.dev Public API requires a Plus subscription for the authenticated user. Onboarding should surface this requirement clearly so users are not confused when their PAT fails.
- Gemini TTS free tier with `gemini-2.5-pro-preview-tts` provides ~500k characters/month. A 700-word script ≈ 4,500 characters, giving ~110 episodes/month on the free tier. Onboarding should mention this limit.
- The Jina API free tier provides 1M tokens/month with a key. Without a key, Jina rate-limits globally — a key should be presented as required, not optional.
- The share page is the primary marketing surface. When a DevCast link is shared in a developer Slack or Discord, the OG unfurl is the first impression. The episode title (generated by GPT-4o as part of the script response) and a generated description should be rich and specific — not generic.
- All three keys are user-owned and free-tier obtainable. DevCast itself has no per-user API cost beyond the OpenAI key used server-side for content extraction cleaning and script generation.
- The product name is **DevCast**.
