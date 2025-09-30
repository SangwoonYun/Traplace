# syntax=docker/dockerfile:1.7
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 시스템 패키지 (건강검진용 curl만 추가)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# 의존성
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 소스
COPY . .

# 비루트 사용자
RUN useradd -ms /bin/bash appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# 헬스체크 (Flask의 /healthz 사용)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-8000}/healthz || exit 1

# GUNICORN 실행 (PORT/WORKERS 오버라이드 가능)
CMD ["sh", "-c", "gunicorn -w ${WORKERS:-2} -b 0.0.0.0:${PORT:-8000} app:app"]

