# ADR 009: Secrets and AWS credentials — instance role + env vars, no static keys in containers

## Context

DevCast's backend needs two kinds of credentials at runtime:

1. AWS credentials to write objects to S3 (the `episodes/` prefix). Reads from S3 are anonymous per ADR 008 and need no credentials at all.
2. An OpenAI API key, used server-side for two purposes: the GPT-4o cleaning pass over Jina-extracted markdown (ADR 005) and the GPT-4o script-generation call (ADR 003).

Plus non-secret configuration: bucket name and AWS region.

User-supplied keys (daily.dev PAT, Gemini key, Jina key) are not in scope here — they live in browser `sessionStorage` and are passed to the backend per-request (Jina key) or used directly browser-to-API (Gemini) or proxied transparently (PAT, ADR 002).

The choice space is shaped by two pressures: minimize the operational surface for v1, and never put long-lived AWS access keys inside the runtime image.

## Decision

### AWS credentials

- **Production:** the App Runner service runs under an **Instance IAM role** scoped to exactly `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::<bucket>/episodes/*`. boto3 picks up the role automatically via the instance metadata service.
- **Local dev:** developers run `aws configure sso` (or `aws configure`) to land an AWS profile in `~/.aws/credentials`. The profile name (e.g. `devcast-dev`) is exported as `AWS_PROFILE` via the local `.env` file.
- **Same code path:** boto3's default credential resolution chain finds the instance role in prod and the named profile in dev. The application never reads AWS key material itself.

### OpenAI key

- **Production:** plain App Runner environment variable (`OPENAI_API_KEY`). Set in the service config, not baked into the image.
- **Local dev:** `OPENAI_API_KEY=…` in the local `.env` file. `.env` is gitignored.
- **Future (deferred):** point the App Runner env var at an AWS Secrets Manager secret (`secrets:<arn>`) when the operational maturity warrants it. No code change required at that point.

### Non-secret configuration

The same env-var pattern carries the bucket name and region:

| Name | Prod source | Dev source | Used by |
|------|-------------|------------|---------|
| `OPENAI_API_KEY` | App Runner env var | `.env` | extract-cleaning, script-gen |
| `DEVCAST_S3_BUCKET` | App Runner env var | `.env` | finalize write, share-page read |
| `AWS_REGION` | App Runner env var | `.env` | boto3 client init |
| `AWS_PROFILE` | (unset) | `.env` only | boto3 credential resolution (dev) |

### Repo hygiene

- `.env` is gitignored.
- `.env.example` is checked in with the full key inventory and no values.
- `python-dotenv` loads `.env` only when the file exists; in prod the file isn't there and env vars come from the App Runner config — same code path, no branch.

### Logging hygiene

Access logs scrub the `Authorization` header (already required by ADR 002 for the PAT proxy). The same scrubbing covers the Jina key when it travels in the request body to `/api/extract`: never log request bodies in normal operation, and if a debug logger is added later, redact the `jina_key` field explicitly.

## Consequences

**In favour:**
- No long-lived AWS access keys exist in the container, in the repo, or in any developer's shell history. The only AWS key material is the per-developer SSO/profile setup on their own machine, owned by AWS's standard auth model.
- One credential model for boto3 across dev and prod — no `if os.environ.get("APP_RUNNER")` branching.
- OpenAI key blast radius in v1 is bounded by an OpenAI billing alarm (operational, not in code).
- Migration to Secrets Manager is zero-code-change: swap the App Runner env var source from `value: <literal>` to `value-from: <secret-arn>`.

**Accepted tradeoffs:**
- The OpenAI key sits in App Runner env config in plaintext (visible to anyone with `apprunner:DescribeService` IAM permission). Acceptable for v1, not acceptable forever. Secrets Manager when warranted.
- Local dev requires an AWS account / SSO setup. There's no "run with fake creds" mode in v1 — though tests use mocked boto3 (ADR-005-implied), so unit tests don't need real AWS access.

**Operational notes for Slice 1:**
- The App Runner Instance IAM role is provisioned outside the application image (Console, Terraform, or CloudFormation — implementer's choice).
- The minimum IAM policy attached to the role is:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "WriteAndReadEpisodes",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::<bucket>/episodes/*"
    }]
  }
  ```
- The `.env.example` file is the human-readable inventory; keep it in sync as new env vars are added.
