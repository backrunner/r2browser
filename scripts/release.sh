#!/bin/bash

set -euo pipefail

CHANNEL="stable"
BUMP=""
VERSION=""
EXTRA_ARGS=()

show_help() {
  cat <<'HELP'
Usage: ./scripts/release.sh [options]

Options:
  --stable           Publish to the stable channel (default)
  --beta             Publish to the beta channel
  --major            Bump the major version
  --minor            Bump the minor version
  --patch            Bump the patch version
  --prerelease       Increment an existing beta prerelease number
  --promote          Promote the current beta version to stable
  --version X.Y.Z    Publish an explicit version
  --no-push          Create the commit and tag locally only
  --skip-checks      Skip local checks (CI still validates)
  --dry-run      Preview without edits, commits, tags or pushes
  --help             Show this help message
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stable)
      CHANNEL="stable"
      shift
      ;;
    --beta)
      CHANNEL="beta"
      shift
      ;;
    --major)
      BUMP="major"
      shift
      ;;
    --minor)
      BUMP="minor"
      shift
      ;;
    --patch)
      BUMP="patch"
      shift
      ;;
    --prerelease)
      BUMP="prerelease"
      shift
      ;;
    --promote)
      BUMP="release"
      shift
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --no-push|--skip-checks|--dry-run)
      EXTRA_ARGS+=("$1")
      shift
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      show_help
      exit 1
      ;;
  esac
done

COMMAND=(node scripts/release.mjs --channel "$CHANNEL")
if [[ -n "$VERSION" ]]; then
  COMMAND+=(--version "$VERSION")
elif [[ -n "$BUMP" ]]; then
  COMMAND+=(--bump "$BUMP")
else
  echo "You must provide --version, --major, --minor, --patch, --prerelease, or --promote." >&2
  exit 1
fi
COMMAND+=("${EXTRA_ARGS[@]}")

exec "${COMMAND[@]}"
