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
  publishing, package upload/removal, and GPG signing-key management, all from
  the UI (no CLI required).
- **Mirror wizard** with Debian/Ubuntu presets. Mirrors of the official Debian
  repositories **verify signatures out of the box** — the archive keyring is
  pre-loaded in the aptly image.
- **Non-blocking mirror syncs** — syncs run as background aptly tasks; the UI
  shows live per-mirror progress and reports success/failure without ever
  blocking on a long download.
- **Publish snapshots _or_ local repos directly**, sign with one click, switch a
  published snapshot, or **refresh** a directly-published repo after
  uploading/removing packages.
- **Generate _or_ import a signing key** right in the UI, so a fresh install can
  publish signed repositories with zero shell access.
- **Built for IT ops & homelabs:**
  - **RBAC** — `admin` / `operator` / `viewer` roles, enforced on every action.
  - **Audit logging** — who did what, when, viewable in the UI.
  - **Scheduled syncs** — cron-based automatic mirror updates that can optionally
    snapshot and re-publish, configured entirely from a guided form.
  - **Backup & restore** — one-click snapshots of aptly state + the UI database.
- **Manages _and_ serves** — a bundled repo server (nginx) publishes your signed
  repositories and signing key over HTTP so `apt` clients can install straight
  away. One `docker compose up`, nothing else to wire.
- **Lightweight by design** — FastAPI + SQLite, no Postgres/Redis required.
- **Single sign-on session** — JWT auth with automatic token refresh; the signing
  secret persists across restarts so sessions survive redeploys.
- **Sleek dark UI** — React + Vite + Tailwind, served straight from the backend.

## Architecture

The compose stack runs three services sharing an `aptly-data` volume:

```
                       ┌──────────── webui (FastAPI + React SPA) ─── :8000 (management) ─┐
  admin browser ──▶    │  JWT auth · RBAC · audit log · scheduler  →  SQLite (UI state)   │
                       │  proxy ──▶ aptly REST API   ·   exports signing public key       │
                       └───────────────┬───────────────────────────────┬─────────────────┘
                                       │                                │
                       ┌───────────────▼────────────┐        writes public.key
                       │  aptly (api serve)          │                  │
                       │  /data/aptly  (shared vol)  │        ┌─────────▼──────────────────┐
                       └───────────────┬────────────┘        │  repo (nginx) ─ :80         │
                                       │  publishes to        │  serves /data/aptly/public  │
                                       └── /data/aptly/public ▶│  and /gpg/public.key        │
  apt clients ────────────────────────────────────────────▶  └─────────────────────────────┘
```

- The UI **never touches aptly's database directly** — it speaks to aptly's REST
  API (`aptly api serve`).
- The UI's own state (users, audit log, schedules) lives in **SQLite**.
- The UI and aptly **share a GPG keyring** (a Docker volume); keys you generate or
  import in the UI are used by aptly for signing, and the UI exports the public
  half for the repo server to hand to clients.
- The **repo server** mounts the aptly data **read-only** and serves only the
  published tree plus the signing public key — never aptly's database.

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

That's it — the compose stack runs the web UI (management, **:8000**), a paired
aptly API service, and a repo server (**:80**) that serves your published
repositories to `apt` clients. To serve on a different host port (e.g. if 80 is
taken), set `REPO_HTTP_PORT` in `.env`.

## First workflow

1. **GPG Keys** → *Generate Key* (or import one) to sign published repos.
2. **Mirrors** → *New Mirror* (pick a preset) → *Sync* (runs in the background).
3. **Snapshots** → create a snapshot from the mirror (or a local repo).
4. **Published** → *Publish* the snapshot with GPG signing.
5. On the **Published** page, click the terminal icon for copy-paste `apt` client
   setup commands, then run them on any Debian/Ubuntu box.

For hosting your own packages: **Local Repos** → create a repo → *Upload .deb* →
**Published** → *Publish* it directly (source type *Local Repo*). After uploading
or removing more packages, hit *Refresh* on the publication — no re-snapshotting
needed. Prefer immutable releases? Snapshot the repo and publish that instead.

The bundled repo server serves everything clients need — no extra web server to
configure. On a client:

```bash
curl -fsSL http://<host>/gpg/public.key | sudo gpg --dearmor -o /usr/share/keyrings/aptly-repo.gpg
echo "deb [signed-by=/usr/share/keyrings/aptly-repo.gpg] http://<host>/ stable main" \
  | sudo tee /etc/apt/sources.list.d/aptly-repo.list
sudo apt update
```

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
| `SECRET_KEY` | persisted to `DATA_DIR` | JWT signing secret — auto-generated and saved on first start if unset; **set a fixed strong value in production** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin` | First-run admin seed |
| `APTLY_API_URL` | `http://localhost:8080` | aptly REST API (compose sets `http://aptly:8080`) |
| `DATA_DIR` | `/data/webui` | Where the UI's SQLite DB and backups live |
| `APTLY_ROOT_DIR` | `/data/aptly` | aptly's data dir (for backup/restore) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access-token lifetime |
| `PUBLIC_KEY_PATH` | `/data/keys/public.key` | Where the UI exports the signing public key for the repo server to serve |
| `REPO_HTTP_PORT` | `80` | Host port the repo server listens on (compose only) |

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
