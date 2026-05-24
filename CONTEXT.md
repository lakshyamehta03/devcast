# DevCast

DevCast turns daily.dev bookmarks into two-host AI podcast episodes with permanent shareable URLs.

## Language

**Bookmark**:
A saved daily.dev item the user can select for podcast generation. Carries metadata (title, image, publisher, tags, upvotes) but no extracted content. Up to 2 may be selected per episode.
_Avoid_: Post (when referring to the user-facing selectable item)

**Publisher**:
The publication or blog a **Bookmark** originates from (e.g., "CSS Tricks", "Dev.to"). Carried as `{ name, image }` on the Bookmark.
_Avoid_: source (the daily.dev API field name — rename at the boundary)

**Content Document**:
The extracted text for a selected **Bookmark** — produced either by the Jina+GPT cleaning path or the summary+comments fallback path. Each Content Document has an **Extraction Method**.
_Avoid_: Post content, article text, extracted content (as a noun)

**Extraction Method**:
How a **Content Document** was produced: `jina_clean` (Jina fetch + GPT-4o cleaning, ≥500 words) or `fallback` (summary + top comments). Stored on the Content Document.
_Avoid_: source (ambiguous with **Publisher** and **Source Bookmarks**)

**Script**:
A two-host dialogue generated from one or two **Content Documents**. Alternating `Alex:`/`Jordan:` speaker turns. Soft word budget (~1000 words) enforced only by prompt — no hard server-side limit. "Regenerate" means re-running GPT on the same Content Documents to get a different dialogue — it does not re-extract content.
_Avoid_: Transcript (which refers to the Script text as displayed on the share page)

**Episode**:
The final, permanent artifact: MP3 audio + metadata JSON stored in S3 at `episodes/{ulid}.*`. An Episode is created by the finalize endpoint and is immutable once written. Contains the **Script** text (displayed as a transcript), audio URL, **Source Bookmarks**, and duration.
_Avoid_: Podcast (which refers to the product, not a single generated artifact)

**Source Bookmarks**:
The array of **Bookmarks** that were selected as input for an **Episode**. Stored on the Episode metadata as `source_bookmarks` (1–2 items). Provides provenance — which articles seeded the content.
_Avoid_: source_posts, source articles

## Example dialogue

> **Dev**: "The extract endpoint is returning `source: fallback` — is it broken?"
> **Domain expert**: "You mean the Extraction Method is `fallback`. That's expected when Jina can't get enough clean text — it fell back to the Bookmark's summary plus top comments. The Content Document still has content, it's just thinner. Check if the Publisher's site is JS-rendered or paywalled."
>
> **Dev**: "Got it. The user picked two Bookmarks but only one has a Content Document with jina_clean. The other is fallback. Will the Script still be good?"
> **Domain expert**: "The Script draws on both Content Documents regardless of Extraction Method. GPT adapts — the fallback one just contributes less depth. If you want to see which Bookmarks seeded an Episode after the fact, look at Source Bookmarks on the Episode metadata."
