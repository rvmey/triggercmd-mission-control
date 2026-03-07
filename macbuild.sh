#!/usr/bin/env bash
set -euo pipefail

echo "This script will unlock your keychain and grant codesign access."
echo "You'll be prompted for your keychain password twice."
echo ""

# Read password once
read -sp "Enter your keychain password: " KEYCHAIN_PASSWORD
echo ""

echo "Unlocking keychain..."
security unlock-keychain -p "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db

echo "Granting codesign access to keychain..."
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db

# Clear password from memory
unset KEYCHAIN_PASSWORD

echo "Building Electron app..."
npm run electron:build
