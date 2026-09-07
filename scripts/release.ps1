param(
    [switch]$Stable,
    [switch]$Beta,
    [switch]$Major,
    [switch]$Minor,
    [switch]$Patch,
    [switch]$Prerelease,
    [switch]$Promote,
    [string]$Version,
    [switch]$NoPush,
    [switch]$SkipChecks,
    [switch]$DryRun,
    [switch]$Help
)

if ($Help) {
    Write-Host "Usage: .\scripts\release.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Stable       Publish to the stable channel (default)"
    Write-Host "  -Beta         Publish to the beta channel"
    Write-Host "  -Major        Bump the major version"
    Write-Host "  -Minor        Bump the minor version"
    Write-Host "  -Patch        Bump the patch version"
    Write-Host "  -Prerelease   Increment an existing beta prerelease number"
    Write-Host "  -Promote      Promote the current beta version to stable"
    Write-Host "  -Version      Publish an explicit version"
    Write-Host "  -NoPush       Create the commit and tag locally only"
    Write-Host "  -SkipChecks   Skip local checks (CI still validates)"
    Write-Host "  -DryRun   Preview without edits, commits, tags or pushes"
    exit 0
}

$channel = if ($Beta) { 'beta' } else { 'stable' }
$bump = $null

if ($Major) {
    $bump = 'major'
} elseif ($Minor) {
    $bump = 'minor'
} elseif ($Patch) {
    $bump = 'patch'
} elseif ($Prerelease) {
    $bump = 'prerelease'
} elseif ($Promote) {
    $bump = 'release'
}

if (-not $Version -and -not $bump) {
    Write-Host 'You must provide -Version, -Major, -Minor, -Patch, -Prerelease, or -Promote.' -ForegroundColor Red
    exit 1
}

$arguments = @('scripts/release.mjs', '--channel', $channel)
if ($Version) {
    $arguments += @('--version', $Version)
} else {
    $arguments += @('--bump', $bump)
}

if ($NoPush) {
    $arguments += '--no-push'
}
if ($SkipChecks) {
    $arguments += '--skip-checks'
}
if ($DryRun) {
    $arguments += '--dry-run'
}

& node @arguments
exit $LASTEXITCODE
