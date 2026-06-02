# Multi-stage build for the frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Python backend
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies including aptly client
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    apt-utils \
    aptly \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Nginx configuration
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Startup script
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash
set -e

# Start the backend
python /app/backend/app.py &

# Start nginx
nginx -g 'daemon off;'
EOF

RUN chmod +x /app/start.sh

EXPOSE 80

CMD ["/app/start.sh"]
