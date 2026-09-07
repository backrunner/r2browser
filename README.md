<div align="center">
  <img src="docs/assets/logo.svg" width="112" height="112" alt="R2 Browser logo" />
  <h1>R2 Browser</h1>
  <p>A desktop file manager for Cloudflare R2 and S3-compatible storage.</p>
  <p>Browse buckets. Preview objects. Keep transfers under control.</p>
  <p>
    <a href="https://github.com/backrunner/r2browser/actions/workflows/build.yml"><img src="https://github.com/backrunner/r2browser/actions/workflows/build.yml/badge.svg" alt="CI" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0 license" /></a>
    <img src="https://img.shields.io/badge/platforms-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-18181b" alt="macOS, Windows and Linux" />
  </p>
  <p>
    <a href="https://github.com/backrunner/r2browser/releases">Downloads</a> ·
    <a href="#getting-started">Getting started</a> ·
    <a href="CONTRIBUTING.md">Contributing</a> ·
    <a href="docs/releases.md">Release guide / 发版指南</a>
  </p>
</div>

> **Early development.** Start with non-critical data and keep backups. The release pipeline targets the platforms below; native cross-platform and real-storage acceptance testing is still pending. See [known limitations](#known-limitations).

## Your buckets, in a familiar workspace

| Capability | What you can do |
| --- | --- |
| R2 & S3 | Connect to Cloudflare R2, AWS S3, MinIO and other S3-compatible endpoints. Save connections and manage Cloudflare profiles. |
| Files & folders | Upload, download, rename, copy, move and delete objects with conflict handling and folder operations. |
| Multiple workspaces | Use tabs, separate windows and split views. Keep each workspace's path and selection independent. |
| Transfer controls | Track progress, pause, resume and cancel transfers, including multipart uploads. |
| Previews | Open images, text, PDF, audio and video without leaving the app. |
| A comfortable UI | Switch between list and grid views, light and dark themes, and English and Chinese. Use keyboard shortcuts and system file drops. |
| Encrypted configuration | Store credentials with AES-GCM and RSA locally, with optional iCloud Drive storage. See the [security model](SECURITY.md). |

## Install

Use the **versioned releases** on [GitHub Releases](https://github.com/backrunner/r2browser/releases). Releases named `updater-stable` and `updater-beta` contain machine-managed update metadata, not installers. If no versioned release is available yet, [build from source](#development).

| Platform | Installer | Architecture |
| --- | --- | --- |
| macOS | `.dmg` | Apple Silicon and Intel, separate downloads |
| Windows | `.exe` (NSIS) | x86-64 |
| Linux | `.AppImage`, `.deb`, `.rpm` | x86-64; built on Ubuntu 24.04 |

macOS release builds require Developer ID signing and notarization. Windows installers currently have Tauri update signatures but no Authenticode signing, so Windows may show a publisher/SmartScreen prompt. Linux automatic updates are supported for AppImage installations; update `.deb` and `.rpm` installations with a new package.

Each release includes `SHA256SUMS` and third-party license notices with source links. Tauri verifies the updater artifact's signature before installing it.

## Getting started

1. Open **New Connection** and choose Cloudflare R2 or S3 Compatible.
2. Enter your bucket and credentials. R2 uses an account ID; S3 accepts an endpoint, region and optional path-style addressing.
3. Save the connection and open a bucket. Double-click folders to browse and files to preview. Right-click for file actions.
4. Drop local files into the window to upload. Use the task menu to monitor or pause transfers.

Use credentials scoped to the buckets and operations you need. A Cloudflare account API token is separate from S3 access keys and is needed for account-level bucket/profile operations.

| Shortcut | Action |
| --- | --- |
| `⌘/Ctrl + C`, `X`, `V` | Copy, cut, paste |
| `⌘/Ctrl + A` | Select all |
| `Enter` | Open folder or preview |
| `F2` | Rename |
| `Delete` | Delete selected items |
| `Backspace` | Go to the parent folder |

## Updates: stable & beta

Choose an update channel in **Settings → About**. New beta installations default to beta; saved preferences survive upgrades.

- **Stable** receives versions such as `1.2.0`.
- **Beta** receives versions such as `1.3.0-beta.1`, and newer stable versions when they are published.

The main window checks after startup. You can also check manually. Downloads and installation require your action; pause transfers in every window before installing or restarting. Switching back to stable never downgrades an installed beta: it waits for a newer stable release. Both channels use the same application and configuration directory.

## Development

Requires **Node.js 24.11+**, **pnpm 12.3.4**, **Rust 1.94.1+** and the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
git clone https://github.com/backrunner/r2browser.git
cd r2browser
pnpm install --frozen-lockfile
pnpm tauri dev
```

```sh
pnpm run lint
pnpm run check
pnpm run test
pnpm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

`pnpm run dev-web` starts the UI only; storage and native window operations require Tauri. `pnpm tauri build` produces installers under `src-tauri/target/release/bundle/`; see [local signing setup](docs/releases.md) when generating updater artifacts.

Built with React 19, TypeScript 6, Vite 8, UnoCSS, Radix, Zustand, Tauri 2 and the AWS SDK for Rust. See the [architecture](.agents/architecture.md) and [contribution guide](CONTRIBUTING.md) to find your way around.

## Known limitations

- Cross-connection copies buffer the object in memory. Avoid multi-GB copies between connections until streaming multipart transfer is implemented.
- Downloads resumed after an app restart do not yet persist the original object's ETag; restart the download if the remote object changed while paused.
- Large directory pagination and grid rendering still need optimization. List mode uses virtual scrolling, but real 10,000-object performance has not been certified.
- Native multi-window dragging, installer upgrades and real R2/S3 transfers need macOS/Windows acceptance testing. Linux runtime coverage is more limited.
- Local encryption does not protect against a compromised OS account. iCloud-backed storage can include both encrypted records and their keys. Review [SECURITY.md](SECURITY.md) before enabling sync.

## Contributing & security

Bug reports and focused pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), and keep credentials, object names, local paths and presigned URLs out of public reports. Report vulnerabilities privately using the process in [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE). Third-party dependencies retain their respective licenses. R2 Browser is an independent project and is not affiliated with Cloudflare or Amazon Web Services.
