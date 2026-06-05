"""Aptly API client service."""

import os
import re
import subprocess
import tempfile
from typing import Any

import httpx
import structlog

from aptly_webui.core.config import settings

logger = structlog.get_logger(__name__)


class AptlyClient:
    """HTTP client for Aptly REST API."""

    def __init__(self, base_url: str | None = None, timeout: int = 60):
        """Initialize Aptly client.

        Args:
            base_url: Aptly API base URL (defaults to settings.APTLY_API_URL)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url or settings.aptly_api_url
        if not self.base_url.endswith("/api"):
            self.base_url = f"{self.base_url.rstrip('/')}/api"
        self.timeout = timeout
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            follow_redirects=True,
        )

    async def close(self) -> None:
        """Close HTTP client."""
        await self.client.aclose()

    def _clean_prefix(self, prefix: str) -> str:
        """Clean prefix for URL."""
        if prefix == "_empty_" or prefix == ".":
            return ""
        return prefix

    def _sanitize_dir(self, d: str | None) -> str:
        """Sanitize directory name to prevent path traversal."""
        if not d:
            return ""
        # Strip any dots, slashes, backslashes
        d = re.sub(r"[.\\/]+", "", d)
        if not re.match(r"^[A-Za-z0-9_-]+$", d):
            return ""
        return d

    def _valid_fingerprint(self, fp: str) -> bool:
        """Validate a 40-char hex GPG fingerprint."""
        return bool(re.match(r"^[A-F0-9]{40}$", fp))

    # ---------------------------------------------------------------------------
    # Mirrors
    # ---------------------------------------------------------------------------

    async def list_mirrors(self) -> list[dict[str, Any]]:
        """List all mirrors."""
        response = await self.client.get("/mirrors")
        response.raise_for_status()
        return response.json()

    async def get_mirror(self, name: str) -> dict[str, Any]:
        """Get mirror details."""
        response = await self.client.get(f"/mirrors/{name}")
        response.raise_for_status()
        return response.json()

    async def create_mirror(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new mirror."""
        response = await self.client.post("/mirrors", json=data)
        response.raise_for_status()
        return response.json()

    async def update_mirror(self, name: str, data: dict[str, Any]) -> dict[str, Any]:
        """Update mirror configuration."""
        response = await self.client.put(f"/mirrors/{name}", json=data)
        response.raise_for_status()
        return response.json()

    async def delete_mirror(self, name: str, force: bool = False) -> dict[str, Any]:
        """Delete a mirror."""
        params = {"force": "1" if force else "0"}
        response = await self.client.delete(f"/mirrors/{name}", params=params)
        response.raise_for_status()
        return {"message": "Mirror deleted"}

    async def update_mirror_packages(
        self, name: str, data: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Trigger mirror update (sync packages)."""
        data = data or {}
        response = await self.client.post(f"/mirrors/{name}/update", json=data)
        response.raise_for_status()
        return response.json()

    # ---------------------------------------------------------------------------
    # Local Repos
    # ---------------------------------------------------------------------------

    async def list_repos(self) -> list[dict[str, Any]]:
        """List all local repositories."""
        response = await self.client.get("/repos")
        response.raise_for_status()
        return response.json()

    async def create_repo(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new local repository."""
        response = await self.client.post("/repos", json=data)
        response.raise_for_status()
        return response.json()

    async def delete_repo(self, name: str) -> dict[str, Any]:
        """Delete a local repository."""
        response = await self.client.delete(f"/repos/{name}")
        response.raise_for_status()
        return {"message": "Repository deleted"}

    # ---------------------------------------------------------------------------
    # Snapshots
    # ---------------------------------------------------------------------------

    async def list_snapshots(self) -> list[dict[str, Any]]:
        """List all snapshots."""
        response = await self.client.get("/snapshots")
        response.raise_for_status()
        return response.json()

    async def get_snapshot(self, name: str) -> dict[str, Any]:
        """Get snapshot details."""
        response = await self.client.get(f"/snapshots/{name}")
        response.raise_for_status()
        return response.json()

    async def create_snapshot(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new snapshot."""
        response = await self.client.post("/snapshots", json=data)
        response.raise_for_status()
        return response.json()

    async def create_snapshot_from_mirror(
        self, mirror_name: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        """Create snapshot from mirror."""
        response = await self.client.post(f"/mirrors/{mirror_name}/snapshots", json=data)
        response.raise_for_status()
        return response.json()

    async def create_snapshot_from_repo(
        self, repo_name: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        """Create snapshot from local repo."""
        response = await self.client.post(f"/repos/{repo_name}/snapshots", json=data)
        response.raise_for_status()
        return response.json()

    async def delete_snapshot(self, name: str, force: bool = False) -> dict[str, Any]:
        """Delete a snapshot."""
        params = {"force": "1" if force else "0"}
        response = await self.client.delete(f"/snapshots/{name}", params=params)
        response.raise_for_status()
        return {"message": "Snapshot deleted"}

    async def diff_snapshots(self, name: str, other: str) -> dict[str, Any]:
        """Compare two snapshots."""
        response = await self.client.get(f"/snapshots/{name}/diff/{other}")
        response.raise_for_status()
        return response.json()

    # ---------------------------------------------------------------------------
    # Publish
    # ---------------------------------------------------------------------------

    async def list_publish(self) -> list[dict[str, Any]]:
        """List all published repositories."""
        response = await self.client.get("/publish")
        response.raise_for_status()
        return response.json()

    async def publish_snapshot(self, prefix: str, data: dict[str, Any]) -> dict[str, Any]:
        """Publish a snapshot."""
        prefix = self._clean_prefix(prefix)
        url = f"/publish/{prefix}" if prefix else "/publish"
        response = await self.client.post(url, json=data)
        response.raise_for_status()
        return response.json()

    async def switch_publish(
        self, prefix: str, distribution: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        """Switch published snapshot."""
        prefix = self._clean_prefix(prefix)
        url = f"/publish/{prefix}/{distribution}" if prefix else f"/publish/{distribution}"
        response = await self.client.put(url, json=data)
        response.raise_for_status()
        return response.json()

    async def update_publish(
        self, prefix: str, distribution: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        """Update published repository."""
        prefix = self._clean_prefix(prefix)
        url = f"/publish/{prefix}/{distribution}" if prefix else f"/publish/{distribution}"
        response = await self.client.put(url, json=data)
        response.raise_for_status()
        return response.json()

    async def delete_publish(
        self, prefix: str, distribution: str, force: bool = False
    ) -> dict[str, Any]:
        """Unpublish a repository."""
        prefix = self._clean_prefix(prefix)
        params = {"force": "1" if force else "0"}
        url = f"/publish/{prefix}/{distribution}" if prefix else f"/publish/{distribution}"
        response = await self.client.delete(url, params=params)
        response.raise_for_status()
        return {"message": "Published repository deleted"}

    # ---------------------------------------------------------------------------
    # Packages
    # ---------------------------------------------------------------------------

    async def list_repo_packages(self, name: str) -> list[str]:
        """List packages in a local repo."""
        response = await self.client.get(f"/repos/{name}/packages")
        response.raise_for_status()
        return response.json()

    async def list_mirror_packages(self, name: str) -> list[str]:
        """List packages in a mirror."""
        response = await self.client.get(f"/mirrors/{name}/packages")
        response.raise_for_status()
        return response.json()

    async def list_snapshot_packages(self, name: str) -> list[str]:
        """List packages in a snapshot."""
        response = await self.client.get(f"/snapshots/{name}/packages")
        response.raise_for_status()
        return response.json()

    # ---------------------------------------------------------------------------
    # Tasks
    # ---------------------------------------------------------------------------

    async def list_tasks(self) -> list[dict[str, Any]]:
        """List background tasks."""
        response = await self.client.get("/tasks")
        response.raise_for_status()
        return response.json()

    async def get_task(self, task_id: str) -> dict[str, Any]:
        """Get task status."""
        response = await self.client.get(f"/tasks/{task_id}")
        response.raise_for_status()
        return response.json()

    # ---------------------------------------------------------------------------
    # Files
    # ---------------------------------------------------------------------------

    async def upload_files(self, files: list[tuple[str, bytes, str]], temp_dir: str | None = None) -> dict[str, Any]:
        """Upload files to Aptly temp directory.

        Args:
            files: List of (filename, content, content_type) tuples
            temp_dir: Optional temp directory name

        Returns:
            Upload response from Aptly
        """
        temp_dir = temp_dir or "upload"
        temp_dir = self._sanitize_dir(temp_dir)

        files_data = []
        for filename, content, content_type in files:
            files_data.append(("file", (filename, content, content_type)))

        response = await self.client.post(
            f"/files/{temp_dir}",
            files=files_data,
        )
        response.raise_for_status()
        try:
            return response.json()
        except Exception:
            return {"message": response.text}

    async def add_packages_to_repo(
        self, name: str, temp_dir: str, force_replace: bool = False
    ) -> dict[str, Any]:
        """Add uploaded packages to a local repo."""
        temp_dir = self._sanitize_dir(temp_dir)
        payload = {}
        if force_replace:
            payload["ForceReplace"] = True

        response = await self.client.post(
            f"/repos/{name}/file/{temp_dir}",
            json=payload if payload else None,
        )
        response.raise_for_status()
        return response.json()

    # ---------------------------------------------------------------------------
    # Graph
    # ---------------------------------------------------------------------------

    async def get_graph(self) -> bytes:
        """Get repository graph as SVG."""
        response = await self.client.get("/graph.svg")
        response.raise_for_status()
        return response.content


class GPGManager:
    """GPG key management utilities."""

    def __init__(self):
        """Initialize GPG manager."""
        pass

    def list_keys(self) -> list[dict[str, Any]]:
        """List GPG keys."""
        try:
            proc = subprocess.run(
                [
                    "gpg",
                    "--batch",
                    "--yes",
                    "--list-secret-keys",
                    "--with-colons",
                    "--fingerprint",
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
        except Exception:
            return []

        if proc.returncode != 0:
            return []

        keys = []
        current: dict[str, str] | None = None

        for line in proc.stdout.splitlines():
            if line.startswith("sec:"):
                parts = line.split(":")
                key_id = parts[4] if len(parts) > 4 else ""
                if current and "fingerprint" in current:
                    keys.append(current)
                current = {"keyId": key_id, "name": "", "fingerprint": ""}
            elif line.startswith("fpr:"):
                parts = line.split(":")
                fp = parts[9] if len(parts) > 9 else ""
                if current:
                    current["fingerprint"] = fp
            elif line.startswith("uid:"):
                parts = line.split(":")
                uid = parts[9] if len(parts) > 9 else ""
                if current:
                    current["name"] = uid

        if current and "fingerprint" in current:
            keys.append(current)

        # Deduplicate and format
        result = []
        seen = set()
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
                "display": f"{k.get('name', 'Unknown')} ({short_id})",
            })

        return result

    def import_key(self, file_content: bytes, filename: str) -> dict[str, Any]:
        """Import GPG key from file."""
        suffix = os.path.splitext(filename)[1] or ".asc"
        imported = []

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_content)
            tmp.flush()
            tmp_path = tmp.name

        try:
            proc = subprocess.run(
                ["gpg", "--batch", "--yes", "--import", tmp_path],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr or "Import failed")
            imported.append(filename)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        return {"imported": imported, "keys": self.list_keys()}

    def delete_key(self, fingerprint: str) -> dict[str, Any]:
        """Delete GPG key."""
        if not self._valid_fingerprint(fingerprint):
            raise ValueError("Invalid fingerprint format")

        # Delete secret key first
        subprocess.run(
            ["gpg", "--batch", "--yes", "--delete-secret-keys", fingerprint],
            capture_output=True,
            text=True,
            timeout=30,
        )

        # Delete public key
        subprocess.run(
            ["gpg", "--batch", "--yes", "--delete-keys", fingerprint],
            capture_output=True,
            text=True,
            timeout=30,
        )

        return {"deleted": fingerprint, "keys": self.list_keys()}

    def _valid_fingerprint(self, fp: str) -> bool:
        """Validate a 40-char hex GPG fingerprint."""
        return bool(re.match(r"^[A-F0-9]{40}$", fp))
