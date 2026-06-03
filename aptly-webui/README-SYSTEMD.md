# Aptly WebUI Systemd Installation Guide

## Quick Install

```bash
# On debrepo, as root
sudo su
cd /home/keith/aptlywebui/aptly-webui

# Install systemd services
bash install-systemd.sh

# Start all services
bash manage-services.sh start

# Check status
bash manage-services.sh status
```

## What's Installed

Three systemd services are created:

1. **aptly-api.service** - The aptly REST API on port 5000
2. **aptly-webui-backend.service** - Flask backend on port 5001
3. **aptly-webui-frontend.service** - React frontend on port 3000

## Management Commands

### Start/Stop/Restart
```bash
# Start all services
sudo bash manage-services.sh start

# Stop all services
sudo bash manage-services.sh stop

# Restart all services
sudo bash manage-services.sh restart
```

### Check Status
```bash
sudo bash manage-services.sh status
```

Shows:
- Whether each service is running
- Health checks for API, backend, and frontend
- Version information

### View Logs
```bash
sudo bash manage-services.sh logs
```

This shows combined logs from all services. Press Ctrl+C to exit.

Or view individual service logs:
```bash
journalctl -u aptly-api -f
journalctl -u aptly-webui-backend -f
journalctl -u aptly-webui-frontend -f
```

### Enable/Disable Auto-Start
```bash
# Start on boot
sudo bash manage-services.sh enable

# Don't start on boot
sudo bash manage-services.sh disable
```

## Manual Systemd Commands

```bash
# Individual service control
systemctl start aptly-api
systemctl stop aptly-api
systemctl restart aptly-api
systemctl status aptly-api

# View recent logs
journalctl -u aptly-api --since "10 minutes ago"

# View logs with follow
journalctl -u aptly-webui-backend -f
```

## Troubleshooting

### Service fails to start

Check logs:
```bash
journalctl -u aptly-webui-backend -n 50 --no-pager
```

### Permission errors

Make sure the `aptly` user exists and has permissions:
```bash
id aptly
ls -la /home/keith/aptlywebui/aptly-webui/
```

### Port conflicts

Check if ports are in use:
```bash
ss -tlnp | grep -E "5000|5001|3000"
```

### Reset everything

```bash
# Stop and disable
sudo bash manage-services.sh stop
sudo bash manage-services.sh disable

# Clear cache
rm -f /var/lib/aptly-webui/cache.db

# Reinstall
sudo bash install-systemd.sh
sudo bash manage-services.sh start
```

## Uninstall

```bash
sudo bash uninstall-systemd.sh
```

This removes the systemd services but keeps the application files.

## Configuration

Edit service files to customize:

```bash
# Edit backend environment variables
nano /etc/systemd/system/aptly-webui-backend.service

# After editing, reload
systemctl daemon-reload
systemctl restart aptly-webui-backend
```

Common environment variables for backend:
- `APTLY_API_URL` - URL of aptly API (default: http://10.0.2.160:5000)
- `USE_OPTIMIZED_SYNC` - Enable parallel sync (default: true)
- `CACHE_DB_PATH` - SQLite cache location (default: /var/lib/aptly-webui/cache.db)

## Access

After starting services:
- WebUI: http://10.0.2.160:3000
- Backend API: http://10.0.2.160:5001/api/
- Aptly API: http://10.0.2.160:5000/api/
