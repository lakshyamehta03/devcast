# ADR 012: Frontend navigation, bookmark pagination, and testing setup

## Context

Three small frontend-and-quality decisions remained open at the end of grilling. None deserves a full ADR on its own, but each is non-obvious enough to record once so future-us doesn't relitigate.

1. **Navigation between in-app screens.** DevCast's user flow is linear — wizard → bookmarks → preview → progress → redirect-to-share-page — and the share page (`/episode/{id}`) is a separate server-rendered route outside React's control. The question is whether to introduce `react-router-dom` (more deps, real URL state, browser back/forward semantics) or to drive stages with a state variable in `App.tsx` (no deps, no URL state, no back-button surprises).

2. **Bookmark pagination UX.** daily.dev's bookmark API returns a cursor and a `hasNextPage` boolean. Three patterns are viable: infinite scroll, "Load more" button, or numbered pages.

3. **Testing setup.** PRD module-level tests are listed, but the actual frameworks, mocking strategy, and HTML-assertion approach for the share page were not specified.

## Decision

### Frontend navigation — single-page state machine, no router

`App.tsx` owns a stage variable typed as `'wizard' | 'bookmarks' | 'preview' | 'progress'`. The component renders one of four screens based on stage. Stage transitions happen via explicit handlers (`onWizardComplete`, `onBookmarksSelected`, `onScriptApproved`). The browser URL stays at `/` throughout the in-app journey. The final transition is `window.location.assign(episode_url)` — a hard navigation to the server-rendered share page.

No deep links into in-app stages (you cannot bookmark the preview screen — its state depends on transient React memory). No back-button navigation inside the SPA (back-button reloads `/` and re-evaluates from sessionStorage, which means either wizard or bookmarks depending on whether keys are present).

This is reversible: if a future stage warrants a deep link (e.g. "share your script before audio is generated"), introduce `react-router-dom` then.

### Bookmark pagination — infinite scroll via IntersectionObserver

The bookmark grid renders cards in a CSS grid layout. A sentinel `<div>` at the bottom of the grid is watched by an `IntersectionObserver`. When the sentinel scrolls into view, the component fetches the next page using the stored cursor from the last response and appends the new cards. The observer is detached when `pagination.hasNextPage` is `false`.

A small loading indicator below the sentinel covers the in-flight gap. No "Load more" button. No numbered pagination. The familiar Pinterest/Instagram-saved pattern.

### Testing setup

**Backend:**

- Framework: `pytest` with `pytest-asyncio`.
- HTTP test client: `httpx.AsyncClient` against the FastAPI app in-process. No real server.
- boto3 mocking: `unittest.mock.patch` over the boto3 client. Two methods are touched (`put_object`, `get_object`); patching them directly is lighter than `moto`'s full S3 simulation.
- OpenAI mocking: `unittest.mock.patch` over the OpenAI client. For the script-gen integration test, a small fixtures directory holds canned GPT responses so the streaming-parser logic can be tested deterministically without burning real OpenAI calls. A separate marker-tagged test optionally hits the real API in CI when an env var is set, for prompt-drift detection.
- Test files: `backend/tests/test_extract.py`, `test_script.py`, `test_finalize.py`, `test_share_page.py`, `test_bookmark_proxy.py`. One file per route.

**Frontend:**

- Framework: `vitest` (shares Vite config; fast watch mode).
- Component testing: `@testing-library/react` — assertions in terms of user-visible behavior, not React internals.
- Test files: co-located as `Component.test.tsx` next to `Component.tsx`.

**Share page HTML — targeted BeautifulSoup assertions, not snapshots.**

Each share-page test parses the rendered HTML and checks one named contract:

- OG/Twitter meta tags exist in `<head>` with correct content.
- `<audio src>` matches the stored audio URL.
- Transcript text appears in the body.
- Source attribution links point at each post's article URL.
- Missing-episode requests return 404 with an "Episode not found" Jinja page.

Snapshot tests are explicitly rejected: they go red on every cosmetic change, drown the diff in noise, and let real regressions hide. Five-to-eight focused assertion tests cover the share page's actual promises and survive markup/styling churn.

**Runner orchestration:**

A root `Makefile` target (`make test`) runs `pytest backend/` and `vitest run --root frontend/` sequentially. CI runs both with appropriate failure semantics.

**E2E tests — deferred to v1.5.** Playwright is the natural pick when DevCast's flow has more branches. v1's flow is short enough that thorough unit/integration coverage suffices.

## Consequences

**In favour:**
- No `react-router-dom` dependency. No URL-state bugs. No "what does the back button do here" debates.
- Infinite scroll is the bookmark-grid pattern users already know; cursor pagination from daily.dev maps to it cleanly.
- Targeted HTML assertions make share-page tests serve as live documentation: each test is a sentence about what the page promises.
- One testing stack per language (pytest for Python, vitest for TS), no exotic libraries to onboard.

**Accepted tradeoffs:**
- No browser back/forward inside the SPA. If a user wants to "go back from the preview to re-select bookmarks", they refresh the page and lose React state. Acceptable for a linear flow.
- Infinite scroll has accessibility tradeoffs — keyboard-only users have a harder time reaching footer content. v1's bookmark grid has no footer, so the practical impact is nil.
- No `moto` means our boto3 tests don't exercise the wire-level S3 protocol — only the calls we make against the mock. Adequate for v1; revisit if S3 integration bugs slip past unit tests.
- No E2E tests means the full pipeline (wizard → bookmarks → preview → progress → share page) is only covered by the human running through it locally. Reasonable for v1 with the linear, short flow.
