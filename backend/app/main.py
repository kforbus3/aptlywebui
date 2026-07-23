"""FastAPI application: API under /api and the built SPA at /."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.aptly import AptlyError
from app.config import settings
from app.db import init_db
from app.routers import (
    aptly_proxy,
    audit,
    auth,
    backup,
    gpg,
    schedules,
    system,
    users,
)
from app.scheduler import load_jobs, shutdown, start
from app.seed import seed_admin

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("aptly-webui")

STATIC_DIR = os.environ.get("STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "static"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_admin()
    start()
    await load_jobs()
    # Publish the signing public key for apt clients (served by nginx at
    # /gpg/public.key) so an existing key is available after a restart.
    try:
        from starlette.concurrency import run_in_threadpool

        from app.aptly import gpg_manager
        await run_in_threadpool(gpg_manager.export_public_keys, settings.public_key_path)
    except Exception:  # noqa: BLE001 — never block startup on key export
        logger.warning("Could not export signing public key", exc_info=True)
    logger.info("Aptly Web UI %s started (aptly API: %s)", __version__, settings.aptly_api_url)
    try:
        yield
    finally:
        shutdown()


app = FastAPI(title="Aptly Web UI", version=__version__, lifespan=lifespan)

# A wildcard origin combined with allow_credentials=True is rejected by
# browsers per the CORS spec. Auth uses Bearer tokens (not cookies), so
# credentials aren't needed when the origin list is the "*" wildcard.
_cors_origins = settings.cors_origin_list
_allow_wildcard = _cors_origins == ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=not _allow_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AptlyError)
async def aptly_error_handler(_: Request, exc: AptlyError):
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


# --- API routes (mounted under /api) ---
for r in (auth.router, aptly_proxy.router, gpg.router, users.router,
          audit.router, schedules.router, backup.router, system.router):
    app.include_router(r, prefix="/api")


# --- Static SPA ---
_assets_dir = os.path.join(STATIC_DIR, "assets")
if os.path.isdir(_assets_dir):
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")


_STATIC_ROOT = os.path.realpath(STATIC_DIR)


@app.get("/{full_path:path}", include_in_schema=False)
async def spa(full_path: str):
    """Serve the SPA, falling back to index.html for client-side routes."""
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    # Resolve the requested path and confirm it stays within STATIC_DIR before
    # serving. Percent-encoded traversal (e.g. %2e%2e%2f) reaches here decoded
    # and would otherwise expose the SQLite DB, GPG keys, and aptly data.
    candidate = os.path.realpath(os.path.join(_STATIC_ROOT, full_path))
    within_root = candidate == _STATIC_ROOT or candidate.startswith(_STATIC_ROOT + os.sep)
    if full_path and within_root and os.path.isfile(candidate):
        return FileResponse(candidate)
    index = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return JSONResponse(
        status_code=200,
        content={"message": "Aptly Web UI API is running. Build the frontend to serve the SPA.",
                 "api_docs": "/docs", "version": __version__},
    )
