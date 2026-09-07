# Requirements

## 产品目标

R2 Browser 是一个现代、流畅、用户友好的桌面图形界面，用于管理 Cloudflare R2 与任意 S3 兼容对象存储。体验应接近原生文件管理器，重点是安全、可靠、跨平台和大对象列表性能。

## 支持平台

- macOS 和 Windows 是一等支持平台。
- Linux 需要保持 CI 可构建，发行物由 release workflow 生成。
- 桌面壳使用 Tauri 2，无边框窗口和 Webview 内自定义标题栏。

## 存储提供方

### Cloudflare R2

配置字段：

- `account_id`
- `access_key_id`
- `secret_access_key`
- `bucket_name`

规则：

- endpoint 为 `https://{account_id}.r2.cloudflarestorage.com`。
- region 使用 `auto`。
- 通过 AWS SDK S3 客户端访问。

### S3 Compatible

配置字段：

- `endpoint`
- `region`
- `access_key_id`
- `secret_access_key`
- `bucket_name`
- `force_path_style`

规则：

- 允许 AWS S3、MinIO、Ceph 和其他 S3 兼容服务。
- `force_path_style` 用于兼容不支持 virtual-hosted-style 的服务。

## 会话和凭据

- 会话支持保存、加载、删除、编辑元数据、最近访问、收藏和标签。
- Cloudflare profile 支持单独管理账号级凭据和 bucket 列表。
- 凭据只允许在本地加密持久化，不允许明文落盘。
- 本地加密采用 RSA 密钥对保护 AES-GCM 数据密钥，密文存储在用户 AppData/Application Support 目录。
- 导入、导出或迁移敏感配置时必须明确提示用户其敏感性。

## 欢迎页

- 第一屏展示近期会话、可用 bucket 和 profile 入口。
- `New Connection` 进入连接表单；表单应保持居中、宽度受控、分组清晰。
- 页面主体由应用容器滚动，`html`、`body`、`#root` 不应产生全局滚动。
- 欢迎页转场只动画内容层，使用快速 opacity/transform 过渡，避免背景重绘闪烁。

## 文件管理器

基础能力：

- 顶部包含返回/上级、面包屑、搜索、排序、上传、任务状态、设置入口。
- 对象前缀展示为文件夹；普通对象展示为文件。
- 双击文件夹进入，双击文件预览。
- 支持列表视图和网格视图。
- 支持多标签、多窗口和拆分视图。

多窗口：

- 动态窗口限定为 `manager-*`，具备与主窗口一致的业务权限。
- 跨窗口标签转移须等待目标确认；失败保留源标签，重复请求不能重复插入或导航。
- 跨窗口消息只携带连接 ID 与路径；凭据从 Rust 加密存储重新加载。
- 文件拖放与传输进度只发送到所属窗口；监听必须正确清理异步注册与 StrictMode 重挂载。
- 连接和 profile 的编辑、删除同步到各窗口；标签、路径、选择与剪贴板仍由各窗口独立管理。
- 任务由创建或恢复它的窗口管理；其他窗口不得同时恢复、暂停、取消或删除该任务。
- 活动传输或任务创建未结束时阻止窗口关闭；暂停后可关闭，任务可由其他窗口接管。任务入口在欢迎页也必须可用。
- 更新安装全局互斥，检查所有窗口的活动任务，并阻止安装期间创建或恢复新任务。

对象列表：

- 后端分页使用 `max_keys` 和 `continuation_token`。
- 前端合并分页结果时必须去重。
- 大列表应使用虚拟滚动，1 万条对象仍应保持可操作。
- `.folder` 占位对象不应作为普通文件展示。

文件夹：

- 新建文件夹通过上传 `{prefix}/.folder` 占位对象实现。
- 删除文件夹应遍历该 prefix 下所有对象，并批量删除。
- 批量删除按 S3 限制分批，每批不超过 1000 个对象。

文件操作：

- 上传、下载、复制、移动、重命名、删除必须有进度或用户反馈。
- 上传/重命名冲突必须支持覆盖、跳过、自动重命名。
- 跨会话复制/移动必须先检查目标冲突。
- Delete、F2、Enter、Backspace、Ctrl/Cmd+A 等快捷键应符合文件管理器直觉。

预览：

- 图片支持缩放和平移。
- 文本支持基础语法高亮和二进制检测。
- PDF 使用 `react-pdf`/`pdfjs-dist`，worker 与 react-pdf 内部 PDF.js 版本一致并随应用打包。
- 音频和视频使用 HTML5 media。
- 大文件可使用短期预签名 URL，注意过期和缓存刷新。

传输任务：

- 上传和下载支持进度、暂停、恢复、取消。
- 大文件上传使用 multipart，并持久化可恢复任务状态。
- 取消和暂停必须清理对应 generation 的 cancellation state，避免影响后续任务。
- 任务恢复不得重复启动同一 session 的恢复流程。
- 恢复仅处理本机记录的任务；不得因远端分片上传没有本机记录而自动中止它。
- 下载恢复使用本地长度与已持久化进度中的较小值；后端校验长度并截断未确认的尾部。
- 原生传输的下载进度、multipart upload ID 和已完成分片直接由后端持久化，不能依赖前端回调落盘。
- Backspace 返回上级目录；弹窗、菜单和输入控件中的按键由该控件处理。
- 切换连接后清空撤销/重做历史，避免在其他 bucket 重放操作。

## 安全要求

- 禁止记录 secret、token、credential、authorization、预签名 URL。
- 对象 key、本地路径、任务 id 等可能泄露用户信息的数据默认视为敏感元数据，日志应脱敏、裁剪或只记录计数。
- 前端持久化只允许保存 UI 偏好；会话和凭据必须走 Rust 加密存储。
- 文件系统权限应通过 Tauri capabilities 明确声明，不新增宽泛权限，除非有明确需求。

## 验收标准

- `pnpm run lint` 通过。
- `pnpm run check` 通过。
- `pnpm run build` 通过。
- `cargo check` 通过。
- `cargo test --no-run` 通过。
- `pnpm outdated --format json` 在依赖升级任务完成后应为空对象，除非有明确说明。
- `pnpm peers check` 无 peer dependency 问题。

## 发布与自动更新

- 仅支持 stable（vX.Y.Z）和 beta（vX.Y.Z-beta.N），不接受其他预发布格式。
- 新安装默认渠道来自编译版本，已保存偏好优先；beta 接受更高 beta 和 stable，stable 只接受更高 stable，不自动降级。
- 欢迎页与文件管理器均可从公共标题栏打开设置并手动检查更新；请求失败不得显示已是最新版本，过期渠道请求不能重新展示旧更新。
- 四个平台全部构建、清单校验、真实公钥验签成功后才公开 Release；macOS 必须签名、公证。公开版本资产不可覆盖，渠道指针不得倒退。
- 更新插件 IPC 不直接授权给 webview，所有安装操作通过 Rust 业务命令和传输互斥检查。
