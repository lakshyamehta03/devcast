# ADR 011: Failure model — no auto-retry, terminal errors, preserved client state

## Context

DevCast's pipeline traverses five external services (daily.dev, Jina, OpenAI, Gemini, S3) plus an in-process step (ffmpeg). Each layer fails in its own way, and a v1 needs *some* coherent answer to the question "what does the user see and what does retry do?" — but it does not need a research project on resilience patterns.

The choice space:

- "Smart" retries (exponential backoff, partial-progress checkpointing, queue-and-resume) buy little when the user is staring at the screen waiting for a single ~15 s pipeline to finish. They mostly buy reliability at the cost of complexity, and DevCast has no SLA.
- "Dumb" retries (let the user click "Try Again") match the BYOK, no-account product reality: the user is in the loop, has their own keys, and can tolerate clicking a button. State that's already in React memory survives a retry.
- "Silent recovery" (auto-retry without telling the user) hides problems and produces mystery failures when something else later goes wrong with stale state.

The simplest defensible model is: surface every failure as a terminal event, preserve what's already in client memory, and let the user re-trigger the failed step with one click.

## Decision

### Single rule

**No silent auto-retry. Every user-visible failure is terminal for that attempt. The user clicks "Try Again" to re-run the failed step. State produced before the failure stays in React memory so the user does not redo work.**

### Two error shapes

- **Pre-stream errors** (before any SSE stream has opened — e.g. multipart parse failure on `/api/episodes/finalize`, validation errors on `/api/extract`, daily.dev proxy 401/429): standard JSON response with appropriate HTTP status, body `{"error": "<code>", "user_message": "<string>"}`. Frontend renders a toast or inline error.
- **In-flight SSE errors** (after the stream has opened — e.g. ffmpeg crash mid-finalize, OpenAI drops mid-script-gen): a named SSE event:

  ```
  event: error
  data: {"phase": "<phase_name>", "user_message": "<string>", "log_id": "<server-side correlation id>"}
  ```

  The frontend treats `error` as terminal: stop reading the stream, show `user_message` in a modal, render `log_id` in small text for support purposes. No `complete` event will arrive.

This split means the frontend has two error code paths (toast for pre-stream, modal for in-flight), but no third one. Unknown SSE events are silently ignored for forward compatibility.

### Per-phase retry semantics

When the user clicks "Try Again" after a failure, retry re-runs *only the failed step*. State from earlier successful steps is preserved in React memory:

| Phase that failed | What survives in client memory | What retry re-runs |
|-------------------|-------------------------------|--------------------|
| Bookmark fetch | the three onboarding keys | `/api/bookmarks` |
| `/api/extract` | selected bookmark cards | `/api/extract` from scratch (no extract result is cached) |
| `/api/script` | content documents | `/api/script` (skips extract) |
| Gemini TTS | content documents, script | Gemini TTS (skips extract and script) |
| `/api/episodes/finalize` | content docs, script, the ~1 MB PCM buffer | `/api/episodes/finalize` with the same PCM |

A full page refresh wipes React memory and bounces the user to the bookmark grid (or wizard, if `sessionStorage` keys are gone). The v1 design intentionally does *not* persist content docs, scripts, or PCM to `sessionStorage` — the storage budget and complexity aren't worth it for a single user-session flow.

### Specific decisions

**Onboarding-time validation.** The wizard's PAT step calls `GET /api/bookmarks?limit=1` and surfaces a clear "Invalid PAT or no Plus subscription" message on 401. The Gemini and Jina keys are taken on faith and fail later with their own error events. Pre-validating Gemini would burn a real TTS call (expensive in latency and quota); pre-validating Jina by hitting a known URL is workable but adds latency to onboarding. Defer both.

**Empty-extraction floor.** If `/api/extract` returns under **100 words total** across all sources (Jina cleaning failed *and* summary+comments are tiny), the endpoint returns a pre-stream JSON error with `user_message: "Couldn't extract enough content from your selection — try different articles."` The frontend bounces back to the bookmark grid (the selection is preserved so the user can deselect and pick something else).

**Over-budget script handling.** If GPT-4o produces a >750-word script on the first call, retry once with a "trim under 750 words" instruction (already in ADR 003). If the retry *also* exceeds 750 words, the backend **truncates** before passing to TTS. Truncation rules:

1. Walk backward from word 750 to the nearest sentence-ending punctuation (`.`, `!`, `?`) followed by whitespace.
2. If that sentence end falls in the middle of a speaker turn that doesn't complete (the truncated line started but didn't end), drop back further to the end of the previous complete speaker turn.
3. The truncated script becomes the canonical script — it's the version stored in the metadata sidecar and rendered on the share page. The transcript displayed to the user matches the audio.

Why truncate rather than accept-and-proceed: Gemini's multi-speaker TTS has a known 5-minute audio output cap, beyond which it cuts off or behaves unpredictably. Passing a longer script does not produce a longer episode — it produces an unreliable one. Truncation server-side is the deterministic alternative. Log the over-budget event with both word counts for prompt-quality monitoring.

**Orphan MP3 on partial finalize failure.** If `s3_audio` succeeds but `s3_metadata` fails, the MP3 sits in S3 with no JSON sidecar pointing at it. The share page can't render. The user retries finalize; on retry a fresh ULID is generated and a new MP3 is uploaded. The old MP3 is orphaned but harmless — no share URL references it, and v1 has no cleanup job. Manual cleanup is an ops-console job if and when storage costs warrant.

**Share page error pages.**
- `/episode/{id}` with no sidecar in S3 (`NoSuchKey`) → Jinja renders an "Episode not found" page (HTTP 404). Not the SPA shell, not a generic 500 — a real polite page with brand-consistent layout and a "Make your own" link back to `/`.
- `/episode/{id}` with a transient S3 read error → Jinja renders an "Episode is temporarily unavailable, please retry" page (HTTP 503).

## Consequences

**In favour:**
- Predictable mental model: failure = modal/toast + "Try Again". No mystery retries. No state desync between client and server.
- No queue, no checkpoints, no orphan reaper, no exponential backoff configuration. Less code, fewer bugs.
- Truncation on over-budget scripts is deterministic — the audio is always under Gemini's 5-min cap, regardless of GPT misbehavior.
- The two error shapes (JSON pre-stream, SSE event in-flight) match the natural protocol boundaries, no shoehorning.

**Accepted tradeoffs:**
- A page refresh during the pipeline loses everything. User has to start over from the bookmark grid (or wizard). Acceptable for v1; sessionStorage persistence is a v2 robustness improvement.
- Orphan MP3s accumulate on partial-finalize failures. Unlikely to be more than a handful per month at v1 traffic. Manual cleanup is fine.
- Truncation at word ~750 sometimes drops a line of dialogue that GPT considered important. Logged for prompt tuning; the prompt will be iterated to produce in-budget scripts more reliably.
- No retry budget cap. A user mashing "Try Again" against a degraded OpenAI eats their server-side OpenAI cost without bound. Mitigated by the per-user-keys reality for the other two paid services (Gemini, Jina), and by an OpenAI billing alarm operationally.

**Out of scope explicitly:**
- Per-IP rate limiting on DevCast endpoints. No accounts means no per-user limiting; ULIDs make episode URLs unguessable; we accept the v1 abuse surface.
- Background cleanup jobs for orphan MP3s.
- Resumable uploads or checkpointed finalize.
