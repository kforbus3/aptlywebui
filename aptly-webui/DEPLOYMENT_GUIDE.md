# Aptly WebUI - Deployment Guide

## Production Deployment Options

### Option 1: Docker Compose (Recommended) ⭐
### Option 2: Manual Deployment
### Option 3: Kubernetes

---

## Prerequisites

### Server Requirements
- **OS:** Ubuntu 22.04 LTS or Debian 12 (recommended)
- **RAM:** Minimum 4GB (8GB recommended)
- **CPU:** 2 cores minimum
- **Disk:** 50GB+ (depends on repository size)
- **Network:** Ports 80, 443, 8000, 3000

### Required Software
- Docker 24.0+
- Docker Compose v2+
- Git
- Nginx (for reverse proxy)
- Certbot (for SSL)

---

## Option 1: Docker Compose Deployment (Recommended)

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### Step 2: Clone and Configure

```bash
# Clone repository
git clone <your-repo-url> aptly-webui
cd aptly-webui

# Create production environment file
cat > .env.production << 'EOF'
# Database
POSTGRES_USER=aptly
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=aptly_webui
DATABASE_URL=postgresql+asyncpg://aptly:your_secure_password_here@db:5432/aptly_webui

# Redis
REDIS_URL=redis://redis:6379/0

# JWT Secret (generate a secure random string)
SECRET_KEY=your-super-secret-jwt-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Backend
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
APTLY_API_URL=http://aptly:8080
ENVIRONMENT=production

# Frontend
NEXT_PUBLIC_API_URL=/api
EOF

# Generate a secure secret key
openssl rand -hex 32
# Copy the output and update SECRET_KEY in .env.production
```

### Step 3: Create Production Docker Compose

```bash
cat > docker-compose.prod.yml << 'EOF'
version: '3.8'

services:
  # PostgreSQL Database
  db:
    image: postgres:16-alpine
    container_name: aptly-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - aptly-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: aptly-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - aptly-network
    command: redis-server --appendonly yes

  # Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: aptly-backend
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - SECRET_KEY=${SECRET_KEY}
      - ALGORITHM=${ALGORITHM}
      - ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES}
      - REFRESH_TOKEN_EXPIRE_DAYS=${REFRESH_TOKEN_EXPIRE_DAYS}
      - APTLY_API_URL=${APTLY_API_URL}
      - ENVIRONMENT=${ENVIRONMENT}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - aptly-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: aptly-frontend
    restart: unless-stopped
    environment:
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
    depends_on:
      - backend
    networks:
      - aptly-network

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: aptly-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - certbot-data:/etc/letsencrypt
      - certbot-www:/var/www/certbot
    depends_on:
      - frontend
      - backend
    networks:
      - aptly-network

  # Certbot for SSL
  certbot:
    image: certbot/certbot
    container_name: aptly-certbot
    volumes:
      - certbot-data:/etc/letsencrypt
      - certbot-www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

volumes:
  postgres_data:
  redis_data:
  certbot-data:
  certbot-www:

networks:
  aptly-network:
    driver: bridge
EOF
```

### Step 4: Nginx Configuration

```bash
mkdir -p nginx/ssl

cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:8000;
    }

    upstream frontend {
        server frontend:3000;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    server {
        listen 80;
        server_name your-domain.com;

        # ACME challenge for Let's Encrypt
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        # Redirect HTTP to HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL certificates (will be created by Certbot)
        ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

        # SSL settings
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # Frontend
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Backend API
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Login rate limiting
        location /api/v1/auth/login {
            limit_req zone=login burst=5 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Static files caching
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
EOF
```

### Step 5: Deploy

```bash
# Create initial SSL certificates (for first run)
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos --no-eff-email \
  -d your-domain.com

# Build and start services
docker compose -f docker-compose.prod.yml up -d --build

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Run database migrations
docker compose -f docker-compose.prod.yml exec backend \
  alembic upgrade head

# Create admin user
docker compose -f docker-compose.prod.yml exec backend \
  python -c "
import asyncio
from aptly_webui.core.security import get_password_hash
from aptly_webui.db.session import AsyncSessionLocal
from aptly_webui.db.models import User

async def create_admin():
    async with AsyncSessionLocal() as db:
        admin = User(
            email='admin@your-domain.com',
            username='admin',
            hashed_password=get_password_hash('your-admin-password'),
            role='admin',
            is_active=True
        )
        db.add(admin)
        await db.commit()
        print('Admin user created')

asyncio.run(create_admin())
"
```

---

## Option 2: Manual Deployment

### Backend Setup

```bash
# Install Python 3.12
sudo apt install -y python3.12 python3.12-venv python3.12-dev

# Create virtual environment
python3.12 -m venv /opt/aptly-webui/venv
source /opt/aptly-webui/venv/bin/activate

# Install dependencies
cd /opt/aptly-webui/backend
pip install -r requirements.txt

# Create systemd service
sudo tee /etc/systemd/system/aptly-webui.service << 'EOF'
[Unit]
Description=Aptly WebUI Backend
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=aptly-webui
Group=aptly-webui
WorkingDirectory=/opt/aptly-webui/backend
Environment=PATH=/opt/aptly-webui/venv/bin
EnvironmentFile=/opt/aptly-webui/.env
ExecStart=/opt/aptly-webui/venv/bin/uvicorn aptly_webui.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable aptly-webui
sudo systemctl start aptly-webui
```

### Frontend Setup

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Build frontend
cd /opt/aptly-webui/frontend
npm ci
npm run build

# Install PM2 for process management
sudo npm install -g pm2

# Create PM2 config
cat > /opt/aptly-webui/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'aptly-webui-frontend',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/opt/aptly-webui/frontend',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF

pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd
```

---

## SSL/TLS Setup with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal test
sudo certbot renew --dry-run
```

---

## Backup Strategy

### Database Backup

```bash
# Create backup script
cat > /opt/aptly-webui/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/opt/aptly-webui/backups
DATE=$(date +%Y%m%d_%H%M%S)

# Backup PostgreSQL
docker exec aptly-db pg_dump -U aptly aptly_webui > $BACKUP_DIR/db_$DATE.sql

# Backup Redis
docker exec aptly-redis redis-cli BGSAVE
sleep 5
cp /var/lib/docker/volumes/aptly-webui_redis_data/_data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# Cleanup old backups (keep 7 days)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete
EOF

chmod +x /opt/aptly-webui/backup.sh

# Schedule daily backups
echo "0 2 * * * /opt/aptly-webui/backup.sh" | sudo crontab -
```

---

## Monitoring

### Health Checks

Add to your backend at `aptly_webui/api/routes/health.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from aptly_webui.db.session import get_db
import redis.asyncio as redis
from aptly_webui.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check():
    return {"status": "healthy"}

@router.get("/health/db")
async def db_health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy", "service": "database"}
    except Exception as e:
        return {"status": "unhealthy", "service": "database", "error": str(e)}

@router.get("/health/redis")
async def redis_health_check():
    try:
        r = redis.from_url(settings.REDIS_URL)
        await r.ping()
        return {"status": "healthy", "service": "redis"}
    except Exception as e:
        return {"status": "unhealthy", "service": "redis", "error": str(e)}
```

### Setup Monitoring with Uptime Kuma

```bash
# Run Uptime Kuma
docker run -d \
  --name uptime-kuma \
  -p 3001:3001 \
  -v uptime-kuma-data:/app/data \
  louislam/uptime-kuma:latest
```

Then configure monitors for:
- https://your-domain.com/health
- https://your-domain.com/api/health/db
- https://your-domain.com/api/health/redis

---

## Troubleshooting

### Common Issues

**1. Container won't start**
```bash
# Check logs
docker logs aptly-backend
docker logs aptly-frontend
docker logs aptly-db

# Check environment variables
docker exec aptly-backend env | grep -i secret
```

**2. Database connection failed**
```bash
# Test database connection
docker exec aptly-backend python -c "
import asyncio
from aptly_webui.db.session import AsyncSessionLocal
async def test():
    async with AsyncSessionLocal() as db:
        print('DB connection successful')
asyncio.run(test())
"
```

**3. 502 Bad Gateway**
```bash
# Check if services are running
docker ps

# Restart services
docker compose -f docker-compose.prod.yml restart

# Check nginx configuration
sudo nginx -t
```

**4. SSL Certificate Issues**
```bash
# Renew certificates manually
sudo certbot renew --force-renewal

# Check certificate status
sudo certbot certificates
```

---

## Security Checklist

- [ ] Change default passwords
- [ ] Enable firewall (UFW)
- [ ] Configure fail2ban
- [ ] Set up SSL/TLS certificates
- [ ] Disable root SSH access
- [ ] Use SSH keys only
- [ ] Regular security updates
- [ ] Database backups encrypted
- [ ] Environment variables secured
- [ ] Access logs monitored

---

## Quick Start Commands

```bash
# One-time setup
cd /opt/aptly-webui
docker compose -f docker-compose.prod.yml up -d

# Daily operations
docker compose -f docker-compose.prod.yml logs -f  # View logs
docker compose -f docker-compose.prod.yml ps      # Check status
docker compose -f docker-compose.prod.yml pull   # Update images
docker compose -f docker-compose.prod.yml up -d  # Restart

# Backup
docker exec aptly-db pg_dump -U aptly aptly_webui > backup.sql

# Database migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

---

## Support

For issues or questions:
1. Check logs: `docker logs aptly-backend`
2. Review this guide
3. Check the project documentation
4. Create an issue in the project repository
