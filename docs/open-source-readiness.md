# 开源准备评估 · 2026-09-07

## 结论

代码可以按**早期 beta 开源项目**准备公开，但尚不满足“已通过安全与跨平台验收的正式版”标准。初次评估时仓库为 private，尚无公开版本 Release。此文记录公开前的检查结果；后续仓库可见性及首个 beta 的构建状态以 GitHub 为准。

正式发布前还有明确的外部配置及验收项：补齐 macOS 签名/公证 secrets、启用私密漏洞报告、公开仓库以便匿名获取更新，并实际跑通一次四平台 CI 和 beta → beta → stable 升级。

## 本次检查与处理

| 项目 | 结果 |
| --- | --- |
| 项目许可证 | LICENSE 为 Apache-2.0；package.json 与 Cargo.toml 一致。新增贡献、安全与发布说明。 |
| 跟踪内容与历史 | Gitleaks 扫描所有本地 refs 的历史（79 个被扫描 commit）和最终待公开文件集合，均未发现密钥；跟踪文件检查未发现环境文件、私钥、证书或运行时凭据。扫描不等于不存在未知 secret 格式。 |
| npm 生产依赖 | `pnpm audit --prod`：0 条公告；许可证元数据为 MIT、Apache-2.0、ISC、0BSD 或其组合。 |
| Rust 依赖 | 关闭 AWS S3 旧 rustls 特性并移除只用于类型导入的 aws-config，使旧 h2/rustls-webpki 路径退出依赖图，5 条漏洞公告降为 1 条 RSA 公告。 |
| Rust 许可证元数据 | 未发现缺失 license 或必须采用 GPL/AGPL 的依赖；MPL-2.0 依赖需要保留其许可证和源代码获取方式，详见下文。 |
| 更新信任 | 保留原公钥及旧 secrets 名称兼容；最终发布前对实际更新字节验签；取消直接暴露给 webview 的 updater 插件权限，安装统一经过 Rust 任务互斥检查。 |
| 本地路径日志 | 移除 key manager 中配置迁移、iCloud 路径的结构化日志字段；加密格式保持不变。 |
| 发布完整性 | 标签与四份版本记录一致；全部平台构建成功才公开 Release；渠道按版本单调前进；固定版本资产不可覆盖。 |
| 项目展示 | README 改为安装、上手、能力、更新、开发与限制说明；替换 Tauri 模板图标，SVG 源文件与桌面图标保持一致。 |

## 尚未解决的风险

- `RUSTSEC-2023-0071`：RSA 时序侧信道，无已知补丁版本；当前仅用于本地配置解密，未作为远程解密服务暴露。保留已有数据兼容性，不在这次发布改造中替换加密格式。
- Tauri Linux 上游仍有 16 条 unmaintained 提示和 1 条 `glib::VariantStrIter` unsound 提示。不能用编译成功代替安全审计通过。
- Webview CSP 仍未启用；文件管理器具备较广的 home 目录访问权限，需要后续专门验证权限收敛和远端预览边界。
- iCloud 配置同步可能默认启用，并包含解密密钥；README/SECURITY 已明确这一信任边界。
- 跨连接大对象复制内存占用、跨重启下载 ETag、超大目录与网格性能问题，见 [此前审查](review-2026-09-06.md) 与 README。
- Windows 无 Authenticode；macOS 现有仓库只有旧名称的 updater secrets，缺少 Apple 签名/公证 secrets。无法读取 GitHub secret 值，因此未验证现有私钥是否匹配公钥；CI 将在实际发布时校验。

## 许可证与分发

Rust 的 MPL-2.0 依赖包括 cssparser 0.36.0、cssparser-macros 0.6.1、dtoa-short 0.3.5、option-ext 0.2.0、selectors 0.36.1。它们的许可证不要求本项目改用 MPL，但必须保留相应文件的许可证和提供源码获取方式。锁文件固定版本，源码可通过 `https://crates.io/api/v1/crates/<name>/<version>/download` 获取。发布管线生成并附带各 target 的 THIRD-PARTY-NOTICES 文本，收集生产 npm/Cargo 依赖的许可证声明、原始 license/notice 文件与固定版本源码链接，不能只附项目的 Apache-2.0 LICENSE。

许可证检查基于依赖声明元数据；不构成对每个嵌入资源、平台 SDK 或第三方代码片段来源的完整法律审计。

## 验证记录

- lint、TypeScript、前端生产构建通过。
- 22 项 JS 回归覆盖多窗口、发版预演/版本提交、平台清单、渠道默认值/偏好保留、更新竞态与 IPC 错误。
- Rust check、test --no-run、10 项 Rust 测试通过，包括渠道版本过滤。
- actionlint 校验两个工作流通过；发版 dry-run 验证无文件、commit、tag 或远端修改。
- 使用临时生成的 Tauri 密钥签名测试文件，minisign 验签成功；修改文件后验签失败；测试密钥随后删除，正式密钥未改动。
- 使用生产前端与临时模拟 IPC 验证欢迎页设置入口、beta 渠道检查、检查失败与重试、可用更新弹窗；不代表原生自动更新实测。
- 未执行真实 GitHub release workflow、macOS notarization、Windows/Linux 安装、真实存储传输或历史配置迁移。

审计数据库在首次审查时联网更新成功；复查时 GitHub 获取失败，使用同一次审查已取得的本地数据库完成比较。
