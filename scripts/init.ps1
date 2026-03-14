# ========================================
# R2 Browser Initialization Script (Windows)
# ========================================
# Installs both JavaScript and Rust dependencies

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================"
Write-Host "  R2 Browser - Project Initialization"
Write-Host "========================================"
Write-Host ""

# Get project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

# Check for pnpm
Write-Host "[1/4] Checking prerequisites..." -ForegroundColor Blue
try {
    $null = Get-Command pnpm -ErrorAction Stop
    Write-Host "  √ pnpm found" -ForegroundColor Green
} catch {
    Write-Host "ERROR: pnpm is not installed" -ForegroundColor Red
    Write-Host "Please install pnpm: npm install -g pnpm"
    exit 1
}

# Check for Rust/Cargo
try {
    $null = Get-Command cargo -ErrorAction Stop
    Write-Host "  √ cargo found" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Rust/Cargo is not installed" -ForegroundColor Red
    Write-Host "Please install from: https://rustup.rs/"
    exit 1
}

# Install Node.js dependencies
Write-Host ""
Write-Host "[2/4] Installing Node.js dependencies..." -ForegroundColor Blue
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install Node.js dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "  √ Node.js dependencies installed" -ForegroundColor Green

# Install Rust dependencies
Write-Host ""
Write-Host "[3/4] Installing Rust dependencies..." -ForegroundColor Blue
Set-Location src-tauri
cargo fetch
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install Rust dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "  √ Rust dependencies installed" -ForegroundColor Green

Set-Location $ProjectRoot

# Verify installation
Write-Host ""
Write-Host "[4/4] Verifying installation..." -ForegroundColor Blue
if ((Test-Path "node_modules") -and (Test-Path "src-tauri\target")) {
    Write-Host "  √ All dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "  ! Some dependencies may not have been installed correctly" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Initialization completed!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  pnpm tauri dev    - Start development server"
Write-Host "  pnpm tauri build  - Build for production"
Write-Host ""
