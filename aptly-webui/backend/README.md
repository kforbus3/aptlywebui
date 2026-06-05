# Aptly WebUI Backend

FastAPI backend for the Aptly WebUI application.

## Features

- RESTful API for Aptly repository management
- PostgreSQL database with SQLAlchemy async ORM
- Redis caching and task queue
- JWT authentication
- GPG key management

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run development server
uvicorn aptly_webui.main:app --reload
```

## Docker

```bash
docker build -t aptly-webui-backend .
docker run -p 8000:8000 aptly-webui-backend
```
