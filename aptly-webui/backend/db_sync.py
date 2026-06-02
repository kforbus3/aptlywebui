#!/usr/bin/env python3
"""
Aptly Web UI - Database Sync Service
High-performance sync using direct database access.
"""

import json
import logging
import threading
import time
from typing import Optional, Dict, Any
from datetime import datetime

from cache import get_cache, AptlyCache
from db_reader import get_cached_reader, CachedDBReader

logger = logging.getLogger(__name__)


class DBSyncService:
    """Sync service that reads directly from aptly database"""

    def __init__(self, aptly_root: Optional[str] = None,
                 cache: Optional[AptlyCache] = None):
        self.reader = get_cached_reader(aptly_root)
        self.cache = cache or get_cache()
        self.running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    def sync_all(self) -> Dict[str, Any]:
        """Full sync from database to SQLite cache"""
        start_time = time.time()
        logger.info("Starting database sync...")

        try:
            # Get all data from database (via dump command - fast!)
            data = self.reader.get_data(force_refresh=True)

            # Sync mirrors
            mirrors = data.get('Mirrors', [])
            if mirrors:
                self.cache.save_mirrors(mirrors)
                logger.info(f"Synced {len(mirrors)} mirrors")

            # Sync snapshots
            snapshots = data.get('Snapshots', [])
            if snapshots:
                self.cache.save_snapshots(snapshots)
                logger.info(f"Synced {len(snapshots)} snapshots")

            # Sync published
            published = data.get('Published', [])
            if published:
                self.cache.save_published(published)
                logger.info(f"Synced {len(published)} published repos")

            # Index packages for search
            self._index_packages(data.get('Snapshots', []))

            duration = time.time() - start_time
            logger.info(f"Full sync complete in {duration:.2f}s")

            return {
                'success': True,
                'mirrors': len(mirrors),
                'snapshots': len(snapshots),
                'published': len(published),
                'duration': duration
            }

        except Exception as e:
            logger.error(f"Sync failed: {e}")
            return {'success': False, 'error': str(e)}

    def _index_packages(self, snapshots: list, max_snapshots: int = 100):
        """Index packages for FTS search"""
        logger.info("Indexing packages for search...")

        # Sort by name (usually contains date) and take most recent
        sorted_snapshots = sorted(snapshots, key=lambda x: x.get('name', ''), reverse=True)
        recent_snapshots = sorted_snapshots[:max_snapshots]

        total_indexed = 0
        for snap in recent_snapshots:
            name = snap.get('name', '')

            # Get packages directly from database
            packages = self.reader.reader.get_packages_for_snapshot(name)

            if packages:
                count = self.cache.index_packages(
                    name, 'snapshot', packages, batch_size=1000
                )
                total_indexed += count

        logger.info(f"Indexed {total_indexed} packages from {len(recent_snapshots)} snapshots")
        return total_indexed

    def incremental_sync(self) -> Dict[str, Any]:
        """Quick incremental sync - just refresh the cache"""
        return self.sync_all()  # db dump is already fast

    def start(self, interval: int = 300):
        """Start background sync loop"""
        self.running = True
        self._thread = threading.Thread(target=self._sync_loop, args=(interval,))
        self._thread.daemon = True
        self._thread.start()
        logger.info(f"DB sync service started (interval: {interval}s)")

    def _sync_loop(self, interval: int):
        """Background sync loop"""
        while not self._stop_event.is_set():
            try:
                self.incremental_sync()
            except Exception as e:
                logger.error(f"Background sync error: {e}")

            # Wait for next sync
            for _ in range(interval):
                if self._stop_event.is_set():
                    break
                time.sleep(1)

    def stop(self):
        """Stop the sync service"""
        self.running = False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("DB sync service stopped")


# Singleton
_db_sync_service: Optional[DBSyncService] = None


def get_db_sync_service(aptly_root: Optional[str] = None,
                        cache: Optional[AptlyCache] = None) -> DBSyncService:
    """Get or create singleton DB sync service"""
    global _db_sync_service
    if _db_sync_service is None:
        _db_sync_service = DBSyncService(aptly_root, cache)
    return _db_sync_service
