# Stage 1: Build the frontend with Node
FROM node:20-alpine AS frontend-build

WORKDIR /build

# Copy package files first for layer caching
COPY frontend/package.json frontend/package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy frontend source code
COPY frontend/ .

# Build the frontend
RUN npm run build


# Stage 2: Runtime image with Python, ffmpeg, and compiled frontend
FROM python:3.12-slim

# Install ffmpeg (required for audio transcoding)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Install uv for Python dependency management
RUN pip install --no-cache-dir uv

WORKDIR /app/backend

# Copy Python dependency files first for layer caching
COPY backend/pyproject.toml backend/uv.lock ./

# Install runtime dependencies only (exclude dev deps like pytest)
RUN uv sync --frozen --no-dev

# Copy backend source code (this overwrites the pyproject.toml/uv.lock already present)
COPY backend/ .

# Copy compiled frontend assets to the static directory where main.py expects them
COPY --from=frontend-build /build/dist/ ./static/

# Expose the port that ECS Express Mode expects
EXPOSE 8080

# Start the FastAPI application
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
