#!/bin/bash
# Install Aptly WebUI as systemd services
# Run this on debrepo as root

set -e

INSTALL_DIR="/home/keith/aptlywebui/aptly-webui"
SERVICE_DIR="/etc/systemd/system"

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

echo "Installing Aptly WebUI systemd services..."

# Create user if not exists
if ! id -u aptly &>/dev/null; then
    useradd -r -s /bin/false aptly
fi

# Set ownership
chown -R aptly:aptly $INSTALL_DIR

cat > $SERVICE_DIR/aptly-api.service << 'EOF'
[Unit]
Description=Aptly REST API
After=network.target

[Service]
Type=simple
User=aptly
WorkingDirectory=/var/lib/aptly
ExecStart=/usr/bin/aptly api serve -listen=:5000 -no-lock
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

cat > $SERVICE_DIR/aptly-webui-backend.service << EOF
[Unit]
Description=Aptly WebUI Backend
After=network.target aptly-api.service
Wants=aptly-api.service

[Service]
Type=simple
User=aptly
WorkingDirectory=$INSTALL_DIR/backend
Environment=APTLY_API_URL=http://10.0.2.160:5000
Environment=CACHE_DB_PATH=/var/lib/aptly-webui/cache.db
Environment=USE_OPTIMIZED_SYNC=true
Environment=ENABLE_AUTO_SYNC=true
Environment=FLASK_DEBUG=false
Environment=PYTHONUNBUFFERED=1

ExecStart=/usr/bin/python3 -m flask --app app run --host=0.0.0.0 --port=5001
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

cat > $SERVICE_DIR/aptly-webui-frontend.service << EOF
[Unit]
Description=Aptly WebUI Frontend
After=network.target aptly-webui-backend.service
Wants=aptly-webui-backend.service

[Service]
Type=simple
User=aptly
WorkingDirectory=$INSTALL_DIR/frontend
Environment=VITE_API_URL=http://10.0.2.160:5001/api
Environment=NODE_ENV=production

ExecStart=/usr/bin/npx serve -s dist -l 3000
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Create cache directory
mkdir -p /var/lib/aptly-webui
chown aptly:aptly /var/lib/aptly-webui

# Reload systemd
systemctl daemon-reload

# Enable services
systemctl enable aptly-api.service
systemctl enable aptly-webui-backend.service
systemctl enable aptly-webui-frontend.service

echo ""
echo "====================================="
echo "Systemd services installed!"
echo "====================================="
echo ""
echo "To start all services:"
echo "  systemctl start aptly-api aptly-webui-backend aptly-webui-frontend"
echo ""
echo "To check status:"
echo "  systemctl status aptly-api"
echo "  systemctl status aptly-webui-backend"
echo "  systemctl status aptly-webui-frontend"
echo ""
echo "To view logs:"
echo "  journalctl -u aptly-api -f"
echo "  journalctl -u aptly-webui-backend -f"
echo "  journalctl -u aptly-webui-frontend -f"
echo ""
echo "WebUI will be available at: http://10.0.2.160:3000"
