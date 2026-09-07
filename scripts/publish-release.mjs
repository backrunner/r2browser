#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { compareVersions, releaseMetadata, validateManifest, walk } from './release-utils.mjs'

const directory = process.argv[2] ?? 'release-artifacts'
const { tag, version, channel } = releaseMetadata(process.env.RELEASE_TAG)
const repository = process.env.GITHUB_REPOSITORY
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid GITHUB_REPOSITORY')
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const api = (...args) => JSON.parse(gh('api', ...args))
const endpoint = `repos/${repository}/releases`
const releases = () => api(endpoint, '--paginate', '--slurp').flat()
const assets = id => api(`${endpoint}/${id}/assets`, '--paginate', '--slurp').flat()
const readRemoteManifest = release => {
  const asset = assets(release.id).find(asset => asset.name === 'latest.json')
  if (!asset) throw new Error(`Release ${release.tag_name} has no latest.json; refusing to replace an unknown channel state.`)
  return validateManifest(JSON.parse(gh('api', `${endpoint}/assets/${asset.id}`, '-H', 'Accept: application/octet-stream')), { repository })
}

const manifestPath = join(directory, 'latest.json')
const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), { version, repository })
const files = walk(directory).filter(file => !basename(file).startsWith('manifest-') && basename(file) !== 'SHA256SUMS')
const byName = new Map(files.map(file => [basename(file), file]))
if (byName.size !== files.length) throw new Error('Duplicate release asset names')

// Verify the actual updater bytes against the public key embedded in the app.
// A present .sig alone does not prove the CI secret matches that key.
const temporary = mkdtempSync(join(tmpdir(), 'r2browser-verify-'))
try {
  const publicKey = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).plugins.updater.pubkey
  const keyFile = join(temporary, 'updater.pub')
  writeFileSync(keyFile, Buffer.from(publicKey, 'base64'))
  for (const entry of new Set(Object.values(manifest.platforms).map(entry => JSON.stringify(entry)))) {
    const { url, signature } = JSON.parse(entry)
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop())
    const file = byName.get(name)
    if (!file || !byName.has(`${name}.sig`)) throw new Error(`Missing updater asset/signature: ${name}`)
    if (readFileSync(byName.get(`${name}.sig`), 'utf8').trim() !== signature) throw new Error(`Signature mismatch: ${name}`)
    const signatureFile = join(temporary, 'artifact.sig')
    writeFileSync(signatureFile, Buffer.from(signature, 'base64'))
    execFileSync('minisign', ['-Vm', file, '-p', keyFile, '-x', signatureFile], { stdio: 'inherit' })
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
const checksums = files.sort().map(file => `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${basename(file)}`).join('\n') + '\n'
const checksumFile = join(directory, 'SHA256SUMS')
writeFileSync(checksumFile, checksums)

// All release jobs use the same workflow concurrency group. Never move a
// channel backwards, including when an older tag is manually rebuilt.
const existing = releases()
const channels = channel === 'stable' ? ['stable', 'beta'] : ['beta']
const pointers = channels.map(name => {
  const release = existing.find(item => item.tag_name === `updater-${name}`)
  const previous = release ? readRemoteManifest(release) : null
  return { name, release, advance: !previous || compareVersions(version, previous.version) > 0 }
})
const stable = existing.filter(item => !item.draft && /^v\d+\.\d+\.\d+$/.test(item.tag_name))
const makeLatest = channel === 'stable' && stable.every(item => compareVersions(version, item.tag_name.slice(1)) >= 0)
let release = existing.find(item => item.tag_name === tag)
if (release && !release.draft) {
  const remote = readRemoteManifest(release)
  if (JSON.stringify(remote) !== JSON.stringify(manifest)) throw new Error(`${tag} is already published with different metadata; immutable releases cannot be overwritten.`)
  console.log(`${tag} is already published; retrying channel publication only.`)
} else {
  if (!release) {
    gh('release', 'create', tag, '--repo', repository, '--draft', '--verify-tag', '--title', `R2 Browser ${tag}`, '--generate-notes')
    release = releases().find(item => item.tag_name === tag)
    if (!release) throw new Error('Draft release was not found; retry the publish job.')
  }
  // Remove stale draft assets left by an earlier failed build.
  const desired = new Set([...byName.keys(), 'SHA256SUMS'])
  for (const asset of assets(release.id)) if (!desired.has(asset.name)) gh('api', '-X', 'DELETE', `${endpoint}/assets/${asset.id}`)
  gh('release', 'upload', tag, ...files, checksumFile, '--repo', repository, '--clobber')
  const uploaded = new Map(assets(release.id).map(asset => [asset.name, asset]))
  for (const file of [...files, checksumFile]) {
    const asset = uploaded.get(basename(file))
    const bytes = readFileSync(file)
    if (!asset || asset.size !== bytes.length || (asset.digest && asset.digest !== `sha256:${createHash('sha256').update(bytes).digest('hex')}`)) throw new Error(`Uploaded asset verification failed: ${basename(file)}`)
  }
  gh('api', '-X', 'PATCH', `${endpoint}/${release.id}`, '-F', 'draft=false', '-F', `prerelease=${channel === 'beta'}`, '-f', `make_latest=${makeLatest}`)
}
for (const pointer of pointers) {
  if (!pointer.advance) { console.log(`Keeping newer/equal ${pointer.name} channel.`); continue }
  const pointerTag = `updater-${pointer.name}`
  if (!pointer.release) {
    gh('release', 'create', pointerTag, manifestPath, '--repo', repository, '--target', process.env.RELEASE_SHA, '--prerelease', '--latest=false', '--title', `R2 Browser ${pointer.name} updates`, '--notes', 'Machine-managed update manifest. Download installers from versioned releases.')
  } else {
    gh('release', 'upload', pointerTag, manifestPath, '--repo', repository, '--clobber')
    gh('api', '-X', 'PATCH', `${endpoint}/${pointer.release.id}`, '-F', 'prerelease=true', '-f', 'make_latest=false')
  }
  console.log(`Published ${version} to ${pointer.name}.`)
}
