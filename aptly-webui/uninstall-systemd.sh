#!/bin/bash
# Uninstall Aptly WebUI systemd services
# Run this on debrepo as root

set -e

SERVICE_DIR="/etc/systemd/system"
SERVICES="aptly-api aptly-webui-backend aptly-webui-frontend"

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

echo "Uninstalling Aptly WebUI systemd services..."

# Stop services
for service in $SERVICES; do
    if systemctl is-active --quiet $service 2>/dev/null; then
        echo "Stopping $service..."
        systemctl stop $service
    fi
done

# Disable services
for service in $SERVICES; do
    if systemctl is-enabled --quiet $service 2>/dev/null; then
        echo "Disabling $service..."
        systemctl disable $service
    fi
done

# Remove service files
for service in $SERVICES; do
    if [ -f "$SERVICE_DIR/$service.service" ]; then
        echo "Removing $SERVICE_DIR/$service.service"
        rm -f "$SERVICE_DIR/$service.service"
    fi
done

# Reload systemd
systemctl daemon-reload

echo ""
echo "====================================="
echo "Systemd services uninstalled!"
echo "====================================="
echo ""
echo "Note: The application files in /home/keith/aptlywebui/aptly-webui/"
echo "      were NOT removed. Delete them manually if needed."
echo ""
