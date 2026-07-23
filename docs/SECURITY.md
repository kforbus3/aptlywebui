# Security Model

## Authentication

- Username/password login issues a short-lived **JWT access token** plus a
  longer-lived **refresh token**. The SPA refreshes transparently.
- Passwords are hashed with **bcrypt**; plaintext is never stored.
- Authentication is **always on** — there is no "auth disabled" mode. Every API
  route except `/api/health` requires a valid token.
- `SECRET_KEY` signs the tokens. **Set a strong, fixed value in production**; if it
  is weak or rotates unexpectedly, existing sessions become invalid (and a
  predictable key would let tokens be forged).

## Authorization (RBAC)

Three roles, enforced server-side by FastAPI dependencies:

| Role | Level | Capabilities |
|------|-------|--------------|
| viewer | read | List/inspect all resources |
| operator | write | Create/sync/delete/publish, manage schedules and backups |
| admin | full | User management, audit log, backup deletion & restore |

Role checks happen on the backend, not just in the UI — a viewer's token cannot
perform operator actions even with crafted requests. The system refuses to remove
or disable the **last active admin**.

## Audit logging

Every mutating action (and every login attempt) is recorded with the username,
action, target resource, HTTP method, status, and timestamp. Admins can view and
filter the log in the UI or via `GET /api/audit`.

## Secrets and key material

- The JWT secret comes from the `SECRET_KEY` environment variable.
- GPG **signing keys** live in a keyring volume shared between the UI and aptly.
  Treat that volume as sensitive and restrict host access to it.
- The repository's `.gitignore` excludes `*.key`, `*.asc`, `*.gpg`, `.env`, and
  all `data/` directories so secrets are never committed.
- No secrets are baked into the Docker image (`.dockerignore` excludes `.env` and
  data).

## Network exposure

- The app serves **HTTP** on ports 8000 (UI) and 80 (repo). Before exposing it
  beyond a trusted network, terminate TLS — the bundled Caddy overlay
  (`docker-compose.tls.yml`) does this with automatic Let's Encrypt certificates
  (see [DEPLOYMENT.md](DEPLOYMENT.md#tls-https-with-automatic-certificates)).
- The paired aptly API has no authentication of its own and should **never** be
  exposed directly — only the web UI talks to it, over the internal Docker
  network.

## Hardening checklist

- [ ] Set a strong `SECRET_KEY` and a non-default `ADMIN_PASSWORD`.
- [ ] Change the seeded admin password on first login.
- [ ] Terminate TLS at a reverse proxy; redirect HTTP→HTTPS.
- [ ] Keep aptly's port internal to the Docker network.
- [ ] Restrict host access to the GPG keyring and data volumes.
- [ ] Create per-person accounts with least-privilege roles instead of sharing the
      admin login.

## Reporting a vulnerability

Report security issues privately to the maintainer with reproduction steps and the
affected version/commit — do not open a public issue.
