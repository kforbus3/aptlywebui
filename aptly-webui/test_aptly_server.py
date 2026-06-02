#!/usr/bin/env python3
"""
Mock Aptly REST API server for testing performance.
Simulates the user's environment with:
- 24 mirrors
- 6229 snapshots
- 2 published repos
"""

import json
import random
from datetime import datetime, timedelta
from flask import Flask, jsonify

app = Flask(__name__)

# Generate test data
MIRRORS = []
SNAPSHOTS = []
PUBLISHED = []

def generate_test_data():
    """Generate realistic test data"""
    print("Generating test data...")

    # 24 mirrors
    mirror_names = [
        "bookworm-security-non-free-firmware",
        "bookworm-non-free-firmware",
        "trixie-updates-contrib",
        "trixie-contrib",
        "bookworm-updates-contrib",
        "trixie-non-free-firmware",
        "bookworm-updates-non-free",
        "trixie-security-contrib",
        "bookworm-updates-main",
        "trixie-security-non-free-firmware",
        "trixie-updates-main",
        "trixie-non-free",
        "bookworm-security-main",
        "bookworm-contrib",
        "bookworm-main",
        "bookworm-security-non-free",
        "trixie-security-main",
        "trixie-security-non-free",
        "bookworm-updates-non-free-firmware",
        "trixie-updates-non-free-firmware",
        "trixie-main",
        "trixie-updates-non-free",
        "bookworm-security-contrib",
        "bookworm-non-free",
    ]

    for name in mirror_names:
        MIRRORS.append({
            "Name": name,
            "UUID": f"uuid-{random.randint(1000,9999)}",
            "ArchiveRoot": "http://deb.debian.org/debian/",
            "Distribution": name.split("-")[0] if "-" in name else "bookworm",
            "Components": ["main", "contrib", "non-free"],
            "Architectures": ["amd64", "arm64"],
            "Meta": {"Acquire-By-Hash": "yes"}
        })

    # 6229 snapshots - simulating daily snapshots over years
    print("Generating 6229 snapshots...")
    base_date = datetime(2023, 1, 1)
    for i in range(6229):
        date = base_date + timedelta(days=i)
        name = f"merged_main_{date.strftime('%Y%m%d')}0200"
        SNAPSHOTS.append({
            "Name": name,
            "CreatedAt": date.isoformat(),
            "Description": f"Snapshot from {date.strftime('%Y-%m-%d')}"
        })

    # 2 published repos
    PUBLISHED.extend([
        {
            "Prefix": ".",
            "Distribution": "bookworm",
            "Sources": [{"Name": SNAPSHOTS[-1]["Name"], "Component": "main"}]
        },
        {
            "Prefix": ".",
            "Distribution": "trixie",
            "Sources": [{"Name": SNAPSHOTS[-2]["Name"], "Component": "main"}]
        }
    ])

    print(f"Generated: {len(MIRRORS)} mirrors, {len(SNAPSHOTS)} snapshots, {len(PUBLISHED)} published")

generate_test_data()

@app.route('/api/mirrors')
def get_mirrors():
    """Return list of mirrors (no package count in list)"""
    return jsonify(MIRRORS)

@app.route('/api/mirrors/<name>')
def get_mirror_detail(name):
    """Return mirror details with package count"""
    for mirror in MIRRORS:
        if mirror["Name"] == name:
            # Add package count to detail
            detail = mirror.copy()
            detail["PackageCount"] = random.randint(50000, 150000)
            detail["DownloadSize"] = f"{random.randint(10, 100)} GiB"
            return jsonify(detail)
    return jsonify({"error": "not found"}), 404

@app.route('/api/snapshots')
def get_snapshots():
    """Return list of snapshots"""
    return jsonify(SNAPSHOTS)

@app.route('/api/snapshots/<name>')
def get_snapshot_detail(name):
    """Return snapshot with packages"""
    for snap in SNAPSHOTS:
        if snap["Name"] == name:
            detail = snap.copy()
            # Simulate package list
            detail["Packages"] = [f"package_{i}_1.0_amd64" for i in range(random.randint(1000, 5000))]
            return jsonify(detail)
    return jsonify({"error": "not found"}), 404

@app.route('/api/publish')
def get_published():
    """Return published repos"""
    return jsonify(PUBLISHED)

@app.route('/api/publish/<prefix>/<distribution>')
def get_published_detail(prefix, distribution):
    """Return published repo details"""
    for pub in PUBLISHED:
        if pub["Distribution"] == distribution:
            detail = pub.copy()
            detail["Storage"] = ""
            detail["SourceKind"] = "snapshot"
            return jsonify(detail)
    return jsonify({"error": "not found"}), 404

@app.route('/api/version')
def get_version():
    return jsonify({"Version": "1.6.0"})

if __name__ == '__main__':
    print("Starting mock aptly API server on port 6000...")
    app.run(host='0.0.0.0', port=6000, debug=False)
