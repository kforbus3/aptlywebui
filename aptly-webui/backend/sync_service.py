#!/usr/bin/env python3
"""
Aptly Web UI - Background Sync Service
Keeps the SQLite cache in sync with the aptly REST API.
"""

import logging
import threading
import time
from datetime import datetime
from typing import Optional, Callable
from dataclasses import dataclass
from enum import Enum

import requests

from cache import get_cache, AptlyCache

logger = logging.getLogger(__name__)


class SyncStatus(Enum):
    IDLE = "idle"
    SYNCING = "syncing"
    ERROR = "error"


@dataclass
class SyncConfig:
    """Configuration for sync service"""
    mirrors_interval: int = 300  # 5 minutes
    snapshots_interval: int = 60  # 1 minute
    published_interval: int = 300  # 5 minutes
    package_index_batch_size: int = 500  # packages per batch
    max_snapshots_to_index: int = 100  # most recent snapshots for package search
    enable_package_indexing: bool = True
    retry_delay: int = 30  # seconds between retries on error


class AptlySyncService:
    """Background service that syncs aptly data to SQLite cache"""

    def __init__(self, api_url: str, cache: Optional[AptlyCache] = None,
                 config: Optional[SyncConfig] = None):
        self.api_url = api_url
        self.cache = cache or get_cache()
        self.config = config or SyncConfig()

        self._stop_event = threading.Event()
        self._threads: list[threading.Thread] = []
        self._status = {entity: SyncStatus.IDLE for entity in
                         ['mirrors', 'snapshots', 'published', 'packages']}
        self._lock = threading.Lock()

    def _api_get(self, endpoint: str) -> dict:
        """Make API request with timeout"""
        url = f"{self.api_url}/api/{endpoint}"
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {e}")
            raise

    def sync_mirrors(self) -> dict:
        """Sync mirrors list from API to cache"""
        with self._lock:
            self._status['mirrors'] = SyncStatus.SYNCING

        start_time = time.time()
        logger.info("Starting mirrors sync")

        try:
            # Get list of mirrors
            mirrors = self._api_get('mirrors')
            logger.info(f"Fetched {len(mirrors)} mirrors from API")

            # Enhance with package counts (N+1 required, but only during sync)
            enhanced_mirrors = []
            for mirror in mirrors:
                name = mirror.get('Name', mirror.get('name', ''))
                try:
                    detail = self._api_get(f'mirrors/{name}')
                    enhanced_mirrors.append({
                        'name': name,
                        'archive_root': detail.get('ArchiveRoot', ''),
                        'distribution': detail.get('Distribution', ''),
                        'components': detail.get('Components', []),
                        'architectures': detail.get('Architectures', []),
                        'last_updated': detail.get('LastDownloadDate', ''),
                        'num_packages': detail.get('PackageCount', 0),
                        'download_size': detail.get('DownloadSize', '0'),
                        'filter': detail.get('Filter', ''),
                        'filter_with_deps': detail.get('FilterWithDeps', False),
                        'skip_component_check': detail.get('SkipComponentCheck', False),
                        'is_esm': 'esm.ubuntu.com' in str(detail.get('ArchiveRoot', ''))
                    })
                except Exception as e:
                    logger.warning(f"Could not get details for mirror {name}: {e}")
                    # Add with basic info
                    enhanced_mirrors.append({
                        'name': name,
                        'archive_root': mirror.get('ArchiveRoot', ''),
                        'distribution': mirror.get('Distribution', ''),
                        'components': mirror.get('Components', []),
                        'architectures': mirror.get('Architectures', []),
                        'num_packages': None
                    })

            # Save to cache
            count = self.cache.save_mirrors(enhanced_mirrors)

            duration_ms = int((time.time() - start_time) * 1000)
            self.cache.update_sync_state('mirrors', count, duration_ms)

            with self._lock:
                self._status['mirrors'] = SyncStatus.IDLE

            logger.info(f"Mirrors sync complete: {count} mirrors in {duration_ms}ms")
            return {'success': True, 'count': count, 'duration_ms': duration_ms}

        except Exception as e:
            logger.error(f"Mirrors sync failed: {e}")
            with self._lock:
                self._status['mirrors'] = SyncStatus.ERROR
            return {'success': False, 'error': str(e)}

    def sync_snapshots(self) -> dict:
        """Sync snapshots list from API to cache"""
        with self._lock:
            self._status['snapshots'] = SyncStatus.SYNCING

        start_time = time.time()
        logger.info("Starting snapshots sync")

        try:
            # Get list of snapshots
            snapshots = self._api_get('snapshots')
            logger.info(f"Fetched {len(snapshots)} snapshots from API")

            # Enhance with package counts
            enhanced_snapshots = []
            for snap in snapshots:
                name = snap.get('Name', snap.get('name', ''))
                try:
                    detail = self._api_get(f'snapshots/{name}')
                    enhanced_snapshots.append({
                        'name': name,
                        'created_at': snap.get('CreatedAt', snap.get('created_at', '')),
                        'description': detail.get('Description', ''),
                        'num_packages': len(detail.get('Packages', [])),
                        'sources': detail.get('Sources', [])
                    })
                except Exception as e:
                    logger.warning(f"Could not get details for snapshot {name}: {e}")
                    enhanced_snapshots.append({
                        'name': name,
                        'created_at': snap.get('CreatedAt', ''),
                        'description': snap.get('Description', ''),
                        'num_packages': snap.get('NumberOfPackages', 0),
                        'sources': []
                    })

            # Save to cache
            count = self.cache.save_snapshots(enhanced_snapshots)

            duration_ms = int((time.time() - start_time) * 1000)
            self.cache.update_sync_state('snapshots', count, duration_ms)

            with self._lock:
                self._status['snapshots'] = SyncStatus.IDLE

            logger.info(f"Snapshots sync complete: {count} snapshots in {duration_ms}ms")
            return {'success': True, 'count': count, 'duration_ms': duration_ms}

        except Exception as e:
            logger.error(f"Snapshots sync failed: {e}")
            with self._lock:
                self._status['snapshots'] = SyncStatus.ERROR
            return {'success': False, 'error': str(e)}

    def sync_published(self) -> dict:
        """Sync published repos from API to cache"""
        with self._lock:
            self._status['published'] = SyncStatus.SYNCING

        start_time = time.time()
        logger.info("Starting published sync")

        try:
            # Get list of published
            published = self._api_get('publish')
            logger.info(f"Fetched {len(published)} published repos from API")

            # Enhance with full details
            enhanced_published = []
            for pub in published:
                prefix = pub.get('Prefix', '.')
                distribution = pub.get('Distribution', '')

                try:
                    # Get full details
                    if prefix == '.' or prefix == '':
                        detail = self._api_get(f'publish/{distribution}')
                    else:
                        detail = self._api_get(f'publish/{prefix}/{distribution}')

                    enhanced_published.append({
                        'prefix': prefix if prefix != '.' else '',
                        'distribution': distribution,
                        'storage': detail.get('Storage', ''),
                        'architectures': detail.get('Architectures', []),
                        'source_kind': detail.get('SourceKind', ''),
                        'sources': detail.get('Sources', []),
                        'label': detail.get('Label', ''),
                        'origin': detail.get('Origin', ''),
                        'acquire_by_hash': detail.get('AcquireByHash', False)
                    })
                except Exception as e:
                    logger.warning(f"Could not get details for {prefix}/{distribution}: {e}")
                    enhanced_published.append({
                        'prefix': prefix if prefix != '.' else '',
                        'distribution': distribution,
                        'sources': pub.get('Sources', []),
                        'architectures': pub.get('Architectures', [])
                    })

            # Save to cache
            count = self.cache.save_published(enhanced_published)

            duration_ms = int((time.time() - start_time) * 1000)
            self.cache.update_sync_state('published', count, duration_ms)

            with self._lock:
                self._status['published'] = SyncStatus.IDLE

            logger.info(f"Published sync complete: {count} repos in {duration_ms}ms")
            return {'success': True, 'count': count, 'duration_ms': duration_ms}

        except Exception as e:
            logger.error(f"Published sync failed: {e}")
            with self._lock:
                self._status['published'] = SyncStatus.ERROR
            return {'success': False, 'error': str(e)}

    def index_packages(self, limit: Optional[int] = None) -> dict:
        """Index packages for FTS search"""
        if not self.config.enable_package_indexing:
            return {'success': True, 'message': 'Package indexing disabled'}

        with self._lock:
            self._status['packages'] = SyncStatus.SYNCING

        start_time = time.time()
        logger.info("Starting package indexing")

        try:
            total_indexed = 0
            snapshots_to_index = limit or self.config.max_snapshots_to_index

            # Get recent snapshots from cache
            snapshots, _ = self.cache.get_snapshots(limit=snapshots_to_index, sort_desc=True)

            for snap in snapshots:
                name = snap['name']
                try:
                    detail = self._api_get(f'snapshots/{name}')
                    packages = detail.get('Packages', [])

                    if packages:
                        count = self.cache.index_packages(
                            name, 'snapshot', packages,
                            batch_size=self.config.package_index_batch_size
                        )
                        total_indexed += count
                        logger.debug(f"Indexed {count} packages from snapshot {name}")

                except Exception as e:
                    logger.warning(f"Could not index packages for snapshot {name}: {e}")

            duration_ms = int((time.time() - start_time) * 1000)
            self.cache.update_sync_state('packages', total_indexed, duration_ms)

            with self._lock:
                self._status['packages'] = SyncStatus.IDLE

            logger.info(f"Package indexing complete: {total_indexed} packages in {duration_ms}ms")
            return {
                'success': True,
                'count': total_indexed,
                'duration_ms': duration_ms,
                'snapshots_indexed': len(snapshots)
            }

        except Exception as e:
            logger.error(f"Package indexing failed: {e}")
            with self._lock:
                self._status['packages'] = SyncStatus.ERROR
            return {'success': False, 'error': str(e)}

    def full_sync(self) -> dict:
        """Run full sync of all entities"""
        logger.info("Starting full sync")
        results = {}

        results['mirrors'] = self.sync_mirrors()
        if not results['mirrors']['success']:
            return results

        results['snapshots'] = self.sync_snapshots()
        if not results['snapshots']['success']:
            return results

        results['published'] = self.sync_published()
        if not results['published']['success']:
            return results

        # Package indexing can run in background
        results['packages'] = self.index_packages()

        logger.info("Full sync complete")
        return results

    def _sync_loop(self, sync_func: Callable, interval: int, name: str):
        """Background sync loop for an entity type"""
        logger.info(f"Starting {name} sync loop (interval: {interval}s)")

        while not self._stop_event.is_set():
            try:
                result = sync_func()
                if not result['success']:
                    logger.warning(f"{name} sync failed, retrying in {self.config.retry_delay}s")
                    time.sleep(self.config.retry_delay)
                    continue
            except Exception as e:
                logger.error(f"{name} sync loop error: {e}")

            # Wait for next sync interval
            for _ in range(interval):
                if self._stop_event.is_set():
                    break
                time.sleep(1)

    def start(self, background: bool = True):
        """Start the sync service"""
        if background:
            # Start sync threads
            threads = [
                ('mirrors', self.sync_mirrors, self.config.mirrors_interval),
                ('snapshots', self.sync_snapshots, self.config.snapshots_interval),
                ('published', self.sync_published, self.config.published_interval),
            ]

            for name, func, interval in threads:
                thread = threading.Thread(
                    target=self._sync_loop,
                    args=(func, interval, name),
                    daemon=True,
                    name=f"sync-{name}"
                )
                thread.start()
                self._threads.append(thread)

            # Package indexing runs less frequently
            if self.config.enable_package_indexing:
                pkg_thread = threading.Thread(
                    target=self._package_index_loop,
                    daemon=True,
                    name="sync-packages"
                )
                pkg_thread.start()
                self._threads.append(pkg_thread)

            logger.info("Sync service started (background mode)")
        else:
            # Run once synchronously
            self.full_sync()

    def _package_index_loop(self):
        """Background loop for package indexing"""
        logger.info("Starting package index loop")

        while not self._stop_event.is_set():
            try:
                self.index_packages()
            except Exception as e:
                logger.error(f"Package index loop error: {e}")

            # Index packages every 10 minutes
            for _ in range(600):
                if self._stop_event.is_set():
                    break
                time.sleep(1)

    def stop(self):
        """Stop the sync service"""
        logger.info("Stopping sync service")
        self._stop_event.set()

        for thread in self._threads:
            thread.join(timeout=5)

        self._threads.clear()
        logger.info("Sync service stopped")

    def get_status(self) -> dict:
        """Get current sync status"""
        with self._lock:
            return {
                entity: status.value
                for entity, status in self._status.items()
            }

    def get_sync_info(self) -> dict:
        """Get comprehensive sync information"""
        states = self.cache.get_all_sync_states()
        stats = self.cache.get_stats()

        return {
            'status': self.get_status(),
            'last_sync': {s['entity_type']: s['last_sync'] for s in states},
            'record_counts': {s['entity_type']: s['record_count'] for s in states},
            'cache_stats': stats,
            'config': {
                'mirrors_interval': self.config.mirrors_interval,
                'snapshots_interval': self.config.snapshots_interval,
                'published_interval': self.config.published_interval,
                'enable_package_indexing': self.config.enable_package_indexing,
            }
        }


# Singleton instance
_sync_service: Optional[AptlySyncService] = None


def get_sync_service(api_url: str, cache: Optional[AptlyCache] = None) -> AptlySyncService:
    """Get or create singleton sync service"""
    global _sync_service
    if _sync_service is None:
        _sync_service = AptlySyncService(api_url, cache)
    return _sync_service
