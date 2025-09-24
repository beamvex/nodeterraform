#!/usr/bin/env bash
set -euo pipefail

# release.sh
# Bumps the minor version, packs, publishes to npm, and pushes git tags/commits.
# Usage:
#   ./release.sh                # default: minor
#   ./release.sh patch          # patch release
#   ./release.sh minor          # minor release (default)
#   ./release.sh major          # major release
#
# Requirements:
# - Clean git working tree
# - You must be logged in to npm (npm whoami)

VERSION_TYPE="${1:-minor}"

# Colors
Y="\033[33m"; G="\033[32m"; R="\033[31m"; N="\033[0m"

say() { echo -e "${Y}==>${N} $*"; }
ok()  { echo -e "${G}✔${N} $*"; }
fail(){ echo -e "${R}✖${N} $*"; exit 1; }

# Ensure in project root (where package.json lives)
if [[ ! -f package.json ]]; then
  fail "Run this script from the project root (where package.json exists)."
fi

# Ensure clean git working tree
say "Checking git working tree is clean..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short
  fail "Working tree is not clean. Commit or stash changes before releasing."
fi
ok "Git working tree is clean."

# Ensure npm auth
say "Checking npm authentication..."
if ! npm whoami >/dev/null 2>&1; then
  fail "Not logged in to npm. Run 'npm login' first."
fi
ok "npm auth OK. User: $(npm whoami)"

# Ensure dependencies install
say "Installing dependencies (if any)..."
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install --no-audit --no-fund
fi
ok "Dependencies installed."

# Bump version (this creates a git commit and a tag)
say "Bumping ${VERSION_TYPE} version..."
NEW_VER=$(npm version "${VERSION_TYPE}" -m "chore(release): %s")
ok "Version bumped to ${NEW_VER}."

# Push commit and tags
say "Pushing commit and tags..."
git push origin HEAD
git push origin --tags
ok "Pushed."

# Create package tarball
say "Packing package..."
PKG_TGZ=$(npm pack)
ok "Packed: ${PKG_TGZ}"

# Publish to npm
say "Publishing to npm..."
# Use public access by default for scoped packages
if npm publish --access public; then
  ok "Published ${NEW_VER} to npm."
else
  fail "npm publish failed."
fi

say "Done. Released ${NEW_VER}."
