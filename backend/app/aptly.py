"""Aptly REST API client and local GPG key management.

The web UI never touches aptly's on-disk database directly; it speaks to the
aptly HTTP API (``aptly api serve``). GPG operations shell out to the local
``gpg`` binary, which must share a keyring with the aptly process used for
signing.
"""

from __future__ import annotations

import asyncio
import os
import re
import subprocess
import tempfile
import time
from typing import Any

import httpx

from app.config import settings

# aptly task states (api/task package).
TASK_SUCCEEDED = 2
TASK_FAILED = 3
_TASK_TERMINAL = (TASK_SUCCEEDED, TASK_FAILED)


class AptlyError(Exception):
    """Raised when the aptly API returns an error; carries an HTTP status."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _clean_prefix(prefix: str) -> str:
    if prefix in ("_empty_", "."):
        return ""
    return prefix


def _sanitize_dir(d: str | None) -> str:
    if not d:
        return ""
    d = re.sub(r"[.\\/]+", "", d)
    return d if re.match(r"^[A-Za-z0-9_-]+$", d) else ""


def _valid_fingerprint(fp: str) -> bool:
    return bool(re.match(r"^[A-F0-9]{40}$", fp))


class AptlyClient:
    """Thin async proxy over the aptly REST API."""

    def __init__(self, base_url: str | None = None, timeout: int = 120):
        base = base_url or settings.aptly_api_url
        if not base.endswith("/api"):
            base = f"{base.rstrip('/')}/api"
        self.base_url = base
        self.client = httpx.AsyncClient(base_url=base, timeout=timeout, follow_redirects=True)

    async def close(self) -> None:
        await self.client.aclose()

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        try:
            resp = await self.client.request(method, path, **kwargs)
        except httpx.RequestError as exc:
            raise AptlyError(f"Cannot reach aptly API at {self.base_url}: {exc}", 503) from exc
        if resp.status_code >= 400:
            detail = resp.text
            try:
                payload = resp.json()
                if isinstance(payload, list) and payload:
                    detail = payload[0].get("error", detail)
                elif isinstance(payload, dict):
                    detail = payload.get("error", detail)
            except Exception:
                pass
            raise AptlyError(detail or f"aptly returned {resp.status_code}", resp.status_code)
        if resp.headers.get("content-type", "").startswith("application/json"):
            return resp.json()
        return resp.content

    # --- Version / health ---
    async def version(self) -> dict[str, Any]:
        return await self._request("GET", "/version")

    # --- Mirrors ---
    async def list_mirrors(self):
        return await self._request("GET", "/mirrors")

    async def get_mirror(self, name: str):
        return await self._request("GET", f"/mirrors/{name}")

    async def create_mirror(self, data: dict):
        return await self._request("POST", "/mirrors", json=data)

    async def update_mirror(self, name: str, data: dict):
        # On aptly (verified against the bundled 1.5.0) the only mutating mirror
        # route is PUT /mirrors/:name, which both applies config changes and
        # refreshes packages. Allow a long timeout since it downloads.
        return await self._request("PUT", f"/mirrors/{name}", json=data, timeout=3600)

    async def delete_mirror(self, name: str, force: bool = False):
        await self._request("DELETE", f"/mirrors/{name}", params={"force": "1" if force else "0"})
        return {"message": "Mirror deleted"}

    async def update_mirror_packages(self, name: str, data: dict | None = None) -> dict:
        # Download/refresh mirror packages via PUT /mirrors/:name (there is no
        # POST /mirrors/:name/update route). Runs as an aptly background task
        # (?_async=1) and returns the task immediately, so a long sync never
        # blocks the HTTP request; callers poll the task via wait_for_task or
        # the /tasks endpoints.
        return await self._request(
            "PUT", f"/mirrors/{name}", params={"_async": "1"}, json=data or {}
        )

    async def list_mirror_packages(self, name: str):
        return await self._request("GET", f"/mirrors/{name}/packages")

    # --- Local repos ---
    async def list_repos(self):
        return await self._request("GET", "/repos")

    async def get_repo(self, name: str):
        return await self._request("GET", f"/repos/{name}")

    async def create_repo(self, data: dict):
        return await self._request("POST", "/repos", json=data)

    async def delete_repo(self, name: str, force: bool = False):
        await self._request("DELETE", f"/repos/{name}", params={"force": "1" if force else "0"})
        return {"message": "Repository deleted"}

    async def list_repo_packages(self, name: str):
        return await self._request("GET", f"/repos/{name}/packages")

    async def remove_repo_packages(self, name: str, refs: list[str]):
        # aptly removes packages by reference key via DELETE /repos/:name/packages
        # with body {"PackageRefs": [...]}. The repo must be re-snapshotted and
        # re-published for the removal to reach apt clients.
        return await self._request("DELETE", f"/repos/{name}/packages", json={"PackageRefs": refs})

    # --- Snapshots ---
    async def list_snapshots(self):
        return await self._request("GET", "/snapshots")

    async def get_snapshot(self, name: str):
        return await self._request("GET", f"/snapshots/{name}")

    async def create_snapshot(self, data: dict):
        return await self._request("POST", "/snapshots", json=data)

    async def create_snapshot_from_mirror(self, mirror: str, data: dict):
        return await self._request("POST", f"/mirrors/{mirror}/snapshots", json=data)

    async def create_snapshot_from_repo(self, repo: str, data: dict):
        return await self._request("POST", f"/repos/{repo}/snapshots", json=data)

    async def delete_snapshot(self, name: str, force: bool = False):
        await self._request("DELETE", f"/snapshots/{name}", params={"force": "1" if force else "0"})
        return {"message": "Snapshot deleted"}

    async def diff_snapshots(self, name: str, other: str):
        return await self._request("GET", f"/snapshots/{name}/diff/{other}")

    async def list_snapshot_packages(self, name: str):
        return await self._request("GET", f"/snapshots/{name}/packages")

    # --- Publish ---
    async def list_publish(self):
        return await self._request("GET", "/publish")

    async def publish_snapshot(self, prefix: str, data: dict):
        prefix = _clean_prefix(prefix)
        url = f"/publish/{prefix}" if prefix else "/publish"
        return await self._request("POST", url, json=data)

    async def update_publish(self, prefix: str, distribution: str, data: dict):
        # aptly's PUT route is always 3-segment /publish/:prefix/:distribution;
        # the root prefix must be passed as ":." (a bare "." is ambiguous in a
        # URL), never as an omitted segment.
        prefix_seg = _clean_prefix(prefix) or ":."
        return await self._request("PUT", f"/publish/{prefix_seg}/{distribution}", json=data)

    async def delete_publish(self, prefix: str, distribution: str, force: bool = False):
        prefix_seg = _clean_prefix(prefix) or ":."
        await self._request(
            "DELETE", f"/publish/{prefix_seg}/{distribution}", params={"force": "1" if force else "0"}
        )
        return {"message": "Unpublished"}

    # --- Packages ---
    async def get_package(self, key: str):
        return await self._request("GET", f"/packages/{key}")

    # --- Tasks ---
    async def list_tasks(self):
        return await self._request("GET", "/tasks")

    async def get_task(self, task_id: str):
        return await self._request("GET", f"/tasks/{task_id}")

    async def get_task_output(self, task_id: str) -> str:
        out = await self._request("GET", f"/tasks/{task_id}/output")
        return out if isinstance(out, str) else out.decode("utf-8", "replace")

    async def delete_task(self, task_id: str):
        return await self._request("DELETE", f"/tasks/{task_id}")

    async def wait_for_task(
        self, task_id: str, poll_interval: float = 2.0, timeout: float = 3600.0
    ) -> dict:
        """Poll a task until it reaches a terminal state (succeeded/failed).

        Polling short requests is more robust than blocking on aptly's
        /tasks/:id/wait for the full duration of a large sync (which can trip
        reverse-proxy read timeouts). Returns the final task object.
        """
        deadline = time.monotonic() + timeout if timeout else None
        while True:
            task = await self.get_task(task_id)
            if task.get("State") in _TASK_TERMINAL:
                return task
            if deadline and time.monotonic() > deadline:
                raise AptlyError(f"Timed out waiting for aptly task {task_id}", 504)
            await asyncio.sleep(poll_interval)

    # --- Files ---
    async def upload_files(self, files: list[tuple[str, bytes, str]], temp_dir: str | None = None):
        temp_dir = _sanitize_dir(temp_dir) or "upload"
        files_data = [("file", (fn, content, ct)) for fn, content, ct in files]
        return await self._request("POST", f"/files/{temp_dir}", files=files_data)

    async def add_packages_to_repo(self, name: str, temp_dir: str, force_replace: bool = False):
        temp_dir = _sanitize_dir(temp_dir)
        params = {"forceReplace": "1"} if force_replace else {}
        return await self._request("POST", f"/repos/{name}/file/{temp_dir}", params=params)

    # --- Graph ---
    async def get_graph(self) -> bytes:
        return await self._request("GET", "/graph.svg")


class GPGManager:
    """Manage the signing keyring via the local ``gpg`` binary."""

    def list_keys(self) -> list[dict[str, Any]]:
        try:
            proc = subprocess.run(
                ["gpg", "--batch", "--yes", "--list-secret-keys", "--with-colons", "--fingerprint"],
                capture_output=True, text=True, timeout=10,
            )
        except Exception:
            return []
        if proc.returncode != 0:
            return []

        keys, current = [], None
        for line in proc.stdout.splitlines():
            parts = line.split(":")
            if line.startswith("sec:"):
                if current and current.get("fingerprint"):
                    keys.append(current)
                current = {"keyId": parts[4] if len(parts) > 4 else "", "name": "", "fingerprint": ""}
            elif line.startswith("fpr:") and current:
                current["fingerprint"] = parts[9] if len(parts) > 9 else ""
            elif line.startswith("uid:") and current:
                current["name"] = parts[9] if len(parts) > 9 else ""
        if current and current.get("fingerprint"):
            keys.append(current)

        result, seen = [], set()
        for k in keys:
            fp = k.get("fingerprint", "")
            if not fp or fp in seen:
                continue
            seen.add(fp)
            short_id = k.get("keyId") or fp[-16:]
            result.append({
                "id": short_id,
                "fingerprint": fp,
                "name": k.get("name", ""),
                "display": f"{k.get('name') or 'Unknown'} ({short_id})",
            })
        return result

    def generate_key(self, name: str, email: str, key_length: int = 4096) -> dict[str, Any]:
        # Generate an unprotected RSA signing key in the keyring so aptly can
        # sign publications non-interactively. %no-protection is required: aptly
        # signs in batch mode and cannot supply a passphrase.
        name = name.strip() or "Aptly Repository"
        email = email.strip()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            raise ValueError("A valid email address is required")
        if key_length not in (2048, 4096):
            key_length = 4096
        batch = (
            "Key-Type: RSA\n"
            f"Key-Length: {key_length}\n"
            f"Name-Real: {name}\n"
            f"Name-Email: {email}\n"
            "Expire-Date: 0\n"
            "%no-protection\n"
            "%commit\n"
        )
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".batch") as tmp:
            tmp.write(batch)
            tmp_path = tmp.name
        try:
            proc = subprocess.run(
                ["gpg", "--batch", "--generate-key", tmp_path],
                capture_output=True, text=True, timeout=180,
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr or "Key generation failed")
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        return {"generated": email, "keys": self.list_keys()}

    def import_key(self, file_content: bytes, filename: str) -> dict[str, Any]:
        suffix = os.path.splitext(filename)[1] or ".asc"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_content)
            tmp_path = tmp.name
        try:
            proc = subprocess.run(
                ["gpg", "--batch", "--yes", "--import", tmp_path],
                capture_output=True, text=True, timeout=30,
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr or "Import failed")
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        return {"imported": [filename], "keys": self.list_keys()}

    def delete_key(self, fingerprint: str) -> dict[str, Any]:
        if not _valid_fingerprint(fingerprint):
            raise ValueError("Invalid fingerprint format")
        for args in (["--delete-secret-keys", fingerprint], ["--delete-keys", fingerprint]):
            proc = subprocess.run(
                ["gpg", "--batch", "--yes", *args], capture_output=True, text=True, timeout=30
            )
            if proc.returncode != 0 and "delete-keys" in args[0]:
                raise RuntimeError(proc.stderr or "Delete failed")
        return {"deleted": fingerprint, "keys": self.list_keys()}

    def export_public_keys(self, dest_path: str) -> bool:
        """Export the armored public half of every signing key to ``dest_path``
        so apt clients can import it (the bundled nginx serves it at
        /gpg/public.key). Concatenating all keys means whichever one signed a
        given publication, the client has it. Returns True if a file was written.
        """
        if not dest_path:
            return False
        parent = os.path.dirname(dest_path) or "."
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError:
            return False
        fingerprints = [k["fingerprint"] for k in self.list_keys() if k.get("fingerprint")]
        if not fingerprints:
            # No signing keys left — drop any stale export so clients don't pin
            # to a key that no longer exists.
            if os.path.exists(dest_path):
                try:
                    os.unlink(dest_path)
                except OSError:
                    pass
            return False
        proc = subprocess.run(
            ["gpg", "--batch", "--yes", "--armor", "--export", *fingerprints],
            capture_output=True, timeout=30,
        )
        if proc.returncode != 0 or not proc.stdout:
            return False
        tmp_path = f"{dest_path}.tmp"
        with open(tmp_path, "wb") as fh:
            fh.write(proc.stdout)
        os.replace(tmp_path, dest_path)
        os.chmod(dest_path, 0o644)
        return True


gpg_manager = GPGManager()
