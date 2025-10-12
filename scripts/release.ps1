# ========================================
# R2 Browser Release Script for PowerShell
# ========================================

param(
    [switch]$Major,
    [switch]$Minor,
    [switch]$Patch,
    [string]$Version,
    [switch]$SkipBuild,
    [switch]$SkipTag,
    [switch]$Help
)

if ($Help) {
    Write-Host "Usage: .\release.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Major        Bump major version (x.0.0)"
    Write-Host "  -Minor        Bump minor version (0.x.0)"
    Write-Host "  -Patch        Bump patch version (0.0.x)"
    Write-Host "  -Version X.Y.Z Set specific version"
    Write-Host "  -SkipBuild    Skip building artifacts"
    Write-Host "  -SkipTag      Skip creating git tag"
    Write-Host "  -Help         Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\release.ps1 -Patch              Bump patch version and release"
    Write-Host "  .\release.ps1 -Version 1.0.0      Release version 1.0.0"
    Write-Host "  .\release.ps1 -Minor -SkipTag     Bump minor but don't tag"
    exit 0
}

# Validate inputs
if (-not $Major -and -not $Minor -and -not $Patch -and -not $Version) {
    Write-Host "ERROR: Must specify -Major, -Minor, -Patch, or -Version" -ForegroundColor Red
    Write-Host "Run .\release.ps1 -Help for usage information"
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "  R2 Browser Release Script"
Write-Host "========================================"
Write-Host ""

# Load signing key if available
$KeyPath = Join-Path $env:USERPROFILE ".tauri\r2browser.key"
if ((Test-Path $KeyPath) -and -not $env:TAURI_SIGNING_PRIVATE_KEY) {
    Write-Host "[*] Loading signing key from: $KeyPath" -ForegroundColor Cyan
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $KeyPath -Raw
    Write-Host "[*] Signing key loaded" -ForegroundColor Green
    Write-Host ""
} elseif (-not (Test-Path $KeyPath) -and -not $env:TAURI_SIGNING_PRIVATE_KEY) {
    Write-Host "[!] WARNING: No signing key found." -ForegroundColor Yellow
    Write-Host "    Run 'pnpm run setup-signing' to generate signing keys." -ForegroundColor Yellow
    Write-Host ""
}

# Get current version
$PackageJson = Get-Content "package.json" | ConvertFrom-Json
$CurrentVersion = $PackageJson.version
Write-Host "Current version: $CurrentVersion" -ForegroundColor Blue

# Calculate new version
if ($Version) {
    $NewVersion = $Version
} else {
    $VersionParts = $CurrentVersion -split '\.'
    $MajorNum = [int]$VersionParts[0]
    $MinorNum = [int]$VersionParts[1]
    $PatchNum = [int]$VersionParts[2]

    if ($Major) { $MajorNum++; $MinorNum = 0; $PatchNum = 0 }
    elseif ($Minor) { $MinorNum++; $PatchNum = 0 }
    elseif ($Patch) { $PatchNum++ }

    $NewVersion = "$MajorNum.$MinorNum.$PatchNum"
}

Write-Host "New version: $NewVersion" -ForegroundColor Green
Write-Host ""

# Confirm
$Confirm = Read-Host "Continue with version $NewVersion? (y/N)"
if ($Confirm -notmatch '^[Yy]$') {
    Write-Host "Aborted"
    exit 1
}

# Check git status
$GitStatus = git status --porcelain
if ($GitStatus) {
    Write-Host "WARNING: Working directory is not clean" -ForegroundColor Yellow
    $Confirm = Read-Host "Continue anyway? (y/N)"
    if ($Confirm -notmatch '^[Yy]$') {
        Write-Host "Aborted"
        exit 1
    }
}

# Update version in package.json
Write-Host "[1/6] Updating package.json..." -ForegroundColor Blue
$PackageJson.version = $NewVersion
$PackageJson | ConvertTo-Json -Depth 100 | Set-Content "package.json"

# Update version in Cargo.toml
Write-Host "[2/6] Updating Cargo.toml..." -ForegroundColor Blue
$CargoContent = Get-Content "src-tauri\Cargo.toml"
$CargoContent = $CargoContent -replace "version = `"$CurrentVersion`"", "version = `"$NewVersion`""
$CargoContent | Set-Content "src-tauri\Cargo.toml"

# Update version in tauri.conf.json
Write-Host "[3/6] Updating tauri.conf.json..." -ForegroundColor Blue
$TauriConfig = Get-Content "src-tauri\tauri.conf.json" | ConvertFrom-Json
$TauriConfig.version = $NewVersion
$TauriConfig | ConvertTo-Json -Depth 100 | Set-Content "src-tauri\tauri.conf.json"

# Build artifacts
if (-not $SkipBuild) {
    Write-Host "[4/6] Building release artifacts..." -ForegroundColor Blue
    .\scripts\build.ps1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Build failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[4/6] Skipping build" -ForegroundColor Blue
}

# Commit changes
Write-Host "[5/6] Committing version changes..." -ForegroundColor Blue
git add package.json src-tauri\Cargo.toml src-tauri\tauri.conf.json
git commit -m "chore: bump version to v$NewVersion"

# Create git tag
if (-not $SkipTag) {
    Write-Host "[6/6] Creating git tag..." -ForegroundColor Blue
    git tag -a "v$NewVersion" -m "Release v$NewVersion"
    Write-Host "Created tag: v$NewVersion" -ForegroundColor Green
} else {
    Write-Host "[6/6] Skipping git tag" -ForegroundColor Blue
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Release prepared successfully!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Review the changes: git log -1"
Write-Host "  2. Push to remote: git push && git push --tags"
Write-Host "  3. Create GitHub release with artifacts from:"
Write-Host "     src-tauri\target\release\bundle\"
Write-Host ""
