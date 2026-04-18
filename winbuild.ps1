$ErrorActionPreference = "Stop"

Write-Host "Building Electron app for Windows..."
Write-Host ""

npm run electron:build

Write-Host ""
Write-Host "Electron app build complete. The output can be found in the 'dist' directory."
Write-Host "To create a release, run scripts\publish-release.ps1"
