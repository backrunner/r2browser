#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { validateManifest } from './release-utils.mjs'

function parseArgs(argv) {
  const args = new Map()

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      continue
    }

    const [key, inlineValue] = token.split('=', 2)
    if (inlineValue !== undefined) {
      args.set(key, inlineValue)
      continue
    }

    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }

    args.set(key, value)
    index += 1
  }

  return {
    input: args.get('--input'),
    output: args.get('--output'),
  }
}

function walk(directory) {
  const entries = []

  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry)
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      entries.push(...walk(absolutePath))
      continue
    }

    entries.push(absolutePath)
  }

  return entries
}

function readManifests(inputDirectory) {
  return walk(inputDirectory)
    .filter((filePath) => basename(filePath) === 'latest.json' || /^manifest-.*\.json$/.test(basename(filePath)))
    .map((filePath) => ({
      path: filePath,
      data: JSON.parse(readFileSync(filePath, 'utf8')),
    }))
}

function mergeManifests(manifests) {
  if (manifests.length === 0) {
    throw new Error('No updater manifests were found in the provided input directory.')
  }

  const merged = {
    version: null,
    notes: null,
    pub_date: null,
    platforms: {},
  }

  for (const manifest of manifests) {
    const { version, notes, pub_date: publishedAt, platforms } = manifest.data

    if (!version || typeof version !== 'string') {
      throw new Error(`Manifest ${manifest.path} is missing a valid version field.`)
    }

    if (!platforms || typeof platforms !== 'object') {
      throw new Error(`Manifest ${manifest.path} is missing a platforms object.`)
    }

    if (merged.version && merged.version !== version) {
      throw new Error(
        `Manifest ${manifest.path} has version ${version}, expected ${merged.version}.`
      )
    }

    merged.version = version
    merged.notes ??= notes ?? null
    merged.pub_date ??= publishedAt ?? null

    for (const [platform, payload] of Object.entries(platforms)) {
      if (platform in merged.platforms) {
        const previous = JSON.stringify(merged.platforms[platform])
        const next = JSON.stringify(payload)
        if (previous !== next) {
          throw new Error(`Conflicting updater payload found for platform ${platform}.`)
        }
        continue
      }

      merged.platforms[platform] = payload
    }
  }

  if (Object.keys(merged.platforms).length === 0) {
    throw new Error('The merged updater manifest does not contain any platform entries.')
  }

  return merged
}

function main() {
  const { input, output } = parseArgs(process.argv.slice(2))

  if (!input || !output) {
    throw new Error('Usage: node scripts/merge-updater-manifest.mjs --input <dir> --output <file>')
  }

  const inputDirectory = resolve(process.cwd(), input)
  const outputFile = resolve(process.cwd(), output)
  const manifests = readManifests(inputDirectory)
  const merged = validateManifest(mergeManifests(manifests), {
    version: process.env.RELEASE_TAG?.slice(1),
    repository: process.env.GITHUB_REPOSITORY,
  })

  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')

  console.log(`Merged ${manifests.length} updater manifest(s) into ${outputFile}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
