# syntax=docker/dockerfile:1.7
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # 기본 포트/워커는 환경변수로 오버라이드 가능
    PORT=8000 \
    WORKERS=2

WORKDIR /app

# 시스템 패키지 (헬스체크용 curl만 설치)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# 의존성만 먼저 복사해 레이어 캐시 효율 개선
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 소스
# (app/, wsgi.py, templates/, static/ 등 포함)
COPY . .

# 비루트 사용자
RUN useradd -ms /bin/bash appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# 헬스체크 (Flask의 /healthz 사용)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/healthz || exit 1

# Gunicorn 실행
# 앱 팩토리 구조에 맞춰 모듈 경로를 wsgi:app 로 변경
CMD ["sh", "-c", "gunicorn -w ${WORKERS} -b 0.0.0.0:${PORT} wsgi:app"]
