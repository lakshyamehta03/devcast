# ADR 008: S3 bucket configured for anonymous read via bucket policy ("knows-the-URL-can-access")

## Context

DevCast stores every episode's MP3 audio and JSON metadata sidecar in a single S3 bucket and serves them from permanent, shareable URLs. The share page link is the product's primary marketing surface and must work without auth for anyone the link is given to — including Slack/Discord/X unfurlers that don't run JavaScript and can't carry signed cookies.

"Public bucket" is ambiguous in S3-speak. Four legitimate ways to expose objects exist (bucket policy with anonymous `GetObject`, presigned URLs, CloudFront with signed URLs/cookies, per-object public-read ACLs). Each makes a different tradeoff against the constraint of "permanent, anyone-with-the-link, no signing on every page render."

Presigned URLs expire — incompatible with the permanent-link requirement (Slack re-scrapes long after the original render). CloudFront is explicitly deferred for v1. Per-object public-read ACLs are a legacy pattern AWS now discourages and disables by default on new accounts.

What remains is "private bucket with a bucket policy that grants anonymous `s3:GetObject` on the episode prefix." Combined with ULID-named objects (80 bits of randomness past the timestamp prefix), the operational property is **knows-the-URL-can-access** — enumeration is infeasible, and anyone with a share URL has the same access as the user who created it. This matches the v1 product reality: no accounts, no ownership, links are the only access control.

## Decision

### Bucket configuration

- **Single bucket** for prod (name TBD, e.g. `devcast-episodes-prod`). One bucket, region of our choice (probably `us-east-1` for App Runner co-location, but not load-bearing).
- **Object Ownership: `BucketOwnerEnforced`.** Object ACLs are fully disabled; only the bucket policy controls access. Modern AWS best practice.
- **Block Public Access settings:**
  - `BlockPublicPolicy`: **disabled** (we need to attach a public-read policy)
  - `RestrictPublicBuckets`: **disabled** (we need anonymous reads to resolve)
  - `BlockPublicAcls`: enabled (we don't use ACLs anyway, but keep the safety belt)
  - `IgnorePublicAcls`: enabled (same)

Disabling `BlockPublicPolicy` and `RestrictPublicBuckets` requires deliberate action against AWS's default-on settings. This is intentional, not accidental, and consistent with the product's "permanent public URLs" requirement.

### Bucket policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadEpisodes",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::<bucket>/episodes/*"
  }]
}
```

- Only `GetObject`. No `ListBucket` (no enumeration). No `PutObject`, no `DeleteObject` (writes are done by the backend's IAM identity, not by anonymous callers).
- Scoped to the `episodes/*` prefix so any future non-public objects in the same bucket (logs, temp files) stay private by default.

### Per-object metadata at upload time

- **MP3 objects:** `Content-Type: audio/mpeg`, `Cache-Control: public, max-age=31536000, immutable`.
- **JSON sidecar objects:** `Content-Type: application/json`, `Cache-Control: public, max-age=60`. (Short TTL leaves a small repair window in the unlikely case we need to patch a sidecar; MP3s are immutable.)

### Lifecycle

- Transition `episodes/*` objects to `STANDARD_IA` at 30 days. No expiration. No automatic deletion. (Permanent URLs.)

### URL shape and CORS

- Public URL shape: `https://<bucket>.s3.<region>.amazonaws.com/episodes/{ulid}.mp3`. A vanity CNAME (`audio.devcast.app`) is deferred to whenever CloudFront lands.
- CORS configuration: **none in v1.** `<audio src=...>` playback does not require CORS unless the `crossorigin` attribute is set. The metadata sidecar is fetched server-side via boto3 from FastAPI, not from the browser. If we later add a browser-side fetch of the sidecar (e.g. progressive enhancement on the share page), add a narrow GET-only CORS rule then.

## Consequences

**In favour:**
- Permanent, unsigned, browser-friendly URLs that Slack/X/Discord unfurlers can scrape without ceremony.
- ULID name space (80 random bits past the timestamp) makes URL enumeration computationally infeasible.
- Read path is uniform — no signing code, no expiry handling, no cookie passing. Single audio URL works in any HTML5 player anywhere.
- Aligns with v1 "no accounts, no ownership" reality: links are the access boundary.

**Accepted risks:**
- **Bandwidth exposure.** A malicious actor embedding `https://<bucket>.../{id}.mp3` on a high-traffic site bills us for egress. v1 mitigation is an AWS Billing alarm on bucket egress (operational, not in code). Permanent mitigation arrives with CloudFront (rate-limiting, geographic controls, origin protection) — deferred per PRD.
- **No revocation per object.** If we ever need to take down an episode (DMCA, abuse), we'd have to delete the S3 object. We have no UI for this in v1 (ownership unprovable without accounts). Manual ops process via AWS console is the v1 escape hatch.
- **AWS security tooling will flag this.** Anything that scans for public-readable buckets (AWS Trusted Advisor, Macie, third-party scanners) will warn. The bucket policy comment / tag should say `intent: public-read for episodes/*; see ADR 008` so a future audit lands on this doc, not on a surprise.

**Operational notes for Slice 1:**
- The bucket and policy are infrastructure, provisioned outside the application image. Whether via Terraform, CloudFormation, or AWS Console one-time setup is up to the implementer — but the bucket name + region land in a runtime env var (`DEVCAST_S3_BUCKET`, `AWS_REGION`) read by the FastAPI app.
- Backend writes use the App Runner instance's IAM role (covered in the secrets-management ADR, forthcoming). No static AWS keys in the container.
