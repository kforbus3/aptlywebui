# Aptly Web UI

A comprehensive web-based interface for managing Aptly repositories. This application provides complete control over mirrors, snapshots, and published repositories without requiring command-line access.

## Features

### Core Functionality
- **Mirror Management**: Create, update, and delete mirrors from external repositories
- **Snapshot Management**: Create snapshots from mirrors, merge snapshots, and manage their lifecycle
- **Publish Management**: Publish snapshots as APT repositories and switch between them
- **Package Search**: Search for packages across all snapshots and published repositories

### Ubuntu ESM Support
- Full support for Ubuntu Extended Security Maintenance (ESM) repositories
- Automatic token injection for ESM mirror URLs
- Visual indicators for ESM mirrors

### Production Ready
- Responsive React frontend with modern UI
- Flask-based REST API backend
- Docker and Docker Compose support
- Systemd service configuration
- Health checks and monitoring

## Quick Start

### Docker Compose (Recommended)

1. Clone the repository and navigate to the project:
```bash
cd aptly-webui
```

2. Create an environment file:
```bash
cat > .env << EOF
APTLY_WEBUI_PORT=8080
APTLY_ROOT_DIR=/var/lib/aptly
ESM_TOKEN=your_esm_token_here
EOF
```

3. Start the application:
```bash
docker-compose up -d
```

4. Access the Web UI at `http://localhost:8080`

### Manual Installation

1. Install dependencies:
```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
npm run build
```

2. Run the backend:
```bash
cd backend
python app.py
```

3. Serve the frontend (using nginx or any static file server):
```bash
cd frontend/dist
python -m http.server 3000
```

4. Access the Web UI at `http://localhost:3000`

### Systemd Installation

For production deployments on systemd-based systems:

```bash
sudo ./scripts/install.sh
sudo systemctl start aptly-webui
sudo systemctl enable aptly-webui
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APTLY_CLI` | Path to aptly binary | `aptly` |
| `APTLY_ROOT_DIR` | Aptly root directory | `/var/lib/aptly` |
| `ESM_TOKEN` | Ubuntu ESM authentication token | - |
| `FLASK_DEBUG` | Enable Flask debug mode | `false` |
| `PORT` | Backend port | `5000` |

### Ubuntu ESM Setup

To enable Ubuntu ESM mirroring:

1. Obtain your ESM token from Ubuntu Advantage
2. Set the `ESM_TOKEN` environment variable
3. Create mirrors with the "ESM Repository" option enabled

The Web UI will automatically inject the token into ESM URLs when updating mirrors.

## Usage Guide

### Creating a Mirror

1. Navigate to **Mirrors** → **Create Mirror**
2. Enter mirror details:
   - Name: A unique identifier (e.g., `debian-bookworm`)
   - Archive URL: The repository URL (e.g., `http://deb.debian.org/debian`)
   - Distribution: The release name (e.g., `bookworm`)
   - Components: Repository sections (e.g., `main, contrib, non-free`)
3. Optionally configure filters, architectures, and ESM support
4. Click **Create Mirror**

### Updating a Mirror

1. Navigate to **Mirrors**
2. Find the mirror you want to update
3. Click the **Update** button (refresh icon)
4. Wait for the download to complete

### Creating a Snapshot

1. Navigate to **Snapshots** → **Create Snapshot**
2. Choose the source:
   - From Mirror: Freeze the current state of a mirror
   - Merge Snapshots: Combine multiple snapshots
   - Empty Snapshot: Start with a blank snapshot
3. Enter snapshot details and click **Create**

### Publishing a Snapshot

1. Navigate to **Publish** → **Publish Snapshot**
2. Select the snapshot to publish
3. Configure:
   - Distribution: The release name (e.g., `bookworm`)
   - Prefix: Optional path prefix (e.g., `debian`)
   - GPG signing options
4. Click **Publish**

### Searching for Packages

1. Navigate to **Package Search**
2. Enter a package name or partial match
3. Optionally toggle search locations (snapshots/published)
4. Results are grouped by location for easy identification

## API Reference

The backend provides a RESTful API at `/api/`. See `backend/app.py` for complete endpoint documentation.

### Key Endpoints

- `GET /api/mirrors` - List all mirrors
- `POST /api/mirrors` - Create a new mirror
- `POST /api/mirrors/{name}/update` - Update a mirror
- `GET /api/snapshots` - List all snapshots
- `POST /api/snapshots` - Create a snapshot
- `GET /api/publish` - List published repositories
- `POST /api/publish` - Publish a snapshot
- `GET /api/packages/search?q={query}` - Search packages

## Architecture

### Frontend
- React 18 with TypeScript
- TanStack Query for data fetching
- React Router for navigation
- Lucide React for icons
- Custom CSS with CSS variables for theming

### Backend
- Flask (Python)
- Direct aptly CLI integration
- CORS enabled for frontend communication
- Structured error handling

### Deployment
- Docker multi-stage build
- Nginx reverse proxy
- Gunicorn WSGI server
- Systemd service support

## Development

### Running in Development Mode

```bash
# Start backend
cd backend
python app.py

# Start frontend (in another terminal)
cd frontend
npm run dev
```

The frontend will proxy API requests to the backend automatically.

### Building for Production

```bash
cd frontend
npm run build
```

Static files will be output to `frontend/dist/`.

## Troubleshooting

### Aptly Not Found
Ensure `aptly` is installed and accessible in the system PATH, or set the `APTLY_CLI` environment variable to the full path.

### Permission Errors
The application needs read/write access to:
- Aptly root directory (default: `/var/lib/aptly`)
- GPG home directory (for signing)

### ESM Authentication Failures
Verify your ESM token is correctly set in the `ESM_TOKEN` environment variable.

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and feature requests, please use the GitHub issue tracker.
