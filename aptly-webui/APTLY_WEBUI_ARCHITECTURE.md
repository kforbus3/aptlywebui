# Aptly WebUI Architecture for Large Installations

## Problem Analysis

Current architecture limitations with 6000+ snapshots:
- REST API list endpoints are fast but lack detail (no package counts)
- REST API detail endpoints require N+1 calls (1 per item)
- Package search requires iterating ALL snapshots (minutes of latency)
- No pagination support in aptly REST API
- Database locked when API is running (no CLI fallback)

## Proposed Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Frontend                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Dashboard  │  │   Search    │  │  Mirror/Snapshot/Publish │ │
│  │   (cached)  │  │   (FTS)     │  │      (paginated)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      Flask Backend                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    API Layer                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │   Read      │  │   Write     │  │  Sync Control   │  │   │
│  │  │  (cache)    │  │ (invalidate)│  │  (background)   │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │   │
│  └─────────┼────────────────┼──────────────────┼───────────┘   │
│            │                │                  │               │
│  ┌─────────▼────────────────▼──────────────────▼───────────┐   │
│  │                    Data Layer                           │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │  SQLite Cache   │  │   SQLite FTS Index          │   │   │
│  │  │  (mirrors,      │  │   (package search)          │   │   │
│  │  │   snapshots,    │  │                             │   │   │
│  │  │   published)    │  │  ┌──────────────────────┐   │   │   │
│  │  │                 │  │  │  packages_fts        │   │   │   │
│  │  │  ┌───────────┐  │  │  │  - name (indexed)    │   │   │   │
│  │  │  │ counts    │  │  │  │  - version           │   │   │   │
│  │  │  │_materialized│  │  │  │  - architecture      │   │   │   │
│  │  │  └───────────┘  │  │  │  - snapshot (ref)    │   │   │   │
│  │  └─────────────────┘  │  └──────────────────────┘   │   │   │
│  └───────────────────────┘  └───────────────────────────┘   │   │
│                            Background Sync Thread          │   │
└────────────────────────────────────────────────────────────┘   │
                              │
                    ┌─────────┴─────────┐
                    │                   │
            ┌───────▼──────┐  ┌────────▼──────┐
            │  Aptly REST  │  │  Aptly REST   │
            │     API      │  │  (mutations)   │
            │   (reads)    │  │               │
            └──────────────┘  └───────────────┘
```

### Key Components

#### 1. SQLite Cache Database

```sql
-- Main entities cache
CREATE TABLE mirrors (
    name TEXT PRIMARY KEY,
    archive_root TEXT,
    distribution TEXT,
    components TEXT, -- JSON array
    architectures TEXT, -- JSON array
    last_updated TEXT,
    package_count INTEGER,
    download_size TEXT,
    filter TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE snapshots (
    name TEXT PRIMARY KEY,
    created_at TEXT,
    description TEXT,
    package_count INTEGER,
    sources TEXT, -- JSON
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE published (
    id TEXT PRIMARY KEY, -- prefix + "-" + distribution
    prefix TEXT,
    distribution TEXT,
    storage TEXT,
    architectures TEXT, -- JSON array
    sources TEXT, -- JSON
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FTS for package search
CREATE VIRTUAL TABLE packages_fts USING fts5(
    name,
    version,
    architecture,
    snapshot_name,
    content=''
);

-- Sync metadata
CREATE TABLE sync_state (
    entity_type TEXT PRIMARY KEY,
    last_sync TIMESTAMP,
    record_count INTEGER,
    sync_duration_ms INTEGER
);
```

#### 2. Background Sync Service

```python
class AptlySyncService:
    """Background service that syncs from REST API to SQLite cache"""
    
    def __init__(self, db_path: str, api_url: str):
        self.db = sqlite3.connect(db_path)
        self.api_url = api_url
        self.running = False
    
    def sync_mirrors(self):
        """Sync mirrors list (fast: 1 API call)"""
        mirrors = api_get('mirrors')
        # Batch insert/update
        
    def sync_snapshots_incremental(self):
        """Sync only new/changed snapshots"""
        # Get list of all snapshot names (fast: 1 API call)
        # Fetch details only for new/modified ones
        
    def sync_packages_for_snapshot(self, snapshot_name: str):
        """Index packages for FTS"""
        detail = api_get(f'snapshots/{snapshot_name}')
        packages = detail.get('Packages', [])
        # Parse package keys and insert into FTS
        # pkg = parse_package_key(key)
        # INSERT INTO packages_fts (name, version, architecture, snapshot_name)
```

#### 3. Query Optimizations

**Mirrors/Snapshots/Published Lists:**
- Read from SQLite cache (sub-10ms)
- Join with materialized counts view
- Server-side pagination: `SELECT * FROM snapshots LIMIT ? OFFSET ?`
- Sort/filter in SQL

**Package Search:**
- Use FTS5: `SELECT * FROM packages_fts WHERE packages_fts MATCH ?`
- Results in <100ms even with millions of packages
- Supports ranking: `ORDER BY rank`

**Dashboard Stats:**
- Materialized view with triggers
- Pre-computed: total_packages, total_snapshots, etc.
- Updated on each sync

#### 4. Cache Invalidation Strategy

```python
# Write-through invalidation
def create_mirror(data):
    result = api_post('mirrors', data)
    cache.invalidate('mirrors')
    cache.invalidate('stats')
    return result

def create_snapshot(name, sources):
    result = api_post('snapshots', {'name': name, 'sources': sources})
    cache.invalidate('snapshots')
    cache.invalidate_matching(f'snapshot_packages:{name}')
    return result
```

### Performance Targets

| Operation | Current | Target | Strategy |
|-----------|---------|--------|----------|
| List mirrors | 25s (N+1) | <50ms | SQLite cache |
| List snapshots | Timeout | <100ms | SQLite + pagination |
| Package search | Minutes | <100ms | FTS5 index |
| Dashboard stats | N/A | <10ms | Materialized view |
| Create mirror | 30s | 30s | Direct API |
| Update mirror | 5min+ | 5min+ | Direct API (background) |

### Implementation Phases

#### Phase 1: Core Cache (Week 1)
- SQLite schema + connection management
- Background sync thread (mirrors, snapshots, published)
- Cache read endpoints

#### Phase 2: FTS Search (Week 1-2)
- Package key parser
- FTS index population
- Search API endpoint

#### Phase 3: Advanced Features (Week 2-3)
- Materialized counts
- Pagination UI
- Cache warming
- Sync status dashboard

#### Phase 4: Production Hardening (Week 3)
- Configurable sync intervals
- Cache persistence across restarts
- Error handling & recovery
- Metrics & logging

### Database Schema Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     mirrors     │     │    snapshots    │     │    published    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ PK name         │     │ PK name         │     │ PK id           │
│   archive_root  │     │   created_at    │     │   prefix        │
│   distribution  │     │   description   │     │   distribution  │
│   components    │◄────┤   package_count │◄────┤   storage       │
│   architectures │     │   sources       │     │   architectures │
│   last_updated  │     │   updated_at    │     │   sources       │
│   package_count │     └─────────────────┘     │   updated_at    │
│   updated_at    │                           └─────────────────┘
└─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐
│  packages_fts   │◄── Virtual FTS5 table
├─────────────────┤    (auto-indexed)
│   name          │
│   version       │
│   architecture  │
│   snapshot_name │
└─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│  sync_state     │     │ stats_materialized│
├─────────────────┤     ├─────────────────┤
│ PK entity_type  │     │ total_packages  │
│   last_sync     │     │ total_snapshots │
│   record_count  │     │ total_mirrors   │
│   sync_duration │     │ total_published │
└─────────────────┘     │ updated_at      │
                        └─────────────────┘
```

### Configuration

```python
# config.py
CACHE_CONFIG = {
    'db_path': os.environ.get('CACHE_DB_PATH', '/var/lib/aptly-webui/cache.db'),
    'sync_interval': int(os.environ.get('SYNC_INTERVAL', 60)),  # seconds
    'fts_batch_size': int(os.environ.get('FTS_BATCH_SIZE', 1000)),
    'enable_auto_sync': os.environ.get('ENABLE_AUTO_SYNC', 'true').lower() == 'true',
    'cache_ttl': int(os.environ.get('CACHE_TTL', 300)),  # 5 minutes
}
```

### Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
  aptly-webui:
    build: .
    environment:
      - APTLY_API_URL=http://aptly:5000
      - CACHE_DB_PATH=/data/cache.db
      - SYNC_INTERVAL=60
    volumes:
      - aptly-cache:/data
    ports:
      - "5001:5001"
      
  aptly:
    image: aptly/aptly
    volumes:
      - aptly-data:/aptly
    command: api -listen=0.0.0.0:5000
```

## Benefits

1. **Speed**: Sub-100ms response times for all operations
2. **Scale**: Handles 10,000+ snapshots, millions of packages
3. **Search**: Full-text search with ranking
4. **Offline Resilience**: Cache serves reads even if API is briefly down
5. **Resource Efficient**: SQLite is embedded, no external dependencies
6. **Observable**: Sync status, cache hit rates, query performance

## Trade-offs

1. **Eventual Consistency**: Cache may be 1-60 seconds behind API
2. **Storage**: Requires disk space for SQLite (~100MB per 1M packages)
3. **Complexity**: Additional layer to maintain
4. **Initial Sync**: First sync may take minutes for large installations
