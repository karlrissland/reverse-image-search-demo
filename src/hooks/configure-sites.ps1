#Requires -Version 7.0
<#
.SYNOPSIS
  Stamp the Function API origin into each SPA's runtime config before azd builds them.

.DESCRIPTION
  The internal and public sites read their API base URL at runtime from
  `public/config.js` (window.__VISIONSEARCH__.apiBaseUrl). Shipped empty, that makes
  each SPA POST to its own Static Web App origin (`/api/search`), which the static host
  rejects with HTTP 405 because it only serves GET/HEAD. This script writes the
  provisioned Function URI into both config.js files.

  Runs in the azd `postprovision` hook, which fires BEFORE azd builds/deploys the JS
  services — so Vite copies the stamped `public/config.js` into `dist/` at build time.
  Idempotent: it replaces only the apiBaseUrl value and preserves the brand/theme skin.

.PARAMETER FunctionUri
  The Function API origin. Defaults to the azd/Bicep output AZURE_FUNCTION_URI.
#>
[CmdletBinding()]
param(
    [string]$FunctionUri = $env:AZURE_FUNCTION_URI
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($FunctionUri)) {
    throw 'AZURE_FUNCTION_URI is not set. Run inside azd (postprovision) or pass -FunctionUri.'
}

# Trim any trailing slash so the app's apiUrl() joins cleanly to `/api/...`.
$origin = $FunctionUri.TrimEnd('/')

$appsRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'apps'
$targets = @(
    @{ Site = 'internal'; Path = (Join-Path $appsRoot 'internal/public/config.js') },
    @{ Site = 'public'; Path = (Join-Path $appsRoot 'public/public/config.js') }
)

Write-Host ''
Write-Host "Stamping API origin into site config: $origin" -ForegroundColor Cyan

foreach ($t in $targets) {
    if (-not (Test-Path $t.Path)) {
        throw "Site config not found: $($t.Path)"
    }

    # Replace only the apiBaseUrl value so the brand/theme skin in config.js is preserved.
    $content = Get-Content -Path $t.Path -Raw
    $updated = [regex]::Replace(
        $content,
        "apiBaseUrl:\s*'[^']*'",
        "apiBaseUrl: '$origin'"
    )

    if ($updated -eq $content -and $content -notmatch "apiBaseUrl:\s*'$([regex]::Escape($origin))'") {
        throw "Could not find an apiBaseUrl entry to stamp in $($t.Path)"
    }

    Set-Content -Path $t.Path -Value $updated -Encoding utf8 -NoNewline
    Write-Host "  $($t.Site.PadRight(9)) -> $($t.Path)"
}

Write-Host 'Site config stamped.' -ForegroundColor Green
