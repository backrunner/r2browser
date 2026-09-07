#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
import { releaseMetadata, validateVersions } from './release-utils.mjs'

const metadata = releaseMetadata(process.env.RELEASE_TAG ?? process.argv[2])
validateVersions(metadata.version)
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
if (config.bundle.createUpdaterArtifacts !== true) throw new Error('Release packaging requires Tauri v2 updater artifacts (createUpdaterArtifacts: true).')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(metadata).map(([key, value]) => `${key}=${value}\n`).join(''))
console.log(`Validated ${metadata.tag} (${metadata.channel})`)
