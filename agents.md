R2 Browser – 开发代理指南（Agent Guide）

目标与平台
- 目标：从零实现一个现代、流畅、用户友好的 Cloudflare R2 与任意 S3 兼容存储的图形界面管理器。
- 平台：Windows 与 macOS（Tauri 2.x 原生跨平台）。

技术栈
- 前端：React 18 + TypeScript、Vite 7、UnoCSS（Tailwind 规则）、shadcn/ui（Zinc 主题）、Iconify（图标）。
- 后端：Tauri 2.x（Rust）、AWS SDK for S3、reqwest、AES‑GCM + RSA（本地加密）、tauri plugins（fs/dialog/http/shell）。

核心原则
- 原生体验：无边框窗口 + 自定义标题栏，窗口控制按钮置于 Webview 内部。
- 安全默认：凭据仅本地加密保存，绝不输出到日志。
- 兼容性：同时支持 Cloudflare R2 原生 API 与任意 S3 兼容服务。
- 可扩展：分页加载、虚拟滚动、多标签、分屏、多会话、批量操作。

架构概览
- 前端（App）
  - 路由：Welcome（会话与登陆）与 Explorer（文件管理）。
  - 状态：Zustand 管理会话、文件列表、选中项、上传队列、预览、标签与分屏布局。
  - 组件：shadcn/ui（Dialog/ContextMenu/Tabs/Dropdown/Toast）、Iconify 图标、虚拟列表（建议 react‑virtuoso 或 @tanstack/react‑virtual）。
  - 样式：UnoCSS（tailwind 规则），Zinc 主题风格统一。
- 桌面特性：自定义标题栏（-webkit-app-region）、拖拽上传、文件对话框、右键菜单、快捷键。
  - 滚动条：全局自定义 WebKit 滚动条，细窄、圆角、半透明，与主题色联动（见“UI 设计规范”）。
- 后端（Tauri Commands）
  - 存储：基于 AWS SDK S3 客户端；R2 通过自定义 endpoint + 区域 "auto"；S3 通过 endpoint/region/forcePathStyle。
  - 会话：保存/加载/删除/更新元数据/统计/导出导入；本地加密持久化（RSA+AES‑GCM）。
  - 窗口：最小化、最大化切换、关闭、是否最大化、开始拖拽（支持无边框）。

鉴权与会话
- R2 原生模式（R2Config）
  - 字段：accountId、accessKeyId、secretAccessKey、bucketName。
  - Endpoint：`https://{accountId}.r2.cloudflarestorage.com`，region 使用 "auto"。
- S3 兼容模式（S3Config）
  - 字段：endpoint、region、accessKeyId、secretAccessKey、bucketName、forcePathStyle?。
  - 兼容任意 S3（AWS、MinIO、Ceph 等）。
- 会话能力
  - 保存/快速进入已保存会话；名称/收藏/标签；最近访问与统计。
  - 导出/导入配置（敏感数据，保持加密与确认）。
  - 后端加密存储：RSA 生成密钥对，AES‑GCM 加密 JSON，存于用户 AppData 目录。

界面 1：欢迎页（Welcome）
- 单列布局：顶部左侧“Recent Sessions”标题，右上角“New Connection”按钮；下方是最近会话列表（为空则展示空态）。全局锁定滚动，仅由应用内部容器滚动（`html, body, #root { overflow: hidden }`，App 内部 `overflow-auto`）。
- 点击“New Connection”进入第二屏表单视图。
- 第二屏（表单视图）：
  - 过渡采用 `transition-opacity + transform-gpu + will-change`，仅对内容层做淡入淡出与微小位移，避免背景重绘引起闪烁。
  - 表单容器 `max-w-xl mx-auto`，直接使用 `border rounded-lg bg-card p-6 shadow-sm` 包裹表单（不使用 Card 标题），简洁居中。
  - 顶部提供“Back”轻量返回按钮。

界面 2：文件管理器（Explorer）
- 布局
  - 顶部：返回按钮（根目录返回 Welcome）、Breadcrumb（可点击各级）、上传按钮。
  - 主体：对象“前缀”作为“文件夹”展示；无前缀为文件；双击进入/返回上一级。
  - 支持多标签（Tabs）与左右分屏（同时查看两个会话）。
- 列表与性能
  - 分页与延迟加载：滚动到底部再拉取下一页（maxKeys/continuationToken）。
  - 虚拟滚动：仅渲染可见元素，提升 1w+ 文件的流畅度。
- 交互
  - 右键菜单：详情、下载、重命名、删除、新建文件夹、删除文件夹、复制完整路径。
  - 拖拽：
    - 窗口内拖拽移动（文件/文件夹移动到另一个前缀）。
    - 窗口/系统拖入上传到当前前缀（支持多文件）。
  - 多选：Shift/点击框选、Ctrl/Cmd 多选；批量重命名（规则化）、批量删除（确认）。
  - 快捷键：Enter 打开、Backspace 返回上一级、Ctrl/Cmd+A 全选、Delete 删除、F2 重命名。
- 文件夹（前缀）
  - 新建文件夹：向该前缀上传一个过滤占位对象（如 `.folder`），展示时过滤；若后续该前缀内出现真实对象，可清理占位对象。
  - 删除文件夹：要求用户输入文件夹名称确认；遍历该前缀下所有对象，批量删除（按 1000/批）。
- 预览
  - 双击或菜单中“预览”：支持图片、音频、PDF、文本基础预览。
  - 大文件可选用预签名 URL（GET）短期访问；注意过期与缓存刷新。
- 冲突与反馈
  - 上传/重命名冲突：覆盖/跳过/自动重命名三选一。
  - 进度：上传/下载/删除显示进度与可取消项（队列与错误回退）。
  - 错误：网络/权限/限速提示，Toast + 详情对话框。

后端命令（Tauri Commands）
- 会话与应用
  - `initialize_app()` 初始化并保证密钥对存在。
  - `save_session(id, config)`、`get_sessions()`、`get_session_data(id)`、`delete_session(id)`。
  - `update_session_metadata(id, name?, is_favorite?, tags?)`、`get_session_stats()`、`generate_session_id()`。
  - 导出/导入/清空：通过 `SessionStore` 方法实现（封装在前端调用链）。
- 存储操作
  - `test_connection(config)`。
  - `list_objects(sessionId, prefix?, maxKeys?, continuationToken?)`。
  - `get_object(sessionId, key)`、`upload_object(sessionId, key, filePath, contentType?)`、`download_object(sessionId, key, savePath)`。
  - `delete_object(sessionId, key)`、`delete_objects(sessionId, keys)`（批量）。
  - `copy_object(sessionId, srcKey, dstKey)`、`move_object(sessionId, srcKey, dstKey)`。
  - `get_object_metadata(sessionId, key)`、`generate_presigned_url(sessionId, key, method, expiresIn)`。
  - `create_folder(sessionId, prefix)`（占位对象）、`delete_folder(sessionId, prefix)`（遍历删除）。
- 窗口控制（无边框）
  - `window_minimize()`、`window_toggle_maximize()` -> bool、`window_close()`、`window_is_maximized()` -> bool、`window_start_dragging()`。

数据与约定
- 键与前缀：前缀以 `/` 结尾代表“文件夹”，空前缀代表根；展示时过滤占位对象（如 `{prefix}/.folder`）。
- 分页：`max_keys` 与 `continuation_token` 管理滚动加载；客户端维护当前前缀下列表合并与去重。
- 内容类型：上传时尽量推断 `content-type`，无法推断时由用户选择或设为 `application/octet-stream`。

前端实现要点
- 主题：shadcn/ui Zinc 主题，深浅色切换与系统跟随。
- 组件：Tabs（多会话）、Resizable Panels（左右分屏）、Context Menu、Dialog、Breadcrumb、Toolbar、DataGrid/Card 切换视图。
- 虚拟列表：react‑virtuoso（或 @tanstack/react‑virtual）渲染文件项；无限滚动触发下一页。
- DnD：HTML5 拖拽 + Tauri 文件解析；拖入即上传、列表内拖拽触发移动 API。
- 图标：Iconify（文件类型/操作/面包屑/窗口控件）。
- 自定义标题栏：
  - CSS：`-webkit-app-region: drag`（可拖拽区），交互元素使用 `no-drag`。
  - 调用窗口命令：`window_minimize`、`window_toggle_maximize`、`window_close`。
- 自定义滚动条：全局 `::-webkit-scrollbar` 规则，10px 宽、圆角 8px、透明轨道、浅/深色自适应；Firefox 使用 `scrollbar-width: thin` + `scrollbar-color`。
 - 欢迎页转场：使用 CSS 过渡实现快速淡入淡出（150ms），通过切换 `opacity`、`pointer-events` 与 `absolute/relative` 叠放屏幕。

UI 设计规范（简）
- 颜色与主题
  - 基于 shadcn/ui Zinc 主题变量（light/dark），不要硬编码色值；使用 `hsl(var(--...))`。
  - 组件背景：card 使用 `bg-card`，分隔 `border-border`；半透明层可用 `bg-card/95` + blur。
- 排版与间距
  - 页面容器左右内边距 24px，区块间距 16–24px；卡片内边距 24px。
  - 标题字重 600，正文 400，字号按层级：标题 20–24，正文 14–16。
- 形状与投影
  - 卡片圆角 8px（跟随 `--radius`）；必要时加 `shadow` 或 `shadow-lg`，悬停加深。
- 交互与状态
  - 悬停、聚焦、禁用状态明确（利用 shadcn 变体）；按钮/菜单使用明显的 hover 背景。
  - 过渡/动画：150–200ms，避免夸张，保持响应迅速。
- 滚动条
  - WebKit：宽/高 10px、圆角 8px、拇指颜色 `hsl(var(--muted-foreground)/~0.35)`；悬停 ~0.55；轨道透明。
  - Firefox：`scrollbar-width: thin`；`scrollbar-color` 与主题联动。
- 欢迎页转场
  - 使用 CSS 过渡实现快速淡入淡出（150ms），通过切换 `opacity`、`pointer-events` 与 `absolute/relative` 叠放屏幕。
  - 减少闪烁：避免动画背景层；仅动画内容层；使用 `transform-gpu` 与 `will-change: opacity, transform`；标题栏不使用 `backdrop-blur`。
- 欢迎页 – New Connection
  - 居中显示、最大宽度 ~640px；卡片内部仅表单，无标题栏；页面顶部提供返回按钮。
  - 表单分组清晰：提供者选择、凭据输入、桶名称、路径/风格设置；提供“测试连接”和“保存并进入”。
- 标题栏
  - 无边框窗口；顶部 32px 自定义栏；左侧标题/面包屑，右侧窗口控制；双击标题栏切换最大化。

安全与隐私
- 绝不记录凭据与对象敏感信息；错误提示做泛化处理（例如“认证失败/权限不足/网络错误”）。
- 本地持久化一律加密；导出/导入前提示敏感性并要求用户确认。

质量与测试
- 大列表性能：1 万条对象仍保持流畅滚动与分页加载。
- 批量操作：删除按 1000/批；失败可重试与错误汇总。
- 后端：`cargo check`、`cargo test --no-run`；对接真实云服务的测试标记为 `#[ignore]`。

开发命令
- `pnpm install` 安装依赖。
- `pnpm tauri dev` 启动前后端开发。
- `pnpm tauri build` 产出发行包。
- `RUST_LOG=debug pnpm tauri dev` 打开后端调试日志。

补充说明
- 已在 Tauri 配置中关闭原生装饰（无边框）；务必提供自定义标题栏与窗口控制按钮。
- R2 使用 AWS SDK S3 客户端（自定义 endpoint + region "auto"），S3 兼容以用户提供的 endpoint/region 为准。
