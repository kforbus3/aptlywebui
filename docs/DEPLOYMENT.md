# Deployment & Operations

## Docker Compose (recommended)

```bash
cp .env.example .env          # set SECRET_KEY + ADMIN_PASSWORD
docker compose up -d --build
```

This starts three services on an internal network:

| Service | Image | Ports | Volumes |
|---------|-------|-------|---------|
| `webui` | built from repo root | `8000:8000` (management UI) | `webui-data`, `aptly-data`, `gpg`, `repo-keys` |
| `aptly` | `aptly api serve` | internal only | `aptly-data`, `gpg` |
| `repo` | `nginx` | `${REPO_HTTP_PORT:-80}:80` (apt clients) | `aptly-data` (ro), `repo-keys` (ro) |

Volumes:

- `webui-data` → `/data/webui` — SQLite DB and UI backups
- `aptly-data` → `/data/aptly` — aptly database and published repositories
- `gpg` → `/root/.gnupg` — shared signing keyring (UI + aptly)
- `repo-keys` → `/data/keys` — the exported signing public key the repo server serves

## Configuration

All settings are environment variables (see [`.env.example`](../.env.example) and
the table in the [README](../README.md#configuration)). The most important:

- `SECRET_KEY` — set a strong, fixed value.
- `ADMIN_PASSWORD` — set before first start; change it after logging in.

## TLS (HTTPS with automatic certificates)

The repo ships an optional **Caddy** front (`docker-compose.tls.yml`) that
terminates HTTPS for both the management UI and the apt repository, obtaining and
renewing **Let's Encrypt** certificates automatically.

1. Point two DNS names at the host (one for the UI, one for the repo) and set
   them in `.env`:

   ```bash
   WEBUI_DOMAIN=aptly.example.com
   REPO_DOMAIN=repo.example.com
   ```

2. Bring the stack up with the TLS overlay:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
   ```

Caddy takes over ports **80** (redirects to HTTPS) and **443**, and proxies to
the internal `webui` and `repo` services — which the overlay stops publishing
directly. Certificates are persisted in the `caddy-data` volume, so restarts do
not re-request them. Clients then use `https://repo.example.com/` in their
`sources.list`; the *apt setup* helper on the Published page fills in the exact
commands.

> Trying it locally without DNS? Set `WEBUI_DOMAIN=webui.localhost` and
> `REPO_DOMAIN=repo.localhost` — Caddy serves those over HTTPS using its own
> internal CA. To add a certificate-expiry email, drop a global `{ email … }`
> block at the top of [`caddy/Caddyfile`](../caddy/Caddyfile).

## Serving published repositories to apt clients

The bundled `repo` service (nginx) already does this — it serves aptly's
published tree (`/data/aptly/public`) and the exported signing public key on
`REPO_HTTP_PORT` (default **80**). It mounts the aptly data **read-only** and
exposes only the published subtree plus `/gpg/public.key`; aptly's database is
never served.

On a client:

```bash
curl -fsSL http://<host>/gpg/public.key | sudo gpg --dearmor -o /usr/share/keyrings/aptly-repo.gpg
echo "deb [signed-by=/usr/share/keyrings/aptly-repo.gpg] http://<host>/ <dist> <component>" \
  | sudo tee /etc/apt/sources.list.d/aptly-repo.list
sudo apt update
```

The **Published** page has a per-publication *apt setup* helper (terminal icon)
that generates these exact commands. For public/production use, front the `repo`
service with a TLS-terminating proxy too, and serve the key over HTTPS.

## Backups

Use the UI (**Backups** page, operator+) to create downloadable tarballs of aptly
state plus the UI database, or back up the volumes directly:

```bash
docker run --rm -v aptlywebui_aptly-data:/a -v aptlywebui_webui-data:/w \
  -v "$PWD":/out debian:bookworm-slim \
  tar czf /out/aptly-webui-backup.tar.gz -C / a w
```

Restoring overwrites aptly's data — stop aptly first, restore, then start it.

## Health & monitoring

- `GET /api/health` — unauthenticated liveness probe (used by the container
  healthcheck).
- `GET /api/system/aptly` — aptly reachability and version (authenticated).
- The dashboard shows live resource counts and active aptly tasks.

## Upgrades

```bash
git pull
docker compose up -d --build
```

The database schema is created/extended automatically on start. Back up volumes
before upgrading.

## Operations quick reference

```bash
docker compose ps
docker compose logs -f webui
docker compose logs -f aptly
docker compose restart webui
docker compose down            # stop (keep volumes)
docker compose down -v         # stop and DELETE all data
```
