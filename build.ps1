# Build script for "Always Online for Mattermost".
#   1) Syncs the shared code from chromium/ into gecko/ (only manifest.json differs).
#   2) Packages both builds into dist/*.zip for a GitHub release / the extension stores.
# Zipping goes through pack.py so the archives use forward-slash paths (required by
# addons.mozilla.org; PowerShell's Compress-Archive would use backslashes).
# Run from the project root:  ./build.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$version = (Get-Content (Join-Path $root 'chromium/manifest.json') -Raw | ConvertFrom-Json).version

# --- 1) sync shared code chromium -> gecko (gecko/manifest.json is left untouched) ---
$shared = 'defaults.js', 'background.js', 'popup.html', 'popup.js', 'styles.css'
foreach ($f in $shared) {
    Copy-Item (Join-Path $root "chromium/$f") (Join-Path $root "gecko/$f") -Force
}
foreach ($d in 'icons', '_locales') {
    $target = Join-Path $root "gecko/$d"
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    Copy-Item (Join-Path $root "chromium/$d") $target -Recurse -Force
}

# --- 2) package each build (manifest.json ends up at the zip root) ---
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
foreach ($engine in 'chromium', 'gecko') {
    $zip = Join-Path $dist "always-online-for-mattermost-$engine-v$version.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    python (Join-Path $root 'pack.py') (Join-Path $root $engine) $zip
}
Write-Host "Done (v$version)."
