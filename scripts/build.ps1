# ========================================
# R2 Browser Build Script for PowerShell
# ========================================

param(
    [switch]$Debug,
    [switch]$SkipDeps,
    [switch]$SkipChecks,
    [switch]$Clean,
    [switch]$NoSign,
    [switch]$Help
)

# Show help
if ($Help) {
    Write-Host "Usage: .\build.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Debug        Build in debug mode (faster, larger binary)"
    Write-Host "  -SkipDeps     Skip dependency installation"
    Write-Host "  -SkipChecks   Skip type checking and linting"
    Write-Host "  -Clean        Clean build artifacts before building"
    Write-Host "  -NoSign       Build without code signing"
    Write-Host "  -Help         Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\build.ps1                    Build release version"
    Write-Host "  .\build.ps1 -Debug             Build debug version"
    Write-Host "  .\build.ps1 -Clean             Clean build"
    Write-Host "  .\build.ps1 -SkipChecks        Fast build without checks"
    Write-Host "  .\build.ps1 -NoSign            Build without signing"
    exit 0
}

$BuildMode = if ($Debug) { "debug" } else { "release" }

Write-Host ""
Write-Host "========================================"
Write-Host "  R2 Browser Build Script"
Write-Host "========================================"
Write-Host "Build mode: $BuildMode"
Write-Host ""

# Check for signing key
$KeyPath = Join-Path $env:USERPROFILE ".tauri\r2browser.key"
if (-not $NoSign -and (Test-Path $KeyPath) -and -not $env:TAURI_SIGNING_PRIVATE_KEY) {
    Write-Host "[*] Loading signing key from: $KeyPath" -ForegroundColor Cyan
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $KeyPath -Raw
    Write-Host "[*] Signing key loaded" -ForegroundColor Green
} elseif (-not $NoSign -and -not $env:TAURI_SIGNING_PRIVATE_KEY -and -not (Test-Path $KeyPath)) {
    Write-Host "[!] WARNING: No signing key found. Building without code signing." -ForegroundColor Yellow
    Write-Host "    Run 'pnpm run setup-signing' to generate signing keys." -ForegroundColor Yellow
    Write-Host ""
}

# Check dependencies
Write-Host "[1/7] Checking dependencies..." -ForegroundColor Blue
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: pnpm is not installed" -ForegroundColor Red
    Write-Host "Please install pnpm: npm install -g pnpm"
    exit 1
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Rust/Cargo is not installed" -ForegroundColor Red
    Write-Host "Please install from: https://rustup.rs/"
    exit 1
}

# Clean build artifacts if requested
if ($Clean) {
    Write-Host "[2/7] Cleaning build artifacts..." -ForegroundColor Blue
    if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
    if (Test-Path "src-tauri\target") { Remove-Item -Recurse -Force "src-tauri\target" }
    Write-Host "Build artifacts cleaned" -ForegroundColor Green
} else {
    Write-Host "[2/7] Skipping clean (use -Clean to clean)" -ForegroundColor Blue
}

# Install dependencies
if ($SkipDeps) {
    Write-Host "[3/7] Skipping dependency installation" -ForegroundColor Blue
} else {
    Write-Host "[3/7] Installing Node.js dependencies..." -ForegroundColor Blue
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Type checking
if ($SkipChecks) {
    Write-Host "[4/7] Skipping type checks" -ForegroundColor Blue
} else {
    Write-Host "[4/7] Running type checks..." -ForegroundColor Blue
    pnpm run check
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Type check failed" -ForegroundColor Red
        exit 1
    }
}

# Lint
if ($SkipChecks) {
    Write-Host "[5/7] Skipping linting" -ForegroundColor Blue
} else {
    Write-Host "[5/7] Running linter..." -ForegroundColor Blue
    pnpm run lint
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Linting issues found, continuing build..." -ForegroundColor Yellow
    }
}

# Build frontend
Write-Host "[6/7] Building frontend..." -ForegroundColor Blue
pnpm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend build failed" -ForegroundColor Red
    exit 1
}

# Build Tauri application
Write-Host "[7/7] Building Tauri application..." -ForegroundColor Blue
if ($Debug) {
    pnpm tauri build --debug
} else {
    pnpm tauri build
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Tauri build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Build completed successfully!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Build artifacts:"
if ($BuildMode -eq "release") {
    Write-Host "  MSI Installer:  src-tauri\target\release\bundle\msi\"
    Write-Host "  NSIS Installer: src-tauri\target\release\bundle\nsis\"
    Write-Host "  Executable:     src-tauri\target\release\r2browser.exe"
} else {
    Write-Host "  Executable:     src-tauri\target\debug\r2browser.exe"
}
Write-Host ""
