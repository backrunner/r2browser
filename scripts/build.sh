#!/bin/bash

# R2 Browser 构建和发布脚本

set -e

echo "🚀 R2 Browser 构建脚本"
echo "======================="

# 检查依赖
echo "📦 检查依赖..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ Rust/Cargo 未安装"
    exit 1
fi

# 安装依赖
echo "📥 安装 Node.js 依赖..."
npm install

# 类型检查
echo "🔍 执行类型检查..."
npm run check

# 构建前端
echo "🏗️ 构建前端..."
npm run build

# 构建 Tauri 应用
echo "📱 构建 Tauri 应用..."
npm run build-tauri

echo "✅ 构建完成！"
echo ""
echo "📂 构建产物位置："
echo "  Windows: src-tauri/target/release/bundle/msi/"
echo "  macOS:   src-tauri/target/release/bundle/dmg/"
echo "  Linux:   src-tauri/target/release/bundle/deb/ 或 appimage/"