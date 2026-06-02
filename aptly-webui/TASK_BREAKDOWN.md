# Aptly-WebUI Production Task Breakdown

## Legend
- **Category**: `CORE`, `UX`, `BUG`, `SECURITY`, `INFRA`
- **Priority**: `1` (Critical) → `5` (Nice-to-have)
- **Status**: Identified from codebase review

---

## 1. Authentication & Authorization
- **Category**: `SECURITY`
- **Priority**: `1`
- **Description**: The application has zero authentication or authorization. Any client with network reachability to port 5000 can create, modify, drop, and publish repositories, mirrors, and snapshots.
- **Acceptance Criteria**:
  - [ ] Implement session-based or token-based authentication (e.g., Flask-Login or API keys).
  - [ ] Enforce authentication on **all** API routes and the root page.
  - [ ] Define role-based access control (RBAC) or at minimum an admin/user split.
  - [ ] Intruder test: All `DELETE`, `POST`, `PUT`, `PATCH` endpoints return `401/403` when unauthenticated.

## 2. Vendor CDN Dependency (Alpine.js / Tailwind CSS)
- **Category**: `SECURITY`
- **Priority**: `1`
- **Description**: `index.html` loads `cdn.tailwindcss.com` and `alpinejs@3.x.x` from external CDNs without Subresource Integrity (SRI) hashes. A compromised or unavailable CDN breaks the UI or enables XSS.
- **Acceptance Criteria**:
  - [ ] Vendor assets are vendored into `static/vendor/` (or bundled via a build step like Vite/Webpack).
  - [ ] No external network requests are required for the UI to render.
  - [ ] A Content-Security-Policy header is served that disallows unsafe external scripts.

## 3. Server-Side Input Validation & Sanitization
- **Category**: `SECURITY`
- **Priority**: `1`
- **Description**: `app.py` accepts JSON payloads and query parameters with no schema validation or sanitization. Mirror names, prefixes, distributions, and GPG fingerprints are passed directly to the aptly API or `subprocess`.
- **Acceptance Criteria**:
  - [ ] All incoming JSON bodies are validated against strict schemas (e.g., `pydantic` or `marshmallow`).
  - [ ] Mirror/repo/snapshot names are restricted to `[a-zA-Z0-9._-]` to prevent path injection.
  - [ ] Query parameters (`force`, `dir`, etc.) are cast and bounded.
  - [ ] Fuzzy test with invalid payloads returns `400` rather than `500` or silent pass-through.

## 4. Multi-Source Snapshot Merging UI
- **Category**: `CORE`
- **Priority**: `2`
- **Description**: **MISSING FEATURE.** The backend proxy `POST /api/snapshots` technically accepts a `SourceSnapshots` array, but the UI (`doCreateSnapshot`, `formSnapshot`) only supports selecting a **single** source. Production use often requires merging multiple snapshots into one (e.g., `main` + `contrib` + `security`).
- **Acceptance Criteria**:
  - [ ] The "Create Snapshot" modal allows adding multiple source snapshots.
  - [ ] Each source snapshot in the list can be assigned a distinct component.
  - [ ] The generated payload correctly produces `SourceSnapshots: [{Component: "main", Name: "snap1"}, {Component: "contrib", Name: "snap2"}]`.
  - [ ] The snapshot list reflects merged sources in its description or detail view.

## 5. Multi-Component Publishing UI
- **Category**: `CORE`
- **Priority**: `2`
- **Description**: **MISSING FEATURE.** The Publish and Update Publish modals (`buildPublishSources`) only construct a single `Sources` entry. Aptly supports publishing a prefix/distribution with multiple components (e.g., `main`, `contrib`, `non-free`) sourced from different snapshots. The UI prevents this.
- **Acceptance Criteria**:
  - [ ] Publish modal supports adding N source rows (source type + name + component).
  - [ ] Update Publish preserves and can edit multiple existing sources.
  - [ ] Switch Publish respects the existing component mapping instead of hardcoding `main`.

## 6. Package Search & Pagination (Server-Side)
- **Category**: `CORE` / `UX`
- **Priority**: `2`
- **Description**: `loadPackages()` in the frontend fetches **all** packages from **all** selected sources into a single in-memory array (`allPackages`). On real repositories this is an OOM/crash risk and unusable.
- **Acceptance Criteria**:
  - [ ] Replace eager `loadPackages()` with on-demand search backed by server-side filtering.
  - [ ] The backend provides paginated package search endpoints (or proxies aptly query params with `q`, `withDeps`, `format` equivalents).
  - [ ] The UI search returns results within `< 500ms` for repositories with >10,000 packages.

## 7. GPG Signing Robustness
- **Category**: `CORE` / `SECURITY`
- **Priority**: `2`
- **Description**: **NOT ROBUST.** `buildSigningPayload` sends `{Batch: true, GpgKey: fp}` with no ability to supply a passphrase. If the key requires a passphrase, `Batch: true` will cause `aptly publish` to fail opaquely. There is also no validation that the selected fingerprint exists in the server's GPG keyring at publish time.
- **Acceptance Criteria**:
  - [ ] If a signing key requires a passphrase, the UI provides a secure input (masked) and the backend supplies it to `aptly` or `gpg-agent` securely.
  - [ ] The publish endpoint validates the fingerprint against `_parse_gpg_keys()` before proxying to aptly.
  - [ ] Clear GPG error messages (e.g., "No secret key", "Bad passphrase", "Key expired") are surfaced to the user.
  - [ ] Support for `Skip`, `GpgKey`, `Keyring`, and `SecretKeyring` fields is configurable.

## 8. File Upload Limits & DoS Protection
- **Category**: `SECURITY`
- **Priority**: `2`
- **Description**: `upload_files()` proxies multi-file uploads to the aptly API with no size checks, count limits, or rate limits. A malicious actor can exhaust disk or memory.
- **Acceptance Criteria**:
  - [ ] Enforce a per-file size limit (configurable, default 100MB) and total request size limit.
  - [ ] Enforce a per-IP rate limit on upload endpoints (e.g., `Flask-Limiter`).
  - [ ] Return `413 Payload Too Large` or `429 Too Many Requests` appropriately.

## 9. Dedicated GPG Keyring Separation
- **Category**: `SECURITY`
- **Priority**: `2`
- **Description**: GPG key import/delete operates on the default GPG home directory (`~/.gnupg`). In Docker this is `root`, and it may conflict with `aptly`'s own GPG configuration. There is no isolation between keys used by aptly and keys used by other processes.
- **Acceptance Criteria**:
  - [ ] The app initializes a dedicated GPG home directory (e.g., `/app/.gnupg` or `/data/gpg`) if it does not exist.
  - [ ] All `gpg` subprocess calls use `--homedir` pointing to this dedicated directory.
  - [ ] The aptly config (`aptly.conf`) and the WebUI app reference the same keyring for publish signing.

## 10. GPG Delete Fingerprint Validation
- **Category**: `SECURITY`
- **Priority**: `2`
- **Description**: `delete_gpg_key` takes a user-supplied fingerprint and passes it directly to `gpg --delete-secret-keys` and `--delete-keys` with `--yes`. No validation that the fingerprint belongs to a listed key.
- **Acceptance Criteria**:
  - [ ] Before deletion, verify the fingerprint exists in the output of `_parse_gpg_keys()`.
  - [ ] Reject malformed or non-existent fingerprints with `400 Bad Request`.
  - [ ] Log all GPG deletion operations with the authenticated user and timestamp.

## 11. Error Handling, Retry Logic & Timeouts
- **Category**: `UX` / `CORE`
- **Priority**: `3`
- **Description**: `aptly_request` uses a fixed 60s timeout and no retry logic. Network blips or long-running `aptly` tasks can return misleading `500` errors. The frontend `api()` wrapper swallows fetch exceptions into a toast but doesn't provide retry or idempotency.
- **Acceptance Criteria**:
  - [ ] Implement exponential-backoff retry (max 3) for idempotent GET/DELETE requests.
  - [ ] Differentiate between `aptly` API errors (4xx/5xx) and infrastructure errors (DNS, TCP timeout).
  - [ ] Return structured error codes to the frontend so the UI can show contextual help (e.g., "Mirror already exists" vs. "Aptly API unreachable").

## 12. Switch Publish Component Bug
- **Category**: `BUG`
- **Priority**: `3`
- **Description**: In `app.js`, `doSwitchPublish` hardcodes `Component: 'main'` in the `Snapshots` array, regardless of the original publish's actual component mapping. If a publish was created with `Component: 'contrib'`, switching will misalign it.
- **Acceptance Criteria**:
  - [ ] `doSwitchPublish` reads the existing `switchTarget.Sources` and preserves the component mapping, or allows the user to select the correct component.
  - [ ] Integration test: switch a `contrib`-component publish and assert the component remains `contrib`.

## 13. Edit Mirror Form State Loss
- **Category**: `BUG`
- **Priority**: `3`
- **Description**: `editMirror()` resets the `preset` to `'custom'` and clears `ubuntuRelease`/`ubuntuPocket`, losing the context of how the mirror was originally created. This forces the user to manually reconstruct the URL/distribution if they want to use presets during editing.
- **Acceptance Criteria**:
  - [ ] `editMirror()` preserves or re-infers the preset, release, and pocket from the mirror's `ArchiveURL` and `Distribution` if they match a known preset.
  - [ ] Editing a mirror and saving does not unintentionally overwrite fields that the user did not change.

## 14. Upload ForceReplace Control
- **Category**: `UX`
- **Priority**: `3`
- **Description**: `doUpload()` blindly sends `ForceReplace: true` when adding uploaded files to a repo. Users may accidentally overwrite existing packages without warning.
- **Acceptance Criteria**:
  - [ ] The upload modal includes a visible checkbox for "Replace existing packages" (default unchecked).
  - [ ] The checkbox state drives the `ForceReplace` boolean in the `add` API call.

## 15. Remove `debug=True` & Harden Entrypoint
- **Category**: `INFRA` / `SECURITY`
- **Priority**: `3`
- **Description**: `if __name__ == '__main__': app.run(..., debug=True)` enables the Werkzeug debugger and pin. While Gunicorn overrides this in Docker, running `python app.py` directly in a dev/test environment leaks the debugger.
- **Acceptance Criteria**:
  - [ ] Remove `debug=True`. Read debug flag from an environment variable with default `False`.
  - [ ] Do not expose the reloader unless explicitly configured in a local-dev-only env.

## 16. Docker Non-Root User & `.dockerignore`
- **Category**: `INFRA`
- **Priority**: `3`
- **Description**: The Dockerfile creates no unprivileged user and `COPY . /app` copies everything into the image, including potential `.git`, `.env`, or local secrets.
- **Acceptance Criteria**:
  - [ ] Add a `USER` instruction (e.g., `aptlywebui`) with a fixed UID/GID.
  - [ ] Create a `.dockerignore` excluding `.git`, `*.md`, `.env`, `__pycache__`, and local test artifacts.
  - [ ] Ensure the non-root user can still write to a designated upload temp directory and GPG home.

## 17. Audit Logging for Mutations
- **Category**: `SECURITY`
- **Priority**: `3`
- **Description**: No logs are emitted for destructive operations (drop mirror, delete snapshot, unpublish, GPG key delete). In a production incident, there is no traceability.
- **Acceptance Criteria**:
  - [ ] Every mutating API call logs the authenticated user, remote IP, HTTP method, endpoint, and key parameters (excluding secrets) at `INFO` level.
  - [ ] Destructive operations (drop, delete, publish switch, GPG delete) are logged at `WARNING` level.
  - [ ] Logs are structured JSON by default to integrate with centralized log aggregators.

## 18. Healthcheck & Readiness Probes
- **Category**: `INFRA`
- **Priority**: `4`
- **Description**: The Dockerfile and compose file provide no healthcheck. Orchestrators (Kubernetes, Docker Swarm) cannot determine if the app or its dependency (aptly API) is healthy.
- **Acceptance Criteria**:
  - [ ] Add a `HEALTHCHECK` instruction in the Dockerfile (e.g., `curl -f http://localhost:5000/ || exit 1`).
  - [ ] Expose a `/health` endpoint that returns `200` when the Flask app is up **and** the aptly API is reachable.
  - [ ] Add a `/ready` endpoint that checks critical dependencies (aptly API, GPG availability, writable temp dir).

## 19. Accessibility & Focus Management
- **Category**: `UX`
- **Priority**: `4`
- **Description**: Modals lack focus trapping, `aria-label`s, and `role="dialog"`. Keyboard-only users cannot navigate safely. Toast notifications are not announced to screen readers.
- **Acceptance Criteria**:
  - [ ] All modals use `role="dialog"`, `aria-modal="true"`, and trap focus within the modal while open.
  - [ ] Close buttons and icon-only controls have `aria-label` text.
  - [ ] Toast container uses `aria-live="polite"` and is populated with assertive messages on errors.

## 20. Stats Grid Layout Bug
- **Category**: `BUG`
- **Priority**: `4`
- **Description**: The stats header uses `grid-cols-2 lg:grid-cols-4` but contains 5 items (Mirrors, Repos, Snapshots, Published, Packages). On `lg` screens, the 5th item wraps or breaks the grid alignment.
- **Acceptance Criteria**:
  - [ ] The grid uses `lg:grid-cols-5` (or restructures the stats) so all 5 items fit on a single row without overflow or wrapping.

## 21. Docker Compose Resilience
- **Category**: `INFRA`
- **Priority**: `4`
- **Description**: `docker-compose.yml` requires an external network that may not exist, has no restart policy, and no resource limits. It also exposes the app on host port 5000 without TLS.
- **Acceptance Criteria**:
  - [ ] Document the network dependency clearly, or provide a fallback `create` directive.
  - [ ] Add `restart: unless-stopped`.
  - [ ] Add CPU/memory limits and reservations in the compose file.
  - [ ] Update documentation to mandate a reverse proxy (nginx/traefik) with TLS termination for production.

## 22. Package Detail / Delete / Move Operations
- **Category**: `CORE` / `UX`
- **Priority**: `4`
- **Description**: The UI can list packages but cannot view metadata of a single package, delete a package from a local repo, or copy/move packages between local repos.
- **Acceptance Criteria**:
  - [ ] Add an endpoint to show package details (version, architecture, dependencies, files, SHA256).
  - [ ] Add UI/backend support to delete a specific package key from a local repository.
  - [ ] Add UI/backend support to copy/move packages between local repos using the aptly package key list.

## 23. Graph SVG Error Handling
- **Category**: `UX`
- **Priority**: `4`
- **Description**: If the aptly graph endpoint is slow or large, the UI blocks on a synchronous-feeling fetch with no timeout indicator and no error fallback besides an empty state.
- **Acceptance Criteria**:
  - [ ] Display a loading skeleton or spinner while fetching the graph.
  - [ ] Show a user-friendly error (e.g., "Graph generation timed out") if `GET /api/graph` fails or exceeds 10s.
  - [ ] Provide an option to download the raw `.svg` instead of inline rendering.

## 24. Task Polling Visibility & Cancellation
- **Category**: `UX`
- **Priority**: `5`
- **Description**: Background tasks (mirror update, etc.) are polled but cannot be cancelled by the user. A stuck mirror update poll loops forever.
- **Acceptance Criteria**:
  - [ ] Each background task card in the toast panel includes a "Cancel" button that sends a `DELETE /api/tasks/{id}` to aptly.
  - [ ] After N failed polls (e.g., 20), the UI stops polling and marks the task as "Stuck / Check Manually".

## 25. Browser Console Error Cleanup
- **Category**: `UX`
- **Priority**: `5`
- **Description**: The codebase leaves `console.log` and `console.warn` calls in production (`loadPackages`, `viewPublishPackages`). These leak internal endpoint paths and can confuse users.
- **Acceptance Criteria**:
  - [ ] Strip or gate all `console.*` statements behind a `DEBUG` flag.
  - [ ] No warnings appear in the browser console during normal operation.
