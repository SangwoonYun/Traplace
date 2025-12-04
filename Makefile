.PHONY: help install dev dev-no-redis redis test lint format clean

help:
	@echo "🎯 Traplace - Available Commands"
	@echo "================================"
	@echo "  make install      - Install dependencies"
	@echo "  make dev          - Start Flask dev server with Redis"
	@echo "  make dev-no-redis - Start Flask dev server (no Redis)"
	@echo "  make redis        - Start Redis server only"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Check code style"
	@echo "  make format       - Format code"
	@echo "  make clean        - Clean cache files"

install:
	@echo "📦 Installing dependencies..."
	pip install -r requirements.txt
	@echo "✅ Dependencies installed"

dev:
	@echo "🚀 Starting Traplace (with Redis)..."
	./start-dev.sh

dev-no-redis:
	@echo "🚀 Starting Traplace (no Redis - shortener disabled)..."
	python3 manage.py

redis:
	@echo "🔄 Starting Redis..."
	redis-server --loglevel warning

test:
	@echo "🧪 Running tests..."
	python3 -m pytest tests/ -v

lint:
	@echo "🔍 Linting code..."
	ruff check app/ manage.py wsgi.py

format:
	@echo "✨ Formatting code..."
	ruff format app/ manage.py wsgi.py

clean:
	@echo "🧹 Cleaning cache..."
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	@echo "✅ Cache cleaned"
