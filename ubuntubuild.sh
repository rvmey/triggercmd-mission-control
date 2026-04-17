#!/usr/bin/env bash
set -euo pipefail


echo "Installing build tools..."
apt-get update -y
apt-get install -y rpm curl

curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
apt-get update -y
apt-get install -y gh

echo "Installing dependencies..."
npm install

echo "Building Electron app..."
npx vite build && npx electron-builder

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

echo "Uploading artifacts to GitHub release ${TAG}..."
gh release upload "${TAG}" dist/*.AppImage dist/*.deb dist/*.rpm --repo rvmey/triggercmd-mission-control --clobber
