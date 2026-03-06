#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('../package.json').version")
INSTALLER="dist/TRIGGERcmd Mission Control-${VERSION}.dmg"

if [ ! -f "$INSTALLER" ]; then
  echo "Error: Installer not found: $INSTALLER"
  echo "Run 'npm run electron:build' first."
  exit 1
fi

gh release create "v${VERSION}" "${INSTALLER}" \
  --title "TRIGGERcmd Mission Control v${VERSION}" \
  --notes "Release ${VERSION} of TRIGGERcmd Mission Control - a desktop app for triggering your TRIGGERcmd commands." \
  --repo rvmey/triggercmd-mission-control
