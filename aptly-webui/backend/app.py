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

@app.route('/api/packages/search', methods=['GET'])
def search_packages():
    """Search packages using FTS"""
    query = request.args.get('q', '')
    if not query:
        return jsonify({'results': [], 'total': 0})

    try:
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
        stats = cache.get_stats()
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

# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)
