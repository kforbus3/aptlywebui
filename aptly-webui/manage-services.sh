#!/bin/bash
# Manage Aptly WebUI services

set -e

SERVICES="aptly-api aptly-webui-backend aptly-webui-frontend"

usage() {
    echo "Usage: $0 {start|stop|restart|status|logs|enable|disable}"
    echo ""
    echo "Commands:"
    echo "  start    - Start all services"
    echo "  stop     - Stop all services"
    echo "  restart  - Restart all services"
    echo "  status   - Show status of all services"
    echo "  logs     - Show logs from all services"
    echo "  enable   - Enable services to start on boot"
    echo "  disable  - Disable services from starting on boot"
    echo ""
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "Please run as root (use sudo)"
        exit 1
    fi
}

start_services() {
    echo "Starting Aptly WebUI services..."
    systemctl start aptly-api
    sleep 3
    systemctl start aptly-webui-backend
    sleep 2
    systemctl start aptly-webui-frontend
    echo "All services started!"
    echo ""
    echo "Access WebUI at: http://10.0.2.160:3000"
}

stop_services() {
    echo "Stopping Aptly WebUI services..."
    systemctl stop aptly-webui-frontend
    systemctl stop aptly-webui-backend
    systemctl stop aptly-api
    echo "All services stopped!"
}

restart_services() {
    echo "Restarting Aptly WebUI services..."
    stop_services
    sleep 2
    start_services
}

show_status() {
    echo "====================================="
    echo "Aptly WebUI Service Status"
    echo "====================================="
    echo ""
    for service in $SERVICES; do
        status=$(systemctl is-active $service 2>/dev/null || echo "not installed")
        if [ "$status" = "active" ]; then
            echo "✓ $service: RUNNING"
        else
            echo "✗ $service: $status"
        fi
    done
    echo ""
    echo "====================================="
    echo "Health Checks:"
    echo "====================================="
    echo ""

    # Check Aptly API
    if curl -s http://10.0.2.160:5000/api/version >/dev/null 2>&1; then
        version=$(curl -s http://10.0.2.160:5000/api/version 2>/dev/null | grep -o '"Version": "[^"]*"' | cut -d'"' -f4)
        echo "✓ Aptly API: OK (version $version)"
    else
        echo "✗ Aptly API: NOT RESPONDING"
    fi

    # Check Backend
    if curl -s http://10.0.2.160:5001/api/health >/dev/null 2>&1; then
        echo "✓ Backend: OK"
    else
        echo "✗ Backend: NOT RESPONDING"
    fi

    # Check Frontend
    if curl -s -o /dev/null -w "%{http_code}" http://10.0.2.160:3000 | grep -q "200\|301"; then
        echo "✓ Frontend: OK"
    else
        echo "✗ Frontend: NOT RESPONDING"
    fi

    echo ""
}

show_logs() {
    echo "Showing logs (Ctrl+C to exit)..."
    journalctl -u aptly-api -u aptly-webui-backend -u aptly-webui-frontend -f
}

enable_services() {
    check_root
    echo "Enabling services to start on boot..."
    for service in $SERVICES; do
        systemctl enable $service
    done
    echo "Services enabled!"
}

disable_services() {
    check_root
    echo "Disabling services from starting on boot..."
    for service in $SERVICES; do
        systemctl disable $service
    done
    echo "Services disabled!"
}

case "$1" in
    start)
        check_root
        start_services
        ;;
    stop)
        check_root
        stop_services
        ;;
    restart)
        check_root
        restart_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    enable)
        check_root
        enable_services
        ;;
    disable)
        check_root
        disable_services
        ;;
    *)
        usage
        exit 1
        ;;
esac
