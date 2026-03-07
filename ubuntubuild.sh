#!/usr/bin/env bash
set -euo pipefail

echo "Installing dependencies..."
npm install

echo "Building Electron app..."
npx vite build && npx electron-builder

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

echo "Uploading artifacts to GitHub release ${TAG}..."
gh release upload "${TAG}" dist/*.AppImage dist/*.deb dist/*.rpm --clobber
