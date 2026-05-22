# ADR 006: Host names, speaker labels, and Gemini voice mapping

## Context

DevCast generates a two-host dialogue script and synthesizes it with Gemini's multi-speaker TTS. Three pieces have to line up:

1. The label GPT-4o emits in the script (machine-parseable for word-counting, OG description extraction, and transcript display).
2. The speaker token Gemini consumes in the TTS input text.
3. The persona name a listener hears the hosts use when addressing each other.

Gemini's multi-speaker TTS (`gemini-2.5-pro-preview-tts`, `gemini-2.5-flash-preview-tts`) takes input text with inline speaker labels of the form `Name: dialogue text` and a `multiSpeakerVoiceConfig.speakerVoiceConfigs[]` array mapping each `speaker` string to a `voiceName`. Maximum two speakers per request. The labels in the input text are not pronounced; they act as speaker-switch markers (confirmed both by Google's documented example — "Joe: How's it going today Jane?" — and by the natural reading of the API contract).

Because the label is also the speaker token, decoupling label-from-persona (e.g. `HOST_A:` in GPT output, rewritten to `Alex:` before TTS) buys us nothing and adds a transformation step on both the TTS path and the display path. The simplest design uses the same string for all three roles.

## Decision

**Fixed host names, fixed voice assignments, single string per host across the entire pipeline.**

| Host | Speaker label (everywhere) | Gemini voice | Persona hint |
|------|----------------------------|--------------|--------------|
| A    | `Alex`                     | `Charon`     | Lead / summarizer — drives the narrative, sets up topics |
| B    | `Jordan`                   | `Aoede`      | Skeptic / clarifier — asks follow-ups, surfaces tensions |

Both names are gender-flexible, two-syllable max, alphabetic only (matches Google's own example pattern), and unlikely to collide with terms in technical articles.

Personas are baked into the system prompt for `/api/script`. They are not user-configurable in v1 (consistent with the broader "no customization" framing of v1: fixed voices, fixed name, fixed two-host format).

## Consequences

- GPT's output uses `Alex:` / `Jordan:` directly. No `HOST_A` / `HOST_B` placeholders anywhere. ADR 003 is amended accordingly.
- The frontend's TTS step sends the script text verbatim to Gemini and configures `speakerVoiceConfigs` with `{speaker: "Alex", voiceName: "Charon"}` and `{speaker: "Jordan", voiceName: "Aoede"}`.
- The share page transcript renders the same `Alex:` / `Jordan:` labels — no transformation step.
- Changing host names later requires updating: (a) the script-gen system prompt, (b) the TTS voice-config builder, and (c) any baked-in test fixtures. Three coordinated edits — small enough that we don't need an abstraction for it in v1.
- If we ever support more than two hosts (out of scope for v1), Gemini's two-speaker cap forces a different architecture.
