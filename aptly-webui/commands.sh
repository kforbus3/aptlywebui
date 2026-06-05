#!/bin/bash
# Common docker compose commands for Aptly WebUI

case "$1" in
  up)
    echo "Starting services..."
    docker compose -f docker-compose.simple.yml up -d
    ;;
  down)
    echo "Stopping services..."
    docker compose -f docker-compose.simple.yml down
    ;;
  logs)
    echo "Showing logs..."
    docker compose -f docker-compose.simple.yml logs -f
    ;;
  status)
    echo "Service status:"
    docker compose -f docker-compose.simple.yml ps
    ;;
  restart)
    echo "Restarting services..."
    docker compose -f docker-compose.simple.yml restart
    ;;
  build)
    echo "Rebuilding images..."
    docker compose -f docker-compose.simple.yml build --no-cache
    ;;
  clean)
    echo "Deep cleaning and rebuilding..."
    ./fix-and-build.sh
    ;;
  *)
    echo "Usage: $0 {up|down|logs|status|restart|build|clean}"
    echo ""
    echo "Commands:"
    echo "  up      - Start services"
    echo "  down    - Stop services"
    echo "  logs    - Show logs"
    echo "  status  - Show service status"
    echo "  restart - Restart services"
    echo "  build   - Rebuild images"
    echo "  clean   - Deep clean and rebuild"
    ;;
esac
