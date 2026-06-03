#!/bin/bash
# Start all Aptly WebUI services

set -e

echo "Starting Aptly WebUI..."

# Check if aptly API is running
if ! curl -s http://10.0.2.160:5000/api/version > /dev/null 2>&1; then
    echo "ERROR: Aptly API is not running on port 5000"
    echo "Start it first with: aptly api serve -listen=:5000"
    exit 1
fi

echo "1. Aptly API is running"

# Start backend in background
echo "2. Starting backend..."
cd /home/keith/aptlywebui/aptly-webui/backend
flask --app app run --host=0.0.0.0 --port=5001 > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
sleep 3
if ! curl -s http://10.0.2.160:5001/api/health > /dev/null 2>&1; then
    echo "ERROR: Backend failed to start"
    echo "Check logs: tail -f /tmp/backend.log"
    exit 1
fi
echo "   Backend is ready"

# Start frontend
echo "3. Starting frontend..."
cd /home/keith/aptlywebui/aptly-webui/frontend
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "====================================="
echo "All services started!"
echo "====================================="
echo ""
echo "Aptly API:  http://10.0.2.160:5000"
echo "Backend:    http://10.0.2.160:5001"
echo "Frontend:   http://10.0.2.160:3000"
echo ""
echo "Access the WebUI at: http://10.0.2.160:3000"
echo ""
echo "Logs:"
echo "  Backend:  tail -f /tmp/backend.log"
echo "  Frontend: tail -f /tmp/frontend.log"
echo ""
echo "To stop: kill $BACKEND_PID $FRONTEND_PID"
