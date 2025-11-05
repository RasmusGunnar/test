param(
  [switch]$NoInstall
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Resolve-Path "$ScriptDir/.."
Set-Location $ProjectDir

if (-not (Test-Path "node_modules") -and -not $NoInstall) {
  Write-Host "Installerer Node-afhængigheder..."
  npm install
}

$env:NODE_ENV = "production"
node sonos-local-server.js
