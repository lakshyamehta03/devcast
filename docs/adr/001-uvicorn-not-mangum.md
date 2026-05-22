# ADR 001: Run FastAPI under uvicorn, not Mangum, on App Runner

## Context

The initial PRD draft specified "FastAPI with Mangum on AWS App Runner". Mangum is the ASGI-to-AWS-Lambda adapter — it translates Lambda invocation events into ASGI scope/receive/send. AWS App Runner runs long-lived containers, not Lambda invocations, and speaks HTTP directly to an ASGI server inside the container.

Putting Mangum in front of FastAPI on App Runner adds a wrapper that does nothing useful, and it actively breaks behavior we need: Lambda response buffering would defeat Server-Sent Events, which the script generation endpoint (`/api/script`) and the finalize endpoint (`/api/episodes/finalize`) both rely on for streaming progress to the browser.

## Decision

Run FastAPI under `uvicorn` directly inside the App Runner container. The container `CMD` is the uvicorn invocation. No Mangum, no Lambda-shaped adapter.

If we ever migrate to Lambda we will add Mangum at that point — it is a one-line swap.

## Consequences

- SSE works end-to-end without buffering tricks.
- One fewer dependency in `requirements.txt` / `pyproject.toml`.
- The Dockerfile `CMD` is the obvious `uvicorn main:app --host 0.0.0.0 --port 8080`.
- Health checks and graceful shutdown are stock uvicorn behavior.
