# Development Guidelines

## 工具链

- Node.js：CI 使用 Node 20；本地可使用更新版本。
- pnpm：11。
- Rust：MSRV 1.91.1，由 AWS SDK 直接依赖要求决定。
- Tauri：2.x。
- TypeScript：6.x。
- Vite：8.x。
- React：19.x。

## 常用命令

```bash
pnpm install
pnpm run dev-web
pnpm tauri dev
pnpm run lint
pnpm run check
pnpm run build
pnpm tauri build
cd src-tauri && cargo check
cd src-tauri && cargo test --no-run
```

在 Codex/agent 环境中执行 shell 命令时，遵循全局 RTK 规则，命令前加 `rtk`。

## 依赖升级规则

1. 前端使用 `pnpm up --latest` 或精确包名升级。
2. Rust 直接依赖以 crates.io 当前版本为准；不要盲目套用会降级现有版本的工具输出。
3. 升级后提交：
   - `package.json`
   - `pnpm-lock.yaml`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
   - 受影响的源码和 Tauri schema
4. 跑 `pnpm outdated --format json` 和 `pnpm peers check`。
5. 发生 major bump 时，按编译/lint 暴露的问题适配源码，不用 suppress 掩盖真正的 breaking change。

## TypeScript/React 规范

- 保持 `strict`。
- 不新增 `any`；必须用 `unknown`、泛型或明确接口。
- React 19 hooks lint 默认可信，除非有明确误报证据。
- 不在 render 阶段读取 mutable ref 的 `.current` 来决定 UI；需要参与渲染的值使用 state。
- 副作用放入 `useEffect` 或事件处理器，避免在组件顶层触发异步动作。
- 回调传给深层组件时优先 `useCallback`，大型派生数据用 `useMemo`。

## Rust 规范

- command 层负责参数转换和错误字符串化，业务错误留在 `StorageError`。
- 使用 `?` 和 typed errors，避免新增 `unwrap`/`expect`。已有锁 poisoning 场景优先使用 `unwrap_or_else(|e| e.into_inner())`。
- S3 批量删除必须按 1000 条上限分批。
- 大文件复制必须走 multipart copy，遵守 5 MiB part 下限和 10,000 parts 上限。
- 新增持久化写入时使用原子写入或明确说明为什么不需要。

## UI 规范

- 保持 shadcn/Radix + Zinc 变量体系，颜色使用 `hsl(var(--...))` 或已有 token。
- 无边框窗口必须保留自定义标题栏和窗口控制。
- 标题栏可拖拽区使用 `-webkit-app-region: drag`，按钮和输入使用 `no-drag`。
- 操作按钮优先使用图标，必要时加简短文本和 tooltip/title。
- 不做营销式 landing page；第一屏服务于实际连接和文件管理。
- 卡片用于列表项、弹窗或明确 framed tool，不把页面区块层层包卡片。
- 文字必须在窄屏和长文件名下可截断或换行，不允许溢出破坏布局。

## 安全和隐私

- 不记录凭据、token、authorization、secret、预签名 URL。
- 对象 key、本地路径、任务 id、bucket 名称按敏感元数据处理，日志优先记录计数、文件扩展名或脱敏 basename。
- 前端 logger 的 metadata 会脱敏，但不要把敏感信息拼进 message。
- 后端 tracing 也要遵守同样规则，尤其是 `debug!` 和 `error!`。
- 加密存储变更必须验证旧数据可继续解密，除非明确做迁移。

## 性能规范

- 大列表必须使用虚拟滚动。
- 文件列表分页加载，不一次性拉取全 bucket，除非执行明确的批量 prefix 操作。
- 搜索过滤在前端进行时，避免在 render 中重复构造昂贵结构。
- 上传/下载进度事件应节流或保持轻量，避免高频状态写入拖慢 UI。

## 测试和验证

提交前推荐顺序：

```bash
pnpm run lint
pnpm run check
pnpm run build
cd src-tauri && cargo check
cd src-tauri && cargo test --no-run
pnpm peers check
pnpm outdated --format json
git diff --check
```

如果某个命令无法运行，提交或 PR 描述必须说明原因和残余风险。

## 文档维护

- 改动需求或行为时更新 `.agents/requirements.md`。
- 改动模块边界或数据流时更新 `.agents/architecture.md`。
- 改动工具链、CI、验证命令时更新 `.agents/development-guidelines.md` 和 `.agents/git-rules.md`。
