# ADR 014: Backend module organisation — wiring, routers, and shared utilities

## Context

During slice 3 (bookmark feed), two structural problems emerged:

1. `/episode/{id}` was defined inline in `main.py` with a plain `@app.get` decorator, while `/api/bookmarks` and `/api/posts/{id}/comments` lived in `routers/bookmarks.py`. The mixed styles made it unclear where new routes should go.

2. Both proxy routes shared helpers (`_proxy_get`, `_forward_response`, `_check_no_pat_in_query`), but those helpers lived inside `bookmarks.py`. When `/api/posts/{id}/comments` was extracted to its own file, the helpers had to move so neither router imported from the other.

Without an explicit rule, each new slice risks adding routes inline, misplacing shared code, or creating wrong-direction imports between routers.

## Decision

**`main.py` is wiring-only.** It contains router registrations (`app.include_router`) and the `StaticFiles` mount. It never contains `@app.get` or `@app.post` decorators. The `StaticFiles` mount is always the last statement (see ADR 007).

**One router file per resource, one URL namespace per file.** Each file in `routers/` owns one coherent URL prefix:

| File | Owns |
|---|---|
| `routers/bookmarks.py` | `GET /api/bookmarks` |
| `routers/posts.py` | `GET /api/posts/{id}/comments` |
| `routers/script.py` | `POST /api/script` (slice 4) |
| `routers/finalize.py` | `POST /api/finalize` (slice 5) |
| `routers/episode.py` | `GET /episode/{id}` (when extracted from main.py) |

Routes are not grouped by the HTTP client or utility they happen to share — they are grouped by the resource they represent.

**Shared utilities live at the backend root, not inside `routers/`.** `proxy.py` holds the daily.dev HTTP helpers. Future shared code (e.g. S3 helpers, auth guards) follows the same pattern: a peer module at `backend/`, imported by routers, never the reverse.

**Test files mirror router files.** `tests/test_bookmarks.py`, `tests/test_posts.py`, etc. Patch shared helpers at the point of use in the router (`"routers.bookmarks._proxy_get"`), not at the definition in `proxy.py`.

## Consequences

- `main.py` stays short and mechanical — the wiring is immediately legible without reading route logic.
- Adding a new route means creating or editing exactly one router file and one line in `main.py`. No decision required about where it goes.
- Wrong-direction imports (`routers/a.py` importing from `routers/b.py`) are structurally prevented by putting shared code at the backend root.
- The `StaticFiles` mount rule from ADR 007 is reinforced by making `main.py` wiring-only — there is never a reason to add anything after the mount.
- Episode SSR routes (`/episode/{id}`) will be extracted from `main.py` into `routers/episode.py` before slice 6 adds more episode-related endpoints.
