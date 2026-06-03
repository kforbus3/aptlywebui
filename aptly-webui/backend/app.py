#!/usr/bin/env python3
"""
Aptly Web UI - Backend API
A comprehensive web interface for managing Aptly repositories.
Optimized for large installations with SQLite caching.
"""

import os
import json
import subprocess
import re
import logging
import atexit
from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass, asdict
from functools import wraps

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

# Configure logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import cache and sync modules
from cache import get_cache, AptlyCache
from sync_service import get_sync_service, AptlySyncService, SyncConfig
from optimized_sync import get_optimized_sync_service, OptimizedSyncService

# Flask app configuration
app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": ["*"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Configuration
APTLY_API_URL = os.environ.get('APTLY_API_URL', 'http://localhost:5000')
APTLY_CLI = os.environ.get('APTLY_CLI', 'aptly')
CACHE_DB_PATH = os.environ.get('CACHE_DB_PATH', '/tmp/aptly_cache.db')
ENABLE_AUTO_SYNC = os.environ.get('ENABLE_AUTO_SYNC', 'true').lower() == 'true'
USE_OPTIMIZED_SYNC = os.environ.get('USE_OPTIMIZED_SYNC', 'true').lower() == 'true'

cache: AptlyCache = get_cache(CACHE_DB_PATH)
sync_service = None

if ENABLE_AUTO_SYNC:
    if USE_OPTIMIZED_SYNC:
        sync_service = get_optimized_sync_service(APTLY_API_URL, cache)
        sync_service.start(interval=300)
        logger.info("Auto-sync enabled (Optimized mode)")
    else:
        sync_service = get_sync_service(APTLY_API_URL, cache)
        sync_service.start(background=True)
        logger.info("Auto-sync enabled (Standard mode)")

    atexit.register(lambda: sync_service.stop() if sync_service else None)

class AptlyError(Exception):
    def __init__(self, message: str, status_code: int = 500, details: Optional[Dict] = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}

@app.errorhandler(AptlyError)
def handle_aptly_error(error: AptlyError):
    return jsonify({'error': str(error), 'status': error.status_code, 'details': error.details}), error.status_code

@app.errorhandler(Exception)
def handle_generic_error(error: Exception):
    logger.exception("Unhandled error occurred")
    return jsonify({'error': str(error)}), 500

def aptly_api_get(endpoint: str) -> Any:
    url = f"{APTLY_API_URL}/api/{endpoint}"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()

# =============================================================================
# API Routes
# =============================================================================

@app.route('/api/mirrors', methods=['GET'])
def list_mirrors():
    """List mirrors from cache"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        offset = (page - 1) * per_page

        mirrors, total = cache.get_mirrors(limit=per_page, offset=offset)

        if total == 0 and sync_service:
            logger.info("Cache empty, triggering sync")
            if hasattr(sync_service, 'sync_mirrors_fast'):
                sync_service.sync_mirrors_fast()
            else:
                sync_service.sync_mirrors()
            mirrors, total = cache.get_mirrors(limit=per_page, offset=offset)

        return jsonify({
            'mirrors': mirrors,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page
            }
        })
    except Exception as e:
        logger.error(f"Failed to list mirrors: {e}")
        return jsonify({'mirrors': [], 'error': str(e)})

@app.route('/api/snapshots', methods=['GET'])
def list_snapshots():
    """List snapshots from cache"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        offset = (page - 1) * per_page

        snapshots, total = cache.get_snapshots(limit=per_page, offset=offset)

        if total == 0 and sync_service:
            logger.info("Cache empty, triggering snapshot sync")
            if hasattr(sync_service, 'sync_snapshots_fast'):
                sync_service.sync_snapshots_fast()
            else:
                sync_service.sync_snapshots()
            snapshots, total = cache.get_snapshots(limit=per_page, offset=offset)

        return jsonify({
            'snapshots': snapshots,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page
            }
        })
    except Exception as e:
        logger.error(f"Failed to list snapshots: {e}")
        return jsonify({'snapshots': [], 'error': str(e)})

@app.route('/api/publish', methods=['GET'])
def list_published():
    """List published repos from cache"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        offset = (page - 1) * per_page

        published, total = cache.get_published(limit=per_page, offset=offset)

        if total == 0 and sync_service:
            logger.info("Cache empty, triggering published sync")
            if hasattr(sync_service, 'sync_published_fast'):
                sync_service.sync_published_fast()
            else:
                sync_service.sync_published()
            published, total = cache.get_published(limit=per_page, offset=offset)

        return jsonify({
            'published': published,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page
            }
        })
    except Exception as e:
        logger.error(f"Failed to list published: {e}")
        return jsonify({'published': [], 'error': str(e)})

# Direct database functions to bypass cached module
def _get_db_connection():
    """Get direct database connection"""
    import sqlite3
    conn = sqlite3.connect(CACHE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _search_packages_direct(query: str, limit: int = 100) -> list:
    """Search packages directly from database"""
    try:
        conn = _get_db_connection()
        cursor = conn.cursor()

        # Check if packages table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='packages'")
        if not cursor.fetchone():
            return []

        # Use LIKE search
        pattern = f'%{query}%'
        cursor.execute("""
            SELECT package_name, version, architecture, source_name, source_type, 0 as rank
            FROM packages
            WHERE package_name LIKE ?
            LIMIT ?
        """, (pattern, limit))

        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Direct search error: {e}")
        return []
    finally:
        conn.close()

def _get_stats_direct() -> dict:
    """Get stats directly from database"""
    try:
        conn = _get_db_connection()
        cursor = conn.cursor()

        stats = {'total_mirrors': 0, 'total_snapshots': 0, 'total_published': 0, 'total_packages': 0}

        # Check if tables exist and get counts
        for table in ['mirrors', 'snapshots', 'published', 'packages']:
            cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
            if cursor.fetchone():
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                key = f'total_{table}' if table != 'published' else 'total_published'
                stats[key] = count

        return stats
    except Exception as e:
        logger.error(f"Direct stats error: {e}")
        return {'total_mirrors': 0, 'total_snapshots': 0, 'total_published': 0, 'total_packages': 0}
    finally:
        conn.close()

@app.route('/api/packages/search', methods=['GET'])
def search_packages():
    """Search packages using FTS"""
    query = request.args.get('q', '')
    if not query:
        return jsonify({'results': [], 'total': 0})

    try:
        # Try direct search first
        results = _search_packages_direct(query, limit=100)

        # Fall back to cache if direct fails
        if not results:
            results = cache.search_packages(query, limit=100)

        return jsonify({
            'query': query,
            'total': len(results),
            'results': results
        })
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return jsonify({'results': [], 'error': str(e)})

@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        aptly_api_get('version')
        return jsonify({'status': 'healthy', 'aptly_available': True})
    except:
        return jsonify({'status': 'unhealthy', 'aptly_available': False}), 503

@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        # Try direct database query first
        stats = _get_stats_direct()

        # If direct returns 0s, try cache
        if stats['total_snapshots'] == 0:
            cache_stats = cache.get_stats()
            if cache_stats.get('total_snapshots', 0) > 0:
                stats = cache_stats

        return jsonify({'stats': stats, 'cache_enabled': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cache/sync', methods=['POST'])
def trigger_sync():
    if not sync_service:
        return jsonify({'error': 'Sync service not enabled'}), 400
    try:
        result = sync_service.full_sync()
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cache/index-packages', methods=['POST'])
def index_packages():
    """Index packages for search"""
    try:
        max_snapshots = request.json.get('max_snapshots', 50) if request.json else 50
        if sync_service and hasattr(sync_service, 'index_packages_limited'):
            result = sync_service.index_packages_limited(max_snapshots)
            return jsonify({'success': True, 'result': result})
        else:
            return jsonify({'success': False, 'error': 'Sync service not available'}), 400
    except Exception as e:
        logger.error(f"Package indexing failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/snapshots/<name>', methods=['GET'])
def get_snapshot(name):
    """Get single snapshot details (with lazy loading)"""
    try:
        # Try cache first
        snapshot = cache.get_snapshot(name)

        # If not in cache or no details, fetch from API
        if not snapshot or not snapshot.get('sources'):
            logger.info(f"Fetching snapshot {name} from API (lazy load)")
            detail = aptly_api_get(f'snapshots/{name}')

            # Get package count from /packages endpoint
            try:
                packages = aptly_api_get(f'snapshots/{name}/packages')
                num_packages = len(packages)
            except:
                num_packages = 0

            snapshot = {
                'name': name,
                'created_at': detail.get('CreatedAt', ''),
                'description': detail.get('Description', ''),
                'num_packages': num_packages,
                'sources': detail.get('Sources', [])
            }
            # Update cache
            cache.save_snapshots([snapshot])

        return jsonify({'snapshot': snapshot})
    except Exception as e:
        logger.error(f"Failed to get snapshot {name}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/mirrors/<name>', methods=['GET'])
def get_mirror(name):
    """Get single mirror details"""
    try:
        mirror = cache.get_mirror(name)
        if not mirror:
            detail = aptly_api_get(f'mirrors/{name}')
            mirror = {
                'name': name,
                'archive_root': detail.get('ArchiveRoot', ''),
                'distribution': detail.get('Distribution', ''),
                'components': detail.get('Components', []),
                'architectures': detail.get('Architectures', []),
                'last_updated': detail.get('LastDownloadDate', ''),
                'num_packages': detail.get('PackageCount', 0),
                'download_size': str(detail.get('DownloadSize', '0'))
            }
        return jsonify({'mirror': mirror})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/packages/count', methods=['GET'])
def get_package_count():
    """Get total package count across all snapshots"""
    try:
        stats = _get_stats_direct()
        return jsonify({
            'total_packages': stats.get('total_packages', 0),
            'note': 'Package count from indexed snapshots only'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)
