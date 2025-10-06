#!/bin/bash

# Real Estate Server Deployment & Keep-Alive Script
echo "🚀 Real Estate Server Deployment & Keep-Alive Setup"
echo "=================================================="

# Deploy to Vercel
echo "📦 Deploying to Vercel..."
vercel --prod

# Get the deployment URL (you'll need to replace this with your actual URL)
SERVER_URL="YOUR_VERCEL_DEPLOYMENT_URL"

echo "✅ Deployment complete!"
echo "🔗 Server URL: $SERVER_URL"

# Test health endpoints
echo ""
echo "🏥 Testing health endpoints..."

# Test health check
echo "Testing /health endpoint..."
curl -s "$SERVER_URL/health" | jq '.' || echo "Health check failed"

# Test ping endpoint  
echo "Testing /ping endpoint..."
curl -s "$SERVER_URL/ping" | jq '.' || echo "Ping failed"

# Test keep-alive endpoint
echo "Testing /keep-alive endpoint..."
curl -s "$SERVER_URL/keep-alive" | jq '.' || echo "Keep-alive failed"

echo ""
echo "📋 Server Keep-Alive Setup Complete!"
echo "=================================="
echo ""
echo "✅ Added Features:"
echo "  - Health check endpoint: /health"
echo "  - Ping endpoint: /ping" 
echo "  - Keep-alive endpoint: /keep-alive"
echo "  - Vercel cron job every 14 minutes"
echo "  - Client-side keep-alive service"
echo "  - Internal server keep-alive mechanism"
echo ""
echo "🎯 Your server should now stay alive and responsive!"
echo "📊 Monitor at: $SERVER_URL/health"