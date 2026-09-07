# Security policy

R2 Browser is in early development. The latest stable release receives fixes; beta releases are for testing. There is no support commitment for older versions and no independent security audit has been completed.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/backrunner/r2browser/security/advisories/new) when enabled. If it is unavailable, contact the maintainer through the contact method listed on [backrunner's profile](https://github.com/backrunner); a public issue may request a private contact channel but must not include exploit details or sensitive data.

Include the affected version/platform, reproduction steps with synthetic data, impact and any proposed fix. Never include real access keys, Cloudflare tokens, object names, local paths, encrypted stores, private keys or presigned URLs. Maintainers should enable private vulnerability reporting before making the repository public.

## What local encryption protects

Connection credentials are encrypted with AES-GCM; an RSA key pair protects the per-record AES key. Files are stored in the application's configuration directory. The RSA private key is available to the current OS account; this is not a password-locked vault or a defense against malware running as that account. Keep OS account, disk and backup access protected.

On supported platforms the app can use iCloud Drive when available, including by default when no preference has been saved. The configuration directory includes encrypted records and key material. This is file synchronization, not a separate end-to-end encrypted key escrow system. Review **Settings** and disable iCloud storage if you require configuration to remain local.

S3 endpoints are user-configurable, including HTTP for local compatible services. Use HTTPS for remote storage. Previews may fetch short-lived signed object URLs; treat those URLs as credentials. No claim is made that all remote files are safe to preview.

## Update trust and process boundaries

Updates are downloaded from the repository's GitHub Releases and verified with the Tauri public key embedded in the application. Keep the corresponding private key outside the repository. A missing key or signature mismatch stops publication. OS signing is separate: macOS releases require signing and notarization; Windows Authenticode is not currently configured.

Updater plugin commands are not exposed directly to webviews. Rust application commands mediate update operations, validate version/channel, and block installation while transfers are active in any window. The app has broad home-directory filesystem access for user-selected uploads/downloads. Content Security Policy is not yet enabled; hardening this boundary and testing all preview types remains a pre-stable task.

## Dependency review (2026-09-07)

The npm production audit found no advisories. Removing the AWS SDK's legacy TLS feature eliminated the old `h2` and `rustls-webpki` advisory paths without changing credential storage formats.

`rsa` remains affected by [RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071.html), with no patched version listed at review time. Its private-key operations here are for local configuration decryption, not a network decryption service. This limits remote exploitability but does not resolve the underlying side channel. Revisit before exposing any decryption operation to untrusted remote callers.

The Tauri Linux dependency tree also has GTK maintenance notices and [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) for `glib::VariantStrIter`. These are upstream constraints and remain open. Run `cargo audit` and `pnpm audit --prod` again before each release; a successful compile does not mean a clean security audit.
