#!/usr/bin/env python3
"""
Aptly Web UI - SQLite Cache Layer
Provides fast caching and FTS search for large aptly installations.
"""

import json
import logging
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


class AptlyCache:
    """SQLite-based cache for aptly data with FTS search"""

    def __init__(self, db_path: str = "/tmp/aptly_cache.db"):
        self.db_path = db_path
        self._local = threading.local()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Get thread-local database connection"""
        if not hasattr(self._local, 'connection'):
            self._local.connection = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                timeout=30.0
            )
            self._local.connection.row_factory = sqlite3.Row
        return self._local.connection

    def _init_db(self):
        """Initialize database schema"""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Migration: Check if we have old contentless FTS table and migrate
        try:
            cursor.execute("SELECT sql FROM sqlite_master WHERE name='packages_fts'")
            row = cursor.fetchone()
            if row and "content=''" in row[0]:
                logger.info("Migrating from contentless FTS to external content FTS")
                cursor.execute("DROP TABLE IF EXISTS packages_fts")
                cursor.execute("DROP TABLE IF EXISTS packages")
        except Exception as e:
            logger.debug(f"Migration check error: {e}")

        # Mirrors table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS mirrors (
                name TEXT PRIMARY KEY,
                archive_root TEXT,
                distribution TEXT,
                components TEXT,
                architectures TEXT,
                last_updated TEXT,
                package_count INTEGER,
                download_size TEXT,
                filter TEXT,
                filter_with_deps BOOLEAN DEFAULT 0,
                skip_component_check BOOLEAN DEFAULT 0,
                is_esm BOOLEAN DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Snapshots table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS snapshots (
                name TEXT PRIMARY KEY,
                created_at TEXT,
                description TEXT,
                package_count INTEGER DEFAULT 0,
                sources TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Published repos table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS published (
                id TEXT PRIMARY KEY,
                prefix TEXT,
                distribution TEXT,
                storage TEXT,
                architectures TEXT,
                source_kind TEXT,
                sources TEXT,
                label TEXT,
                origin TEXT,
                acquire_by_hash BOOLEAN DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Packages table for storing actual data
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS packages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                package_name TEXT,
                version TEXT,
                architecture TEXT,
                source_name TEXT,
                source_type TEXT,
                UNIQUE(package_name, version, architecture, source_name, source_type)
            )
        """)

        # FTS5 virtual table for package search (external content table)
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS packages_fts USING fts5(
                package_name,
                version,
                architecture,
                source_name,
                source_type,
                content='packages',
                content_rowid='id'
            )
        """)

        # Trigger to keep FTS index in sync
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS packages_ai AFTER INSERT ON packages BEGIN
                INSERT INTO packages_fts(rowid, package_name, version, architecture, source_name, source_type)
                VALUES (new.id, new.package_name, new.version, new.architecture, new.source_name, new.source_type);
            END
        """)

        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS packages_ad AFTER DELETE ON packages BEGIN
                INSERT INTO packages_fts(packages_fts, rowid, package_name, version, architecture, source_name, source_type)
                VALUES ('delete', old.id, old.package_name, old.version, old.architecture, old.source_name, old.source_type);
            END
        """)

        # Sync state tracking
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sync_state (
                entity_type TEXT PRIMARY KEY,
                last_sync TIMESTAMP,
                record_count INTEGER DEFAULT 0,
                sync_duration_ms INTEGER DEFAULT 0
            )
        """)

        # Stats materialized view (actually a regular table updated by triggers/sync)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS stats_cache (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                total_mirrors INTEGER DEFAULT 0,
                total_snapshots INTEGER DEFAULT 0,
                total_published INTEGER DEFAULT 0,
                total_packages INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Insert initial stats row
        cursor.execute("""
            INSERT OR IGNORE INTO stats_cache (id) VALUES (1)
        """)

        # Indexes for performance (FTS tables don't need explicit indexes)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_published_prefix ON published(prefix)")

        conn.commit()
        logger.info(f"Cache database initialized at {self.db_path}")

    # ==========================================================================
    # Mirror Operations
    # ==========================================================================

    def save_mirrors(self, mirrors: List[Dict]) -> int:
        """Save mirror list to cache"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM mirrors")

        for mirror in mirrors:
            cursor.execute("""
                INSERT INTO mirrors (
                    name, archive_root, distribution, components, architectures,
                    last_updated, package_count, download_size, filter,
                    filter_with_deps, skip_component_check, is_esm
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                mirror.get('name', ''),
                mirror.get('archive_root', ''),
                mirror.get('distribution', ''),
                json.dumps(mirror.get('components', [])),
                json.dumps(mirror.get('architectures', [])),
                mirror.get('last_updated', ''),
                mirror.get('num_packages', 0),
                mirror.get('download_size', '0'),
                mirror.get('filter', ''),
                mirror.get('filter_with_deps', False),
                mirror.get('skip_component_check', False),
                mirror.get('is_esm', False)
            ))

        conn.commit()
        self._update_stats()
        return len(mirrors)

    def get_mirrors(self, limit: int = 100, offset: int = 0) -> Tuple[List[Dict], int]:
        """Get mirrors from cache with pagination"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as total FROM mirrors")
        total = cursor.fetchone()['total']

        cursor.execute("""
            SELECT * FROM mirrors
            ORDER BY name
            LIMIT ? OFFSET ?
        """, (limit, offset))

        rows = cursor.fetchall()
        mirrors = []
        for row in rows:
            mirror = dict(row)
            mirror['components'] = json.loads(mirror['components'] or '[]')
            mirror['architectures'] = json.loads(mirror['architectures'] or '[]')
            mirrors.append(mirror)

        return mirrors, total

    def get_mirror(self, name: str) -> Optional[Dict]:
        """Get single mirror from cache"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM mirrors WHERE name = ?", (name,))
        row = cursor.fetchone()

        if row:
            mirror = dict(row)
            mirror['components'] = json.loads(mirror['components'] or '[]')
            mirror['architectures'] = json.loads(mirror['architectures'] or '[]')
            return mirror
        return None

    def delete_mirror(self, name: str):
        """Remove mirror from cache"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM mirrors WHERE name = ?", (name,))
        conn.commit()
        self._update_stats()

    # ==========================================================================
    # Snapshot Operations
    # ==========================================================================

    def save_snapshots(self, snapshots: List[Dict]) -> int:
        """Save snapshot list to cache"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM snapshots")

        for snapshot in snapshots:
            cursor.execute("""
                INSERT INTO snapshots (
                    name, created_at, description, package_count, sources
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                snapshot.get('name', ''),
                snapshot.get('created_at', ''),
                snapshot.get('description', ''),
                snapshot.get('num_packages', 0),
                json.dumps(snapshot.get('sources', []))
            ))

        conn.commit()
        self._update_stats()
        return len(snapshots)

    def get_snapshots(self, limit: int = 100, offset: int = 0,
                      sort_by: str = 'created_at', sort_desc: bool = True) -> Tuple[List[Dict], int]:
        """Get snapshots from cache with pagination and sorting"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as total FROM snapshots")
        total = cursor.fetchone()['total']

        # Validate sort column
        valid_columns = ['name', 'created_at', 'description', 'package_count']
        if sort_by not in valid_columns:
            sort_by = 'created_at'

        order = "DESC" if sort_desc else "ASC"

        cursor.execute(f"""
            SELECT * FROM snapshots
            ORDER BY {sort_by} {order}
            LIMIT ? OFFSET ?
        """, (limit, offset))

        rows = cursor.fetchall()
        snapshots = []
        for row in rows:
            snapshot = dict(row)
            snapshot['sources'] = json.loads(snapshot['sources'] or '[]')
            snapshots.append(snapshot)

        return snapshots, total

    def get_snapshot(self, name: str) -> Optional[Dict]:
        """Get single snapshot from cache"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM snapshots WHERE name = ?", (name,))
        row = cursor.fetchone()

        if row:
            snapshot = dict(row)
            snapshot['sources'] = json.loads(snapshot['sources'] or '[]')
            return snapshot
        return None

    def search_snapshots(self, query: str, limit: int = 50) -> List[Dict]:
        """Search snapshots by name or description"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM snapshots
            WHERE name LIKE ? OR description LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (f'%{query}%', f'%{query}%', limit))

        rows = cursor.fetchall()
        snapshots = []
        for row in rows:
            snapshot = dict(row)
            snapshot['sources'] = json.loads(snapshot['sources'] or '[]')
            snapshots.append(snapshot)

        return snapshots

    def delete_snapshot(self, name: str):
        """Remove snapshot from cache"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM snapshots WHERE name = ?", (name,))
        cursor.execute("DELETE FROM packages WHERE source_name = ? AND source_type = 'snapshot'", (name,))
        conn.commit()
        self._update_stats()

    # ==========================================================================
    # Published Operations
    # ==========================================================================

    def save_published(self, published: List[Dict]) -> int:
        """Save published repos to cache"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM published")

        for pub in published:
            prefix = pub.get('prefix', '') or ''
            distribution = pub.get('distribution', '')
            pub_id = f"{prefix}:{distribution}" if prefix else f"root:{distribution}"

            cursor.execute("""
                INSERT INTO published (
                    id, prefix, distribution, storage, architectures,
                    source_kind, sources, label, origin, acquire_by_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pub_id,
                prefix,
                distribution,
                pub.get('storage', ''),
                json.dumps(pub.get('architectures', [])),
                pub.get('source_kind', ''),
                json.dumps(pub.get('sources', [])),
                pub.get('label', ''),
                pub.get('origin', ''),
                pub.get('acquire_by_hash', False)
            ))

        conn.commit()
        self._update_stats()
        return len(published)

    def get_published(self, limit: int = 100, offset: int = 0) -> Tuple[List[Dict], int]:
        """Get published repos from cache with pagination"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as total FROM published")
        total = cursor.fetchone()['total']

        cursor.execute("""
            SELECT * FROM published
            ORDER BY distribution, prefix
            LIMIT ? OFFSET ?
        """, (limit, offset))

        rows = cursor.fetchall()
        published = []
        for row in rows:
            pub = dict(row)
            pub['architectures'] = json.loads(pub['architectures'] or '[]')
            pub['sources'] = json.loads(pub['sources'] or '[]')
            published.append(pub)

        return published, total

    def get_published_by_id(self, pub_id: str) -> Optional[Dict]:
        """Get single published repo from cache"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM published WHERE id = ?", (pub_id,))
        row = cursor.fetchone()

        if row:
            pub = dict(row)
            pub['architectures'] = json.loads(pub['architectures'] or '[]')
            pub['sources'] = json.loads(pub['sources'] or '[]')
            return pub
        return None

    def delete_published(self, pub_id: str):
        """Remove published from cache"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM published WHERE id = ?", (pub_id,))
        conn.commit()
        self._update_stats()

    # ==========================================================================
    # Package FTS Operations
    # ==========================================================================

    def index_packages(self, source_name: str, source_type: str,
                       packages: List[str], batch_size: int = 1000) -> int:
        """Index packages for FTS search"""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Clear existing packages for this source
        cursor.execute("""
            DELETE FROM packages
            WHERE source_name = ? AND source_type = ?
        """, (source_name, source_type))

        # Parse and insert packages
        count = 0
        batch = []

        for pkg_key in packages:
            parsed = self._parse_package_key(pkg_key)
            if parsed:
                batch.append((
                    parsed['name'],
                    parsed['version'],
                    parsed['architecture'],
                    source_name,
                    source_type
                ))
                count += 1

                if len(batch) >= batch_size:
                    cursor.executemany("""
                        INSERT OR IGNORE INTO packages
                        (package_name, version, architecture, source_name, source_type)
                        VALUES (?, ?, ?, ?, ?)
                    """, batch)
                    batch = []

        if batch:
            cursor.executemany("""
                INSERT OR IGNORE INTO packages
                (package_name, version, architecture, source_name, source_type)
                VALUES (?, ?, ?, ?, ?)
            """, batch)

        conn.commit()
        logger.info(f"Indexed {count} packages for {source_type}:{source_name}")
        return count

    def search_packages(self, query: str, source_filter: Optional[str] = None,
                        limit: int = 100) -> List[Dict]:
        """Search packages using LIKE query (fallback for compatibility)"""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Use LIKE query for compatibility - FTS requires triggers
        pattern = f'%{query}%'

        if source_filter:
            cursor.execute("""
                SELECT *, 0 as rank FROM packages
                WHERE package_name LIKE ?
                AND source_name = ?
                LIMIT ?
            """, (pattern, source_filter, limit))
        else:
            cursor.execute("""
                SELECT *, 0 as rank FROM packages
                WHERE package_name LIKE ?
                LIMIT ?
            """, (pattern, limit))

        rows = cursor.fetchall()

        # Transform results to match frontend expectations
        results = []
        for row in rows:
            result = dict(row)
            transformed = {
                'package': result.get('package_name', ''),
                'version': result.get('version', ''),
                'architecture': result.get('architecture', ''),
                'type': result.get('source_type', 'snapshot'),
                'name': result.get('source_name', '') if result.get('source_type') == 'snapshot' else None,
                'prefix': '',
                'distribution': result.get('source_name', '') if result.get('source_type') == 'published' else None,
                'location': result.get('source_name', '')
            }
            results.append(transformed)

        return results

    def get_package_stats(self) -> Dict[str, int]:
        """Get package index statistics"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as total FROM packages")
        total = cursor.fetchone()['total']

        cursor.execute("""
            SELECT source_type, COUNT(*) as count
            FROM packages
            GROUP BY source_type
        """)
        by_source = {row['source_type']: row['count'] for row in cursor.fetchall()}

        return {
            'total_packages': total,
            'by_source': by_source
        }

    def clear_package_index(self):
        """Clear all package index data"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM packages")
        conn.commit()

    # ==========================================================================
    # Sync State Operations
    # ==========================================================================

    def update_sync_state(self, entity_type: str, record_count: int,
                          duration_ms: int):
        """Update sync state for an entity type"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT OR REPLACE INTO sync_state
            (entity_type, last_sync, record_count, sync_duration_ms)
            VALUES (?, CURRENT_TIMESTAMP, ?, ?)
        """, (entity_type, record_count, duration_ms))

        conn.commit()

    def get_sync_state(self, entity_type: str) -> Optional[Dict]:
        """Get sync state for an entity type"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM sync_state WHERE entity_type = ?
        """, (entity_type,))

        row = cursor.fetchone()
        return dict(row) if row else None

    def get_all_sync_states(self) -> List[Dict]:
        """Get all sync states"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM sync_state")
        return [dict(row) for row in cursor.fetchall()]

    # ==========================================================================
    # Stats Operations
    # ==========================================================================

    def _update_stats(self):
        """Update materialized stats"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM mirrors")
        mirror_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM snapshots")
        snapshot_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM published")
        published_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM packages")
        package_count = cursor.fetchone()[0]

        cursor.execute("""
            UPDATE stats_cache SET
                total_mirrors = ?,
                total_snapshots = ?,
                total_published = ?,
                total_packages = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        """, (mirror_count, snapshot_count, published_count, package_count))

        conn.commit()

    def get_stats(self) -> Dict[str, Any]:
        """Get cached stats"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM stats_cache WHERE id = 1")
        row = cursor.fetchone()

        if row:
            return {
                'total_mirrors': row['total_mirrors'],
                'total_snapshots': row['total_snapshots'],
                'total_published': row['total_published'],
                'total_packages': row['total_packages'],
                'updated_at': row['updated_at']
            }

        return {
            'total_mirrors': 0,
            'total_snapshots': 0,
            'total_published': 0,
            'total_packages': 0,
            'updated_at': None
        }

    # ==========================================================================
    # Utility Methods
    # ==========================================================================

    @staticmethod
    def _parse_package_key(key: str) -> Optional[Dict[str, str]]:
        """Parse aptly package key into components"""
        # Format examples:
        # Pnginx 1.24.0-1~bookworm amd64
        # Plibnginx-mod-http-perl 1.24.0-1~bookworm amd64
        try:
            if key.startswith('P'):
                key = key[1:]  # Remove prefix marker

            # Split by space, but version might have spaces
            parts = key.rsplit(' ', 2)
            if len(parts) >= 3:
                return {
                    'name': parts[0],
                    'version': parts[1],
                    'architecture': parts[2]
                }
            elif len(parts) == 2:
                return {
                    'name': parts[0],
                    'version': parts[1],
                    'architecture': 'unknown'
                }
        except Exception as e:
            logger.debug(f"Failed to parse package key '{key}': {e}")

        return {'name': key, 'version': '', 'architecture': 'unknown'}

    def clear_all(self):
        """Clear all cached data (use with caution)"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM mirrors")
        cursor.execute("DELETE FROM snapshots")
        cursor.execute("DELETE FROM published")
        cursor.execute("DELETE FROM packages_fts")
        cursor.execute("DELETE FROM sync_state")
        cursor.execute("DELETE FROM stats_cache")
        cursor.execute("INSERT INTO stats_cache (id) VALUES (1)")

        conn.commit()
        logger.info("Cache cleared")

    def get_db_size(self) -> int:
        """Get database file size in bytes"""
        import os
        return os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0


# Singleton instance
cache_instance: Optional[AptlyCache] = None


def get_cache(db_path: Optional[str] = None) -> AptlyCache:
    """Get or create singleton cache instance"""
    global cache_instance
    if cache_instance is None:
        cache_instance = AptlyCache(db_path or "/tmp/aptly_cache.db")
    return cache_instance
