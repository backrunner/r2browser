# R2 Browser

一个功能完整的 Cloudflare R2 和 S3 兼容存储的图形界面管理器，使用现代化的技术栈构建。

## 功能特点

### 🏗️ 现代化技术栈
- **Tauri + React + TypeScript** 跨平台桌面应用
- **Vite** 作为构建工具，支持热重载
- **UnoCSS** 原子化 CSS 框架，使用 Tailwind 规则
- **shadcn/ui** 高质量组件库，zinc 主题
- **Iconify** 丰富的图标系统
- **Zustand** 轻量级状态管理

### 📁 核心功能
- ✅ **会话管理** - 支持多个 R2/S3 连接配置
- ✅ **文件浏览** - 类似 Windows Explorer 的界面
- ✅ **文件预览** - 支持图片、视频、音频、文本、PDF 预览
- ✅ **文件上传** - 拖拽上传，进度跟踪
- ✅ **右键菜单** - 完整的文件操作菜单
- ✅ **拖拽操作** - 文件移动和上传
- ✅ **虚拟滚动** - 优化大量文件的性能
- ✅ **多选操作** - 批量文件操作
- ✅ **搜索过滤** - 快速查找文件

### 🔧 高级功能
- **面包屑导航** - 清晰的路径导航
- **双存储支持** - Cloudflare R2 和 S3 兼容存储
- **错误处理** - 完善的错误提示和用户反馈
- **响应式设计** - 适配不同屏幕尺寸
- **跨平台** - 支持 Windows 和 macOS

## 项目结构

```
src/
├── components/
│   ├── ui/              # shadcn/ui 基础组件
│   ├── Breadcrumb.tsx   # 面包屑导航
│   ├── FileList.tsx     # 文件列表组件
│   ├── FileContextMenu.tsx    # 右键菜单
│   ├── FileUploadDialog.tsx   # 文件上传对话框
│   ├── FilePreviewDialog.tsx  # 文件预览对话框
│   ├── SessionForm.tsx        # 会话配置表单
│   ├── SessionList.tsx        # 会话列表
│   └── VirtualFileList.tsx    # 虚拟滚动文件列表
├── lib/
│   ├── api/             # S3/R2 API 客户端
│   │   ├── s3-client.ts
│   │   └── session-manager.ts
│   └── utils.ts         # 工具函数
├── hooks/
│   ├── useDragAndDrop.ts      # 拖拽操作 Hook
│   └── use-toast.ts           # Toast 通知 Hook
├── stores/
│   └── app-store.ts     # Zustand 状态管理
├── pages/
│   ├── WelcomePage.tsx  # 欢迎页面
│   └── FileManagerPage.tsx    # 文件管理页面
├── types/
│   └── index.ts         # TypeScript 类型定义
└── styles/
    └── globals.css      # 全局样式
```

## 开发指令

### 快速开始

```bash
# 安装依赖
npm install

# 启动开发环境（同时启动前端和 Tauri 应用）
npm run dev

# 或使用便捷脚本
# Windows:
scripts\dev.bat

# Linux/macOS:
chmod +x scripts/build.sh
./scripts/dev.sh
```

### 构建和分发

#### 开发模式
```bash
# 启动开发环境
npm run dev

# 仅启动前端开发服务器
npm run dev-web

# 类型检查
npm run check
```

#### 生产构建
```bash
# 构建前端
npm run build

# 构建跨平台桌面应用
npm run build-tauri

# 使用自动化脚本
# Windows:
scripts\build.bat

# Linux/macOS:
chmod +x scripts/build.sh
./scripts/build.sh
```

### 打包分发

#### 构建产物位置

**Windows:**
- MSI 安装包: `src-tauri/target/release/bundle/msi/`
- NSIS 安装包: `src-tauri/target/release/bundle/nsis/`
- 可执行文件: `src-tauri/target/release/r2browser.exe`

**macOS:**
- DMG 磁盘映像: `src-tauri/target/release/bundle/dmg/`
- APP 应用包: `src-tauri/target/release/bundle/macos/`

**Linux:**
- DEB 包: `src-tauri/target/release/bundle/deb/`
- AppImage: `src-tauri/target/release/bundle/appimage/`
- RPM 包: `src-tauri/target/release/bundle/rpm/`

#### 自动化构建

项目包含自动化构建脚本，支持一键构建：

1. **Windows 用户**：双击 `scripts/build.bat`
2. **Linux/macOS 用户**：运行 `./scripts/build.sh`

#### 分发准备

构建完成后，你可以：

1. **直接分发**：将构建产物直接分发给用户
2. **代码签名**：为应用添加数字签名（推荐）
3. **应用商店**：上传到各平台应用商店

### 环境要求

#### 开发环境
- **Node.js** 18+
- **Rust** 1.70+
- **npm** 或 **yarn**

#### 系统要求
- **Windows**: Windows 10+ (x64)
- **macOS**: macOS 10.15+ (Intel/Apple Silicon)
- **Linux**: Ubuntu 18.04+ / 其他主流发行版

#### Tauri 依赖

**Windows:**
- Microsoft Visual Studio C++ Build Tools
- WebView2 (通常已预装)

**macOS:**
- Xcode Command Line Tools

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
  build-essential \
  curl \
  wget \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

# Fedora
sudo dnf install webkit2gtk3-devel openssl-devel curl wget libappindicator-gtk3-devel librsvg2-devel
sudo dnf group install "C Development Tools and Libraries"

# Arch
sudo pacman -S webkit2gtk base-devel curl wget openssl appmenu-gtk-module gtk3 libappindicator-gtk3 librsvg libvips
```

## 使用说明

### 1. 创建连接
- 启动应用后，在欢迎页面点击"创建新会话"
- 选择存储类型：Cloudflare R2 或 S3 兼容存储
- 填入访问凭据和存储桶信息
- 测试连接后保存会话

### 2. 文件管理
- 在文件管理界面可以：
  - 双击文件夹进入下一层
  - 双击文件进行预览
  - 右键文件/文件夹查看操作菜单
  - 拖拽文件到文件夹进行移动
  - 从系统拖拽文件到应用进行上传

### 3. 批量操作
- 按住 Ctrl/Cmd 多选文件
- 右键菜单支持批量下载、删除等操作
- 工具栏显示选择数量和批量操作按钮

## 技术亮点

1. **性能优化**
   - 虚拟滚动支持大量文件
   - 组件懒加载
   - 状态管理优化

2. **用户体验**
   - 类原生文件管理器体验
   - 丰富的交互反馈
   - 现代化 UI 设计

3. **跨平台支持**
   - 基于 Tauri 的原生应用
   - 统一的用户界面
   - 高性能渲染

## 开发计划

- [ ] 完善后端 S3/R2 API 集成
- [ ] 实现文件夹创建和删除
- [ ] 添加文件重命名功能
- [ ] 实现剪切板操作
- [ ] 添加多标签页支持
- [ ] 实现分屏功能
- [ ] 添加更多文件预览格式

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！