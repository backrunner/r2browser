#!/bin/bash

# ========================================
# R2 Browser Release Script
# ========================================
# This script automates the release process:
# 1. Version bump
# 2. Build all artifacts
# 3. Create git tag
# 4. Prepare release notes

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Version bump type
BUMP_TYPE=""
NEW_VERSION=""
SKIP_BUILD=0
SKIP_TAG=0

show_help() {
    echo "Usage: ./release.sh [options]"
    echo ""
    echo "Options:"
    echo "  --major        Bump major version (x.0.0)"
    echo "  --minor        Bump minor version (0.x.0)"
    echo "  --patch        Bump patch version (0.0.x)"
    echo "  --version X.Y.Z Set specific version"
    echo "  --skip-build   Skip building artifacts"
    echo "  --skip-tag     Skip creating git tag"
    echo "  --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./release.sh --patch              Bump patch version and release"
    echo "  ./release.sh --version 1.0.0      Release version 1.0.0"
    echo "  ./release.sh --minor --skip-tag   Bump minor but don't tag"
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --major) BUMP_TYPE="major"; shift ;;
        --minor) BUMP_TYPE="minor"; shift ;;
        --patch) BUMP_TYPE="patch"; shift ;;
        --version) NEW_VERSION="$2"; shift 2 ;;
        --skip-build) SKIP_BUILD=1; shift ;;
        --skip-tag) SKIP_TAG=1; shift ;;
        --help) show_help ;;
        *) echo -e "${RED}Unknown option: $1${NC}"; show_help ;;
    esac
done

# Validate inputs
if [ -z "$BUMP_TYPE" ] && [ -z "$NEW_VERSION" ]; then
    echo -e "${RED}ERROR: Must specify --major, --minor, --patch, or --version${NC}"
    show_help
fi

echo ""
echo "========================================"
echo "  R2 Browser Release Script"
echo "========================================"
echo ""

# Load signing key if available
KEY_PATH="$HOME/.tauri/r2browser.key"
if [ -f "$KEY_PATH" ] && [ -z "$TAURI_SIGNING_PRIVATE_KEY" ]; then
    echo -e "${CYAN}[*] Loading signing key from: $KEY_PATH${NC}"
    export TAURI_SIGNING_PRIVATE_KEY=$(cat "$KEY_PATH")
    echo -e "${GREEN}[*] Signing key loaded${NC}"
    echo ""
elif [ ! -f "$KEY_PATH" ] && [ -z "$TAURI_SIGNING_PRIVATE_KEY" ]; then
    echo -e "${YELLOW}[!] WARNING: No signing key found.${NC}"
    echo -e "${YELLOW}    Run 'pnpm run setup-signing' to generate signing keys.${NC}"
    echo ""
fi

# Get current version
CURRENT_VERSION=$(grep -m 1 '"version":' package.json | sed 's/.*"version": "\(.*\)".*/\1/')
echo -e "${BLUE}Current version: ${CURRENT_VERSION}${NC}"

# Calculate new version
if [ -z "$NEW_VERSION" ]; then
    IFS='.' read -r -a VERSION_PARTS <<< "$CURRENT_VERSION"
    MAJOR="${VERSION_PARTS[0]}"
    MINOR="${VERSION_PARTS[1]}"
    PATCH="${VERSION_PARTS[2]}"

    case $BUMP_TYPE in
        major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
        minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
        patch) PATCH=$((PATCH + 1)) ;;
    esac

    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi

echo -e "${GREEN}New version: ${NEW_VERSION}${NC}"
echo ""

# Confirm
read -p "Continue with version ${NEW_VERSION}? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 1
fi

# Check git status
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}WARNING: Working directory is not clean${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted"
        exit 1
    fi
fi

# Update version in package.json
echo -e "${BLUE}[1/6]${NC} Updating package.json..."
sed -i.bak "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
rm -f package.json.bak

# Update version in Cargo.toml
echo -e "${BLUE}[2/6]${NC} Updating Cargo.toml..."
sed -i.bak "s/version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
rm -f src-tauri/Cargo.toml.bak

# Update version in tauri.conf.json
echo -e "${BLUE}[3/6]${NC} Updating tauri.conf.json..."
sed -i.bak "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
rm -f src-tauri/tauri.conf.json.bak

# Build artifacts
if [ $SKIP_BUILD -eq 0 ]; then
    echo -e "${BLUE}[4/6]${NC} Building release artifacts..."
    ./scripts/build.sh
else
    echo -e "${BLUE}[4/6]${NC} Skipping build"
fi

# Commit changes
echo -e "${BLUE}[5/6]${NC} Committing version changes..."
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: bump version to v${NEW_VERSION}" || true

# Create git tag
if [ $SKIP_TAG -eq 0 ]; then
    echo -e "${BLUE}[6/6]${NC} Creating git tag..."
    git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"
    echo -e "${GREEN}Created tag: v${NEW_VERSION}${NC}"
else
    echo -e "${BLUE}[6/6]${NC} Skipping git tag"
fi

echo ""
echo "========================================"
echo -e "  ${GREEN}Release prepared successfully!${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git log -1"
echo "  2. Push to remote: git push && git push --tags"
echo "  3. Create GitHub release with artifacts from:"
echo "     src-tauri/target/release/bundle/"
echo ""
