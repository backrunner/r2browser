# Git Rules

## 分支

- 主干分支是 `main`。
- 日常代理工作如需新分支，使用 `codex/<short-description>`。
- 用户明确要求在当前分支提交时，可以直接提交当前分支。
- 不使用 `git reset --hard`、`git checkout -- <file>` 之类会丢弃别人改动的命令，除非用户明确要求。

## 提交信息

历史提交主要采用简短 conventional commit 风格，也允许领域前缀。继续沿用以下形式：

```text
feat: add bucket profile management
fix: prevent duplicate upload recovery
chore: upgrade dependencies
storage: make secure writes atomic
logging: redact sensitive metadata
uploads: persist resumable task state
transfers: harden task cancellation
ui(toolbar): compact explorer controls
fix(rust): import tauri emitter for progress events
```

规则：

- 用英文提交信息。
- 首行不超过约 72 个字符。
- 类型或领域前缀小写。
- 一次提交只表达一个 coherent change set。
- 不把格式化、依赖升级和业务重构混成难以 review 的提交，除非它们是同一个修复所必需。

推荐前缀：

- `feat`: 用户可见能力。
- `fix`: bug 修复。
- `chore`: 依赖、配置、CI、脚本。
- `docs`: 文档。
- `ui(scope)`: UI 行为或布局。
- `storage`: 本地存储、加密存储、session/profile/task store。
- `uploads`: 上传队列、multipart、恢复。
- `transfers`: 下载、跨会话复制/移动、暂停/取消。
- `logging`: 日志、脱敏、诊断。
- `tauri(scope)`: Tauri 配置、capabilities、窗口、插件。

## 提交前检查

CI 和发布矩阵统一使用 Bash，包括 Windows Git Bash，确保 pnpm 命令实际执行且失败退出码正确传播。

至少运行：

```bash
pnpm run lint
pnpm run check
pnpm run build
cd src-tauri && cargo check
cd src-tauri && cargo test --no-run
git diff --check
```

依赖升级额外运行：

```bash
pnpm peers check
pnpm outdated --format json
cd src-tauri && cargo update --verbose
```

`cargo update --verbose` 可能显示被上游约束的 transitive 旧版本；这不是失败，但需要在总结里说明。

## Staging 规则

- 提交所有与任务直接相关的源码、manifest、lockfile、schema 和文档。
- 不提交 `dist/`、`target/`、证书、环境变量文件、日志文件。
- Tauri 应用必须提交 `src-tauri/Cargo.lock`，保证 Rust 依赖可复现。
- 依赖升级后，如果 Tauri 生成 schema 已被 Git 跟踪，schema 变化应随升级提交。

## 推送

- 当前分支跟踪远端时，用 `git push`。
- 新分支首次推送用 `git push -u origin <branch>`。
- 发布脚本会自动创建 release commit 和 tag，不要手动改 tag，除非正在修 release 自动化。

## Release 规则

版本格式：

- Stable：`vX.Y.Z`
- Beta：`vX.Y.Z-beta.N`

推荐命令：

```bash
pnpm run release:patch
pnpm run release:minor
pnpm run release:major
pnpm run release:beta:patch
pnpm run release:beta:next
pnpm run release:promote
```

release script 会：

- 更新版本后运行 lint、typecheck、JS tests、frontend build、cargo check、cargo tests。
- 同步 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 和 `src-tauri/tauri.conf.json`。
- 创建 release commit。
- 创建 annotated tag。
- 原子推送 commit 和 tag；`--dry-run` 不改文件、commit、tag 或远端，`--no-push` 只保留本地发布。
- 要求干净工作树、非 detached HEAD、版本严格递增；已发布版本资产不可覆盖。
- CI 所有平台成功并通过实际签名验证才公开版本；stable/beta 指针按版本单调更新。维护者配置与实测要求见 `docs/releases.md`。

## Review 关注点

- 凭据是否只走加密存储。
- 日志是否泄露 secret、URL、对象 key、本地路径。
- 文件/文件夹操作是否刷新列表且不重复刷新。
- 删除和跨会话移动是否有冲突检查和失败回滚思路。
- multipart 任务是否可恢复、可取消、不会污染后续 generation。
- UI 是否保持无边框窗口可拖拽、按钮可点击、文本不溢出。
