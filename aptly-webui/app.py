import os
import re
import secrets
import json
import requests
import subprocess
import tempfile
import uuid
from functools import wraps
from flask import Flask, render_template, jsonify, request, session

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY') or secrets.token_urlsafe(32)

APTLY_API_URL = os.environ.get('APTLY_API_URL', 'http://localhost:8080/api')
AUTH_USER = os.environ.get('AUTH_USER')
AUTH_PASS = os.environ.get('AUTH_PASS')

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize_dir(d):
    """Sanitize aptly temp-upload directory name to prevent path traversal."""
    if not d:
        return d
    # Strip any dots, slashes, backslashes
    d = re.sub(r'[.\\/]+', '', d)
    if not re.match(r'^[A-Za-z0-9_-]+$', d):
        return ''
    return d


def _valid_fingerprint(fp):
    """Validate a 40-char hex GPG fingerprint."""
    return bool(re.match(r'^[A-F0-9]{40}$', fp))


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if AUTH_USER and AUTH_PASS:
            auth = request.authorization
            if not auth or auth.username != AUTH_USER or auth.password != AUTH_PASS:
                return jsonify({"error": "Unauthorized"}), 401, {
                    'WWW-Authenticate': 'Basic realm="Aptly WebUI"'
                }
        return f(*args, **kwargs)
    return decorated


def csrf_protect():
    """Verify CSRF token on all mutating requests."""
    if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
        token = session.get('csrf_token')
        header_token = request.headers.get('X-CSRFToken')
        if not token or token != header_token:
            return jsonify({"error": "CSRF token missing or invalid"}), 403


app.before_request(csrf_protect)


def aptly_request(method, endpoint, **kwargs):
    url = f"{APTLY_API_URL}{endpoint}"
    try:
        resp = requests.request(method, url, timeout=60, **kwargs)
        if resp.status_code in (200, 201, 202):
            try:
                return resp.json()
            except ValueError:
                return {"message": resp.text}
        elif resp.status_code == 204:
            return {"message": "Success (no content)"}
        else:
            try:
                data = resp.json()
            except ValueError:
                data = resp.text
            return {"error": data, "status": resp.status_code}
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "status": 500}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.route('/api/auth/verify')
@require_auth
def auth_verify():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_urlsafe(32)
    return jsonify({"csrf_token": session['csrf_token']})


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@app.route('/')
@require_auth
def index():
    return render_template('index.html')


# ---------------------------------------------------------------------------
# Mirrors
# ---------------------------------------------------------------------------

@app.route('/api/mirrors')
@require_auth
def list_mirrors():
    return jsonify(aptly_request('GET', '/mirrors'))


@app.route('/api/mirrors/<name>')
@require_auth
def get_mirror(name):
    return jsonify(aptly_request('GET', f'/mirrors/{name}'))


@app.route('/api/mirrors', methods=['POST'])
@require_auth
def create_mirror():
    data = request.get_json()
    name = data.get('Name')
    payload = {
        "Name": name,
        "ArchiveURL": data.get('ArchiveURL'),
        "Distribution": data.get('Distribution'),
        "Components": data.get('Components', []),
        "Architectures": data.get('Architectures', []),
        "Sources": data.get('Sources', False),
        "Filter": data.get('Filter', ''),
        "FilterWithDeps": data.get('FilterWithDeps', False),
        "DownloadUris": data.get('DownloadUris', False),
        "SkipComponentCheck": data.get('SkipComponentCheck', False)
    }
    if data.get('Keyrings'):
        payload['Keyrings'] = data['Keyrings']
    return jsonify(aptly_request('POST', '/mirrors', json=payload))


@app.route('/api/mirrors/<name>', methods=['PUT'])
@require_auth
def update_mirror(name):
    data = request.get_json()
    return jsonify(aptly_request('PUT', f'/mirrors/{name}', json=data))


@app.route('/api/mirrors/<name>/drop', methods=['DELETE'])
@require_auth
def drop_mirror(name):
    force = request.args.get('force', '0')
    return jsonify(aptly_request('DELETE', f'/mirrors/{name}?force={force}'))


@app.route('/api/mirrors/<name>/update', methods=['POST'])
@require_auth
def update_mirror_packages(name):
    data = request.get_json() or {}
    return jsonify(aptly_request('POST', f'/mirrors/{name}/update', json=data))


# ---------------------------------------------------------------------------
# Local repos
# ---------------------------------------------------------------------------

@app.route('/api/repos')
@require_auth
def list_repos():
    return jsonify(aptly_request('GET', '/repos'))


@app.route('/api/repos', methods=['POST'])
@require_auth
def create_repo():
    data = request.get_json()
    return jsonify(aptly_request('POST', '/repos', json=data))


@app.route('/api/repos/<name>', methods=['DELETE'])
@require_auth
def delete_repo(name):
    return jsonify(aptly_request('DELETE', f'/repos/{name}'))


# ---------------------------------------------------------------------------
# Upload files (to temp dir)
# ---------------------------------------------------------------------------

@app.route('/api/files', methods=['POST'])
@require_auth
def upload_files():
    temp_dir = _sanitize_dir(request.args.get('dir', '')) or ('tmp_' + uuid.uuid4().hex[:8])
    files = request.files.getlist('file')
    if not files:
        return jsonify({"error": "No files uploaded"}), 400
    upload_url = f"{APTLY_API_URL}/files/{temp_dir}"
    try:
        resp = requests.post(upload_url, files=[('file', (f.filename, f.stream, f.content_type)) for f in files], timeout=120)
        if resp.status_code in (200, 201):
            try:
                return jsonify(resp.json())
            except ValueError:
                return jsonify({"message": resp.text})
        else:
            try:
                return jsonify({"error": resp.json(), "status": resp.status_code})
            except ValueError:
                return jsonify({"error": resp.text, "status": resp.status_code})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e), "status": 500})


# ---------------------------------------------------------------------------
# Add uploaded file(s) to a repo
# ---------------------------------------------------------------------------

@app.route('/api/repos/<name>/add', methods=['POST'])
@require_auth
def add_packages_to_repo(name):
    data = request.get_json()
    file_refs = data.get('FileRefs', [])
    if not file_refs:
        return jsonify({"error": "No file references provided"}), 400
    temp_dir = file_refs[0].split('/')[0] if '/' in str(file_refs[0]) else ''
    temp_dir = _sanitize_dir(temp_dir)
    if not temp_dir:
        return jsonify({"error": "Invalid file reference format"}), 400
    payload = {}
    if data.get('ForceReplace'):
        payload['ForceReplace'] = True
    return jsonify(aptly_request('POST', f'/repos/{name}/file/{temp_dir}', json=payload))


# ---------------------------------------------------------------------------
# Snapshots
# ---------------------------------------------------------------------------

@app.route('/api/snapshots')
@require_auth
def list_snapshots():
    return jsonify(aptly_request('GET', '/snapshots'))


@app.route('/api/snapshots/<name>')
@require_auth
def get_snapshot(name):
    return jsonify(aptly_request('GET', f'/snapshots/{name}'))


@app.route('/api/snapshots/from-mirror/<name>', methods=['POST'])
@require_auth
def create_snapshot_from_mirror(name):
    data = request.get_json()
    return jsonify(aptly_request('POST', f'/mirrors/{name}/snapshots', json=data))


@app.route('/api/snapshots/from-repo/<name>', methods=['POST'])
@require_auth
def create_snapshot_from_repo(name):
    data = request.get_json()
    return jsonify(aptly_request('POST', f'/repos/{name}/snapshots', json=data))


@app.route('/api/snapshots', methods=['POST'])
@require_auth
def create_snapshot():
    data = request.get_json()
    return jsonify(aptly_request('POST', '/snapshots', json=data))


@app.route('/api/snapshots/<name>', methods=['DELETE'])
@require_auth
def delete_snapshot(name):
    force = request.args.get('force', '0')
    return jsonify(aptly_request('DELETE', f'/snapshots/{name}?force={force}'))


@app.route('/api/snapshots/<name>/diff/<other>')
@require_auth
def diff_snapshot(name, other):
    return jsonify(aptly_request('GET', f'/snapshots/{name}/diff/{other}'))


# ---------------------------------------------------------------------------
# Publish
# ---------------------------------------------------------------------------

@app.route('/api/publish')
@require_auth
def list_publish():
    return jsonify(aptly_request('GET', '/publish'))


@app.route('/api/publish/<prefix>', methods=['POST'])
@require_auth
def publish_snapshot(prefix):
    data = request.get_json()
    if prefix == '_empty_':
        prefix = ''
    return jsonify(aptly_request('POST', f'/publish/{prefix}', json=data))


@app.route('/api/publish/<prefix>/<distribution>', methods=['PATCH'])
@require_auth
def publish_switch(prefix, distribution):
    data = request.get_json()
    if prefix == '_empty_':
        prefix = ''
    return jsonify(aptly_request('PUT', f'/publish/{prefix}/{distribution}', json=data))


@app.route('/api/publish/<prefix>/<distribution>', methods=['PUT'])
@require_auth
def update_publish(prefix, distribution):
    data = request.get_json()
    if prefix == '_empty_':
        prefix = ''
    return jsonify(aptly_request('PUT', f'/publish/{prefix}/{distribution}', json=data))


@app.route('/api/publish/<prefix>/<distribution>', methods=['DELETE'])
@require_auth
def delete_publish(prefix, distribution):
    if prefix == '_empty_':
        prefix = ''
    force = request.args.get('force', '0')
    return jsonify(aptly_request('DELETE', f'/publish/{prefix}/{distribution}?force={force}'))


# ---------------------------------------------------------------------------
# Packages
# ---------------------------------------------------------------------------

@app.route('/api/repos/<name>/packages')
@require_auth
def list_repo_packages(name):
    return jsonify(aptly_request('GET', f'/repos/{name}/packages'))


@app.route('/api/mirrors/<name>/packages')
@require_auth
def list_mirror_packages(name):
    return jsonify(aptly_request('GET', f'/mirrors/{name}/packages'))


@app.route('/api/snapshots/<name>/packages')
@require_auth
def list_snapshot_packages(name):
    return jsonify(aptly_request('GET', f'/snapshots/{name}/packages'))


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

@app.route('/api/tasks')
@require_auth
def list_tasks():
    return jsonify(aptly_request('GET', '/tasks'))


@app.route('/api/tasks/<task_id>')
@require_auth
def get_task(task_id):
    return jsonify(aptly_request('GET', f'/tasks/{task_id}'))


# ---------------------------------------------------------------------------
# GPG Key management
# ---------------------------------------------------------------------------

@app.route('/api/gpg/keys', methods=['GET'])
@require_auth
def list_gpg_keys():
    return jsonify(_parse_gpg_keys())


@app.route('/api/gpg/keys', methods=['POST'])
@require_auth
def import_gpg_key():
    files = request.files.getlist('file')
    if not files:
        return jsonify({"error": "No key file uploaded"}), 400
    imported = []
    for f in files:
        suffix = os.path.splitext(f.filename)[1] or '.asc'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            f.save(tmp.name)
            try:
                proc = subprocess.run(
                    ['gpg', '--batch', '--yes', '--import', tmp.name],
                    capture_output=True, text=True, timeout=30
                )
                if proc.returncode != 0:
                    os.unlink(tmp.name)
                    return jsonify({"error": proc.stderr or "Import failed"}), 400
                imported.append(f.filename)
            finally:
                if os.path.exists(tmp.name):
                    os.unlink(tmp.name)
    return jsonify({"imported": imported, "keys": _parse_gpg_keys()})


@app.route('/api/gpg/keys/<fingerprint>', methods=['DELETE'])
@require_auth
def delete_gpg_key(fingerprint):
    if not _valid_fingerprint(fingerprint):
        return jsonify({"error": "Invalid fingerprint format"}), 400
    proc1 = subprocess.run(
        ['gpg', '--batch', '--yes', '--delete-secret-keys', fingerprint],
        capture_output=True, text=True, timeout=30
    )
    proc2 = subprocess.run(
        ['gpg', '--batch', '--yes', '--delete-keys', fingerprint],
        capture_output=True, text=True, timeout=30
    )
    return jsonify({"deleted": fingerprint, "keys": _parse_gpg_keys()})


def _parse_gpg_keys():
    """Returns list of dicts with id (short keyid), fingerprint, name"""
    try:
        proc = subprocess.run(
            ['gpg', '--batch', '--yes', '--list-secret-keys', '--with-colons', '--fingerprint'],
            capture_output=True, text=True, timeout=10
        )
    except Exception:
        return []
    if proc.returncode != 0:
        return []
    keys = []
    current = None
    for line in proc.stdout.splitlines():
        if line.startswith('sec:'):
            parts = line.split(':')
            key_id = parts[4] if len(parts) > 4 else ''
            if current and 'fingerprint' in current:
                keys.append(current)
            current = {'keyId': key_id, 'name': '', 'fingerprint': ''}
        elif line.startswith('fpr:'):
            parts = line.split(':')
            fp = parts[9] if len(parts) > 9 else ''
            if current:
                current['fingerprint'] = fp
        elif line.startswith('uid:'):
            parts = line.split(':')
            uid = parts[9] if len(parts) > 9 else ''
            if current:
                current['name'] = uid
    if current and 'fingerprint' in current:
        keys.append(current)
    result = []
    seen = set()
    for k in keys:
        fp = k.get('fingerprint', '')
        if not fp or fp in seen:
            continue
        seen.add(fp)
        short_id = k.get('keyId') or fp[-16:]
        result.append({
            'id': short_id,
            'fingerprint': fp,
            'name': k.get('name', ''),
            'display': f"{k.get('name', 'Unknown')} ({short_id})"
        })
    return result


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

@app.route('/api/graph')
@require_auth
def get_graph():
    resp = requests.get(f"{APTLY_API_URL}/graph.svg", timeout=30)
    if resp.status_code == 200:
        return resp.content, 200, {'Content-Type': 'image/svg+xml'}
    return jsonify({"error": "Failed to get graph"}), resp.status_code


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() in ('1', 'true', 'yes')
    app.run(host='0.0.0.0', port=5000, debug=debug_mode)
