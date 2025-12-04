#!/bin/bash

# Deploy to Railway
# This script helps deploy Traplace to Railway

echo "🚀 Deploying Traplace to Railway"
echo "================================"
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found"
    echo "Install it: npm install -g @railway/cli"
    exit 1
fi

echo "✅ Railway CLI found"
echo ""

# Check if user is logged in
if ! railway whoami &>/dev/null; then
    echo "🔐 Logging in to Railway..."
    railway login
fi

echo ""
echo "📦 Creating/Linking Railway project..."

# Initialize or link existing project
if [ ! -f ".railway/config.json" ]; then
    railway init --name traplace
else
    echo "✅ Railway project already configured"
fi

echo ""
echo "🔄 Configuring environment variables..."

# Add environment variables
railway variables set ENV production
railway variables set PORT 8000

echo ""
echo "📤 Deploying to Railway..."

# Deploy
railway up

echo ""
echo "✅ Deployment complete!"
echo "View your deployment: railway open"
echo "View logs: railway logs"
