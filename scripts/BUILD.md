# Build Scripts

This directory contains automated build and release scripts for R2 Browser.

## Quick Start

### Windows

```powershell
# PowerShell (Recommended)
.\scripts\build.ps1

# Batch
.\scripts\build.bat
```

### Linux/macOS

```bash
# Make executable first
chmod +x scripts/build.sh

# Run build
./scripts/build.sh
```

### Using npm/pnpm scripts

```bash
# Release build
pnpm run build:release

# Debug build
pnpm run build:debug

# Clean build
pnpm run build:clean

# Clean only
pnpm run clean
```

## Available Scripts

### Build Scripts

| Script | Platform | Description |
|--------|----------|-------------|
| `build.bat` | Windows | Batch script for Windows |
| `build.ps1` | Windows | PowerShell script (recommended for Windows) |
| `build.sh` | Linux/macOS | Bash script for Unix-like systems |

### Release Scripts

| Script | Platform | Description |
|--------|----------|-------------|
| `release.ps1` | Windows | PowerShell wrapper for the release automation |
| `release.sh` | Linux/macOS | Bash wrapper for the release automation |
| `release.mjs` | All | Cross-platform tag-driven GitHub release automation |
| `merge-updater-manifest.mjs` | All | Merges per-target updater manifests into a single `latest.json` |

## Build Options

All build scripts support the following options:

| Option | Description |
|--------|-------------|
| `--debug` / `-Debug` | Build in debug mode (faster, larger binaries) |
| `--clean` / `-Clean` | Clean build artifacts before building |
| `--skip-deps` / `-SkipDeps` | Skip dependency installation |
| `--skip-checks` / `-SkipChecks` | Skip type checking and linting |
| `--help` / `-Help` | Show help message |

## Release Workflow

### Release Channels

- **Stable** tags use `vX.Y.Z`
- **Beta** tags use `vX.Y.Z-beta.N`
- Stable auto-updates read from the machine-managed `updater-stable/latest.json` release asset
- Beta auto-updates read from the machine-managed `updater-beta/latest.json` release asset

### 1. Version Bump, Tag, and Push

```bash
# Stable releases
pnpm run release:patch
pnpm run release:minor
pnpm run release:major
pnpm run release:promote   # promote vX.Y.Z-beta.N -> vX.Y.Z

# Beta releases
pnpm run release:beta:patch
pnpm run release:beta:minor
pnpm run release:beta:major
pnpm run release:beta:next

# Custom version
pnpm run release -- --channel beta --version 1.4.0-beta.1
```

The release script will automatically:
- run `pnpm run lint`, `pnpm run check`, and `cargo check`
- update `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
- create a release commit
- create an annotated git tag
- push the commit and tag to GitHub

Use `--no-push` if you want to stop before publishing, or `--skip-checks` for an emergency/manual release.

### 2. GitHub Actions Release

GitHub Actions will automatically:
- build Windows, macOS (Intel + Apple Silicon), and Linux artifacts
- publish the tagged GitHub release
- merge updater manifests into a single `latest.json`
- update the stable or beta pointer release used by in-app auto-updates

## CI/CD

This project uses GitHub Actions for automated building and releasing.

### Workflows

- **CI**: Runs on every push to `main` and every pull request; performs lint, typecheck, frontend build, `cargo check`, and `cargo test --no-run`
- **Release**: Triggered when a tag starting with `v` is pushed; builds installers, publishes the GitHub release, and refreshes the auto-update channel manifest

### Artifacts

Built artifacts are available in:
- **GitHub Actions**: Download from workflow runs
- **GitHub Releases**: Attached to tagged releases

## Build Outputs

### Windows
- `src-tauri/target/release/bundle/msi/*.msi` - MSI installer
- `src-tauri/target/release/bundle/nsis/*.exe` - NSIS installer
- `src-tauri/target/release/r2browser.exe` - Standalone executable

### macOS
- `src-tauri/target/release/bundle/dmg/*.dmg` - DMG installer
- `src-tauri/target/release/bundle/macos/*.app` - App bundle
- `src-tauri/target/release/r2browser` - Standalone executable

### Linux
- `src-tauri/target/release/bundle/deb/*.deb` - DEB package
- `src-tauri/target/release/bundle/appimage/*.AppImage` - AppImage
- `src-tauri/target/release/r2browser` - Standalone executable

## Prerequisites

### Required for All Platforms
- **Node.js**: v18 or later
- **pnpm**: `npm install -g pnpm`
- **Rust**: Install from [rustup.rs](https://rustup.rs/)

### Windows-specific
- **Visual Studio Build Tools**: For Rust MSVC toolchain
- **WebView2**: Pre-installed on Windows 10/11

### macOS-specific
- **Xcode Command Line Tools**: `xcode-select --install`

### Linux-specific
Tauri 2 on Linux currently targets the WebKitGTK 4.1 package series and GTK 3 runtime stack, so the latest supported prerequisite set is:

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

## Troubleshooting

### "pnpm not found"
```bash
npm install -g pnpm
```

### "cargo not found"
Install Rust from https://rustup.rs/ and restart your terminal.

### Type check failures
```bash
pnpm install
pnpm run check
```

### Build failures on Linux
Ensure all system dependencies are installed:
```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libxdo-dev build-essential
```

### Permission denied (Linux/macOS)
```bash
chmod +x scripts/*.sh
```

### GitHub Actions secrets

For automated releases, configure these secrets in your repository:

- `TAURI_SIGNING_PRIVATE_KEY`: Generated with `pnpm tauri signer generate`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password for the private key

Generate updater keys:
```bash
pnpm run setup-signing
```

Then add the private key and password to GitHub repository secrets.

## Auto-Update Notes

- In-app auto-update is split into **stable** and **beta** channels, and users can switch channels from Settings.
- The updater pipeline is fully GitHub-based: releases are published to GitHub Releases and channel manifests are served from machine-managed GitHub release assets.
- The current Tauri updater integration uses signed full-package downloads, not binary diff patches. If cross-platform delta updates become a hard requirement, we will need a custom updater pipeline beyond the stock Tauri updater workflow.

## Development

For development builds, use:

```bash
# Development mode with hot reload
pnpm dev

# Type checking
pnpm run check

# Linting
pnpm run lint

# Frontend preview
pnpm run preview
```

## Performance Tips

1. **Use `--skip-checks`** for faster iteration during development
2. **Use `--skip-deps`** if dependencies haven't changed
3. **Use debug builds** (`--debug`) for faster compilation
4. **Clean builds** only when necessary (it's slower)

## Examples

```bash
# Quick development build
pnpm run build:debug

# Production build with all checks
pnpm run build:release

# Fast iteration (skip checks)
# Windows
.\scripts\build.ps1 -Debug -SkipChecks

# Linux/macOS
./scripts/build.sh --debug --skip-checks

# Complete release process
# Windows
.\scripts\release.ps1 -Patch

# Linux/macOS
./scripts/release.sh --patch
```

## Support

For issues or questions:
- Check the [documentation](../README.md)
- Open an issue on [GitHub](https://github.com/backrunner/r2browser/issues)
- Read the [Tauri documentation](https://tauri.app/v1/guides/)
