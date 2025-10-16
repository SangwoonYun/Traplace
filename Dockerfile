# File: Dockerfile
# syntax=docker/dockerfile:1.7
#
# Production image for the Flask app served by Gunicorn.
# Goals:
# - Small, reproducible, non-root image
# - Aggressive layer caching for deps
# - Healthcheck hits /healthz
# - Clear, English-only comments

FROM python:3.13-slim AS runtime

# ── Environment ────────────────────────────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Can be overridden at runtime
    PORT=8000 \
    WORKERS=2 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# ── OS packages (curl only for healthcheck) ────────────────────────────────────
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# ── Create non-root user early so we can COPY with proper ownership ────────────
# uid/gid kept default; adjust via build args if your infra requires it.
RUN useradd -ms /bin/bash appuser

# ── Python dependencies ────────────────────────────────────────────────────────
# Copy only requirements first to leverage build cache.
COPY --chown=appuser:appuser requirements.txt .
# Use BuildKit cache for pip; falls back gracefully if BuildKit is disabled.
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --no-cache-dir -r requirements.txt

# ── Application source ─────────────────────────────────────────────────────────
# Includes app/, wsgi.py, templates/, static/, etc.
COPY --chown=appuser:appuser . .

# ── Switch to non-root user ────────────────────────────────────────────────────
USER appuser

# ── Network & healthcheck ──────────────────────────────────────────────────────
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1

# ── Entrypoint (Gunicorn) ─────────────────────────────────────────────────────
# App factory pattern: import from wsgi:app
CMD ["sh", "-c", "gunicorn -w ${WORKERS} -b 0.0.0.0:${PORT} wsgi:app"]
