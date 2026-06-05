"""Logging configuration."""

import logging
import sys
from typing import Any

import structlog

from aptly_webui.core.config import settings


def configure_logging() -> None:
    """Configure structured logging."""
    timestamper = structlog.processors.TimeStamper(fmt="iso")

    # Standard processors without add_logger_name (causes issues with PrintLogger)
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        timestamper,
        structlog.processors.format_exc_info,
        structlog.stdlib.ExtraAdder(),
    ]

    if settings.structured_logging:
        # Structured JSON logging for production
        shared_processors.extend([
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ])
    else:
        # Human-readable logging for development
        shared_processors.append(
            structlog.dev.ConsoleRenderer(colors=True),
        )

    structlog.configure(
        processors=shared_processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.log_level)
        ),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=False,
    )

    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.log_level),
    )

    # Silence noisy loggers
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structured logger."""
    return structlog.get_logger(name)


# Request logging middleware
async def log_request_middleware(request: Any, call_next: Any) -> Any:
    """Middleware to log requests."""
    from fastapi import Request

    if not isinstance(request, Request):
        return await call_next(request)

    logger = get_logger("http")

    # Start timer
    import time
    start_time = time.time()

    # Log request
    logger.info(
        "Request started",
        method=request.method,
        path=request.url.path,
        query=str(request.query_params),
        client=request.client.host if request.client else None,
    )

    # Process request
    response = await call_next(request)

    # Calculate duration
    duration = time.time() - start_time

    # Log response
    logger.info(
        "Request completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=round(duration * 1000, 2),
    )

    return response
