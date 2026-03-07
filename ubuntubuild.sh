#!/usr/bin/env bash
set -euo pipefail

echo "Installing dependencies..."
npm install

echo "Building Electron app..."
npx vite build && npx electron-builder --publish always
