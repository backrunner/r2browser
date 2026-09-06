# Module Architecture

## 顶层结构

```text
src/
  components/
  hooks/
  i18n/
  lib/
  pages/
  providers/
  stores/
  styles/
  types/
src-tauri/
  capabilities/
  gen/schemas/
  src/
    clients/
    commands/
    logging/
    security/
    storage/
```

## 前端入口

- `src/main.tsx` 初始化 React、主题和 i18n，并禁用浏览器默认右键菜单。
- `src/App.tsx` 负责路由、标题栏、多标签桥接、更新弹窗和全局错误边界。
- 页面路由：
  - `/`: `WelcomePage`
  - `/manager/:sessionId`: `FileManagerPage`

## 前端状态

### `src/stores/app-store.ts`

职责：

- 应用初始化。
- 会话、profile、bucket、文件列表状态。
- 当前路径、选择、搜索、排序和视图模式。
- 上传/下载任务桥接。
- 剪贴板和 undo/redo。

约束：

- Zustand persist 只保存 UI 偏好。
- 不在浏览器 storage 中保存凭据、会话配置或对象数据。
- 调用 Tauri command 时，参数名必须匹配 Rust command 的 camelCase 映射。

### `src/stores/tab-store.ts`

职责：

- 窗口内标签状态。
- active tab、tab 路径、tab 重排。
- 与 `use-tab-manager`、`tab-sync` 配合实现多窗口。
- `tab-sync` 传递连接 ID、标签 ID 与路径，目标接收后 ACK；源窗口在确认后移除标签。
- `use-app-sync` 同步 session/profile/storage 变更和 UI 偏好，处理窗口关闭保护；`TransferTasks` 位于公共标题栏。
- `shared-preferences-storage` 合并本窗口修改的偏好字段，避免任务进度写入覆盖其他窗口的新偏好。

### `src/stores/preferences-store.ts`

职责：

- 下载目录、更新通道、iCloud sync 等用户偏好。
- 偏好可以持久化到前端 storage，但涉及系统路径时日志仍要脱敏。

## 前端组件边界

- `components/ui`: shadcn/Radix 风格基础组件，只做通用 UI，不调用业务 store。
- `components/layout`: 标题栏、标签栏、拆分视图等壳层组件。
- `components/welcome`: profile、bucket、session 表单和列表。
- `components/file-explorer`: 文件列表、虚拟列表、右键菜单、搜索过滤、排序控制。
- `components/dialogs`: 上传、预览、重命名、删除、设置、CORS、冲突处理等 modal。

## 文件列表数据流

```text
FileManagerPage
  -> useAppStore.navigateToPath/loadFiles
  -> Tauri list_objects
  -> StorageService
  -> AwsS3Client.list_objects
  -> FileManagerPage filters/sorts
  -> FileList / VirtualFileList
```

列表转换规则：

- `common_prefixes` 转换为 folder item。
- `objects` 转换为 file item。
- `.folder` 占位对象过滤。
- 合并分页结果时以 key 去重。

## 上传数据流

```text
DOM/Tauri file drop or upload dialog
  -> app-store enqueueUploads/enqueueUploadsFromPaths
  -> backend task store create/update
  -> upload_object_with_progress
  -> StorageService.upload_file_with_progress
  -> AwsS3Client multipart or put_object
  -> upload_progress/multipart_progress events
  -> app-store task state
```

注意：

- OS 路径上传走 Tauri fs 或后端文件路径，不要把完整路径写入普通日志。
- Browser `File` 上传使用 `browser://` 标记路径，必要时读入 bytes 后调用后端。
- multipart 进度需要持久化 `upload_id`、part number、completed parts、uploaded size。
- 原生传输由 `aws_s3_client` 直接保存 checkpoint，再发送窗口范围的进度事件；前端只更新展示。浏览器 XHR 上传仍由前端保存进度。

## 下载数据流

```text
FileContextMenu / toolbar
  -> app-store downloadFile
  -> download_object_with_progress
  -> AwsS3Client ranged get_object
  -> download_progress event
  -> task store
```

下载恢复规则：

- 恢复时从本地长度与持久化进度的较小值继续 range request；后端截断未确认尾部，校验 range 长度并用 ETag 防止同次下载混入变化后的对象。
- 新下载使用 create，恢复下载在校验和截断后使用 append。
- 任务取消和暂停在 `transfer_control` 中按 task id 和 generation 管理。
- `TaskTransferGuard` 防止重复执行及同一本地路径并发写入，离开作用域后释放 generation；`TaskStoreState` 保存窗口归属，关闭前检查任务，销毁后释放 owner。
- 更新器按窗口保存待安装版本，校验版本与通道；安装与任务创建通过共享锁协调。

## Tauri 后端

### `src-tauri/src/main.rs`

职责：

- 注册 Tauri commands。
- 管理 `SessionStore`、`ProfileStore`、`TaskStore`、`ServiceCache`。
- 窗口 drag/drop 事件转发到前端。

约束：

- commands 返回 `Result<T, String>` 给前端；内部错误类型保留在模块内。
- 缓存的 `StorageService` 在 session/profile 配置变化后必须失效。
- 不在 command 层记录凭据、完整本地路径或预签名 URL。

### `src-tauri/src/clients`

- `storage_service.rs`: provider-neutral facade。
- `aws_s3_client.rs`: AWS SDK S3/R2 实现，包含分页、对象操作、multipart、预签名 URL。
- `cloudflare_r2_client.rs`: 账号级 R2 bucket/CORS 操作。

### `src-tauri/src/storage`

- `secure_storage.rs`: 加密 JSON 存储，带进程内文件锁和原子写入。
- `session_store.rs`: session 元数据和 encrypted config。
- `profile_store.rs`: Cloudflare profile。
- `task_store.rs`: 上传/下载任务持久化。

### `src-tauri/src/security`

- `key_manager.rs`: RSA key pair 生成、加载、迁移、本地/iCloud 存储路径。
- `encryption.rs`: AES-GCM 加密数据，RSA 加密 AES key。

加密格式：

```json
{
  "encrypted_key": "base64 RSA-encrypted AES key",
  "nonce": "base64 AES-GCM nonce",
  "ciphertext": "base64 AES-GCM ciphertext"
}
```

## 配置和权限

- `src-tauri/tauri.conf.json`: 窗口、bundle、updater 配置。
- `src-tauri/capabilities/default.json`: Webview 权限。新增插件或文件访问能力时必须同步更新。
- `src-tauri/gen/schemas`: Tauri 生成 schema，依赖升级后可能变化；如果已被跟踪，变更应随升级提交。

## 构建和发布架构

- `pnpm run build`: TypeScript check + Vite frontend build。
- `pnpm tauri build`: Tauri release build。
- `.github/workflows/build.yml`: push/PR CI。
- `.github/workflows/release.yml`: tag-driven release。
- `scripts/release.mjs`: version bump、checks、commit、tag、push。
- `scripts/merge-updater-manifest.mjs`: 合并各平台 updater manifest。
