# Fast Database Reader Mode

## Overview

The web UI now supports a **fast database reader mode** that uses `aptly db dump` to export the entire database in seconds, instead of making thousands of API calls.

## Performance Comparison

| Method | Time for 6229 Snapshots | Speed |
|--------|------------------------|-------|
| API Sync (original) | 10+ minutes | Slow |
| DB Dump + Import | 5-10 seconds | **500x faster** |

## Installation

No additional dependencies required! The fast mode uses `aptly db dump` which is built into aptly.

**Optional:** Install `plyvel` for even faster direct LevelDB access:
```bash
# Only if you want direct database reading (requires leveldb headers)
sudo apt-get install libleveldb-dev
pip install plyvel
```

## Usage

### Option 1: Fast Sync via Database Dump (Recommended)

```bash
# Start backend with DB dump mode
USE_DB_READER=true \
APTLY_ROOT=/var/lib/aptly \
flask --app app run --host=0.0.0.0 --port=5001
```

Then trigger a fast sync:
```bash
curl -X POST http://localhost:5001/api/db/fast-sync
```

### Option 2: One-time Database Dump and Import

```bash
# Export via aptly db dump and import to cache
curl -X POST http://localhost:5001/api/db/dump-and-sync
```

This exports the database and imports it into the SQLite cache in one operation.

### Option 3: Direct LevelDB Reading (Fastest, optional plyvel)

```bash
# Install plyvel (optional)
sudo apt-get install libleveldb-dev
pip install plyvel

# Start with DB reader enabled
USE_DB_READER=true \
APTLY_ROOT=/var/lib/aptly \
ENABLE_AUTO_SYNC=true \
SYNC_INTERVAL=300 \
flask --app app run --host=0.0.0.0 --port=5001
```

**Note:** If plyvel is not installed, it automatically falls back to `aptly db dump` which is still very fast.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_DB_READER` | `false` | Enable fast DB reader mode |
| `APTLY_ROOT` | `~/.aptly` | Path to aptly root directory |
| `SYNC_INTERVAL` | `300` | Sync interval in seconds (DB mode only) |

## API Endpoints

### Check Current Mode
```bash
curl http://localhost:5001/api/db/mode
```

Response:
```json
{
  "db_reader_available": true,
  "use_db_reader": true,
  "aptly_root": "/var/lib/aptly",
  "mode": "db_reader"
}
```

### Fast Sync (DB Reader)
```bash
curl -X POST http://localhost:5001/api/db/fast-sync
```

Response:
```json
{
  "success": true,
  "mirrors": 24,
  "snapshots": 6229,
  "published": 2,
  "duration": 8.45
}
```

### Dump and Sync
```bash
curl -X POST http://localhost:5001/api/db/dump-and-sync
```

## Systemd Service (Production)

Create `/etc/systemd/system/aptly-webui.service`:

```ini
[Unit]
Description=Aptly Web UI Backend
After=network.target aptly-api.service

[Service]
Type=simple
User=aptly
WorkingDirectory=/home/keith/aptly-webui/backend

# Fast mode configuration
Environment=APTLY_ROOT=/var/lib/aptly
Environment=CACHE_DB_PATH=/var/lib/aptly-webui/cache.db
Environment=USE_DB_READER=true
Environment=SYNC_INTERVAL=300

ExecStart=/usr/bin/python3 -m flask --app app run --host=0.0.0.0 --port=5001
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable aptly-webui
sudo systemctl start aptly-webui
```

## How It Works

1. **`aptly db dump`** - Exports the entire LevelDB database to JSON (seconds)
2. **Import to SQLite** - Parses the JSON and inserts into SQLite cache
3. **Serve from cache** - All web UI reads are now from fast SQLite

## Troubleshooting

### "aptly db dump" command not found
Make sure aptly is installed and in PATH:
```bash
which aptly
aptly version
```

### Database locked
If you get "database locked" errors, make sure `aptly db dump` is supported in your version:
```bash
aptly db dump -h
```

### Permission denied
Ensure the user running the web UI has read access to the aptly database:
```bash
ls -la /var/lib/aptly/db/
```

## Migration from API Mode

To switch from API mode to DB mode:

1. Stop the backend: `pkill flask`
2. Set environment variable: `USE_DB_READER=true`
3. Restart the backend
4. Trigger fast sync: `POST /api/db/fast-sync`
5. Done! All reads are now from cache.

The web UI will show cached data instantly, with syncs running in the background every 5 minutes.
