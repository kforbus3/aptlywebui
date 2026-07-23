"""Regression tests for the security and correctness fixes.

Run with:  DATA_DIR=/tmp/t SECRET_KEY=test pytest -q
(aptly is not required; aptly-dependent endpoints are expected to return 503.)
"""

import os
import tempfile

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())
os.environ.setdefault("SECRET_KEY", "test-secret")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def _auth(client, username, password):
    r = client.post("/api/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_spa_path_traversal_is_blocked(tmp_path, monkeypatch):
    """Percent-encoded traversal in the SPA fallback must not read files
    outside STATIC_DIR."""
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>SPA</html>")
    secret = tmp_path / "secret.txt"
    secret.write_text("TOP-SECRET-HASHES")

    # Point the SPA handler at our temp static dir.
    import app.main as m
    monkeypatch.setattr(m, "STATIC_DIR", str(static))
    monkeypatch.setattr(m, "_STATIC_ROOT", os.path.realpath(str(static)))

    with TestClient(app) as c:
        # A legit asset still serves.
        assert c.get("/index.html").text == "<html>SPA</html>"
        # Traversal attempts fall back to index.html, never the secret.
        for attack in ("/..%2fsecret.txt", "/%2e%2e%2fsecret.txt", "/a/..%2f..%2fsecret.txt"):
            r = c.get(attack)
            assert "TOP-SECRET-HASHES" not in r.text, attack


def test_last_admin_cannot_be_demoted():
    """Changing the sole admin's role away from admin must be rejected."""
    with TestClient(app) as c:
        admin = _auth(c, "admin", "admin")
        me = c.get("/api/auth/me", headers=admin).json()
        r = c.patch(f"/api/users/{me['id']}", headers=admin, json={"role": "viewer"})
        assert r.status_code == 400, r.text
        # Still an admin.
        assert c.get("/api/auth/me", headers=admin).json()["role"] == "admin"


def test_backup_endpoints_are_admin_only():
    """Operators must not be able to create/list/download backups (they contain
    the user database with password hashes)."""
    with TestClient(app) as c:
        admin = _auth(c, "admin", "admin")
        c.post("/api/users", headers=admin,
               json={"username": "op2", "password": "Passw0rd!", "role": "operator"})
        operator = _auth(c, "op2", "Passw0rd!")
        assert c.get("/api/backup", headers=operator).status_code == 403
        assert c.post("/api/backup", headers=operator).status_code == 403
        assert c.get("/api/backup/x/download", headers=operator).status_code == 403


def test_run_disabled_schedule_is_rejected():
    """Running a disabled schedule must 409 rather than falsely report success."""
    with TestClient(app) as c:
        admin = _auth(c, "admin", "admin")
        r = c.post("/api/schedules", headers=admin,
                   json={"name": "disabled-one", "mirror": "m", "cron": "0 3 * * *", "enabled": False})
        assert r.status_code == 201, r.text
        sid = r.json()["id"]
        run = c.post(f"/api/schedules/{sid}/run", headers=admin)
        assert run.status_code == 409, run.text
