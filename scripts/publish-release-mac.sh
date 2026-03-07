#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
INSTALLER_X64="dist/TRIGGERcmd Mission Control-${VERSION}.dmg"
INSTALLER_ARM64="dist/TRIGGERcmd Mission Control-${VERSION}-arm64.dmg"

if [ ! -f "$INSTALLER_X64" ]; then
  echo "Error: x64 installer not found: $INSTALLER_X64"
  echo "Run './macbuild.sh' first."
  exit 1
fi

if [ ! -f "$INSTALLER_ARM64" ]; then
  echo "Error: ARM64 installer not found: $INSTALLER_ARM64"
  echo "Run './macbuild.sh' first."
  exit 1
fi

# Check if release exists
if gh release view "v${VERSION}" --repo rvmey/triggercmd-mission-control &>/dev/null; then
  echo "Release v${VERSION} exists. Uploading DMG files to existing release..."
  gh release upload "v${VERSION}" "${INSTALLER_X64}" "${INSTALLER_ARM64}" --clobber \
    --repo rvmey/triggercmd-mission-control
else
  echo "Creating new release v${VERSION}..."
  gh release create "v${VERSION}" "${INSTALLER_X64}" "${INSTALLER_ARM64}" \
    --title "TRIGGERcmd Mission Control v${VERSION}" \
    --notes "Release ${VERSION} of TRIGGERcmd Mission Control - a desktop app for triggering your TRIGGERcmd commands." \
    --repo rvmey/triggercmd-mission-control
fi
