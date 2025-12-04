#!/bin/bash

# Quick Start Guide for Traplace

echo "🎯 Traplace - Quick Start"
echo "========================"
echo ""

# Option 1: Using shell script
echo "Option 1️⃣  : Using shell script (recommended)"
echo "  $ ./start-dev.sh"
echo ""

# Option 2: Using Makefile
echo "Option 2️⃣  : Using Makefile"
echo "  $ make dev"
echo "  $ make dev-no-redis  # (without shortener)"
echo ""

# Option 3: Direct Python
echo "Option 3️⃣  : Direct Python"
echo "  $ python3 manage.py"
echo ""

# Option 4: Docker Compose
echo "Option 4️⃣  : Docker Compose"
echo "  $ docker-compose up"
echo ""

# Option 5: VS Code Debugger
echo "Option 5️⃣  : VS Code Debug (F5)"
echo "  - Requires VS Code with Python extension"
echo "  - Config in .vscode/launch.json"
echo ""

echo "After starting, open: http://localhost:3001"
echo ""
echo "Requirements:"
echo "  • Python 3.13+"
echo "  • Redis (for URL shortener)"
echo "  • pip packages (run: pip install -r requirements.txt)"
