#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { releaseMetadata, TARGETS, validateManifest, validateVersions, walk } from './release-utils.mjs'

const [target, input, output] = process.argv.slice(2)
const config = TARGETS[target]
if (!config || !input || !output) throw new Error('Usage: prepare-release-artifacts.mjs <target> <bundle-dir> <output-dir>')
const { tag, version } = releaseMetadata(process.env.RELEASE_TAG)
validateVersions(version)
const repository = process.env.GITHUB_REPOSITORY
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Missing valid GITHUB_REPOSITORY')
const files = walk(input)
mkdirSync(output, { recursive: true })
const extensions = [...new Set([...config.installers, config.updater])]
let updaterName
let signature
for (const extension of extensions) {
  const matches = files.filter(file => file.endsWith(extension))
  if (matches.length !== 1) throw new Error(`Expected one ${extension} artifact for ${target}, found ${matches.length}`)
  const source = matches[0]
  const name = `R2-Browser_${version}_${target}${extension}`
  copyFileSync(source, join(output, name))
  if (extension === config.updater) {
    signature = readFileSync(`${source}.sig`, 'utf8').trim()
    copyFileSync(`${source}.sig`, join(output, `${name}.sig`))
    updaterName = name
  }
}
const entry = { signature, url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(updaterName)}` }
const platforms = { [config.platform]: entry }
// Tauri's installer-specific lookup takes precedence over the generic platform.
if (target.includes('windows')) platforms[`${config.platform}-nsis`] = entry
if (target.includes('darwin')) platforms[`${config.platform}-app`] = entry
if (target.includes('linux')) platforms[`${config.platform}-appimage`] = entry
const manifest = validateManifest({ version, notes: `See https://github.com/${repository}/releases/tag/${tag}`, pub_date: new Date().toISOString(), platforms }, { version, repository, complete: false })
writeFileSync(join(output, `manifest-${target}.json`), JSON.stringify(manifest, null, 2) + '\n')
