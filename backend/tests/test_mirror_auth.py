"""Tests for mirror auth-token embedding and credential redaction.

These cover the Ubuntu Pro (ESM/FIPS) support: an auth token is spliced into the
archive URL as HTTP basic auth, and credentials are stripped from any mirror data
returned to the UI/API.

Run with:  DATA_DIR=/tmp/t SECRET_KEY=test pytest -q tests/test_mirror_auth.py
"""

import os
import tempfile

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())
os.environ.setdefault("SECRET_KEY", "test-secret")

from app.aptly import (  # noqa: E402
    _redact_mirror,
    _strip_userinfo,
    _with_basic_auth,
)


def test_basic_auth_default_bearer_user():
    out = _with_basic_auth("https://esm.ubuntu.com/apps/ubuntu", "bearer", "tok123")
    assert out == "https://bearer:tok123@esm.ubuntu.com/apps/ubuntu"


def test_basic_auth_percent_encodes_reserved_chars():
    # Pro tokens can contain +, /, = and other reserved characters.
    out = _with_basic_auth("https://esm.ubuntu.com/infra/ubuntu", "bearer", "a+b/c=d@e")
    assert "a%2Bb%2Fc%3Dd%40e" in out
    # The real host must remain intact and be the authority, not the token.
    assert out.endswith("@esm.ubuntu.com/infra/ubuntu")


def test_basic_auth_preserves_port_and_path():
    out = _with_basic_auth("https://host.example:8443/debian", "bearer", "t")
    assert out == "https://bearer:t@host.example:8443/debian"


def test_basic_auth_leaves_malformed_url_untouched():
    assert _with_basic_auth("not-a-url", "bearer", "t") == "not-a-url"


def test_strip_userinfo_removes_credentials():
    assert (
        _strip_userinfo("https://bearer:secret@esm.ubuntu.com/apps/ubuntu")
        == "https://esm.ubuntu.com/apps/ubuntu"
    )


def test_strip_userinfo_noop_without_credentials():
    url = "http://deb.debian.org/debian"
    assert _strip_userinfo(url) == url


def test_strip_userinfo_keeps_at_in_path_only():
    # An '@' that is not userinfo (e.g. in a path) must not trigger mangling.
    url = "http://deb.debian.org/debian/pool/@weird"
    assert _strip_userinfo(url) == url


def test_redact_mirror_list_and_dict():
    mirrors = [
        {"Name": "esm", "ArchiveRoot": "https://bearer:tok@esm.ubuntu.com/apps/ubuntu"},
        {"Name": "deb", "ArchiveRoot": "http://deb.debian.org/debian"},
    ]
    out = _redact_mirror(mirrors)
    assert out[0]["ArchiveRoot"] == "https://esm.ubuntu.com/apps/ubuntu"
    assert "tok" not in out[0]["ArchiveRoot"]
    assert out[1]["ArchiveRoot"] == "http://deb.debian.org/debian"


def test_redact_mirror_handles_archiveurl_field():
    out = _redact_mirror({"ArchiveURL": "https://u:p@host/x"})
    assert out["ArchiveURL"] == "https://host/x"
