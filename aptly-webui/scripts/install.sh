#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Aptly Web UI Installation Script ===${NC}"
echo ""

# Check if running as root for system-wide install
if [ "$EUID" -eq 0 ]; then
   echo -e "${YELLOW}Running as root - will perform system-wide installation${NC}"
   INSTALL_DIR="/opt/aptly-webui"
   USER="aptly"
   CREATE_USER=true
else
   echo -e "${YELLOW}Running as regular user - will install to home directory${NC}"
   INSTALL_DIR="$HOME/aptly-webui"
   USER=$USER
   CREATE_USER=false
fi

# Check dependencies
echo -e "${GREEN}Checking dependencies...${NC}"

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is required but not installed.${NC}"
    exit 1
fi

if ! command -v pip3 &> /dev/null; then
    echo -e "${RED}pip3 is required but not installed.${NC}"
    exit 1
fi

if ! command -v aptly &> /dev/null; then
    echo -e "${YELLOW}Warning: aptly is not installed. The Web UI will work but you need to install aptly separately.${NC}"
fi

# Create user if needed
if [ "$CREATE_USER" = true ]; then
    echo -e "${GREEN}Creating aptly user...${NC}"
    if ! id -u aptly &> /dev/null; then
        useradd -r -s /bin/false -m -d /var/lib/aptly aptly
    fi
fi

# Create installation directory
echo -e "${GREEN}Creating installation directory...${NC}"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Copy application files
echo -e "${GREEN}Installing application files...${NC}"
# Note: In a real scenario, you would copy files from the distribution
# For now, we assume the script is run from the project directory
if [ -f "backend/app.py" ]; then
    cp -r backend "$INSTALL_DIR/"
    cp -r frontend/dist "$INSTALL_DIR/frontend" 2>/dev/null || echo -e "${YELLOW}Frontend build not found, will serve API only${NC}"
    cp nginx/nginx.conf "$INSTALL_DIR/" 2>/dev/null
    cp systemd/aptly-webui.service "$INSTALL_DIR/" 2>/dev/null
else
    echo -e "${RED}Please run this script from the aptly-webui project directory.${NC}"
    exit 1
fi

# Create virtual environment
echo -e "${GREEN}Creating Python virtual environment...${NC}"
python3 -m venv "$INSTALL_DIR/venv"
source "$INSTALL_DIR/venv/bin/activate"

# Install Python dependencies
echo -e "${GREEN}Installing Python dependencies...${NC}"
pip install --upgrade pip
pip install -r "$INSTALL_DIR/backend/requirements.txt"

# Create log directory
mkdir -p /var/log/aptly-webui

# Set permissions
if [ "$CREATE_USER" = true ]; then
    chown -R aptly:aptly "$INSTALL_DIR"
    chown -R aptly:aptly /var/log/aptly-webui
    chown -R aptly:aptly /var/lib/aptly 2>/dev/null || true
fi

# Create systemd service file
echo -e "${GREEN}Setting up systemd service...${NC}"
if [ "$CREATE_USER" = true ] && [ -f "systemd/aptly-webui.service" ]; then
    cp systemd/aptly-webui.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable aptly-webui.service
    echo -e "${GREEN}Systemd service installed. Start with: systemctl start aptly-webui${NC}"
fi

# Create environment file
if [ "$CREATE_USER" = true ]; then
    mkdir -p /etc/aptly-webui
    cat > /etc/aptly-webui/environment << EOF
# Aptly Web UI Environment Configuration
APTLY_CLI=aptly
ESM_TOKEN=
EOF
fi

echo ""
echo -e "${GREEN}=== Installation Complete ===${NC}"
echo ""
echo "Installation directory: $INSTALL_DIR"
if [ "$CREATE_USER" = true ]; then
    echo "To start the service: sudo systemctl start aptly-webui"
    echo "To view status: sudo systemctl status aptly-webui"
    echo "To view logs: sudo journalctl -u aptly-webui -f"
else
    echo "To start the backend:"
    echo "  cd $INSTALL_DIR"
    echo "  source venv/bin/activate"
    echo "  cd backend && python app.py"
fi
echo ""
echo -e "${YELLOW}Note: Make sure aptly is configured and accessible.${NC}"
echo -e "${YELLOW}Edit /etc/aptly-webui/environment to configure ESM tokens and other settings.${NC}"
