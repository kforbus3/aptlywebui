# Architecture

Aptly Web UI is a single web application that wraps aptly's REST API with
authentication, role-based access control, audit logging, scheduling, and a
polished SPA.

## Components

| Component | Technology | Role |
|-----------|-----------|------|
| API + app server | FastAPI (async) on Uvicorn | Serves the REST API under `/api` and the built SPA at `/` |
| Frontend | React + Vite + TypeScript + Tailwind | Single-page admin UI, built to static assets and served by the backend |
| UI database | SQLite (async SQLAlchemy) | Users, audit log, schedules |
| Scheduler | APScheduler (in-process) | Cron-based mirror updates / re-publishing |
| Repository engine | aptly (`aptly api serve`) | The actual Debian repository operations |

## Data flow

1. The browser loads the SPA from the backend and authenticates via
   `POST /api/auth/login`, receiving a JWT access token (+ refresh token).
2. Every API call carries the access token. A dependency resolves the current
   user and enforces the required role.
3. Resource calls (mirrors, repos, snapshots, publish, packages, tasks) are
   proxied to aptly's REST API by `app/aptly.py::AptlyClient`.
4. Mutating calls record an entry in the audit log before returning.
5. GPG key operations shell out to the local `gpg` binary, which shares a keyring
   volume with the aptly process so signing works.

## Why SQLite (not Postgres/Redis)

The UI's own state is small (users, audit rows, schedules) and aptly is the
source of truth for repository data. SQLite keeps the deployment to a single
lightweight container — appropriate for homelabs and most IT-ops use. The
scheduler runs in-process via APScheduler rather than requiring a separate
broker/worker.

## Layout

```
backend/app/
  main.py        FastAPI app; mounts routers under /api and serves the SPA
  config.py      Env-driven settings
  db.py          Async SQLAlchemy engine/session + table creation
  models.py      User, AuditLog, Schedule
  schemas.py     Pydantic request/response models
  security.py    bcrypt hashing + JWT create/decode
  deps.py        Auth + RBAC dependencies, aptly client provider
  aptly.py       AptlyClient (REST proxy) + GPGManager (gpg subprocess)
  audit.py       Audit-log writer
  scheduler.py   APScheduler jobs for scheduled mirror syncs
  seed.py        First-run admin seeding
  routers/       auth, aptly_proxy, gpg, users, audit, schedules, backup, system

frontend/src/
  lib/           api client (axios + token refresh), auth context
  components/     UI primitives, layout, toast
  pages/         one page per feature area
```

## Pairing with a serving layer

`aptly api serve` exposes the management API and writes published repositories to
`<rootDir>/public`. Serving those files to apt clients over HTTP(S) is a separate
concern — front it with nginx (for example, the companion
[`docker-aptly`](https://github.com/kforbus3/docker-aptly) project) or any web
server pointed at the published directory.
