"""Smoke tests for auth, RBAC, and audit logging.

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


def test_health_and_login_and_rbac():
    with TestClient(app) as c:
        assert c.get("/api/health").json()["status"] == "ok"

        admin = _auth(c, "admin", "admin")
        assert c.get("/api/auth/me", headers=admin).json()["role"] == "admin"

        # Unauthenticated is rejected.
        assert c.get("/api/mirrors").status_code == 401

        # Create an operator and a viewer.
        assert c.post("/api/users", headers=admin,
                      json={"username": "op", "password": "Passw0rd!", "role": "operator"}).status_code == 201
        assert c.post("/api/users", headers=admin,
                      json={"username": "vw", "password": "Passw0rd!", "role": "viewer"}).status_code == 201

        viewer = _auth(c, "vw", "Passw0rd!")
        # Viewer may read but not mutate or reach admin endpoints.
        assert c.post("/api/mirrors", headers=viewer, json={"Name": "x"}).status_code == 403
        assert c.get("/api/users", headers=viewer).status_code == 403

        operator = _auth(c, "op", "Passw0rd!")
        assert c.get("/api/users", headers=operator).status_code == 403  # still not admin

        # Cron validation on schedules.
        assert c.post("/api/schedules", headers=operator,
                      json={"name": "s", "mirror": "m", "cron": "bad"}).status_code == 400
        assert c.post("/api/schedules", headers=operator,
                      json={"name": "s", "mirror": "m", "cron": "0 3 * * *"}).status_code == 201

        # Audit log captured the actions (admin-only view).
        entries = c.get("/api/audit", headers=admin).json()
        actions = {e["action"] for e in entries}
        assert "login" in actions and "create_user" in actions

        # Weak passwords are rejected.
        weak = c.post("/api/users", headers=admin,
                      json={"username": "weak", "password": "abc", "role": "viewer"})
        assert weak.status_code == 400
