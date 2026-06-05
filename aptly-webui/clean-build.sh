#!/bin/bash
set -e

echo "🧹 Cleaning up old Docker caches..."

# Stop any running containers
docker-compose -f docker-compose.simple.yml down 2>/dev/null || true

# Remove old images
docker rmi aptly-webui-frontend:latest aptly-webui-backend:latest 2>/dev/null || true

# Clear build cache
docker builder prune -f

echo "🔨 Building fresh images..."

# Build with no cache
docker-compose -f docker-compose.simple.yml build --no-cache

echo "🚀 Starting services..."
docker-compose -f docker-compose.simple.yml up -d

echo "✅ Build complete!"
echo ""
echo "Check status:"
docker-compose -f docker-compose.simple.yml ps
