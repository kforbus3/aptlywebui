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
- `APP_TIMEZONE` — default IANA timezone until an admin sets one in the UI
  (default `UTC`). See [Timezone](#timezone).
- `PUBLIC_REPO_URL` — internal URL of the published-repo web server, used to read
  publication `Release` dates for the Mirrors view (default `http://repo`).

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
curl -fsSL http://<host>/gpg/public.key | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/aptly-repo.gpg
echo "deb http://<host>/ <dist> <component>" \
  | sudo tee /etc/apt/sources.list.d/aptly-repo.list
sudo apt update
```

Installing the key under `/etc/apt/trusted.gpg.d/` makes it trusted for all
sources, so the sources line needs no `signed-by=` option.

The **Published** page has a per-publication *apt setup* helper (terminal icon)
that generates these exact commands. For public/production use, front the `repo`
service with a TLS-terminating proxy too, and serve the key over HTTPS.

## Signing keys

Manage keys on the **GPG Keys** page (generate or import). The `aptly` and
`webui` containers share one keyring (`gpg` volume), and aptly signs
publications with it.

Every publish/switch/refresh dialog has a **Signing key** picker; it defaults to
your first key. With a single key you can ignore it. With more than one key, pick
the one to sign that publication — otherwise aptly would fall back to gpg's
default key, which is not something you control. The served `public.key` bundles
**all** keys in the keyring, so apt clients verify successfully whichever key
signed.

> Scheduled **Refresh publications** runs currently re-sign with aptly's default
> key (not a per-schedule choice). If you run multiple keys and want the nightly
> job to use a specific one, that's a small follow-up — ask.

## Multi-component repositories (main / contrib / non-free …)

aptly maps **one source (snapshot/repo) to one component**, so a repository with
several components is built from one mirror per component:

1. **Mirrors** → *New Mirror*. Pick a Debian/Ubuntu preset (or list the components
   yourself). With more than one component the UI creates **one mirror per
   component**, named `<name>-<component>` (e.g. `debian-trixie-main`,
   `debian-trixie-contrib`, `debian-trixie-non-free`, `debian-trixie-non-free-firmware`).
   Components are disjoint, so this doesn't increase download size; the package
   pool is shared by content hash.
2. **Snapshots** → create a snapshot from each component mirror.
3. **Published** → *Publish*. Add a source row per component, choosing the matching
   snapshot; the component is guessed from the snapshot name. Publishing writes
   `dists/<dist>/main/`, `contrib/`, `non-free/`, … as separate components.

A single component (the default `main`) stays a single mirror with the plain name.
Publishing a lone multi-component snapshot instead collapses every package into one
component — which is why the per-component split exists.

**Suites.** A full Debian mirror is three suites — the release, `-updates`, and
`-security` — each its own publication (Distribution). The Create Mirror presets
cover all three (and Ubuntu adds `-backports`); pick e.g. *Debian Trixie (13) —
Security* and the archive host, distribution, and components are filled in. The
Debian **security** archive names its components with an `updates/` prefix
(`updates/main`, …); the per-component split strips that to a clean mirror name
(`debian-trixie-security-main`) while the mirror still tracks the real component,
and publishing remaps it back to the plain `main`/`contrib`/… component. So a
client uses the normal:

```
deb http://repo/ trixie          main contrib non-free non-free-firmware
deb http://repo/ trixie-updates  main contrib non-free non-free-firmware
deb http://repo/ trixie-security main contrib non-free non-free-firmware
```

## Mirroring Ubuntu Pro (ESM / FIPS)

Ubuntu Pro archives (`esm.ubuntu.com`) require an auth token. The Create Mirror
form has presets for **ESM Infra**, **ESM Apps**, **FIPS** and **FIPS Updates**
across Jammy/Focal/Bionic/Xenial, and the official Pro signing keys are baked into
the aptly image, so these verify signatures out of the box.

1. On a machine attached to Ubuntu Pro (`sudo pro attach <contract-token>`), read
   the per-service token — it is the password after `login bearer` in the
   generated apt auth file:

   ```bash
   sudo grep -h esm.ubuntu.com /etc/apt/auth.conf.d/*
   # machine esm.ubuntu.com/apps/ubuntu/ login bearer password <TOKEN>
   ```

2. In **Mirrors → New Mirror**, pick the matching Pro preset (e.g. *ESM Apps
   (security) — Jammy 22.04*). A **Ubuntu Pro auth token** field appears — paste
   `<TOKEN>` there and create the mirror.

The token is spliced into the mirror's archive URL as HTTP basic auth (username
`bearer`) and stored only there; the UI/API redact it from all mirror responses,
so it is never displayed again. Each ESM service publishes a `-security` and a
`-updates` suite; mirror whichever you need as separate mirrors. FIPS and
FIPS-Updates are signed by the same key and both verify automatically.

## Scheduling automatic refreshes

**Schedules** run cron jobs. Two kinds:

- **Refresh publications** (the fleet job) — pick *All publications* (or a subset)
  and a cron. Each run syncs every mirror behind those publications, creates a
  timestamped snapshot of each, and switches every component to its new snapshot.
  It resolves which mirror backs each component from the snapshot itself, so a
  full multi-suite, multi-component setup (e.g. 12 mirrors → 3 publications)
  refreshes in one nightly job with no per-item wiring. Set *Keep snapshots per
  mirror* to bound how many timestamped snapshots are retained (older, unpublished
  ones are pruned; published ones are always kept).
- **Sync a single mirror** — the original per-mirror job, optionally snapshotting
  and switching one publication. Best for a single-component publication.

A typical full-mirror setup is one *Refresh publications* schedule over *All
publications* at, say, `0 3 * * *` (daily 03:00).

Cron times are interpreted in the configured **timezone** (see below), so
`0 3 * * *` fires at 3 AM local — and the timestamped snapshot names use the same
zone, so a snapshot's name matches the date shown in the UI.

## Timezone

**Settings → Timezone** (admin) sets one IANA timezone used for cron scheduling,
the date stamp baked into snapshot names, and every timestamp shown in the UI
(mirror last-sync/last-published, snapshots, audit log, backups, schedules).
Changing it reschedules existing jobs immediately — no restart needed.

The default before an admin sets one comes from the `APP_TIMEZONE` env var
(falls back to `UTC`). The setting, once saved, persists in the database and
overrides the env default.

## Mirror sync & publish times

The **Mirrors** page shows, per mirror, **Last Sync** (aptly's native last
successful download) and **Last Published** — the most recent time a publication
containing that mirror's snapshots was (re)published, with the publication(s)
listed. Last-published time is read from each publication's `Release` file
`Date:` over the internal `repo` service (`PUBLIC_REPO_URL`, default
`http://repo`), since aptly's publish API carries no timestamp of its own.

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

> **Upgrading to v2.5.0+** bumps the bundled aptly engine from 1.5.0 to 1.6.1
> (the aptly image base moves to Debian trixie). aptly 1.6 reads an existing 1.5
> on-disk database and upgrades its format on first start; this is one-way, so
> **take a backup first** (Backups page, or snapshot the `aptly-data` volume).
> `docker compose up -d --build` rebuilds the aptly image automatically.

## Operations quick reference

```bash
docker compose ps
docker compose logs -f webui
docker compose logs -f aptly
docker compose restart webui
docker compose down            # stop (keep volumes)
docker compose down -v         # stop and DELETE all data
```
