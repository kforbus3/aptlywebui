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
    logger.info("Aptly Web UI %s started (aptly API: %s)", __version__, settings.aptly_api_url)
    try:
        yield
    finally:
        shutdown()


app = FastAPI(title="Aptly Web UI", version=__version__, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
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


@app.get("/{full_path:path}", include_in_schema=False)
async def spa(full_path: str):
    """Serve the SPA, falling back to index.html for client-side routes."""
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    candidate = os.path.join(STATIC_DIR, full_path)
    if full_path and os.path.isfile(candidate):
        return FileResponse(candidate)
    index = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return JSONResponse(
        status_code=200,
        content={"message": "Aptly Web UI API is running. Build the frontend to serve the SPA.",
                 "api_docs": "/docs", "version": __version__},
    )
