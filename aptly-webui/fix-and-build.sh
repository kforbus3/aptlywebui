#!/bin/bash
set -e

echo "🧹 Deep cleaning..."

# Stop containers
docker compose -f docker-compose.simple.yml down 2>/dev/null || true

# Remove ALL cached Docker images and volumes for this project
docker rmi -f aptly-webui-frontend aptly-webui-backend 2>/dev/null || true
docker volume rm -f aptly-webui_postgres_data aptly-webui_redis_data 2>/dev/null || true

# Clear ALL Docker build cache
docker builder prune -af

echo "📁 Cleaning local build artifacts..."

# Remove Next.js build cache
rm -rf frontend/.next
rm -rf frontend/node_modules
rm -rf frontend/package-lock.json

# Remove any Python cache
find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

echo "📦 Reinstalling dependencies..."

cd frontend
npm install
cd ..

echo "🔨 Building fresh Docker images..."

# Build with absolutely no cache
docker compose -f docker-compose.simple.yml build --no-cache --pull

echo "🚀 Starting services..."
docker compose -f docker-compose.simple.yml up -d

echo ""
echo "✅ Build complete!"
echo ""
echo "Services should be available at:"
echo "  Frontend: http://YOUR-SERVER-IP:3000"
echo "  Backend:  http://YOUR-SERVER-IP:8000"
echo ""
docker compose -f docker-compose.simple.yml ps
