#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const output = process.argv[2]
if (!output) throw new Error('Usage: third-party-notices.mjs <output-file>')
const npm = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' }))
const cargo = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
const texts = new Map()
const entries = []

function licenseFiles(directory, depth = 0) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name)
    if (entry.isFile() && /^(licen[cs]e|notice|copying|copyright)([._-]|$)/i.test(entry.name)) return [file]
    if (entry.isDirectory() && depth < 2 && /^(licenses?|legal)$/i.test(entry.name)) return licenseFiles(file, depth + 1)
    return []
  })
}

function add(name, license, source, directories, explicitFile) {
  if (!license) throw new Error(`Missing license declaration: ${name}`)
  const references = []
  const files = directories.flatMap(directory => licenseFiles(directory))
  if (explicitFile && existsSync(explicitFile)) files.push(explicitFile)
  for (const file of new Set(files)) {
    const content = readFileSync(file, 'utf8').trim()
    const id = createHash('sha256').update(content).digest('hex')
    texts.set(id, content)
    references.push(`${basename(file)}: ${id}`)
  }
  entries.push(`${name}\nLicense: ${license}\nSource: ${source}\n${references.length ? references.join('\n') : 'License text: see the original source distribution linked above.'}`)
}

for (const packages of Object.values(npm)) for (const pkg of packages) {
  add(`npm: ${pkg.name} ${pkg.versions.join(', ')}`, pkg.license,
    pkg.versions.map(version => `https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').pop()}-${version}.tgz`).join('\n'), pkg.paths)
}
for (const pkg of cargo.packages) {
  if (!pkg.source) continue
  const root = dirname(pkg.manifest_path)
  add(`cargo: ${pkg.name} ${pkg.version}`, pkg.license ?? (pkg.license_file ? 'See license file' : null),
    `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`, [root], pkg.license_file ? join(root, pkg.license_file) : null)
}
const sections = [...texts].sort(([a], [b]) => a.localeCompare(b)).map(([id, content]) => `License text ${id}\n\n${content}`)
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, [
  'R2 Browser — Third-party notices',
  'This inventory conservatively includes production npm dependencies and the Cargo dependency graph (including build/test and other-platform crates). Dependencies retain their original licenses. Source archives above provide the exact locked versions, including MPL-covered source. Repeated license texts are deduplicated by SHA-256. This generated inventory is not a substitute for reviewing third-party distribution obligations.',
  readFileSync('LICENSE', 'utf8'),
  ...entries.sort(), ...sections,
].join('\n\n' + '='.repeat(72) + '\n\n') + '\n')
console.log(`Wrote notices for ${entries.length} dependencies.`)
