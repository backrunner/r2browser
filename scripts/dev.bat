@echo off
echo 🔧 R2 Browser 开发环境启动
echo =============================

REM 检查依赖
echo 📦 检查依赖...
where pnpm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ pnpm 未安装
    exit /b 1
)

where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ Rust/Cargo 未安装
    exit /b 1
)

REM 安装依赖（如果需要）
if not exist "node_modules" (
    echo 📥 安装 Node.js 依赖...
    call pnpm install
)

echo 🚀 启动开发环境...
echo   前端开发服务器: http://localhost:3000
echo   Tauri 开发模式将自动启动桌面应用
echo.
echo 按 Ctrl+C 停止开发服务器

call pnpm run dev