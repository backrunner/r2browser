@echo off
setlocal enabledelayedexpansion

REM ========================================
REM R2 Browser Build Script for Windows
REM ========================================

set BUILD_MODE=release
set SKIP_DEPS=0
set SKIP_CHECKS=0
set CLEAN=0
set NO_SIGN=0

REM Parse command line arguments
:parse_args
if "%~1"=="" goto end_parse
if /i "%~1"=="--debug" set BUILD_MODE=debug
if /i "%~1"=="--skip-deps" set SKIP_DEPS=1
if /i "%~1"=="--skip-checks" set SKIP_CHECKS=1
if /i "%~1"=="--clean" set CLEAN=1
if /i "%~1"=="--no-sign" set NO_SIGN=1
if /i "%~1"=="--help" goto show_help
shift
goto parse_args
:end_parse

echo.
echo ========================================
echo   R2 Browser Build Script
echo ========================================
echo Build mode: %BUILD_MODE%
echo.

REM Check for signing key
set "KEY_PATH=%USERPROFILE%\.tauri\r2browser.key"
if %NO_SIGN%==0 (
    if exist "%KEY_PATH%" (
        if not defined TAURI_SIGNING_PRIVATE_KEY (
            echo [*] Loading signing key from: %KEY_PATH%
            for /f "delims=" %%i in ('type "%KEY_PATH%"') do set "TAURI_SIGNING_PRIVATE_KEY=!TAURI_SIGNING_PRIVATE_KEY!%%i"
            echo [*] Signing key loaded
        )
    ) else (
        if not defined TAURI_SIGNING_PRIVATE_KEY (
            echo [!] WARNING: No signing key found. Building without code signing.
            echo     Run 'pnpm run setup-signing' to generate signing keys.
            echo.
        )
    )
)

REM Check dependencies
echo [1/7] Checking dependencies...
where pnpm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: pnpm is not installed
    echo Please install pnpm: npm install -g pnpm
    exit /b 1
)

where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Rust/Cargo is not installed
    echo Please install from: https://rustup.rs/
    exit /b 1
)

REM Clean build artifacts if requested
if %CLEAN%==1 (
    echo [2/7] Cleaning build artifacts...
    if exist dist rmdir /s /q dist
    if exist src-tauri\target rmdir /s /q src-tauri\target
    echo Build artifacts cleaned
) else (
    echo [2/7] Skipping clean (use --clean to clean)
)

REM Install dependencies
if %SKIP_DEPS%==1 (
    echo [3/7] Skipping dependency installation
) else (
    echo [3/7] Installing Node.js dependencies...
    call pnpm install
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install dependencies
        exit /b 1
    )
)

REM Type checking
if %SKIP_CHECKS%==1 (
    echo [4/7] Skipping type checks
) else (
    echo [4/7] Running type checks...
    call pnpm run check
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Type check failed
        exit /b 1
    )
)

REM Lint
if %SKIP_CHECKS%==1 (
    echo [5/7] Skipping linting
) else (
    echo [5/7] Running linter...
    call pnpm run lint
    if %ERRORLEVEL% neq 0 (
        echo WARNING: Linting issues found, continuing build...
    )
)

REM Build frontend
echo [6/7] Building frontend...
call pnpm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Frontend build failed
    exit /b 1
)

REM Build Tauri application
echo [7/7] Building Tauri application...
if "%BUILD_MODE%"=="debug" (
    call pnpm tauri build --debug
) else (
    call pnpm tauri build
)
if %ERRORLEVEL% neq 0 (
    echo ERROR: Tauri build failed
    exit /b 1
)

echo.
echo ========================================
echo   Build completed successfully!
echo ========================================
echo.
echo Build artifacts:
if "%BUILD_MODE%"=="release" (
    echo   MSI Installer:  src-tauri\target\release\bundle\msi\
    echo   NSIS Installer: src-tauri\target\release\bundle\nsis\
    echo   Executable:     src-tauri\target\release\r2browser.exe
) else (
    echo   Executable:     src-tauri\target\debug\r2browser.exe
)
echo.

goto :eof

:show_help
echo Usage: build.bat [options]
echo.
echo Options:
echo   --debug        Build in debug mode (faster, larger binary)
echo   --skip-deps    Skip dependency installation
echo   --skip-checks  Skip type checking and linting
echo   --clean        Clean build artifacts before building
echo   --no-sign      Build without code signing
echo   --help         Show this help message
echo.
echo Examples:
echo   build.bat                      Build release version
echo   build.bat --debug              Build debug version
echo   build.bat --clean              Clean build
echo   build.bat --skip-checks        Fast build without checks
echo   build.bat --no-sign            Build without signing
exit /b 0