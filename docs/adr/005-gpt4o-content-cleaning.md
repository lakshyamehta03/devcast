# ADR 005: GPT-4o cleans Jina's markdown before the word-count fallback

## Context

`r.jina.ai/{url}` returns markdown derived from the live article. In practice the output includes substantial non-article noise: site navigation, header/footer, sidebars, cookie banners, "related articles" lists, author bios, share-this widgets, and inline ads. Feeding this verbatim into the script-generation prompt pollutes the input with unrelated text, which surfaces in the generated script as off-topic asides ("…and check out our newsletter signup…").

A pure-HTML heuristic cleaner (e.g. `readability-lxml`) is an option, but Jina has already lost the HTML structure by the time we receive markdown, so structural heuristics don't apply. Pattern-based stripping is brittle across thousands of source sites.

A GPT-4o pass between Jina and the script prompt is reliable: it has strong implicit priors about "what is article body vs site chrome", and the output is plain text ready for the word-count check and downstream prompt.

## Decision

The content extraction module makes a second LLM call:

1. Fetch markdown from `r.jina.ai/{url}` with the user's Jina key.
2. Send the markdown to GPT-4o with a system prompt that says: *"Return only the article body. Strip navigation, headers, footers, sidebars, cookie notices, author bios, related-article links, social-share widgets, and ads. Preserve paragraph structure. Output plain text."*
3. Apply the **<500-word fallback check on the cleaned output**, not on the raw Jina response. If cleaning leaves under 500 words, fall back to `summary` + top-N daily.dev comments.

Comment ranking note (also recorded here because it shapes the extraction module's behavior): daily.dev's `/posts/{id}/comments` only supports `sort=oldest|newest`. To get top-upvoted comments, the backend fetches up to 50 comments and sorts client-side by `numUpvotes` descending.

## Consequences

- `/api/extract` now has two LLM-touching points (this cleaning call + the script-gen call later in `/api/script`). Total OpenAI calls per episode go from one to **two-or-three** (extract clean × N posts, plus script gen, plus an optional script retry).
- Doubled failure surface for OpenAI outages on the extract step. Treatment: a failure in the cleaning call falls back to the summary+comments path, same as Jina returning <500 words. The user always gets *an* episode.
- Cost impact at GPT-4o pricing is small per episode (~few thousand input tokens of markdown) but non-zero. Track separately if costs become a concern.
- Script quality should improve materially — fewer "and don't forget to subscribe" artifacts in the dialogue.
- Test coverage: the extraction module's unit tests use a mocked OpenAI client. A cleaned response <500 words triggers the fallback path; a cleaning-call error also triggers fallback. Both paths must be exercised.
