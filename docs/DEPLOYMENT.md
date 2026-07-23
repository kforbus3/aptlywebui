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

## TLS (HTTPS)

The repo ships an optional **Caddy** front in two flavours — pick the one that
matches how the host is reachable.

### Public host — automatic Let's Encrypt (`docker-compose.tls.yml`)

For an internet-reachable host with real DNS. Caddy terminates HTTPS for **both**
the UI and the repository and obtains/renews **Let's Encrypt** certificates
automatically.

1. Point two DNS names at the host (one for the UI, one for the repo) and set
   them in `.env`:

   ```bash
   WEBUI_DOMAIN=aptly.example.com
   REPO_DOMAIN=repo.example.com
   ```

2. Bring the stack up with the overlay:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
   ```

Caddy takes over ports **80** (redirects to HTTPS) and **443**, and proxies to
the internal `webui` and `repo` services — which the overlay stops publishing
directly. Certificates are persisted in the `caddy-data` volume, so restarts do
not re-request them. Clients then use `https://repo.example.com/` in their
`sources.list`; the *apt setup* helper on the Published page fills in the exact
commands.

> To add a certificate-expiry email, drop a global `{ email … }` block at the top
> of [`caddy/Caddyfile`](../caddy/Caddyfile).

### LAN / private host — HTTPS UI with an internal CA (`docker-compose.tls-ui.yml`)

For a host that is **not** reachable from the public internet (so Let's Encrypt
can't validate a domain), e.g. a home-lab box. This overlay serves **only the
management UI over HTTPS**, using a certificate from Caddy's **own local CA** (no
DNS, no ACME challenge, no internet). The **repository stays on plain HTTP** —
apt's integrity comes from the GPG signature on the repo metadata, not the
transport, so a signed repo over HTTP is not tamperable; you only forgo
confidentiality of which packages are fetched.

One hostname is enough here, because the two services sit on different ports:

- `https://<host>/` → UI (Caddy, 443)
- `http://<host>/`  → repository (nginx, `REPO_HTTP_PORT`, default 80)

1. In `.env` set the host's name (must resolve to this host on your LAN — via
   your router/local DNS or `/etc/hosts` on each client):

   ```bash
   WEBUI_DOMAIN=repo.homenet.com
   ```

2. Bring the stack up with the overlay:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.tls-ui.yml up -d
   ```

apt clients use `http://repo.homenet.com/` and need nothing extra. Browsers that
open the UI must trust Caddy's root CA once — see below. (There is no automatic
HTTP→HTTPS redirect for the UI, since port 80 belongs to the repo; browse the UI
at `https://`.)

### Trusting the internal CA (browsers)

With the LAN overlay, Caddy signs the UI certificate with a root CA it generates
on first start. Install that root on the devices you browse the UI from, and the
padlock is valid with no warnings. apt clients do **not** need it (the repo is
HTTP).

Export the root certificate:

```bash
docker cp aptly-caddy:/data/caddy/pki/authorities/local/root.crt ./aptly-root.crt
```

Then trust `aptly-root.crt`:

- **Firefox** (uses its *own* trust store, not the OS): Settings → *Privacy &
  Security* → *Certificates* → **View Certificates…** → *Authorities* tab →
  **Import…** → select `aptly-root.crt` → check **“Trust this CA to identify
  websites.”** (Alternatively, set `security.enterprise_roots.enabled` to `true`
  in `about:config` to make Firefox also honor the OS store.)
- **Chrome / Edge / Brave** use the OS store:
  - **macOS**: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain aptly-root.crt` (or open the file in **Keychain Access**, add to *System*, and set it to *Always Trust*). Covers Safari too.
  - **Windows**: `certutil -addstore -f Root aptly-root.crt` in an elevated prompt (or double-click → *Install Certificate* → *Local Machine* → *Trusted Root Certification Authorities*).
  - **Linux**: `sudo cp aptly-root.crt /usr/local/share/ca-certificates/aptly-root.crt && sudo update-ca-certificates`. Chrome on Linux uses its own NSS DB, so also: `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Aptly Local CA" -i aptly-root.crt` (from the `libnss3-tools` package).
- **Android**: Settings → *Security* → *Encryption & credentials* → *Install a
  certificate* → *CA certificate* → pick `aptly-root.crt`.
- **iOS**: AirDrop/email the file, install the profile, then enable it under
  *Settings → General → About → Certificate Trust Settings*.

The root is persisted in the `caddy-data` volume, so it stays the same across
restarts — you only trust it once. Restart the browser after importing.

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
