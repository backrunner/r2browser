# R2 Browser - Cloudflare R2 GUI Manager

A modern, cross-platform desktop application for managing Cloudflare R2 and S3-compatible storage services built with React + Tauri.

## Project Overview

R2 Browser is a comprehensive file management application that provides a native desktop experience for cloud storage management. It supports both Cloudflare R2 native APIs and S3-compatible storage services with an intuitive, Windows Explorer-like interface.

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Desktop Framework**: Tauri 2.x
- **Build Tool**: Vite 7.x
- **UI Framework**: shadcn/ui with Zinc theme
- **Styling**: UnoCSS (Tailwind CSS rules)
- **Icons**: Iconify React
- **State Management**: Zustand
- **Routing**: React Router DOM
- **HTTP Client**: Axios (frontend) + Reqwest (backend)
- **Package Manager**: pnpm

## Project Structure

```
r2browser/
├── src/                          # React frontend source
│   ├── components/               # Reusable UI components
│   │   ├── ui/                  # shadcn/ui base components
│   │   ├── layout/              # Layout components
│   │   ├── file-explorer/       # File management components
│   │   ├── welcome/             # Welcome screen components
│   │   └── dialogs/             # Modal dialogs
│   ├── hooks/                   # Custom React hooks
│   ├── stores/                  # Zustand stores
│   ├── lib/                     # Utility functions
│   │   ├── api/                # API layer (S3/R2)
│   │   ├── storage/            # Local storage utilities
│   │   └── utils/              # General utilities
│   ├── types/                   # TypeScript type definitions
│   ├── pages/                   # Page components
│   └── styles/                  # Global styles
├── src-tauri/                   # Tauri backend
│   ├── src/                    # Rust source code
│   ├── icons/                  # Application icons
│   ├── Cargo.toml             # Rust dependencies
│   └── tauri.conf.json        # Tauri configuration
├── scripts/                     # Development scripts
└── docs/                       # Documentation
```

## Core Features

### 1. Welcome Interface
- **Multi-provider Support**: Cloudflare R2 native API and S3-compatible services
- **Session Management**: Save, load, and manage multiple connection profiles
- **Quick Connect**: Fast access to recently used sessions
- **Credential Validation**: Real-time validation of connection parameters

### 2. File Management Interface
- **Explorer-like UI**: Windows Explorer-inspired interface with breadcrumb navigation
- **Virtual Scrolling**: Efficient rendering for large file lists
- **Multi-tab Support**: Browse multiple sessions simultaneously
- **Split-pane View**: Side-by-side comparison of different sessions
- **Drag & Drop**: Full drag and drop support for file operations

### 3. File Operations
- **Upload**: Single/batch file upload with progress indication
- **Download**: Download files with resume capability
- **Preview**: Built-in preview for images, text, audio, video, and PDF files
- **Rename**: Intelligent rename with batch operations
- **Delete**: Safe deletion with confirmation dialogs
- **Copy/Move**: Cross-folder and cross-session operations

### 4. Advanced Features
- **Search**: Fast file search with filters
- **Sorting**: Multiple sorting options (name, size, date, type)
- **Context Menus**: Right-click menus for all operations
- **Keyboard Shortcuts**: Full keyboard navigation support
- **Undo/Redo**: Operation history with undo capability

## Authentication & Storage Providers

### Cloudflare R2 Native
```typescript
interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}
```

### S3-Compatible Services
```typescript
interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  forcePathStyle?: boolean;
}
```

## Key Components

### Core UI Components
- `FileExplorer`: Main file browsing interface
- `WelcomeScreen`: Initial connection setup
- `SessionTabs`: Multi-session tab management
- `BreadcrumbNav`: Hierarchical navigation
- `FileGrid`: Virtualized file/folder display
- `UploadZone`: Drag-and-drop upload area
- `PreviewDialog`: File preview modal
- `ContextMenu`: Right-click operations menu

### Data Management
- `useFileStore`: File listing and operations state
- `useSessionStore`: Connection session management
- `useUploadStore`: Upload queue and progress
- `usePreferencesStore`: User preferences and settings

## Development Guidelines

### Code Standards
- **TypeScript**: Strict mode enabled, no `any` types
- **ESLint**: Airbnb configuration with React hooks
- **Prettier**: Consistent code formatting
- **Conventional Commits**: Structured commit messages

### Component Patterns
- **Composition over Inheritance**: Use React composition patterns
- **Custom Hooks**: Extract reusable logic into custom hooks
- **Error Boundaries**: Implement proper error handling
- **Accessibility**: Follow WCAG 2.1 guidelines

### Performance Considerations
- **Virtual Scrolling**: For large file lists (>1000 items)
- **Lazy Loading**: Load file thumbnails on demand
- **Debounced Search**: Prevent excessive API calls
- **Memoization**: Use React.memo and useMemo appropriately

## API Design

### Tauri Commands
```rust
// Session management
#[tauri::command]
async fn save_session(session_id: String, config: StorageConfig) -> Result<(), String>

#[tauri::command]
async fn get_sessions() -> Result<HashMap<String, StorageConfig>, String>

// File operations
#[tauri::command]
async fn list_objects(config: StorageConfig, prefix: Option<String>) -> Result<Vec<FileItem>, String>

#[tauri::command]
async fn upload_file(config: StorageConfig, key: String, file_path: String) -> Result<(), String>

#[tauri::command]
async fn download_file(config: StorageConfig, key: String, save_path: String) -> Result<(), String>

#[tauri::command]
async fn delete_object(config: StorageConfig, key: String) -> Result<(), String>

#[tauri::command]
async fn copy_object(config: StorageConfig, source_key: String, dest_key: String) -> Result<(), String>
```

### Frontend API Layer
```typescript
// Storage service abstraction
interface StorageService {
  listObjects(prefix?: string, continuationToken?: string): Promise<ListObjectsResponse>;
  uploadFile(key: string, file: File, onProgress?: (progress: number) => void): Promise<void>;
  downloadFile(key: string): Promise<Blob>;
  deleteObject(key: string): Promise<void>;
  copyObject(sourceKey: string, destKey: string): Promise<void>;
  getSignedUrl(key: string, expiresIn: number): Promise<string>;
}
```

## Special Implementation Notes

### Folder Simulation
Object storage doesn't have true folders, but we simulate them:
- **Folder Creation**: Upload a hidden `.folder` placeholder file
- **Folder Display**: Group objects by common prefixes
- **Folder Deletion**: Enumerate and delete all objects with the prefix
- **Auto-cleanup**: Remove placeholder files when real files are added

### File Preview System
- **Image Files**: Direct blob URL display with zoom/pan
- **Text Files**: Syntax highlighting for code files
- **PDF Files**: Embedded PDF viewer
- **Audio/Video**: HTML5 media player with controls
- **Archive Files**: Display contents without extraction

### Upload Management
- **Queue System**: Handle multiple concurrent uploads
- **Progress Tracking**: Real-time progress for each file
- **Resumable Uploads**: Support for large file uploads (multipart)
- **Conflict Resolution**: Handle filename conflicts gracefully

### Context Menu System
```typescript
interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  action: () => void;
}
```

## Security Considerations

### Credential Storage
- **Encryption**: Store credentials encrypted in local storage
- **Session Tokens**: Use temporary session tokens when possible
- **No Logging**: Never log sensitive credential information
- **Auto-logout**: Implement session timeout for security

### File Validation
- **Type Checking**: Validate file types before upload
- **Size Limits**: Enforce reasonable file size limits
- **Sanitization**: Sanitize file names and paths
- **Virus Scanning**: Consider integration with antivirus APIs

## Testing Strategy

### Unit Tests
- **Components**: Test all UI components with React Testing Library
- **Hooks**: Test custom hooks with proper mocking
- **Utilities**: Test utility functions with edge cases
- **API Layer**: Mock external API calls

### Integration Tests
- **File Operations**: Test complete file management workflows
- **Session Management**: Test connection and session handling
- **Error Scenarios**: Test error handling and recovery

### E2E Tests
- **User Workflows**: Test complete user journeys
- **Cross-platform**: Test on Windows and macOS
- **Performance**: Test with large file sets

## Build & Deployment

### Development Commands
```bash
# Install dependencies
pnpm install

# Start development server
pnpm tauri dev

# Build for production
pnpm tauri build

# Run tests
pnpm test

# Lint and format
pnpm lint
pnpm format
```

### Release Process
1. **Version Bump**: Update version in package.json and Cargo.toml
2. **Changelog**: Update CHANGELOG.md with new features/fixes
3. **Build**: Create platform-specific binaries
4. **Code Signing**: Sign executables for security
5. **Distribution**: Release through GitHub Releases

## Accessibility Features

### Keyboard Navigation
- **Tab Order**: Logical tab sequence through all interactive elements
- **Focus Indicators**: Clear focus indicators for all focusable elements
- **Shortcuts**: Comprehensive keyboard shortcuts for all operations

### Screen Reader Support
- **ARIA Labels**: Proper ARIA labels for all components
- **Live Regions**: Announce dynamic content changes
- **Landmarks**: Proper semantic structure with landmarks

### Visual Accessibility
- **High Contrast**: Support for high contrast themes
- **Font Scaling**: Respect system font size preferences
- **Color Blind**: Don't rely solely on color for information

## Future Enhancements

### Advanced Features
- **Sync Folders**: Two-way sync between local and cloud storage
- **Backup Scheduling**: Automated backup solutions
- **File Versioning**: Track and manage file versions
- **Sharing**: Generate public/private sharing links
- **Collaboration**: Multi-user access and permissions

### Integration Options
- **Cloud Providers**: Support for more storage providers (Google Cloud, Azure)
- **File Formats**: Extended preview support for more file types
- **External Tools**: Integration with external editing tools
- **CLI Interface**: Command-line interface for automation

## Performance Targets

### UI Responsiveness
- **Initial Load**: < 3 seconds to first interactive
- **File Listing**: < 1 second for up to 10,000 files
- **Search**: < 500ms for filtered results
- **Navigation**: < 200ms for folder transitions

### Memory Usage
- **Base Memory**: < 150MB for empty application
- **File Listing**: < 1MB per 1,000 file entries
- **Preview**: Release memory when preview is closed
- **Upload Queue**: Efficient memory usage for large files

## Troubleshooting Guide

### Common Issues
1. **Connection Failures**: Check credentials and network connectivity
2. **Upload Errors**: Verify file permissions and size limits
3. **Slow Performance**: Check available memory and file count
4. **Preview Issues**: Verify file format support and browser compatibility

### Debug Mode
Enable debug logging by setting environment variable:
```bash
RUST_LOG=debug pnpm tauri dev
```

### Log Locations
- **Windows**: `%APPDATA%/r2browser/logs/`
- **macOS**: `~/Library/Application Support/r2browser/logs/`
- **Linux**: `~/.config/r2browser/logs/`

---

This project aims to provide the most intuitive and powerful desktop interface for cloud storage management, combining the familiarity of native file managers with the power of modern web technologies.