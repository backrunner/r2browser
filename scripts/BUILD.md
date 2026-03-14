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
| `release.ps1` | Windows | PowerShell release automation |
| `release.sh` | Linux/macOS | Bash release automation |
| `bump-version.js` | All | Node.js version bumping utility |

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

### 1. Version Bump

```bash
# Using npm scripts (recommended)
pnpm run release:patch  # 0.0.x
pnpm run release:minor  # 0.x.0
pnpm run release:major  # x.0.0

# Using release scripts
# Windows
.\scripts\release.ps1 -Patch

# Linux/macOS
./scripts/release.sh --patch
```

### 2. Build

The release scripts automatically build the application. To build manually:

```bash
pnpm run build:release
```

### 3. Create Release

The release scripts create git tags automatically. Push to trigger CI/CD:

```bash
git push && git push --tags
```

GitHub Actions will automatically:
- Build for all platforms
- Run tests
- Create release artifacts
- Publish GitHub release

## CI/CD

This project uses GitHub Actions for automated building and releasing.

### Workflows

- **Build and Test**: Runs on every push and pull request
- **Release**: Triggered when a tag starting with `v` is pushed

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

- `TAURI_PRIVATE_KEY`: Generated with `pnpm tauri signer generate`
- `TAURI_KEY_PASSWORD`: Password for the private key

Generate updater keys:
```bash
pnpm tauri signer generate -w ~/.tauri/myapp.key
```

Then add the private key and password to GitHub repository secrets.

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
