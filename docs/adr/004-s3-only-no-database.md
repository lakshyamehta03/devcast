# ADR 004: S3-only storage, no database

## Context

The original design used Neon Postgres for episode metadata (`episodes` table) plus S3 for MP3 audio. Two separate stores, two clients (`asyncpg`/`SQLAlchemy` + `boto3`), one schema migration to maintain, one DSN/secret to wire.

The DevCast data model is trivial: one row per episode, written once at finalize, read whenever the share page renders. No relations. No queries beyond `get by id`. No mutations after write. No user accounts, no listing, no search, no analytics aggregation. Postgres earns its keep when you need indexed queries, transactions across rows, or relational integrity — none of which apply here.

S3 is already in the system to serve audio. Reads from a public bucket are uniformly cheap and globally available. JSON-as-a-row at `episodes/{ulid}.json` is `O(1)` to look up, naturally CDN-friendly (when CDN lands), and survives without a database tier to keep alive.

## Decision

Storage is S3-only. For each episode the finalize endpoint writes exactly two objects:

- `episodes/{ulid}.mp3` — the transcoded audio (MIME `audio/mpeg`, `Cache-Control: public, max-age=31536000`).
- `episodes/{ulid}.json` — the metadata sidecar.

The share page (`GET /episode/{id}`) and the JSON endpoint (`GET /api/episodes/{id}`) both resolve a request by fetching `episodes/{id}.json` from S3 via boto3. A `NoSuchKey` error maps to HTTP 404.

No Postgres. No ORM. No migration tooling.

## Consequences

**In favour:**
- One fewer service in the stack. No Neon DSN to rotate, no connection pool to size, no migrations to apply on deploy.
- One fewer dependency surface (`asyncpg`, `SQLAlchemy`, `alembic`-style migrations all drop out).
- v1 ops cost is dominated by S3 storage, which is negligible at this scale (~10 KB JSON + ~5 MB MP3 per episode).
- Read path is uniform: both audio and metadata come from the same public bucket via the same caching story.

**Against / accepted:**
- Listing operations (`list episodes by created_at`, `count`, etc.) require S3 `ListObjectsV2` and are slow and unpaginated-friendly. We have no listing UI in v1, so this cost is theoretical.
- No transactional guarantees between writing the MP3 and writing the JSON. The finalize handler writes MP3 first, then JSON. A failure between the two leaves an orphan MP3 (harmless — never referenced) and the user sees the finalize SSE error. No rollback needed.
- No richer queries (search, filter, sort) without re-architecting. Out of scope for v1, but a Postgres reintroduction is a clean future migration when needed.

## Migration path (if/when needed later)

Reintroducing a database is a non-destructive change: write to both S3 JSON and Postgres during a transition, switch reads to Postgres, then drop S3 JSON writes. The current code shape (a thin `EpisodeStore` interface around two S3 calls) makes this straightforward.
