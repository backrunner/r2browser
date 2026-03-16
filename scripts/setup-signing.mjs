#!/usr/bin/env node

import { mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const tauriDirectory = join(homedir(), '.tauri')
const keyPath = join(tauriDirectory, 'r2browser.key')

mkdirSync(tauriDirectory, { recursive: true })

if (existsSync(keyPath)) {
  console.log(`Signing key already exists at ${keyPath}`)
  console.log('Use TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD in GitHub Actions.')
  process.exit(0)
}

console.log(`Generating a new Tauri updater key at ${keyPath}`)
const result = spawnSync('pnpm', ['tauri', 'signer', 'generate', '-w', keyPath], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log('Key generation complete.')
console.log('Add the private key and password to GitHub repository secrets:')
console.log('- TAURI_SIGNING_PRIVATE_KEY')
console.log('- TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
