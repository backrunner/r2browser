# R2 Browser Agent Docs

本目录是 R2 Browser 的开发代理规范入口。旧的 `README.md`、`CLAUDE.md`、`agents.md` 中存在历史信息，实施开发时以本目录为准。

## 文档索引

- [requirements.md](requirements.md): 产品目标、能力范围、验收标准。
- [architecture.md](architecture.md): 前端、Tauri 后端、存储、加密、传输模块边界。
- [development-guidelines.md](development-guidelines.md): 技术栈、编码规范、安全/UI/性能要求、常用命令。
- [git-rules.md](git-rules.md): 分支、提交信息、验证、发布和推送规则。

## 当前工程事实

- 前端：React 19、TypeScript 6、Vite 8、UnoCSS、Radix/shadcn 风格组件、Iconify/lucide 图标、Zustand。
- 后端：Tauri 2、Rust 1.91.1+、AWS SDK for S3、reqwest、AES-GCM + RSA 本地加密。
- 包管理：pnpm 11；提交 `pnpm-lock.yaml` 和 `src-tauri/Cargo.lock` 以保证可复现构建。
- 平台：macOS 与 Windows 为核心目标，Linux 由 CI 构建链路覆盖。
- CI：lint、typecheck、frontend build、`cargo check`、`cargo test --no-run`。

## 使用原则

1. 先读需求和架构，再改代码。
2. 任何涉及凭据、对象 key、本地路径、预签名 URL 的日志都必须脱敏或避免记录。
3. 依赖升级需要同步 manifest、lockfile、CI 工具版本，并适配 breaking changes。
4. 提交前至少运行 `pnpm run lint`、`pnpm run check`、`pnpm run build`、`cargo check`、`cargo test --no-run`。
