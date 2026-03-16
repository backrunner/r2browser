#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/

function parseArgs(argv) {
  const args = {
    channel: 'stable',
    bump: null,
    version: null,
    push: true,
    runChecks: true,
    allowDirty: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--help' || token === '-h') {
      printHelp()
      process.exit(0)
    }

    if (token === '--no-push') {
      args.push = false
      continue
    }

    if (token === '--skip-checks') {
      args.runChecks = false
      continue
    }

    if (token === '--allow-dirty') {
      args.allowDirty = true
      continue
    }

    const [key, inlineValue] = token.split('=', 2)
    if (!key.startsWith('--')) {
      throw new Error(`Unknown argument: ${token}`)
    }

    const value = inlineValue ?? argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }

    if (inlineValue === undefined) {
      index += 1
    }

    switch (key) {
      case '--channel':
        if (value !== 'stable' && value !== 'beta') {
          throw new Error('The update channel must be either stable or beta.')
        }
        args.channel = value
        break
      case '--bump':
        args.bump = value
        break
      case '--version':
        args.version = value
        break
      default:
        throw new Error(`Unknown argument: ${token}`)
    }
  }

  if (!args.version && !args.bump) {
    throw new Error('You must provide either --version or --bump.')
  }

  return args
}

function printHelp() {
  console.log(`Usage: node scripts/release.mjs [options]

Options:
  --channel <stable|beta>         Release channel (default: stable)
  --bump <major|minor|patch|prerelease|release>
                                  Version increment strategy
  --version <x.y.z[-beta.n]>      Publish an explicit version instead of calculating one
  --no-push                       Create the commit and tag locally only
  --skip-checks                   Skip lint, typecheck, and cargo check
  --allow-dirty                   Allow a non-clean git worktree
  --help                          Show this help message

Examples:
  node scripts/release.mjs --channel stable --bump patch
  node scripts/release.mjs --channel beta --bump patch
  node scripts/release.mjs --channel beta --bump prerelease
  node scripts/release.mjs --channel stable --bump release
`)
}

function run(command, options = {}) {
  console.log(`> ${command}`)
  execSync(command, {
    stdio: 'inherit',
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
  })
}

function runQuiet(command) {
  return execSync(command, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    cwd: process.cwd(),
  }).trim()
}

function parseVersion(version) {
  const match = VERSION_RE.exec(version)
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`)
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    beta: match[4] ? Number(match[4]) : null,
  }
}

function formatVersion(version) {
  const base = `${version.major}.${version.minor}.${version.patch}`
  return version.beta === null ? base : `${base}-beta.${version.beta}`
}

function bumpBaseVersion(version, bump) {
  switch (bump) {
    case 'major':
      return { major: version.major + 1, minor: 0, patch: 0, beta: null }
    case 'minor':
      return { major: version.major, minor: version.minor + 1, patch: 0, beta: null }
    case 'patch':
      return { major: version.major, minor: version.minor, patch: version.patch + 1, beta: null }
    default:
      throw new Error(`Unsupported bump strategy for base version: ${bump}`)
  }
}

function inferChannelFromVersion(version) {
  return version.beta === null ? 'stable' : 'beta'
}

function computeNextVersion(currentVersion, args) {
  if (args.version) {
    const explicitVersion = parseVersion(args.version)
    const explicitChannel = inferChannelFromVersion(explicitVersion)

    if (explicitChannel !== args.channel) {
      throw new Error(
        `Explicit version ${args.version} does not match the ${args.channel} channel.`
      )
    }

    return formatVersion(explicitVersion)
  }

  const parsedCurrent = parseVersion(currentVersion)
  const supportedBumps = new Set(['major', 'minor', 'patch', 'prerelease', 'release'])
  if (!supportedBumps.has(args.bump)) {
    throw new Error(`Unsupported bump strategy: ${args.bump}`)
  }

  if (args.channel === 'stable') {
    if (args.bump === 'release') {
      if (parsedCurrent.beta === null) {
        throw new Error('The release bump can only promote an existing beta version to stable.')
      }

      return formatVersion({ ...parsedCurrent, beta: null })
    }

    if (args.bump === 'prerelease') {
      throw new Error('Stable releases do not support the prerelease bump strategy.')
    }

    return formatVersion(bumpBaseVersion(parsedCurrent, args.bump))
  }

  if (args.bump === 'release') {
    throw new Error('Beta releases do not support the release bump strategy.')
  }

  if (args.bump === 'prerelease') {
    if (parsedCurrent.beta === null) {
      throw new Error('The prerelease bump requires the current version to already be a beta version.')
    }

    return formatVersion({ ...parsedCurrent, beta: parsedCurrent.beta + 1 })
  }

  const nextBaseVersion = bumpBaseVersion(parsedCurrent, args.bump)
  return formatVersion({ ...nextBaseVersion, beta: 1 })
}

function ensureCleanWorktree(allowDirty) {
  if (allowDirty) {
    return
  }

  const status = runQuiet('git status --short')
  if (status) {
    throw new Error('The git worktree is not clean. Commit or stash your changes first, or use --allow-dirty.')
  }
}

function ensureTagDoesNotExist(tagName) {
  const localTag = runQuiet(`git tag --list ${tagName}`)
  if (localTag === tagName) {
    throw new Error(`The git tag ${tagName} already exists locally.`)
  }
}

function ensureRemoteTagDoesNotExist(tagName) {
  try {
    const remoteTag = runQuiet(`git ls-remote --tags origin refs/tags/${tagName}`)
    if (remoteTag) {
      throw new Error(`The git tag ${tagName} already exists on origin.`)
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(`Failed to check remote tags for ${tagName}.`)
  }
}

function updatePackageJson(version) {
  const packageJsonPath = resolve(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  packageJson.version = version
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
}

function updateCargoToml(version) {
  const cargoTomlPath = resolve(process.cwd(), 'src-tauri', 'Cargo.toml')
  const cargoToml = readFileSync(cargoTomlPath, 'utf8')
  const updatedCargoToml = cargoToml.replace(/^version = ".*"$/m, `version = "${version}"`)
  writeFileSync(cargoTomlPath, updatedCargoToml, 'utf8')
}

function updateTauriConfig(version) {
  const tauriConfigPath = resolve(process.cwd(), 'src-tauri', 'tauri.conf.json')
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'))
  tauriConfig.version = version
  writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, 'utf8')
}

function updateVersionFiles(version) {
  updatePackageJson(version)
  updateCargoToml(version)
  updateTauriConfig(version)
}

function runReleaseChecks() {
  run('pnpm run lint')
  run('pnpm run check')
  run('cargo check --manifest-path src-tauri/Cargo.toml')
}

function getCurrentBranch() {
  return runQuiet('git branch --show-current')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const packageJsonPath = join(process.cwd(), 'package.json')
  const currentVersion = JSON.parse(readFileSync(packageJsonPath, 'utf8')).version
  const nextVersion = computeNextVersion(currentVersion, args)
  const tagName = `v${nextVersion}`
  const branch = getCurrentBranch()

  console.log(`Current version: ${currentVersion}`)
  console.log(`Next version:    ${nextVersion}`)
  console.log(`Channel:         ${args.channel}`)
  console.log(`Tag:             ${tagName}`)
  console.log(`Push release:    ${args.push ? 'yes' : 'no'}`)

  ensureCleanWorktree(args.allowDirty)
  ensureTagDoesNotExist(tagName)
  if (args.push) {
    ensureRemoteTagDoesNotExist(tagName)
  }

  if (args.runChecks) {
    runReleaseChecks()
  }

  updateVersionFiles(nextVersion)

  run('git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json')
  run(`git commit -m "chore(release): ${tagName}"`)
  run(`git tag -a ${tagName} -m "Release ${tagName}"`)

  if (args.push) {
    if (!branch) {
      throw new Error('Cannot push release commits from a detached HEAD state.')
    }

    run(`git push origin HEAD:${branch}`)
    run(`git push origin ${tagName}`)
  }

  console.log('\nRelease prepared successfully.')
  if (args.push) {
    console.log(`GitHub Actions will publish ${tagName} once the tag build completes.`)
  } else {
    console.log(`Push ${branch || 'the current ref'} and ${tagName} when you are ready to publish.`)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
