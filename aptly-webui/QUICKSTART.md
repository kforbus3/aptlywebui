# Quick Start - Docker Only

## Prerequisites
- Docker and Docker Compose installed
- Ports 3000 and 8000 available on your server

## Deploy (5 minutes)

### 1. Edit Configuration

Edit `docker-compose.simple.yml` and change these values:
- `aptly_password_change_me` → Your secure database password
- `change-this-to-a-random-string-min-32-chars` → Generate with: `openssl rand -hex 32`
- `your-aptly-server:8080` → Your Aptly server address
- `your-server-ip` → Your server's IP address or hostname

### 2. Start Containers

```bash
docker-compose -f docker-compose.simple.yml up -d
```

### 3. Access

- **Web UI**: http://your-server-ip:3000
- **API**: http://your-server-ip:8000
- **API Docs**: http://your-server-ip:8000/api/docs

### 4. Create Admin User

```bash
docker exec aptly-backend python -c "
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from aptly_webui.db.session import AsyncSessionLocal
from aptly_webui.db.models import User
from aptly_webui.core.security import get_password_hash

async def create_admin():
    async with AsyncSessionLocal() as db:
        admin = User(
            email='admin@example.com',
            username='admin',
            hashed_password=get_password_hash('admin-password'),
            role='admin',
            is_active=True
        )
        db.add(admin)
        await db.commit()
        print('Admin created')

asyncio.run(create_admin())
"
```

## Commands

```bash
# Start
docker-compose -f docker-compose.simple.yml up -d

# Stop
docker-compose -f docker-compose.simple.yml down

# View logs
docker-compose -f docker-compose.simple.yml logs -f

# Restart
docker-compose -f docker-compose.simple.yml restart

# Update after code changes
docker-compose -f docker-compose.simple.yml up -d --build
```

## What This Does

- Runs on ports **3000** (frontend) and **8000** (backend)
- **Does NOT** use port 80 or 443
- **Does NOT** include nginx
- **Does NOT** modify your existing webserver
- Completely isolated in Docker containers
