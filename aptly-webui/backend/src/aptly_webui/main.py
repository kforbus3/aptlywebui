"""Main FastAPI application."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from aptly_webui.api.routes import auth, gpg, mirrors, publish, repos, snapshots, tasks
from aptly_webui.core.config import settings
from aptly_webui.core.logging import configure_logging, get_logger
from aptly_webui.db.session import close_db, init_db

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    configure_logging()
    logger.info(
        "Starting up",
        app_name=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    yield

    # Shutdown
    logger.info("Shutting down")
    await close_db()


def create_application() -> FastAPI:
    """Create and configure FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Modern web UI for Aptly repository management",
        docs_url="/api/docs" if settings.environment != "production" else None,
        redoc_url="/api/redoc" if settings.environment != "production" else None,
        openapi_url="/api/openapi.json" if settings.environment != "production" else None,
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )

    # Add middleware
    # Parse CORS origins from comma-separated string
    cors_origins_list = [origin.strip() for origin in settings.cors_origins.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins_list,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Include routers
    api_v1_prefix = "/api/v1"

    app.include_router(auth.router, prefix=f"{api_v1_prefix}/auth")
    app.include_router(mirrors.router, prefix=f"{api_v1_prefix}/mirrors")
    app.include_router(repos.router, prefix=f"{api_v1_prefix}/repos")
    app.include_router(snapshots.router, prefix=f"{api_v1_prefix}/snapshots")
    app.include_router(publish.router, prefix=f"{api_v1_prefix}/publish")
    app.include_router(tasks.router, prefix=f"{api_v1_prefix}/tasks")
    app.include_router(gpg.router, prefix=f"{api_v1_prefix}/gpg")

    # Health check endpoint
    @app.get("/health", tags=["health"])
    async def health_check():
        return {"status": "healthy", "version": settings.app_version}

    @app.get("/api/health", tags=["health"])
    async def api_health_check():
        return {"status": "healthy", "version": settings.app_version}

    # Graph endpoint (SVG)
    @app.get("/api/v1/graph", tags=["system"])
    async def get_graph():
        """Get repository graph as SVG."""
        from aptly_webui.services.aptly_client import AptlyClient

        client = AptlyClient()
        try:
            svg = await client.get_graph()
            from fastapi.responses import Response
            return Response(content=svg, media_type="image/svg+xml")
        finally:
            await client.close()

    return app


app = create_application()


def main() -> None:
    """Entry point for CLI."""
    import uvicorn

    uvicorn.run(
        "aptly_webui.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
