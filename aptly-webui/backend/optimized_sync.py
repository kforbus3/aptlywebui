#!/usr/bin/env python3
"""
Aptly Web UI - Optimized API Sync Service
Scales to large installations with lazy loading and parallel requests.
"""

import logging
import threading
import time
from datetime import datetime
from typing import Optional, Dict, Any, List
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from cache import get_cache, AptlyCache

logger = logging.getLogger(__name__)


class OptimizedSyncService:
    """
    Optimized sync that handles large installations efficiently.
    - Fast initial sync (lists only)
    - Lazy detail loading
    - Parallel API requests
    - Incremental updates
    """

    def __init__(self, api_url: str, cache: Optional[AptlyCache] = None):
        self.api_url = api_url
        self.cache = cache or get_cache()
        self.running = False
        self._stop_event = threading.Event()
        self._threads: List[threading.Thread] = []

        # Track which snapshots have detailed info
        self._detail_cache_lock = threading.Lock()
        self._snapshots_with_details: set = set()

    def _api_get(self, endpoint: str, timeout: int = 30) -> Any:
        """Make API request"""
        url = f"{self.api_url}/api/{endpoint}"
        try:
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"API request failed: {e}")
            raise

    def sync_mirrors_fast(self) -> Dict[str, Any]:
        """
        Fast mirror sync - list only, details on demand.
        Package counts come from list if available.
        """
        start_time = time.time()
        logger.info("Starting fast mirrors sync...")

        try:
            # Get list (1 API call)
            mirrors_list = self._api_get('mirrors')
            logger.info(f"Fetched {len(mirrors_list)} mirrors from API")

            # For mirrors, we DO need individual calls for package counts
            # But we can parallelize them
            enhanced_mirrors = []

            def fetch_mirror_detail(mirror):
                name = mirror.get('Name', mirror.get('name', ''))
                try:
                    detail = self._api_get(f'mirrors/{name}', timeout=10)
                    return {
                        'name': name,
                        'archive_root': detail.get('ArchiveRoot', ''),
                        'distribution': detail.get('Distribution', ''),
                        'components': detail.get('Components', []),
                        'architectures': detail.get('Architectures', []),
                        'last_updated': detail.get('LastDownloadDate', ''),
                        'num_packages': detail.get('PackageCount', 0),
                        'download_size': str(detail.get('DownloadSize', '0')),
                        'filter': detail.get('Filter', ''),
                        'filter_with_deps': detail.get('FilterWithDeps', False),
                        'skip_component_check': detail.get('SkipComponentCheck', False),
                        'is_esm': 'esm.ubuntu.com' in str(detail.get('ArchiveRoot', ''))
                    }
                except Exception as e:
                    logger.warning(f"Could not get details for mirror {name}: {e}")
                    return {
                        'name': name,
                        'num_packages': None
                    }

            # Parallel fetch with 10 concurrent workers
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [executor.submit(fetch_mirror_detail, m) for m in mirrors_list]
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        enhanced_mirrors.append(result)

            # Save to cache
            count = self.cache.save_mirrors(enhanced_mirrors)
            duration = time.time() - start_time

            logger.info(f"Mirrors sync complete: {count} mirrors in {duration:.2f}s")
            return {'success': True, 'count': count, 'duration': duration}

        except Exception as e:
            logger.error(f"Mirrors sync failed: {e}")
            return {'success': False, 'error': str(e)}

    def sync_snapshots_fast(self, max_detail_fetch: int = 100) -> Dict[str, Any]:
        """
        Fast snapshot sync strategy:
        1. Fetch list only (1 API call)
        2. Fetch details for most recent N snapshots
        3. Store list with basic info
        4. Details fetched on-demand when viewing
        """
        start_time = time.time()
        logger.info(f"Starting fast snapshots sync (fetching details for {max_detail_fetch} recent)...")

        try:
            # Step 1: Fetch list (1 API call)
            snapshots_list = self._api_get('snapshots')
            logger.info(f"Fetched {len(snapshots_list)} snapshots from API")

            # Sort by name (usually contains date) - most recent first
            snapshots_list.sort(
                key=lambda x: x.get('Name', x.get('name', '')),
                reverse=True
            )

            # Step 2: Fetch details for most recent N in parallel
            recent_snapshots = snapshots_list[:max_detail_fetch]

            def fetch_snapshot_detail(snap):
                name = snap.get('Name', snap.get('name', ''))
                try:
                    detail = self._api_get(f'snapshots/{name}', timeout=10)
                    return {
                        'name': name,
                        'created_at': detail.get('CreatedAt', ''),
                        'description': detail.get('Description', ''),
                        'num_packages': len(detail.get('Packages', [])),
                        'sources': detail.get('Sources', [])
                    }
                except Exception as e:
                    logger.debug(f"Could not get details for {name}: {e}")
                    return {
                        'name': name,
                        'created_at': snap.get('CreatedAt', ''),
                        'description': snap.get('Description', ''),
                        'num_packages': snap.get('NumberOfPackages', 0),
                        'sources': []
                    }

            # Fetch details in parallel
            detailed_snapshots = []
            with ThreadPoolExecutor(max_workers=20) as executor:
                futures = [executor.submit(fetch_snapshot_detail, s) for s in recent_snapshots]
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        detailed_snapshots.append(result)
                        with self._detail_cache_lock:
                            self._snapshots_with_details.add(result['name'])

            # Step 3: For remaining snapshots, store basic info only
            remaining_snapshots = snapshots_list[max_detail_fetch:]
            basic_snapshots = [
                {
                    'name': s.get('Name', s.get('name', '')),
                    'created_at': s.get('CreatedAt', ''),
                    'description': s.get('Description', ''),
                    'num_packages': s.get('NumberOfPackages', 0),
                    'sources': [],
                    'details_cached': False  # Flag to indicate lazy loading
                }
                for s in remaining_snapshots
            ]

            # Combine and save
            all_snapshots = detailed_snapshots + basic_snapshots
            count = self.cache.save_snapshots(all_snapshots)

            duration = time.time() - start_time
            logger.info(f"Snapshots sync complete: {count} snapshots in {duration:.2f}s "
                       f"({len(detailed_snapshots)} with details, {len(basic_snapshots)} basic)")

            return {
                'success': True,
                'count': count,
                'detailed': len(detailed_snapshots),
                'basic': len(basic_snapshots),
                'duration': duration
            }

        except Exception as e:
            logger.error(f"Snapshots sync failed: {e}")
            return {'success': False, 'error': str(e)}

    def sync_published_fast(self) -> Dict[str, Any]:
        """Fast published sync with parallel detail fetching"""
        start_time = time.time()
        logger.info("Starting fast published sync...")

        try:
            published_list = self._api_get('publish')
            logger.info(f"Fetched {len(published_list)} published repos from API")

            def fetch_published_detail(pub):
                prefix = pub.get('Prefix', '.')
                distribution = pub.get('Distribution', '')

                try:
                    if prefix == '.' or prefix == '':
                        detail = self._api_get(f'publish/{distribution}')
                    else:
                        detail = self._api_get(f'publish/{prefix}/{distribution}')

                    return {
                        'prefix': prefix if prefix != '.' else '',
                        'distribution': distribution,
                        'storage': detail.get('Storage', ''),
                        'architectures': detail.get('Architectures', []),
                        'source_kind': detail.get('SourceKind', ''),
                        'sources': detail.get('Sources', []),
                        'label': detail.get('Label', ''),
                        'origin': detail.get('Origin', ''),
                        'acquire_by_hash': detail.get('AcquireByHash', False)
                    }
                except Exception as e:
                    logger.warning(f"Could not get details for {prefix}/{distribution}: {e}")
                    return {
                        'prefix': prefix if prefix != '.' else '',
                        'distribution': distribution,
                        'sources': pub.get('Sources', [])
                    }

            # Parallel fetch
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(fetch_published_detail, p) for p in published_list]
                enhanced_published = [f.result() for f in as_completed(futures) if f.result()]

            count = self.cache.save_published(enhanced_published)
            duration = time.time() - start_time

            logger.info(f"Published sync complete: {count} repos in {duration:.2f}s")
            return {'success': True, 'count': count, 'duration': duration}

        except Exception as e:
            logger.error(f"Published sync failed: {e}")
            return {'success': False, 'error': str(e)}

    def index_packages_limited(self, max_snapshots: int = 50) -> Dict[str, Any]:
        """Index packages for FTS search - limited to recent snapshots"""
        logger.info(f"Indexing packages for {max_snapshots} most recent snapshots...")

        try:
            # Get recent snapshots from cache
            snapshots = self.cache.get_snapshots(limit=max_snapshots, sort_desc=True)[0]

            total_indexed = 0
            indexed_count = 0

            def index_snapshot(snap):
                name = snap['name']
                try:
                    # Use the /packages endpoint to get package list
                    packages = self._api_get(f'snapshots/{name}/packages', timeout=30)

                    if packages:
                        return self.cache.index_packages(
                            name, 'snapshot', packages, batch_size=1000
                        )
                    return 0
                except Exception as e:
                    logger.debug(f"Could not index packages for {name}: {e}")
                    return 0

            # Parallel indexing
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(index_snapshot, s) for s in snapshots]
                for future in as_completed(futures):
                    count = future.result()
                    total_indexed += count
                    indexed_count += 1
                    if indexed_count % 10 == 0:
                        logger.info(f"Indexed {indexed_count}/{len(snapshots)} snapshots...")

            logger.info(f"Package indexing complete: {total_indexed} packages from {indexed_count} snapshots")
            return {'success': True, 'count': total_indexed, 'snapshots': indexed_count}

        except Exception as e:
            logger.error(f"Package indexing failed: {e}")
            return {'success': False, 'error': str(e)}

    def full_sync(self) -> Dict[str, Any]:
        """Run optimized full sync"""
        logger.info("Starting optimized full sync")
        results = {}

        results['mirrors'] = self.sync_mirrors_fast()
        if not results['mirrors']['success']:
            return results

        results['published'] = self.sync_published_fast()

        results['snapshots'] = self.sync_snapshots_fast(max_detail_fetch=100)

        # Package indexing in background
        results['packages'] = self.index_packages_limited(max_snapshots=50)

        logger.info("Optimized full sync complete")
        return results

    def start(self, interval: int = 300):
        """Start background sync"""
        self.running = True

        def sync_loop():
            while not self._stop_event.is_set():
                try:
                    self.full_sync()
                except Exception as e:
                    logger.error(f"Background sync error: {e}")

                # Wait for next sync
                for _ in range(interval):
                    if self._stop_event.is_set():
                        break
                    time.sleep(1)

        thread = threading.Thread(target=sync_loop, daemon=True)
        thread.start()
        self._threads.append(thread)
        logger.info(f"Optimized sync service started (interval: {interval}s)")

    def stop(self):
        """Stop sync service"""
        self.running = False
        self._stop_event.set()
        for thread in self._threads:
            thread.join(timeout=5)
        logger.info("Optimized sync service stopped")


# Singleton
_optimized_sync: Optional[OptimizedSyncService] = None


def get_optimized_sync_service(api_url: str, cache: Optional[AptlyCache] = None) -> OptimizedSyncService:
    """Get singleton instance"""
    global _optimized_sync
    if _optimized_sync is None:
        _optimized_sync = OptimizedSyncService(api_url, cache)
    return _optimized_sync
