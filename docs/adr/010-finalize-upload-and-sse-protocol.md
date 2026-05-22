# ADR 010: Finalize endpoint — multipart upload + SSE progress protocol

## Context

The audio finalize step has to do three things in a single user-visible action:

1. Move ~1 MB of raw PCM audio from the browser (decoded from Gemini's base64 response) to the FastAPI backend.
2. Run that PCM through ffmpeg, write the resulting MP3 to S3, write the metadata sidecar to S3.
3. Report progress to the browser smoothly enough that a progress bar can advance through five visible stages without going dead between checkpoints.

The browser's `EventSource` API speaks only GET, but the audio payload is large enough that putting it in a query string is a non-starter. So `EventSource` is out; the protocol has to be SSE-shaped responses to a POST, parsed by hand on the client.

Additionally, in practice browsers buffer the request body before exposing the response stream — meaning whatever progress the server reports through SSE only begins to land in the client after the entire request body has been uploaded. The progress UX has to acknowledge this: the upload phase is invisible to SSE, so a client-side estimate covers it.

## Decision

### One endpoint, one request, one HTTP round trip

`POST /api/episodes/finalize` accepts a `multipart/form-data` body with exactly two parts:

- `metadata` — JSON, containing:
  - `title` (string, from the `meta` SSE event of `/api/script`)
  - `description` (string, same source)
  - `script` (string, the full assembled `Alex:`/`Jordan:` transcript)
  - `source_posts` (array of `{id, title, url, source_name, image}` from the bookmark feed)
- `audio` — `application/octet-stream`, raw LINEAR16 PCM at 24 kHz mono (decoded by the browser from Gemini's base64 with `Uint8Array.from(atob(b64), c => c.charCodeAt(0))`)

The response is `Content-Type: text/event-stream` with the following ordered event sequence:

```
event: upload_received
data: {}

event: transcoding
data: {}

event: s3_audio
data: {}

event: s3_metadata
data: {}

event: complete
data: {"episode_id": "<ulid>", "episode_url": "/episode/<ulid>"}
```

The `complete` event is the last frame. The client redirects on receiving it. Any earlier termination of the stream is a failure (handling deferred to the failure-UX ADR).

### Server-side responsibilities inside the handler

In order:

1. Read the `metadata` part, parse JSON, validate required fields (return 400 if missing — pre-SSE; this is a JSON error response, not an SSE event, since the SSE channel hasn't opened yet).
2. Read the `audio` part fully into memory (it's ~1 MB; no streaming needed for v1).
3. Generate a fresh ULID via `python-ulid` (or equivalent). This is the episode ID.
4. Compute `duration_s = round(len(audio_bytes) / 48000)` (LINEAR16 = 2 bytes/sample × 24000 Hz × 1 channel).
5. Open the SSE response. Emit `upload_received`.
6. Run ffmpeg in a subprocess with `-f s16le -ar 24000 -ac 1 -i pipe:0 -b:a 128k -f mp3 pipe:1`, write PCM to stdin, read MP3 from stdout. Emit `transcoding` once ffmpeg has been launched (not when it finishes — the event marks the *start* of the phase, which keeps the bar moving).
7. `PutObject` the MP3 bytes to `episodes/{ulid}.mp3` with `Content-Type: audio/mpeg, Cache-Control: public, max-age=31536000, immutable`. Emit `s3_audio` after success.
8. Build the metadata sidecar dict (id, title, description, script, audio_url, duration_s, source_posts, created_at). `PutObject` it to `episodes/{ulid}.json` with `Content-Type: application/json, Cache-Control: public, max-age=60`. Emit `s3_metadata` after success.
9. Emit `complete` with `{episode_id, episode_url}` and close the stream.

### Client-side responsibilities

The client uses `fetch()` (not `EventSource`) with `body: FormData`, then reads `response.body` as a `ReadableStream` and parses SSE frames with a small inline parser. On each event:

- `upload_received` → snap progress bar to 75%
- `transcoding` → snap to 85%
- `s3_audio` → snap to 93%
- `s3_metadata` → snap to 98%
- `complete` → snap to 100% and `window.location.assign(episode_url)`

Before `upload_received`, the progress bar is driven by the timer-based easing curve for the Gemini TTS phase (0–69%) and a tiny holding state during the body upload (≤ 69% until the first SSE frame arrives).

### Audio delivery is out-of-band

The MP3 is never returned to the finalize caller. The finalize response is metadata-only. The browser plays the audio later by visiting `/episode/{id}` and letting the share page's `<audio src="https://<bucket>.s3.<region>.amazonaws.com/episodes/{ulid}.mp3">` element fetch the file directly from S3. This keeps the finalize response small (only progress events) and offloads audio bandwidth entirely to S3.

## Consequences

**In favour:**
- One HTTP request from the browser carries the full audio payload AND receives all progress events AND returns the share URL. No coordination between separate calls.
- The same SSE shape used by `/api/script` is reused — frontend has one tiny SSE parser, not two.
- No streaming of the PCM into ffmpeg: the upload is small enough that buffering it in memory once is simpler and just as fast as a streamed pipe, with no edge cases around partial writes.
- The MP3 is delivered by S3 directly to the share-page audio element. The FastAPI process never serves audio bytes after finalize completes; bandwidth scales with S3, not our compute.

**Accepted tradeoffs:**
- The progress bar has a visible "pause" during the request body upload, since SSE can't report on its own intake. Mitigated by the timer-based curve (0–69%) carrying through the upload phase and the snap to 75% at `upload_received`. In practice the upload finishes in <1 s, so the pause is short.
- The metadata-validation 400 path is non-SSE (returns JSON before the SSE stream opens), while the in-flight failure path is SSE-shaped. Two different error shapes for two different phases — acceptable, but the failure-UX ADR will pin down how the client distinguishes them.
- A single request that does five seconds of server work is on the long side for App Runner's default request timeout (120 s). Still well within bounds, but worth tracking if scripts get longer.

**Operational notes for Slice 6:**
- The `metadata` part has a 1 MB practical ceiling (script + source_posts JSON well under that). No need for streaming JSON parsing.
- ffmpeg is invoked once per request. No subprocess pool. Failure isolation is per-request.
- All event names are lowercase snake_case. `complete` is the only event carrying a payload; all others have `data: {}`. The frontend treats unknown events as no-ops for forward compatibility.
