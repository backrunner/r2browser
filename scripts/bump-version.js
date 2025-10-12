#!/usr/bin/env node

/**
 * Version Bump Script
 * Bumps version across package.json, Cargo.toml, and tauri.conf.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BUMP_TYPE = process.argv[2];
const VALID_TYPES = ['major', 'minor', 'patch'];

if (!BUMP_TYPE || !VALID_TYPES.includes(BUMP_TYPE)) {
  console.error('Usage: node bump-version.js <major|minor|patch>');
  process.exit(1);
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}`);
  }
}

function updatePackageJson(newVersion) {
  const path = join(process.cwd(), 'package.json');
  const content = JSON.parse(readFileSync(path, 'utf8'));
  content.version = newVersion;
  writeFileSync(path, JSON.stringify(content, null, 2) + '\n', 'utf8');
}

function updateCargoToml(currentVersion, newVersion) {
  const path = join(process.cwd(), 'src-tauri', 'Cargo.toml');
  let content = readFileSync(path, 'utf8');
  content = content.replace(
    `version = "${currentVersion}"`,
    `version = "${newVersion}"`
  );
  writeFileSync(path, content, 'utf8');
}

function updateTauriConfig(newVersion) {
  const path = join(process.cwd(), 'src-tauri', 'tauri.conf.json');
  const content = JSON.parse(readFileSync(path, 'utf8'));
  content.version = newVersion;
  writeFileSync(path, JSON.stringify(content, null, 2) + '\n', 'utf8');
}

try {
  // Get current version
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  );
  const currentVersion = packageJson.version;

  // Calculate new version
  const newVersion = bumpVersion(currentVersion, BUMP_TYPE);

  console.log(`Bumping version: ${currentVersion} -> ${newVersion}`);

  // Update all files
  updatePackageJson(newVersion);
  updateCargoToml(currentVersion, newVersion);
  updateTauriConfig(newVersion);

  console.log('✓ Version updated successfully');
  console.log('\nNext steps:');
  console.log('  1. Review changes: git diff');
  console.log('  2. Build: pnpm run build:release');
  console.log('  3. Commit: git commit -am "chore: bump version to v' + newVersion + '"');
  console.log('  4. Tag: git tag v' + newVersion);
  console.log('  5. Push: git push && git push --tags');

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
