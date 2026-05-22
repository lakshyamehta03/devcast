# ADR 003: Script API uses two SSE event types (`meta`, `chunk`)

## Context

A single GPT-4o call must produce three things:

1. An episode title (used in the page `<h1>`, browser tab, OG `og:title`).
2. An OG/Twitter meta description (140–160 chars, used in the share unfurl).
3. The two-host podcast script (streamed token-by-token for the typewriter UI).

The hard constraint is that the script must stream for typewriter UX. JSON-mode streaming arrives as partial fragments, which is awkward to render as live text. A two-call architecture doubles latency and cost. Letting the frontend parse `TITLE:` / `DESCRIPTION:` out of a raw text stream pushes fragile parsing into the UI.

The cleanest option keeps a single GPT call, but moves the parsing into the FastAPI handler and exposes a structured stream to the browser.

## Decision

`/api/script` is a Server-Sent Events stream with **two named event types**:

- `event: meta` — emitted exactly once, near the start. `data` is JSON `{"title": string, "description": string}`.
- `event: chunk` — emitted many times, in order. `data` is JSON `{"text": string}` where `text` is the next slice of script characters.
- `event: done` — emitted exactly once, at the end. `data` is `{}`.

### Prompt-side contract

The system prompt instructs GPT-4o to emit output in this strict format:

```
TITLE: <50–80 chars, no quotes, no markdown>
DESCRIPTION: <140–160 chars, plain text, for OG/Twitter meta>
---
Alex: <line>
Jordan: <line>
Alex: <line>
...
```

Rules enforced by the prompt (worded in the prompt itself, not just hoped for):

- The first non-blank line begins with `TITLE: `.
- The second non-blank line begins with `DESCRIPTION: `.
- The separator is exactly `---` on its own line, with blank lines optional around it.
- Speaker labels are **only** `Alex:` and `Jordan:` — never name variants, never any other label.
- No prefatory text, no markdown headings, no closing remarks after the dialogue.

### Backend parser

The FastAPI handler reads OpenAI's stream token-by-token into a small state machine:

- **State `header`**: accumulates tokens, looking for two complete lines matching `TITLE: …` and `DESCRIPTION: …`, then a line containing only `---`. When the separator is seen, parse `title` and `description`, emit `event: meta`, switch state to `body`.
- **State `body`**: every subsequent token is wrapped in an `event: chunk` frame and flushed immediately.

If, after a token budget of **400 tokens**, the parser has not seen `---`, it treats the model as having gone off-format. It synthesizes a fallback `meta`:

- `title` = `"Daily Digest: <first source post title>"` (truncated to 80 chars) — or `"<title-A> + <title-B>"` for two posts (also truncated).
- `description` = `"A podcast on <first source post title>"` (160 chars) — or joined for two posts.

It then emits the fallback `meta`, switches to `body`, and forwards everything received so far (and onward) as `chunk` frames. The 750-word check still applies; the retry path is unchanged.

## Consequences

- One GPT-4o call. One model retry budget, already spent on the 750-word check.
- Frontend code is tiny: it listens for `meta` once (renders title in the preview header), accumulates `chunk` text in a state ref (renders the typewriter), and on `done` reveals the Approve/Regenerate buttons.
- The title and description are available **before** TTS is approved, so the share page never has to fall back to a generic OG.
- The strict prompt format is part of the contract; changes to the format require coordinated changes in prompt + parser. The format is intentionally minimal to reduce the chance of GPT drift.
- The episode metadata sidecar JSON gains a top-level `description` field (storage is S3-only per [ADR 004](004-s3-only-no-database.md)).
- Host names and voice mapping are fixed (`Alex` → Charon, `Jordan` → Aoede) per [ADR 006](006-host-names-and-voice-mapping.md). The labels in this ADR's format spec are the canonical labels used everywhere — GPT output, TTS input, share-page transcript.
- Fallback path is silent (no user-visible error). Logged for prompt-quality monitoring.
