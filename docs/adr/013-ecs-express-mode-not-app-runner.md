# ADR 013: Deploy target — Amazon ECS Express Mode, not AWS App Runner

## Context

[ADR 007](007-monorepo-single-container.md) and [ADR 009](009-secrets-and-aws-credentials.md) both named **AWS App Runner** as the deploy target. The choice was load-bearing for several smaller decisions: instance IAM role (App Runner's per-service role model), HTTPS termination (App Runner-managed), auto-scaling (App Runner-managed), and the absence of any explicit registry step (App Runner could build directly from a connected GitHub source).

On **April 30, 2026**, AWS announced that App Runner is no longer accepting new customers. Existing services keep running, but the service receives no new features going forward. AWS's published migration guidance recommends **Amazon ECS Express Mode** as the replacement for new deployments — a simplified Fargate-based ECS experience that auto-provisions an Application Load Balancer, public URL with TLS, auto-scaling, networking, and monitoring from just a container image and a couple of IAM roles.

DevCast had not yet provisioned anything on App Runner when the change landed. So this is a deploy-target swap *before* any deploy, not an in-place migration.

## Decision

DevCast deploys to **Amazon ECS Express Mode** on Fargate. Concretely:

1. **Image registry: Amazon ECR.** A private ECR repository (e.g. `devcast`) holds the runtime image. Locally or via CI, the multi-stage Dockerfile from [ADR 007](007-monorepo-single-container.md) is built and pushed to ECR with an immutable tag (commit SHA or ULID).

2. **Service creation: ECS Express Mode.** A single Express Mode service is created in the ECS console (one-time) pointing at the ECR image. Express Mode auto-provisions the rest — ALB with SSL/TLS, target group, security groups, auto-scaling target, CloudWatch log group, and a public application URL. The container listens on port `8080` (set by [ADR 007](007-monorepo-single-container.md)) with a health check at `/healthz`.

3. **IAM model (three roles, replacing App Runner's single instance role):**
   - **Task execution role** (AWS-managed policy `AmazonECSTaskExecutionRolePolicy`) — used by ECS itself to pull the image from ECR and write logs to CloudWatch. Created by the ECS console on first use if missing.
   - **Infrastructure role** (AWS-managed policy `AmazonECSInfrastructureRoleforExpressGatewayServices`) — used by ECS Express Mode to manage the auto-provisioned ALB and networking on our behalf. Created by the ECS console on first use if missing.
   - **Task role** (custom inline policy) — assumed by the running container; this is the equivalent of App Runner's "instance role." Grants exactly `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::<bucket>/episodes/*`, per [ADR 009](009-secrets-and-aws-credentials.md). The application code never sees AWS keys — boto3's credential chain picks up the task role automatically from the ECS task metadata endpoint.

4. **Environment variables.** `OPENAI_API_KEY`, `DEVCAST_S3_BUCKET`, and `AWS_REGION` are configured on the Express Mode service. The mapping from env var inventory ([ADR 009](009-secrets-and-aws-credentials.md)) to App Runner env-var config simply moves to ECS Express Mode env-var config — no code change.

5. **CI/CD: out of scope for v1.** v1 deploys are manual: `docker build` → `docker push` to ECR → ECS Express Mode picks up the new image tag via a service update. A follow-up ADR records the GitHub Actions OIDC + `aws-actions/amazon-ecs-deploy-express-service@v1` workflow when we wire it up. The reason for deferring: getting *one* deploy working is Issue #1's gate; CI/CD polish should not be in the critical path.

## Consequences

**In favour:**

- DevCast remains on AWS, keeping the existing IAM/S3 model intact. All the surrounding ADRs (002, 004, 008, 009) still apply.
- ECS Express Mode auto-provisions the same shape of public URL + TLS + auto-scaling that App Runner did. From a user-facing perspective, nothing changes — share URLs and the deployed app live on a `https://*.amazonaws.com` URL until we cut over to a custom domain.
- ALB-backed traffic supports streaming responses natively. The SSE endpoints (`/api/script`, `/api/episodes/finalize`) work without buffering, preserving the rationale in [ADR 001](001-uvicorn-not-mangum.md) and [ADR 010](010-finalize-upload-and-sse-protocol.md).
- ECS Express Mode shares ALBs across services in the same VPC/security-group configuration — cost-optimized as the service set grows.
- No additional ECS Express Mode service fee. Pay only for Fargate compute + ALB + CloudWatch + data transfer.

**Accepted tradeoffs:**

- One extra moving piece: an ECR repository, plus a build-and-push step before each deploy. App Runner's "deploy from GitHub source" eliminated this, but it was never a structural advantage — just convenience. The ECR step is a one-line `docker push` per deploy.
- Three IAM roles instead of one. The task execution role and infrastructure role are AWS-managed and created automatically by the console on first use; only the task role is custom. Net additional human effort is ~2 minutes.
- Manual deploys until the CI/CD ADR lands. For a single-developer v1 this is fine; for a team, GitHub Actions OIDC + the Express Mode deploy action becomes worth setting up.
- ECS Express Mode is a brand-new service (announced November 2025). The feature surface may evolve. Any future migration to standard ECS Fargate or ECS Anywhere is straightforward — Express Mode is a thin wrapper around the same resources.

**ADR amendments triggered by this decision:**

- [ADR 007](007-monorepo-single-container.md) updates the "deployment target" wording: App Runner → ECS Express Mode.
- [ADR 009](009-secrets-and-aws-credentials.md) updates the IAM model: single instance role → task role (plus the two managed roles for execution and infrastructure).

The single-container Dockerfile, the port (`8080`), the route-order rule, the env-var inventory, and every other architectural choice from those ADRs is unchanged.
