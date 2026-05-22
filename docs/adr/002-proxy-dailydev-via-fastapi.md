# ADR 002: Proxy daily.dev API calls through FastAPI

## Context

DevCast was originally specified so that the browser would call daily.dev's public API directly using the user's PAT, so the PAT never touched our server.

This is not possible. Empirical test (`OPTIONS https://api.daily.dev/public/v1/bookmarks/` with an arbitrary `Origin` header) returns:

- `access-control-allow-credentials: true`
- `access-control-allow-methods: GET, HEAD, PUT, PATCH, POST, DELETE`
- `access-control-allow-headers: authorization`
- **no `access-control-allow-origin` echoed back**

Per the CORS spec, a credentialed request with no matching origin echo is blocked by the browser. daily.dev only allows their own origins. Direct browser-to-daily.dev calls will fail in every supported browser.

## Decision

Proxy the two daily.dev endpoints DevCast actually needs through FastAPI:

- `GET /api/bookmarks` → `GET https://api.daily.dev/public/v1/bookmarks/` (with `limit`, `cursor` query passthrough)
- `GET /api/posts/{id}/comments` → `GET https://api.daily.dev/public/v1/posts/{id}/comments` (with `sort=newest`, used for the extraction fallback)

The browser sends `Authorization: Bearer <PAT>` on each call. FastAPI forwards the header unchanged to daily.dev. The PAT lives only in the per-request memory of the proxy handler.

Rules:
- The PAT is **only** accepted via the `Authorization` header. Never via query string or request body — that keeps it out of every access log and stack trace.
- Access logs MUST scrub or drop the `Authorization` header.
- The PAT is never written to disk, DB, or any persistent store.
- The onboarding wizard validates the PAT live with `GET /api/bookmarks?limit=1`; a 401 surfaces a clear "PAT invalid or no Plus subscription" message.

## Consequences

- The PAT touches the DevCast backend in transit. This is strictly less private than the original direct-to-daily.dev framing, and the onboarding copy must say so plainly rather than bury it.
- One additional network hop per bookmark fetch (~50–100 ms). Negligible for this flow.
- A compromised DevCast backend could in principle intercept PATs in flight. The mitigation is operational hygiene (no `Authorization` logging, no body/query acceptance of the PAT, no third-party middleware that touches headers).
- Slice 1 (project scaffold) must include `httpx` for outbound calls.
- Slice 2 (key onboarding) gets a real live-validation step for the PAT.
- Slice 3 (bookmark feed) introduces backend proxy routes in addition to the React grid.
