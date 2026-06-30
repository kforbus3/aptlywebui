# Aptly Web UI

A sleek, self-hosted web frontend for managing an [aptly](https://www.aptly.info/)
Debian/Ubuntu package repository — so admins can run mirrors, snapshots, and
signed publishing from the browser instead of the command line.

It pairs naturally with a Docker-based aptly server (see
[`docker-aptly`](https://github.com/kforbus3/docker-aptly)) and ships as a single
container plus a paired aptly API service.

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688.svg)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb.svg)

---

## Highlights

- **Full aptly lifecycle in the browser** — mirrors, local repos, snapshots,
  publishing, package upload, and GPG signing-key management.
- **Mirror wizard** with Debian/Ubuntu presets.
- **Signed publishing** with one click; switch a published distribution to a new
  snapshot safely.
- **Built for IT ops & homelabs:**
  - **RBAC** — `admin` / `operator` / `viewer` roles, enforced on every action.
  - **Audit logging** — who did what, when, viewable in the UI.
  - **Scheduled syncs** — cron-based automatic mirror updates and re-publishing.
  - **Backup & restore** — one-click snapshots of aptly state + the UI database.
- **Lightweight by design** — FastAPI + SQLite, no Postgres/Redis required.
- **Single sign-on session** — JWT auth with automatic token refresh, always on.
- **Sleek dark UI** — React + Vite + Tailwind, served straight from the backend.

## Architecture

```
                      ┌────────────────────── aptly-webui (one container) ──────────────────────┐
  browser  ──HTTP──▶  │  FastAPI  ──serves──▶  React SPA (built, static)                          │
                      │     │                                                                     │
                      │     ├── JWT auth · RBAC · audit log · scheduler   →  SQLite (UI state)     │
                      │     └── proxy ──HTTP──▶  aptly REST API                                    │
                      └───────────────────────────────────┬──────────────────────────────────────┘
                                                           │
                                          ┌────────────────▼─────────────────┐
                                          │  aptly (api serve)  ── /data/aptly │  ← shared volume
                                          └────────────────────────────────────┘
```

- The UI **never touches aptly's database directly** — it speaks to aptly's REST
  API (`aptly api serve`).
- The UI's own state (users, audit log, schedules) lives in **SQLite**.
- The UI and aptly **share a GPG keyring** (a Docker volume) so keys you manage in
  the UI are available to aptly for signing.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detail.

## Quick start

```bash
git clone https://github.com/kforbus3/aptlywebui.git
cd aptlywebui

cp .env.example .env
# Edit .env: set a strong SECRET_KEY and ADMIN_PASSWORD.

docker compose up -d --build
```

Open **http://localhost:8000** and sign in with the admin credentials from your
`.env` (default `admin` / `admin`). **Change the password immediately** from the
account menu.

That's it — the compose stack runs both the web UI and a paired aptly API service
with shared aptly-data and GPG-keyring volumes.

## First workflow

1. **GPG Keys** → import or (via the aptly container) generate a signing key.
2. **Mirrors** → *New Mirror* (pick a preset) → *Sync*.
3. **Snapshots** → create a snapshot from the mirror (or a local repo).
4. **Published** → *Publish snapshot* with GPG signing.
5. Point a client at `http://<host>/…` exactly as you would any apt repo.

For uploading your own packages: **Local Repos** → create a repo → *Upload .deb* →
snapshot → publish.

## Roles

| Role | Can do |
|------|--------|
| **viewer** | View everything (mirrors, snapshots, packages, published repos) |
| **operator** | Everything a viewer can, plus create/sync/delete/publish and manage schedules & backups |
| **admin** | Everything, plus user management, audit log, backup deletion & restore |

## Configuration

Set via environment variables (see [`.env.example`](.env.example)):

| Variable | Default | Purpose |
|----------|---------|---------|
| `SECRET_KEY` | random per start | JWT signing secret — **set a fixed strong value in production** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin` | First-run admin seed |
| `APTLY_API_URL` | `http://localhost:8080` | aptly REST API (compose sets `http://aptly:8080`) |
| `DATA_DIR` | `/data/webui` | Where the UI's SQLite DB and backups live |
| `APTLY_ROOT_DIR` | `/data/aptly` | aptly's data dir (for backup/restore) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access-token lifetime |

## Development

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DATA_DIR=./.data SECRET_KEY=dev uvicorn app.main:app --reload   # http://localhost:8000

# Frontend (proxies /api → :8000)
cd frontend
npm install
npm run dev                                                     # http://localhost:5173
```

Run the backend tests:

```bash
cd backend && PYTHONPATH=. DATA_DIR=/tmp/t SECRET_KEY=test pytest -q
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components and data flow
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production deployment & operations
- [docs/SECURITY.md](docs/SECURITY.md) — auth, RBAC, secrets, hardening
- [CONTRIBUTING.md](CONTRIBUTING.md)

## License

Licensed under the **Apache License, Version 2.0**. See [`LICENSE`](LICENSE) and
[`NOTICE`](NOTICE).
