#!/bin/bash

# ========================================
# R2 Browser Initialization Script
# ========================================
# Installs both JavaScript and Rust dependencies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "========================================"
echo "  R2 Browser - Project Initialization"
echo "========================================"
echo ""

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Check for pnpm
echo -e "${BLUE}[1/4]${NC} Checking prerequisites..."
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}ERROR: pnpm is not installed${NC}"
    echo "Please install pnpm: npm install -g pnpm"
    exit 1
fi
echo -e "${GREEN}  ✓ pnpm found${NC}"

# Check for Rust/Cargo
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}ERROR: Rust/Cargo is not installed${NC}"
    echo "Please install from: https://rustup.rs/"
    exit 1
fi
echo -e "${GREEN}  ✓ cargo found${NC}"

# Install Node.js dependencies
echo ""
echo -e "${BLUE}[2/4]${NC} Installing Node.js dependencies..."
pnpm install
echo -e "${GREEN}  ✓ Node.js dependencies installed${NC}"

# Install Rust dependencies
echo ""
echo -e "${BLUE}[3/4]${NC} Installing Rust dependencies..."
cd src-tauri
cargo fetch
echo -e "${GREEN}  ✓ Rust dependencies installed${NC}"

cd "$PROJECT_ROOT"

# Verify installation
echo ""
echo -e "${BLUE}[4/4]${NC} Verifying installation..."
if [ -d "node_modules" ] && [ -d "src-tauri/target" ]; then
    echo -e "${GREEN}  ✓ All dependencies installed successfully${NC}"
else
    echo -e "${YELLOW}  ! Some dependencies may not have been installed correctly${NC}"
fi

echo ""
echo "========================================"
echo -e "  ${GREEN}Initialization completed!${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "  pnpm tauri dev    - Start development server"
echo "  pnpm tauri build  - Build for production"
echo ""
