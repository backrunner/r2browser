# 发布与自动更新

发布流程参考相邻 AIPass 项目的做法：解析标签、固定构建 commit、生成平台产物、验证签名、统一发布。R2 Browser 仅支持 stable 与 beta，不接受 nightly/rc 标签。

## 首发前配置

仓库需要公开，GitHub Releases 的安装包和更新清单才能被无 token 的客户端下载。修改仓库可见性与实际首发应由维护者单独执行；构建脚本不会修改可见性。

在 GitHub **Settings → Secrets and variables → Actions** 配置：

| Secret | 用途 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri 更新私钥；兼容现有 `TAURI_PRIVATE_KEY` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码，可以为空；兼容 `TAURI_KEY_PASSWORD` |
| `APPLE_CERTIFICATE` | Developer ID Application `.p12` 文件的 base64；兼容 `CSC_LINK` |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` 密码；兼容 `CSC_KEY_PASSWORD` |
| `APPLE_SIGNING_IDENTITY` | Developer ID Application 完整签名身份 |
| `APPLE_ID` | Apple 开发者账号的登录邮箱，用于 notarization |
| `APPLE_PASSWORD` | 在 Apple 账号管理页生成的 app-specific password（应用专用密码），不是账号登录密码 |
| `APPLE_TEAM_ID` | 开发者团队 ID |

签名与 AIPass 一致：`apple-actions/import-codesign-certs@v3` 将 `.p12` 导入 CI keychain，确认签名身份存在，再让 Tauri 使用该 Developer ID 身份签名。可以复用 AIPass 所属团队的有效 Developer ID Application 证书、证书密码和签名身份；在 R2 Browser 仓库配置同名 secrets 或授权使用共享 secrets 即可。构建完成后校验签名 TeamIdentifier 与 `APPLE_TEAM_ID` 一致。

公证固定使用 Apple 账号方式，预留 `APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID` 三项 secrets；邮箱和应用专用密码可在首发前填写。无需 App Store Connect API key，凭据只注入 macOS 构建步骤；Tauri 负责提交公证并装订票据，后续步骤校验 Gatekeeper 和 stapler，包括更新归档内的 app。本项目没有 AIPass 的 CloudKit entitlement，因此不需要复制 AIPass 的 provisioning profile。Windows Authenticode 尚未接入；Tauri 更新签名并不消除 Windows 的未知发布者提示。

`GITHUB_TOKEN` 由 Actions 自动提供。默认只读，只有最终 publish job 获得 `contents: write`。签名 secrets 不进入 PR CI。缺少必要签名配置时，prepare job 立即失败，不开始矩阵构建。

启用 GitHub private vulnerability reporting；为 `main` 和 `v*` 标签设置合适的仓库规则。限制能创建发布标签、修改发布工作流和 secrets 的维护者。

## 更新签名密钥

`src-tauri/tauri.conf.json` 中的 `plugins.updater.pubkey` 是公开的验证密钥，允许提交。现有公钥已保留，不要为一次发版重新生成密钥，否则旧客户端不能验证新版本。

只有首次配置或明确进行密钥迁移时才运行：

```sh
pnpm run setup-signing
```

私钥默认位于用户目录的 `.tauri/r2browser.key`，公钥位于同路径的 `.pub` 文件。将公钥文件中的 base64 内容写入 Tauri 配置，将私钥内容及密码保存为上述 secrets；不要提交私钥。脚本遇到已有私钥会退出，不覆盖它。备份密钥并限制读取权限。

本地 `pnpm tauri build` 默认生成更新产物，需要从安全位置设置 `TAURI_SIGNING_PRIVATE_KEY` 和相应密码；它们不能写进跟踪文件。只想生成不带更新签名的本地测试包时，可以显式关闭 `bundle.createUpdaterArtifacts` 的本地构建覆盖配置，不要修改发布配置或覆盖正式公钥。

发布 job 会用 minisign 对所有更新产物做真实公钥验签，同时核对 `.sig` 文件与清单一致。错误的私钥即使能够签名，也会在公开 Release 前失败。

## 发版命令

先提交当前工作；脚本要求干净工作树。可以先预演，预演不会改文件、commit、tag 或远端：

```sh
pnpm run release --channel beta --bump patch --dry-run
pnpm run release --channel beta --version 0.1.1-beta.1 --dry-run
```

| 命令 | 示例变化 |
| --- | --- |
| `pnpm run release:patch` | `1.0.0` → `1.0.1` |
| `pnpm run release:minor` | `1.0.0` → `1.1.0` |
| `pnpm run release:major` | `1.0.0` → `2.0.0` |
| `pnpm run release:beta:patch` | `1.0.0` → `1.0.1-beta.1` |
| `pnpm run release:beta:minor` | `1.0.0` → `1.1.0-beta.1` |
| `pnpm run release:beta:next` | `1.1.0-beta.1` → `1.1.0-beta.2` |
| `pnpm run release:promote` | `1.1.0-beta.2` → `1.1.0` |

脚本同步 `package.json`、`Cargo.toml`、`Cargo.lock` 中的本项目版本和 `tauri.conf.json`，然后运行 lint、类型检查、JS 测试、前端构建、Rust check 与 Rust tests，最后创建 commit 和 annotated tag，并原子推送分支与标签。若检查失败，版本改动保留在工作树供排查，不创建标签。修复后重新检查并决定保留或撤销这四个版本改动。

`--no-push` 仅创建本地 commit/tag；`--skip-checks` 仅跳过本地验证，CI 仍会检查。已暂存的无关改动不能混入发版。脚本拒绝重复、降低版本和不符合渠道的显式版本。

## CI 与产物

1. 只接受已有 `vX.Y.Z` 或 `vX.Y.Z-beta.N` 标签，校验四处版本与标签一致；手动重跑通过 Actions → Release → Run workflow 的 `tag` 输入。
2. 固定标签解析到的 commit，构建 macOS arm64/x86-64、Windows x86-64 NSIS、Linux x86-64 AppImage/deb/rpm。Tauri 2 使用 `.exe` / `.exe.sig`，不启用生成 `.nsis.zip` 的 v1 兼容模式。
3. 每个平台执行前端与 Rust 检查，生成签名更新产物；macOS 验证 codesign、Gatekeeper 和 stapled notarization，包括解压后的更新归档。
4. 明确从安装包和 `.sig` 生成平台清单，不依赖 Tauri CLI 在 bundle 目录生成 `latest.json`。文件名包含版本和 target，避免两个 macOS 架构覆盖同名文件。
5. 全矩阵成功后合并清单，要求四个平台齐全、签名存在、URL 指向本仓库的当前版本资产；实际验签并生成 `SHA256SUMS`；同时附带 `third-party-notices.mjs` 收集的依赖许可证、notice 文本与固定版本源码链接。
6. 上传 draft，核对远端资产尺寸/可用 SHA-256 digest 后公开，再推进渠道指针。只有 stable 版本会成为 GitHub Latest；beta 和机器指针始终为 prerelease。

发版工作流串行执行，旧版本不会覆盖较新的渠道指针。GitHub 并发队列可能替换尚未开始的 pending run；若连续推送多个标签，应确认各 run 状态并按需手动补跑。

公开的版本资产不覆盖；失败的 draft 可以重跑。若已公开版本且仅渠道发布失败，重跑 publish job 可以用相同产物补完指针。不要重建并覆盖已发布资产；新构建应使用新版本。更新指针覆盖 `latest.json` 时存在短暂不可用窗口，客户端检查失败可重试，不会安装未校验文件。

## 渠道规则

| 选择 | 清单地址 | 接受版本 |
| --- | --- | --- |
| Stable | `https://github.com/backrunner/r2browser/releases/download/updater-stable/latest.json` | 更高版本的正式版 |
| Beta | `https://github.com/backrunner/r2browser/releases/download/updater-beta/latest.json` | 更高版本的 beta 或正式版 |

正式版发布同时尝试推进 stable/beta。若 beta 已有更高的版本（如 stable `1.1.1`，beta `1.2.0-beta.1`），保留该 beta。默认设置由编译版本决定，用户已保存的渠道选择优先。切回 stable 不降级，等待比当前 beta 更新的正式版。

两个渠道共用 bundle identifier 和配置目录，不能作为完全隔离的两套应用并装。升级需要用户确认；安装时检查所有窗口的传输，并由 Rust 全局互斥保护。Linux `.deb`/`.rpm` 应手动升级，仅 AppImage 支持内置更新。

首次 stable 发布会创建两个指针；首次 beta 发布只创建 beta 指针，尚无 stable 发布时检查 stable 会提示检查失败。fork 必须同步修改 Cargo repository、package repository、Tauri updater endpoint 和文档链接，并使用自己的签名密钥。

## 必须实测的首发验收

- 在干净 macOS/Windows 安装 beta，运行真实测试 bucket 的上传、下载、暂停恢复和多窗口拖放。
- 从 beta.N 升到 beta.N+1，再从 beta 升到同基线 stable；确认偏好、连接与旧加密配置可继续使用。
- 切换 stable/beta、检查失败后重试；验证有活动传输时不能安装，错误签名无法安装。
- Linux AppImage 更新与 deb/rpm 手动升级；macOS Intel 和 Apple Silicon 分别安装验证。
- 重新运行依赖与密钥审计，确认 [开源准备评估](open-source-readiness.md) 中的未完成项。
