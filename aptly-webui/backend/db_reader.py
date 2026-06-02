#!/usr/bin/env python3
"""
Aptly Web UI - Direct Database Reader
Fast reading of aptly's LevelDB database using 'aptly db dump' or direct access.
"""

import json
import logging
import os
import subprocess
import tempfile
from typing import Dict, List, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Optional: plyvel for direct LevelDB access
try:
    import plyvel
    PLYVEL_AVAILABLE = True
except ImportError:
    PLYVEL_AVAILABLE = False


class AptlyDBReader:
    """Read aptly database directly from LevelDB or via dump command"""

    def __init__(self, aptly_root: Optional[str] = None,
                 config_path: Optional[str] = None):
        """
        Initialize DB reader

        Args:
            aptly_root: Path to aptly root directory (contains db/ folder)
            config_path: Path to aptly.conf
        """
        self.aptly_root = aptly_root or self._find_aptly_root()
        self.config_path = config_path
        self.db_path = os.path.join(self.aptly_root, 'db')

        if not os.path.exists(self.db_path):
            raise FileNotFoundError(f"Aptly database not found at {self.db_path}")

        logger.info(f"Aptly DB reader initialized: {self.db_path}")

    def _find_aptly_root(self) -> str:
        """Auto-detect aptly root directory"""
        # Check common locations
        candidates = [
            os.path.expanduser('~/.aptly'),
            '/var/lib/aptly',
            '/srv/aptly',
            '/opt/aptly',
        ]

        for path in candidates:
            if os.path.exists(os.path.join(path, 'db')):
                return path

        raise FileNotFoundError("Could not find aptly root directory. "
                               "Please specify aptly_root parameter.")

    def dump_via_command(self) -> Dict[str, Any]:
        """
        Export database using 'aptly db dump' command.
        This is safe and works even when API is running (uses snapshot).
        """
        logger.info("Exporting aptly database via dump command...")

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            dump_file = f.name

        try:
            # Run aptly db dump
            cmd = ['aptly', 'db', 'dump', f'-output={dump_file}']
            if self.config_path:
                cmd.extend(['-config', self.config_path])

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                raise RuntimeError(f"aptly db dump failed: {result.stderr}")

            # Read the exported JSON
            with open(dump_file, 'r') as f:
                data = json.load(f)

            logger.info(f"Database exported: {len(data.get('Snapshots', []))} snapshots, "
                       f"{len(data.get('Mirrors', []))} mirrors")

            return data

        finally:
            if os.path.exists(dump_file):
                os.unlink(dump_file)

    def read_direct(self) -> Dict[str, Any]:
        """
        Read directly from LevelDB.
        Requires database to be unlocked (API must be stopped).
        Much faster than dump command.
        """
        if not PLYVEL_AVAILABLE:
            raise RuntimeError("plyvel not installed. Run: pip install plyvel")

        logger.info(f"Reading directly from LevelDB: {self.db_path}")

        if not self._is_db_unlocked():
            raise RuntimeError("Database is locked. Stop aptly API or use dump_via_command()")

        try:
            db = plyvel.DB(self.db_path, create_if_missing=False)

            data = {
                'Snapshots': [],
                'Mirrors': [],
                'Published': [],
                'Packages': {}
            }

            # Iterate through all keys
            for key, value in db:
                key_str = key.decode('utf-8', errors='ignore')
                value_data = json.loads(value.decode('utf-8'))

                if key_str.startswith('S:'):
                    # Snapshot
                    data['Snapshots'].append(self._parse_snapshot(value_data))
                elif key_str.startswith('M:'):
                    # Mirror
                    data['Mirrors'].append(self._parse_mirror(value_data))
                elif key_str.startswith('P:'):
                    # Published repo
                    data['Published'].append(self._parse_published(value_data))
                elif key_str.startswith('P:'):
                    # Package (different prefix)
                    data['Packages'][key_str] = value_data

            db.close()

            logger.info(f"Database read complete: {len(data['Snapshots'])} snapshots, "
                       f"{len(data['Mirrors'])} mirrors")

            return data

        except Exception as e:
            logger.error(f"Failed to read database: {e}")
            raise

    def _is_db_unlocked(self) -> bool:
        """Check if database is unlocked (no other process using it)"""
        if not PLYVEL_AVAILABLE:
            return False
        try:
            # Try to open database in read-only mode
            db = plyvel.DB(self.db_path, create_if_missing=False, readonly=True)
            db.close()
            return True
        except Exception:
            return False

    def _parse_snapshot(self, data: Dict) -> Dict:
        """Parse snapshot from DB format"""
        return {
            'name': data.get('Name', ''),
            'created_at': data.get('CreatedAt', ''),
            'description': data.get('Description', ''),
            'num_packages': len(data.get('Packages', [])),
            'sources': data.get('Sources', [])
        }

    def _parse_mirror(self, data: Dict) -> Dict:
        """Parse mirror from DB format"""
        return {
            'name': data.get('Name', ''),
            'archive_root': data.get('ArchiveRoot', ''),
            'distribution': data.get('Distribution', ''),
            'components': data.get('Components', []),
            'architectures': data.get('Architectures', []),
            'last_updated': data.get('LastDownloadDate', ''),
            'num_packages': data.get('PackageCount', 0),
            'download_size': str(data.get('DownloadSize', '0')),
            'filter': data.get('Filter', ''),
            'filter_with_deps': data.get('FilterWithDeps', False),
            'skip_component_check': data.get('SkipComponentCheck', False),
            'is_esm': 'esm.ubuntu.com' in str(data.get('ArchiveRoot', ''))
        }

    def _parse_published(self, data: Dict) -> Dict:
        """Parse published repo from DB format"""
        return {
            'prefix': data.get('Prefix', ''),
            'distribution': data.get('Distribution', ''),
            'storage': data.get('Storage', ''),
            'architectures': data.get('Architectures', []),
            'source_kind': data.get('SourceKind', ''),
            'sources': data.get('Sources', []),
            'label': data.get('Label', ''),
            'origin': data.get('Origin', ''),
            'acquire_by_hash': data.get('AcquireByHash', False)
        }

    def get_packages_for_snapshot(self, snapshot_name: str) -> List[str]:
        """Get package list for a specific snapshot"""
        if not PLYVEL_AVAILABLE:
            return []

        try:
            db = plyvel.DB(self.db_path, create_if_missing=False, readonly=True)

            key = f"S:{snapshot_name}".encode('utf-8')
            value = db.get(key)

            if value:
                data = json.loads(value.decode('utf-8'))
                return data.get('Packages', [])

            db.close()
            return []

        except Exception as e:
            logger.error(f"Failed to get packages for {snapshot_name}: {e}")
            return []

    def get_all_snapshots_fast(self) -> List[Dict]:
        """Get all snapshots directly from DB (fastest method)"""
        if self._is_db_unlocked():
            data = self.read_direct()
            return data.get('Snapshots', [])
        else:
            # Fall back to dump command
            data = self.dump_via_command()
            return data.get('Snapshots', [])

    def get_all_mirrors_fast(self) -> List[Dict]:
        """Get all mirrors directly from DB (fastest method)"""
        if self._is_db_unlocked():
            data = self.read_direct()
            return data.get('Mirrors', [])
        else:
            data = self.dump_via_command()
            return data.get('Mirrors', [])

    def get_all_published_fast(self) -> List[Dict]:
        """Get all published repos directly from DB (fastest method)"""
        if self._is_db_unlocked():
            data = self.read_direct()
            return data.get('Published', [])
        else:
            data = self.dump_via_command()
            return data.get('Published', [])


class CachedDBReader:
    """
    High-performance cached database reader.
    Uses direct DB access when possible, falls back to dump command.
    """

    def __init__(self, aptly_root: Optional[str] = None,
                 cache_path: str = "/tmp/aptly_db_cache.json"):
        self.reader = AptlyDBReader(aptly_root)
        self.cache_path = cache_path
        self._cache: Optional[Dict] = None
        self._cache_time: float = 0
        self.cache_ttl = 60  # seconds

    def get_data(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Get database data (cached or fresh)"""
        import time

        # Check if cache is valid
        if not force_refresh and self._cache is not None:
            if time.time() - self._cache_time < self.cache_ttl:
                return self._cache

        # Try to load from file cache
        if not force_refresh and os.path.exists(self.cache_path):
            mtime = os.path.getmtime(self.cache_path)
            if time.time() - mtime < self.cache_ttl:
                with open(self.cache_path, 'r') as f:
                    self._cache = json.load(f)
                    self._cache_time = time.time()
                    logger.info(f"Loaded from file cache: {self.cache_path}")
                    return self._cache

        # Fetch fresh data
        logger.info("Fetching fresh data from database...")
        data = self.reader.dump_via_command()

        # Update caches
        self._cache = data
        self._cache_time = time.time()

        # Write to file cache
        with open(self.cache_path, 'w') as f:
            json.dump(data, f)

        return data

    def get_snapshots(self) -> List[Dict]:
        return self.get_data().get('Snapshots', [])

    def get_mirrors(self) -> List[Dict]:
        return self.get_data().get('Mirrors', [])

    def get_published(self) -> List[Dict]:
        return self.get_data().get('Published', [])

    def invalidate_cache(self):
        """Invalidate all caches"""
        self._cache = None
        self._cache_time = 0
        if os.path.exists(self.cache_path):
            os.unlink(self.cache_path)


# Convenience functions
def get_db_reader(aptly_root: Optional[str] = None) -> AptlyDBReader:
    """Get DB reader instance"""
    return AptlyDBReader(aptly_root)


def get_cached_reader(aptly_root: Optional[str] = None,
                    cache_path: str = "/tmp/aptly_db_cache.json") -> CachedDBReader:
    """Get cached DB reader instance"""
    return CachedDBReader(aptly_root, cache_path)
