# Aptly WebUI Troubleshooting Guide

## Common Issues

### 1. "npm ERR! Cannot find module"

**Cause:** Node modules are corrupted or missing

**Fix:**
```bash
cd /home/keith/aptlywebui/aptly-webui/frontend
rm -rf node_modules package-lock.json
npm install
```

### 2. Backend returns 404 errors

**Cause:** Backend Flask routes not loaded properly

**Check:**
```bash
curl http://10.0.2.160:5001/api/health
```

**Fix:**
- Stop backend (Ctrl+C)
- Restart: `flask --app app run --host=0.0.0.0 --port=5001`

### 3. "Connection refused" to aptly API

**Cause:** Aptly API not running

**Fix:**
```bash
# Start aptly API first
aptly api serve -listen=:5000

# Verify it's running
curl http://10.0.2.160:5000/api/version
```

### 4. Slow snapshot loading (timeouts)

**Cause:** 6229 snapshots taking too long to sync

**Fix:** The optimized sync is already enabled. First sync may take 2-3 minutes.
Check progress:
```bash
curl http://10.0.2.160:5001/api/stats
```

### 5. Frontend can't connect to backend

**Cause:** Wrong API URL in frontend

**Fix:**
```bash
cd /home/keith/aptlywebui/aptly-webui/frontend
echo "VITE_API_URL=http://10.0.2.160:5001/api" > .env
npm run dev
```

## Debug Commands

Run on your server:

```bash
# Check all services
curl http://10.0.2.160:5000/api/version   # Aptly API
curl http://10.0.2.160:5001/api/health    # Backend
curl http://10.0.2.160:5001/api/stats     # Stats

# Check processes
ps aux | grep -E "aptly|flask|npm"

# View logs
tail -f /tmp/backend.log
tail -f /tmp/frontend.log
```

## Manual Start (if automated script fails)

**Terminal 1:**
```bash
aptly api serve -listen=:5000
```

**Terminal 2:**
```bash
cd /home/keith/aptlywebui/aptly-webui/backend
flask --app app run --host=0.0.0.0 --port=5001
```

**Terminal 3:**
```bash
cd /home/keith/aptlywebui/aptly-webui/frontend
npm run dev
```

## Reset Everything

If nothing works, reset the cache:

```bash
# Stop all services
pkill -f "aptly api serve"
pkill -f "flask --app app"
pkill -f "npm run dev"

# Clear cache
rm -f /tmp/aptly_cache.db

# Restart in order:
# 1. Aptly API
# 2. Backend (will rebuild cache)
# 3. Frontend
```

## Performance Tuning

For 6000+ snapshots:

- **First sync:** ~2-3 minutes (fetching 100 recent snapshot details)
- **Subsequent syncs:** ~30 seconds
- **UI loading:** Instant from cache

The optimized sync:
- Fetches all 6229 snapshot names (1 API call)
- Fetches details for only 100 recent snapshots (parallel, 20 concurrent)
- Loads older snapshot details on-demand when viewed

This scales to any number of snapshots without timeouts.
