import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/
export const TARGETS = {
  'aarch64-apple-darwin': { platform: 'darwin-aarch64', updater: '.app.tar.gz', installers: ['.dmg'] },
  'x86_64-apple-darwin': { platform: 'darwin-x86_64', updater: '.app.tar.gz', installers: ['.dmg'] },
  'x86_64-pc-windows-msvc': { platform: 'windows-x86_64', updater: '.exe', installers: ['.exe'] },
  'x86_64-unknown-linux-gnu': { platform: 'linux-x86_64', updater: '.AppImage', installers: ['.AppImage', '.deb', '.rpm'] },
}

export function parseVersion(version) {
  const match = VERSION_RE.exec(version)
  if (!match) throw new Error(`Unsupported version: ${version}. Use X.Y.Z or X.Y.Z-beta.N.`)
  return match.slice(1).map((part, index) => part === undefined && index === 3 ? null : BigInt(part))
}

export function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right)
  for (let i = 0; i < 4; i++) {
    if (a[i] === b[i]) continue
    if (a[i] === null) return 1
    if (b[i] === null) return -1
    return a[i] > b[i] ? 1 : -1
  }
  return 0
}

export function releaseMetadata(tag) {
  if (!tag?.startsWith('v')) throw new Error('Release tag must start with v.')
  const version = tag.slice(1)
  const parts = parseVersion(version)
  return { tag, version, channel: parts[3] === null ? 'stable' : 'beta' }
}

export function validateVersions(version, root = '.') {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const tauri = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
  const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8').match(/^version = "([^"]+)"/m)?.[1]
  const lock = readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8').match(/\[\[package\]\]\nname = "r2browser"\nversion = "([^"]+)"/)?.[1]
  for (const [file, found] of Object.entries({ 'package.json': pkg.version, 'tauri.conf.json': tauri.version, 'Cargo.toml': cargo, 'Cargo.lock': lock })) {
    if (found !== version) throw new Error(`${file}: expected ${version}, found ${found}`)
  }
}

export function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name)
    return entry.isDirectory() ? walk(file) : entry.isFile() ? [file] : []
  })
}

export function validateManifest(manifest, { version, repository, complete = true } = {}) {
  parseVersion(manifest.version)
  if (version && manifest.version !== version) throw new Error('Manifest version does not match release tag.')
  if (!manifest.pub_date || Number.isNaN(Date.parse(manifest.pub_date))) throw new Error('Missing valid publication date.')
  const entries = Object.entries(manifest.platforms ?? {})
  if (!entries.length) throw new Error('Manifest has no platforms.')
  for (const [platform, entry] of entries) {
    if (!entry || typeof entry.signature !== 'string' || !entry.signature.trim()) throw new Error(`Missing signature: ${platform}`)
    const url = new URL(entry.url)
    const base = `/` + (repository ?? url.pathname.split('/').slice(1, 3).join('/')) + `/releases/download/v${manifest.version}/`
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith(base) || url.search || url.hash || url.username || url.password || !url.pathname.slice(base.length) || url.pathname.slice(base.length).includes('/')) {
      throw new Error(`Invalid versioned asset URL: ${platform}`)
    }
  }
  if (complete) for (const { platform } of Object.values(TARGETS)) {
    if (!manifest.platforms[platform]) throw new Error(`Missing platform: ${platform}`)
  }
  return manifest
}
