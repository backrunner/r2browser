@echo off
echo 🚀 R2 Browser 构建脚本
echo =======================

REM 检查依赖
echo 📦 检查依赖...
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ npm 未安装
    exit /b 1
)

where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ Rust/Cargo 未安装
    exit /b 1
)

REM 安装依赖
echo 📥 安装 Node.js 依赖...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ❌ 依赖安装失败
    exit /b 1
)

REM 类型检查
echo 🔍 执行类型检查...
call npm run check
if %ERRORLEVEL% neq 0 (
    echo ❌ 类型检查失败
    exit /b 1
)

REM 构建前端
echo 🏗️ 构建前端...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ❌ 前端构建失败
    exit /b 1
)

REM 构建 Tauri 应用
echo 📱 构建 Tauri 应用...
call npm run build-tauri
if %ERRORLEVEL% neq 0 (
    echo ❌ Tauri 构建失败
    exit /b 1
)

echo ✅ 构建完成！
echo.
echo 📂 构建产物位置：
echo   Windows MSI: src-tauri\target\release\bundle\msi\
echo   Windows EXE: src-tauri\target\release\bundle\nsis\

pause