# R2 Browser

A modern desktop GUI for managing Cloudflare R2 and S3-compatible storage, built with Tauri + React + TypeScript.

## Features

- 🗄️ **Multi-session Management** - Connect to multiple R2/S3 buckets
- 📁 **File Operations** - Browse, upload, download, rename, copy, cut, paste
- 🖼️ **File Preview** - Images, videos, audio, text, and PDF files
- 🔍 **Search & Filter** - Quick file search with instant results
- 📋 **Clipboard Support** - Copy/cut/paste files with recursive folder operations
- 🎯 **Drag & Drop** - Drag files between folders or from your system
- ⚡ **Virtual Scrolling** - Smooth performance with thousands of files
- 🔄 **Resumable Uploads** - Multipart uploads with pause/resume support
- 🌓 **Dark Mode** - Built-in dark theme support

## Quick Start

### Prerequisites

- **Node.js** 20+
- **Rust** 1.91.1+
- **pnpm** 11

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm tauri dev
```

### Building

```bash
# Build for production
pnpm tauri build

# Type check
pnpm exec tsc --noEmit
```

Build artifacts will be in `src-tauri/target/release/bundle/`:
- **Windows**: `.msi` and `.exe` files
- **macOS**: `.dmg` and `.app` files
- **Linux**: `.deb`, `.appimage`, and `.rpm` files

## Usage

1. **Create Session** - Click "New Session" and enter your R2/S3 credentials
2. **Browse Files** - Navigate folders like Windows Explorer
3. **File Operations** - Right-click for context menu with all operations
4. **Keyboard Shortcuts**:
   - `Ctrl/Cmd + C` - Copy selected files
   - `Ctrl/Cmd + X` - Cut selected files
   - `Ctrl/Cmd + V` - Paste files

## Tech Stack

- **Frontend**: React 19, TypeScript 6, Vite 8
- **Desktop**: Tauri 2.x
- **UI**: shadcn/ui (Zinc theme), UnoCSS
- **State**: Zustand
- **Backend**: Rust with AWS S3 SDK

## Project Structure

```
src/
├── components/        # React components
│   ├── ui/           # shadcn/ui base components
│   ├── dialogs/      # Modal dialogs
│   ├── file-explorer/# File browser components
│   └── layout/       # Layout components
├── stores/           # Zustand state management
├── hooks/            # Custom React hooks
├── lib/              # Utilities and helpers
├── types/            # TypeScript types
└── pages/            # Page components

src-tauri/
├── src/              # Rust backend
│   ├── commands/     # Tauri commands
│   ├── clients/      # S3/R2 client
│   ├── storage/      # Session & task storage
│   └── security/     # Encryption & key management
└── tauri.conf.json   # Tauri configuration
```

## Development Status

- [x] Backend S3/R2 API integration
- [x] Folder creation and deletion
- [x] File rename functionality
- [x] Clipboard operations (copy/cut/paste)
- [x] Multi-tab support
- [x] Split-screen functionality
- [x] File preview support

## License

Apache 2.0

## Contributing

Issues and Pull Requests are welcome!
