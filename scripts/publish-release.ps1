$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

$version = (Get-Content package.json | ConvertFrom-Json).version
$installer = "dist\TRIGGERcmd Mission Control Setup $version.exe"

if (-not (Test-Path $installer)) {
    Write-Error "Installer not found: $installer`nRun 'npm run electron:build' first."
    exit 1
}

gh release create "v$version" $installer `
    --title "TRIGGERcmd Mission Control v$version" `
    --notes "Release $version of TRIGGERcmd Mission Control - a desktop app for triggering your TRIGGERcmd commands." `
    --repo rvmey/triggercmd-mission-control
