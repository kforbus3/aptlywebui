# Deployment & Operations

## Docker Compose (recommended)

```bash
cp .env.example .env          # set SECRET_KEY + ADMIN_PASSWORD
docker compose up -d --build
```

This starts two services on an internal network:

| Service | Image | Ports | Volumes |
|---------|-------|-------|---------|
| `webui` | built from repo root | `8000:8000` | `webui-data`, `aptly-data`, `gpg` |
| `aptly` | `aptly api serve` | internal only | `aptly-data`, `gpg` |

Volumes:

- `webui-data` → `/data/webui` — SQLite DB and UI backups
- `aptly-data` → `/data/aptly` — aptly database and published repositories
- `gpg` → `/root/.gnupg` — shared signing keyring (UI + aptly)

## Configuration

All settings are environment variables (see [`.env.example`](../.env.example) and
the table in the [README](../README.md#configuration)). The most important:

- `SECRET_KEY` — set a strong, fixed value.
- `ADMIN_PASSWORD` — set before first start; change it after logging in.

## TLS

Front the UI with a reverse proxy that terminates HTTPS, e.g. nginx or Caddy:

```nginx
server {
    listen 443 ssl;
    server_name aptly.example.com;
    ssl_certificate     /etc/letsencrypt/live/aptly.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aptly.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Serving published repositories to apt clients

`aptly api serve` writes published repos under `/data/aptly/public`. To serve them
to apt clients, point a web server at that directory (the companion
[`docker-aptly`](https://github.com/kforbus3/docker-aptly) project does exactly
this with nginx), or add an nginx service to the compose file mounting
`aptly-data` and serving `/data/aptly/public`.

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
