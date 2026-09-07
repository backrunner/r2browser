import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { compareVersions, releaseMetadata, TARGETS, validateManifest } from '../scripts/release-utils.mjs'
import { computeNextVersion } from '../scripts/release.mjs'

const root = resolve(import.meta.dirname, '..')
const fixture = t => { const dir = mkdtempSync(join(tmpdir(), 'r2browser-release-test-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir }

test('only stable and beta semver tags are accepted', () => {
  assert.equal(releaseMetadata('v1.2.3').channel, 'stable')
  assert.equal(releaseMetadata('v1.2.3-beta.10').channel, 'beta')
  for (const tag of ['1.2.3', 'v01.2.3', 'v1.2.3-beta.01', 'v1.2.3-nightly.1', 'v1.2.3-rc.1', 'v1.2.3+build', 'v1.2.3;echo bad']) assert.throws(() => releaseMetadata(tag))
})

test('channel advancement compares numerically and promotes beta to stable', () => {
  assert.equal(compareVersions('1.2.3-beta.10', '1.2.3-beta.9'), 1)
  assert.equal(compareVersions('1.2.3', '1.2.3-beta.10'), 1)
  assert.equal(compareVersions('1.2.3', '1.3.0-beta.1'), -1)
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.equal(computeNextVersion('1.2.3', { channel: 'beta', bump: 'minor' }), '1.3.0-beta.1')
  assert.equal(computeNextVersion('1.3.0-beta.9', { channel: 'beta', bump: 'prerelease' }), '1.3.0-beta.10')
  assert.equal(computeNextVersion('1.3.0-beta.10', { channel: 'stable', bump: 'release' }), '1.3.0')
  assert.throws(() => computeNextVersion('1.2.3', { channel: 'stable', version: '1.3.0-beta.1' }))
})

test('build artifacts yield a complete signed manifest without architecture collisions', t => {
  const dir = fixture(t)
  const output = join(dir, 'output')
  const version = JSON.parse(readFileSync(join(root, 'package.json'))).version
  const env = { ...process.env, RELEASE_TAG: `v${version}`, GITHUB_REPOSITORY: 'backrunner/r2browser' }
  for (const [target, config] of Object.entries(TARGETS)) {
    const bundle = join(dir, target)
    mkdirSync(bundle)
    for (const extension of new Set([...config.installers, config.updater])) writeFileSync(join(bundle, `R2 Browser${extension}`), `${target} artifact`)
    writeFileSync(join(bundle, `R2 Browser${config.updater}.sig`), 'fixture-signature\n')
    execFileSync(process.execPath, ['scripts/prepare-release-artifacts.mjs', target, bundle, output], { cwd: root, env })
  }
  execFileSync(process.execPath, ['scripts/merge-updater-manifest.mjs', '--input', output, '--output', join(dir, 'latest.json')], { cwd: root, env })
  const manifest = JSON.parse(readFileSync(join(dir, 'latest.json')))
  validateManifest(manifest, { version, repository: env.GITHUB_REPOSITORY })
  assert.notEqual(manifest.platforms['darwin-aarch64'].url, manifest.platforms['darwin-x86_64'].url)
  const incomplete = structuredClone(manifest)
  delete incomplete.platforms['linux-x86_64']
  assert.throws(() => validateManifest(incomplete), /Missing platform/)
  const unsigned = structuredClone(manifest)
  unsigned.platforms['windows-x86_64'].signature = ''
  assert.throws(() => validateManifest(unsigned), /Missing signature/)
  const wrongURL = structuredClone(manifest)
  wrongURL.platforms['windows-x86_64'].url = 'https://github.com/attacker/repo/releases/download/v0.1.0/setup.exe'
  assert.throws(() => validateManifest(wrongURL, { repository: env.GITHUB_REPOSITORY }), /Invalid versioned asset URL/)
  assert.throws(() => validateManifest(manifest, { version: '99.0.0' }), /version/)
  rmSync(join(output, `manifest-x86_64-unknown-linux-gnu.json`))
  const result = spawnSync(process.execPath, ['scripts/merge-updater-manifest.mjs', '--input', output, '--output', join(dir, 'bad.json')], { cwd: root, env })
  assert.notEqual(result.status, 0, 'a partial matrix must never publish')
})

test('release dry run is inert and local preparation commits all four version files', t => {
  const dir = fixture(t)
  mkdirSync(join(dir, 'src-tauri'))
  cpSync(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0', type: 'module' }) + '\n')
  writeFileSync(join(dir, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '1.0.0' }) + '\n')
  writeFileSync(join(dir, 'src-tauri/Cargo.toml'), '[package]\nname = "r2browser"\nversion = "1.0.0"\n')
  writeFileSync(join(dir, 'src-tauri/Cargo.lock'), 'version = 4\n\n[[package]]\nname = "r2browser"\nversion = "1.0.0"\n')
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim()
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Release Test')
  git('add', '.'); git('commit', '-m', 'fixture')
  const release = (...args) => execFileSync(process.execPath, ['scripts/release.mjs', '--channel', 'beta', '--bump', 'patch', ...args], { cwd: dir, env })
  release('--dry-run')
  assert.equal(git('status', '--porcelain'), '')
  assert.equal(git('tag', '--list'), '')
  release('--no-push', '--skip-checks')
  assert.equal(git('status', '--porcelain'), '')
  assert.equal(git('tag', '--list'), 'v1.0.1-beta.1')
  assert.match(readFileSync(join(dir, 'src-tauri/Cargo.lock'), 'utf8'), /version = "1.0.1-beta.1"/)
  assert.equal(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n').length, 4)
})
