# Aptly WebUI

A modern, production-quality web interface for Aptly repository management. This application provides complete control over mirrors, snapshots, and published repositories without requiring command-line access.

## Features

### Core Functionality
- **Mirror Management**: Create, update, and delete mirrors from external repositories
- **Snapshot Management**: Create snapshots from mirrors, merge snapshots, and manage their lifecycle
- **Publish Management**: Publish snapshots as APT repositories with safe switching
- **Package Search**: Fast full-text search across all snapshots and repositories
- **Package Presence**: "Where is this package?" feature for dependency tracking

### Enterprise Features
- **Authentication**: JWT-based auth with LDAP and OIDC support
- **Authorization**: Role-based access control (Admin, Operator, Viewer)
- **Audit Logging**: Complete audit trail of all operations
- **Multi-Instance**: Manage multiple Aptly instances (host, Docker, remote)

### Ubuntu Support
- Full support for Ubuntu releases (Bionic, Focal, Jammy, Noble)
- Ubuntu ESM (Extended Security Maintenance) support
- Automatic component selection (main, updates, security, backports)
- Multi-architecture support (amd64, arm64)

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Make (optional, for convenience commands)

### Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/yourusername/aptly-webui.git
cd aptly-webui
```

2. Create an environment file:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start the services:
```bash
docker-compose up -d
```

4. Access the Web UI at `http://localhost:3000`
5. API documentation at `http://localhost:8000/api/docs`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://...` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `SECRET_KEY` | JWT signing key (change in production) | `development-secret-key...` |
| `ENCRYPTION_KEY` | Data encryption key (32+ chars) | - |
| `ENVIRONMENT` | dev/staging/production | `development` |
| `APTLY_API_URL` | Default Aptly API URL | `http://localhost:8080` |

## Architecture

### Technology Stack

#### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Accessible component library
- **TanStack Query** - Server state management

#### Backend
- **FastAPI** - High-performance Python API framework
- **SQLAlchemy 2.0** - Async ORM with PostgreSQL
- **Pydantic v2** - Data validation
- **Redis + RQ** - Caching and background jobs
- **structlog** - Structured logging

#### Infrastructure
- **PostgreSQL 16** - Primary database
- **Redis 7** - Cache and message queue
- **Docker** - Containerization
- **Nginx** - Reverse proxy (optional)

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Frontend                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Dashboard  │  │   Search    │  │  Mirror/Snapshot/Publish │ │
│  │   (cached)  │  │   (FTS)     │  │      (paginated)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    API Layer                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │   Read      │  │   Write     │  │  Async Tasks    │  │   │
│  │  │  (cache)    │  │ (validate)  │  │  (background)   │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │   │
│  └─────────┼────────────────┼──────────────────┼───────────┘   │
│            │                │                  │               │
│  ┌─────────▼────────────────▼──────────────────▼───────────┐   │
│  │                    Data Layer                           │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │   PostgreSQL    │  │   Redis Cache/Queue         │   │   │
│  │  │  (metadata)     │  │                             │   │   │
│  │  └─────────────────┘  └─────────────────────────────┘   │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      Aptly Integration                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  REST API   │  │    CLI      │  │    Docker               │ │
│  │  (primary)  │  │  (fallback) │  │   (detection)           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Development

### Setup

1. Install Python dependencies:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
```

2. Install Node.js dependencies:
```bash
cd frontend
npm install
```

3. Start the database and Redis:
```bash
docker-compose up -d db redis
```

4. Run migrations:
```bash
cd backend
alembic upgrade head
```

### Running in Development Mode

Terminal 1 - Backend:
```bash
cd backend
uvicorn aptly_webui.main:app --reload --port 8000
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

Terminal 3 - Worker (optional):
```bash
cd backend
rq worker --url redis://localhost:6379/0
```

The frontend will be available at `http://localhost:3000`
The API will be at `http://localhost:8000`

### Code Quality

Run linting and formatting:
```bash
# Backend
cd backend
ruff check src
ruff format src
mypy src

# Frontend
cd frontend
npm run lint
npm run format
```

### Testing

```bash
# Backend tests
cd backend
pytest --cov=aptly_webui

# Frontend tests
cd frontend
npm run test

# E2E tests
cd frontend
npm run test:e2e
```

## API Documentation

Once the application is running, API documentation is available at:
- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`
- OpenAPI JSON: `http://localhost:8000/api/openapi.json`

## Security

### Authentication
- JWT-based authentication with access and refresh tokens
- Password hashing with bcrypt
- Session management with Redis
- CSRF protection

### Authorization
- Role-based access control (RBAC)
- Roles: Admin, Operator, Viewer, Service
- Resource-level permissions

### Data Protection
- Encryption at rest for sensitive data (tokens, passwords)
- TLS for all communications
- Input validation with Pydantic
- SQL injection prevention via ORM

## Troubleshooting

### Database Connection Issues
Ensure PostgreSQL is running and accessible:
```bash
docker-compose up -d db
```

### Redis Connection Issues
Check Redis is running:
```bash
docker-compose up -d redis
redis-cli ping
```

### Migration Errors
If migrations fail, you can reset:
```bash
cd backend
alembic downgrade base
alembic upgrade head
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Roadmap

See [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) for the complete development plan.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

For issues and feature requests, please use the GitHub issue tracker.
