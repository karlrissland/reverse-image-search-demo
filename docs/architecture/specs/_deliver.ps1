#requires -Version 5.1
# Build helper: validate + deliver a diagram spec as static and motion HTML.
# Usage: pwsh -File specs/_deliver.ps1 -Type architecture -Name 01-deployment-architecture
param(
    [Parameter(Mandatory)][string]$Type,
    [Parameter(Mandatory)][string]$Name
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot          # docs/architecture
$cli = Join-Path (Get-Location) '.github/skills/archify/bin/archify.mjs'
$spec = Join-Path $PSScriptRoot "$Name.json"
$html = Join-Path $root "$Name.html"
$motionSpec = Join-Path $PSScriptRoot "$Name.motion.json"
$motionHtml = Join-Path $root "$Name.motion.html"

Write-Host "== validate $Name =="
node $cli validate $Type $spec --quality showcase --json | ConvertFrom-Json | ForEach-Object {
    if (-not $_.ok) { throw "validation failed: $($_.error)" }
}
Write-Host "== deliver static =="
node $cli deliver $Type $spec $html --quality showcase --json | Out-Null

# motion variant: inject meta.animation = trace
$m = Get-Content $spec -Raw
$m = $m -replace '("quality_profile"\s*:\s*"showcase",)', "`$1`n    `"animation`": `"trace`","
Set-Content $motionSpec -Value $m -NoNewline
Write-Host "== deliver motion =="
node $cli deliver $Type $motionSpec $motionHtml --quality showcase --json | Out-Null
Write-Host "OK: $Name (static + motion)"
