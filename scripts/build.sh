#!/bin/bash

# ========================================
# R2 Browser Build Script for Unix/macOS
# ========================================

set -e

# Default options
BUILD_MODE="release"
SKIP_DEPS=0
SKIP_CHECKS=0
CLEAN=0
NO_SIGN=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse command line arguments
show_help() {
    echo "Usage: ./build.sh [options]"
    echo ""
    echo "Options:"
    echo "  --debug        Build in debug mode (faster, larger binary)"
    echo "  --skip-deps    Skip dependency installation"
    echo "  --skip-checks  Skip type checking and linting"
    echo "  --clean        Clean build artifacts before building"
    echo "  --no-sign      Build without code signing"
    echo "  --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./build.sh                      Build release version"
    echo "  ./build.sh --debug              Build debug version"
    echo "  ./build.sh --clean              Clean build"
    echo "  ./build.sh --skip-checks        Fast build without checks"
    echo "  ./build.sh --no-sign            Build without signing"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            BUILD_MODE="debug"
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=1
            shift
            ;;
        --skip-checks)
            SKIP_CHECKS=1
            shift
            ;;
        --clean)
            CLEAN=1
            shift
            ;;
        --no-sign)
            NO_SIGN=1
            shift
            ;;
        --help)
            show_help
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            ;;
    esac
done

echo ""
echo "========================================"
echo "  R2 Browser Build Script"
echo "========================================"
echo -e "Build mode: ${BLUE}${BUILD_MODE}${NC}"
echo ""

# Check for signing key
KEY_PATH="$HOME/.tauri/r2browser.key"
if [ $NO_SIGN -eq 0 ]; then
    if [ -f "$KEY_PATH" ] && [ -z "$TAURI_SIGNING_PRIVATE_KEY" ]; then
        echo -e "${CYAN}[*] Loading signing key from: $KEY_PATH${NC}"
        export TAURI_SIGNING_PRIVATE_KEY=$(cat "$KEY_PATH")
        echo -e "${GREEN}[*] Signing key loaded${NC}"
    elif [ ! -f "$KEY_PATH" ] && [ -z "$TAURI_SIGNING_PRIVATE_KEY" ]; then
        echo -e "${YELLOW}[!] WARNING: No signing key found. Building without code signing.${NC}"
        echo -e "${YELLOW}    Run 'pnpm run setup-signing' to generate signing keys.${NC}"
        echo ""
    fi
fi

# Check dependencies
echo -e "${BLUE}[1/7]${NC} Checking dependencies..."
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}ERROR: pnpm is not installed${NC}"
    echo "Please install pnpm: npm install -g pnpm"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo -e "${RED}ERROR: Rust/Cargo is not installed${NC}"
    echo "Please install from: https://rustup.rs/"
    exit 1
fi

# Detect platform
OS_TYPE=$(uname -s)
echo -e "${GREEN}Detected platform: ${OS_TYPE}${NC}"

# Clean build artifacts if requested
if [ $CLEAN -eq 1 ]; then
    echo -e "${BLUE}[2/7]${NC} Cleaning build artifacts..."
    rm -rf dist
    rm -rf src-tauri/target
    echo -e "${GREEN}Build artifacts cleaned${NC}"
else
    echo -e "${BLUE}[2/7]${NC} Skipping clean (use --clean to clean)"
fi

# Install dependencies
if [ $SKIP_DEPS -eq 1 ]; then
    echo -e "${BLUE}[3/7]${NC} Skipping dependency installation"
else
    echo -e "${BLUE}[3/7]${NC} Installing Node.js dependencies..."
    pnpm install
fi

# Type checking
if [ $SKIP_CHECKS -eq 1 ]; then
    echo -e "${BLUE}[4/7]${NC} Skipping type checks"
else
    echo -e "${BLUE}[4/7]${NC} Running type checks..."
    pnpm run check
fi

# Lint
if [ $SKIP_CHECKS -eq 1 ]; then
    echo -e "${BLUE}[5/7]${NC} Skipping linting"
else
    echo -e "${BLUE}[5/7]${NC} Running linter..."
    pnpm run lint || echo -e "${YELLOW}WARNING: Linting issues found, continuing build...${NC}"
fi

# Build frontend
echo -e "${BLUE}[6/7]${NC} Building frontend..."
pnpm run build

# Build Tauri application
echo -e "${BLUE}[7/7]${NC} Building Tauri application..."
if [ "$BUILD_MODE" = "debug" ]; then
    pnpm tauri build --debug
else
    pnpm tauri build
fi

echo ""
echo "========================================"
echo -e "  ${GREEN}Build completed successfully!${NC}"
echo "========================================"
echo ""
echo "Build artifacts:"
if [ "$BUILD_MODE" = "release" ]; then
    case $OS_TYPE in
        Darwin)
            echo "  DMG:        src-tauri/target/release/bundle/dmg/"
            echo "  App:        src-tauri/target/release/bundle/macos/"
            echo "  Executable: src-tauri/target/release/r2browser"
            ;;
        Linux)
            echo "  DEB:        src-tauri/target/release/bundle/deb/"
            echo "  AppImage:   src-tauri/target/release/bundle/appimage/"
            echo "  Executable: src-tauri/target/release/r2browser"
            ;;
        *)
            echo "  Executable: src-tauri/target/release/r2browser"
            ;;
    esac
else
    echo "  Executable: src-tauri/target/debug/r2browser"
fi
echo ""