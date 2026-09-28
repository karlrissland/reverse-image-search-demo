#Requires -Version 7.0
<#
.SYNOPSIS
  Post-deploy check: fail loudly if a live site shipped an empty/stale API base URL.

.DESCRIPTION
  Fetches each Static Web App's runtime `config.js` and asserts that
  `window.__VISIONSEARCH__.apiBaseUrl` is present and matches the provisioned Function
  origin. Catches the "deployed build predates the config.js stamp" case that surfaces
  in the browser as HTTP 405 (SPA POSTing to its own static origin).

  Runs in the azd `postdeploy` hook, after the SPAs are built and uploaded.

.PARAMETER FunctionUri
  Expected API origin. Defaults to the azd/Bicep output AZURE_FUNCTION_URI.
#>
[CmdletBinding()]
param(
    [string]$FunctionUri = $env:AZURE_FUNCTION_URI,
    [string]$InternalUri = $env:AZURE_INTERNAL_SITE_URI,
    [string]$PublicUri = $env:AZURE_PUBLIC_SITE_URI
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($FunctionUri)) {
    throw 'AZURE_FUNCTION_URI is not set. Run inside azd (postdeploy) or pass -FunctionUri.'
}

$expected = $FunctionUri.TrimEnd('/')
$targets = @(
    @{ Site = 'internal'; Uri = $InternalUri },
    @{ Site = 'public'; Uri = $PublicUri }
)

Write-Host ''
Write-Host "Verifying live site config points at: $expected" -ForegroundColor Cyan

$failures = @()
foreach ($t in $targets) {
    if ([string]::IsNullOrWhiteSpace($t.Uri)) {
        $failures += "$($t.Site): site URI env var is empty"
        continue
    }
    $configUrl = "$($t.Uri.TrimEnd('/'))/config.js"
    try {
        $content = (Invoke-WebRequest -Uri $configUrl -UseBasicParsing -TimeoutSec 30).Content
    } catch {
        $failures += "$($t.Site): could not fetch $configUrl ($($_.Exception.Message))"
        continue
    }

    # Pull the apiBaseUrl string literal out of the runtime config.
    $m = [regex]::Match($content, "apiBaseUrl\s*:\s*'([^']*)'")
    $actual = if ($m.Success) { $m.Groups[1].Value.TrimEnd('/') } else { $null }

    if ([string]::IsNullOrWhiteSpace($actual)) {
        $failures += "$($t.Site): apiBaseUrl is empty at $configUrl (stale build - SPA will 405)"
    } elseif ($actual -ne $expected) {
        $failures += "$($t.Site): apiBaseUrl '$actual' != expected '$expected' at $configUrl"
    } else {
        Write-Host "  $($t.Site.PadRight(9)) OK -> $actual" -ForegroundColor Green
    }
}

if ($failures.Count -gt 0) {
    Write-Host ''
    foreach ($f in $failures) { Write-Host "  FAIL: $f" -ForegroundColor Red }
    throw "Site config verification failed. Re-run 'azd deploy internal' / 'azd deploy public' so the stamped config.js ships."
}

Write-Host 'Site config verified.' -ForegroundColor Green
