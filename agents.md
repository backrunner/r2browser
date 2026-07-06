# R2 Browser Agent Entry

本文件保留给兼容旧入口使用。实际开发规范、需求和架构文档已迁移到 `.agents/`。

## 必读顺序

1. `.agents/README.md`
2. `.agents/requirements.md`
3. `.agents/architecture.md`
4. `.agents/development-guidelines.md`
5. `.agents/git-rules.md`

## 当前基线

- 前端：React 19、TypeScript 6、Vite 8、UnoCSS、Radix/shadcn 风格组件、Zustand。
- 后端：Tauri 2、Rust 1.91.1+、AWS SDK for S3、AES-GCM + RSA 本地加密。
- 包管理：pnpm 11。
- 核心验证：`pnpm run lint`、`pnpm run check`、`pnpm run build`、`cargo check`、`cargo test --no-run`。

如本文件与 `.agents/` 内容冲突，以 `.agents/` 为准。
