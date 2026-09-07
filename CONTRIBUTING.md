# Contributing to R2 Browser

Start with the [README](README.md) for setup and current limitations. For implementation details, read [.agents/README.md](.agents/README.md) and the linked requirements, architecture and development guidelines in order.

1. Use an issue to describe a substantial change before implementing it. Small fixes can go directly to a pull request.
2. Create a focused branch from `main`, make the change, and add regression coverage for behavior that can cause data loss, security issues or races.
3. Run `pnpm run lint`, `pnpm run check`, `pnpm run test`, `pnpm run build`, `cargo check --locked --manifest-path src-tauri/Cargo.toml`, `cargo test --locked --manifest-path src-tauri/Cargo.toml`, and `git diff --check`.
4. Explain the problem, resulting behavior and validation in your PR. State any native-platform or real-storage checks you could not run.

Use English conventional commit messages. Keep both lockfiles committed. Do not commit generated bundles, signing keys, environment files, logs or real account fixtures. Use temporary buckets and clearly synthetic data for screenshots and tests.

Credentials must go through Rust encrypted storage. Browser persistence is for UI preferences. Logs and cross-window messages must not expose secrets, presigned URLs or sensitive metadata. Changes to transfer ownership, recovery and updates must preserve the multi-window safety checks.

Security reports belong in the [private reporting process](SECURITY.md), not public issues. Release maintainers should follow [docs/releases.md](docs/releases.md).

Contributions are made under the project's [Apache-2.0 license](LICENSE). Preserve upstream copyright and license notices when incorporating third-party work.
