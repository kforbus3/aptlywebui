#!/bin/bash
# Aptly WebUI Debug Script
# Run this on debrepo to diagnose issues

echo "====================================="
echo "Aptly WebUI Diagnostic Tool"
echo "====================================="
echo ""

echo "1. Checking if aptly API is running..."
curl -s http://10.0.2.160:5000/api/version 2>&1 | head -5
echo ""

echo "2. Checking if backend is running..."
curl -s http://10.0.2.160:5001/api/health 2>&1 | head -10
echo ""

echo "3. Checking running processes..."
ps aux | grep -E "aptly|flask|npm" | grep -v grep | head -10
echo ""

echo "4. Checking ports in use..."
netstat -tlnp 2>/dev/null | grep -E "5000|5001|3000" || ss -tlnp 2>/dev/null | grep -E "5000|5001|3000" || echo "No netstat/ss available"
echo ""

echo "5. Testing backend endpoints..."
echo "   - Mirrors:"
curl -s http://10.0.2.160:5001/api/mirrors 2>&1 | head -3
echo ""
echo "   - Snapshots:"
curl -s http://10.0.2.160:5001/api/snapshots 2>&1 | head -3
echo ""
echo "   - Stats:"
curl -s http://10.0.2.160:5001/api/stats 2>&1
echo ""

echo "6. Checking backend logs (last 20 lines)..."
tail -20 /tmp/aptly-webui.log 2>/dev/null || echo "No log file found"
echo ""

echo "7. File locations..."
echo "   Backend files:"
ls -la /home/keith/aptlywebui/aptly-webui/backend/*.py 2>/dev/null | head -10
echo ""
echo "   Frontend files:"
ls -la /home/keith/aptlywebui/aptly-webui/frontend/dist/ 2>/dev/null | head -5
echo ""

echo "====================================="
echo "Debug complete"
echo "====================================="
