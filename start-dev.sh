#!/bin/bash

# Traplace - Flask Development Server Launcher
# This script starts Redis and Flask development server

set -e

echo "🚀 Traplace - Flask Development Server"
echo "======================================"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.13+"
    exit 1
fi

echo "✅ Python found: $(python3 --version)"

# Check pip packages
echo "📦 Checking dependencies..."
python3 -m pip install -q -r requirements.txt 2>/dev/null || {
    echo "⚠️  Some packages may not have installed. Continuing..."
}

# Check Redis
if ! command -v redis-server &> /dev/null; then
    echo "⚠️  Redis not found. URL shortener will be unavailable."
    echo "   Install with: brew install redis"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Redis found: $(redis-server --version | head -1)"
    echo "🔄 Starting Redis..."
    redis-server --daemonize yes --loglevel warning
    sleep 1
fi

# Load environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo "📝 Loaded .env configuration"
fi

# Start Flask
echo ""
echo "🌐 Starting Flask development server..."
echo "📍 Access the app at: http://localhost:${PORT:-3001}"
echo "🛑 Press Ctrl+C to stop"
echo ""

export PYTHONUNBUFFERED=1
python3 manage.py
