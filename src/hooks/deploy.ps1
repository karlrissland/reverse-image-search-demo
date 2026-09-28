#Requires -Version 7.0
<#
.SYNOPSIS
  azd post-provision orchestrator for the Vision Search POC.

.DESCRIPTION
  Invoked by azd's `postprovision` hook (see azure.yaml). azd remains the
  orchestrator: it provisions infrastructure and deploys the three services
  (api, internal, public) natively via the `services:` block. This script runs
  the post-provision steps that depend on provisioned infrastructure — NOT on app
  deployment — and fans out to focused child scripts in this folder:

    - configure-sites.ps1   Stamp the Function API origin into each SPA's config.js.
    - deploy-demo-data.ps1  Upload the demo image dataset to Blob Storage.
    - configure-search.ps1  Idempotently update compatible Search objects, reject
                            immutable schema changes before PUT, then run and poll
                            the indexer. Destructive POC resets require a separate,
                            explicitly approved direct invocation with -Reset.

  AAD/managed identity only — no keys, no SAS. Normal compatible updates are
  idempotent and safe to re-run. Production schema migrations should use a
  versioned index plus validated alias cutover rather than the POC -Reset path.

.PARAMETER SkipDemoData
  Skip the demo-data upload step.

.PARAMETER SkipSearch
  Skip the Search configuration step.

.PARAMETER SkipLoadTest
  Skip deploying the Locust test to Azure Load Testing.
#>
[CmdletBinding()]
param(
    [switch]$SkipDemoData,
    [switch]$SkipSearch,
    [switch]$SkipLoadTest
)

$ErrorActionPreference = 'Stop'

Write-Host '=== Vision Search post-provision ===' -ForegroundColor Cyan

# azd exports infrastructure outputs into the environment for hooks.
Write-Host ''
Write-Host 'Provisioned resources:' -ForegroundColor Green
Write-Host "  Resource group : $($env:AZURE_RESOURCE_GROUP)"
Write-Host "  Storage account: $($env:AZURE_STORAGE_ACCOUNT_NAME)"
Write-Host "  Search endpoint: $($env:AZURE_SEARCH_ENDPOINT)"
Write-Host "  AI Services    : $($env:AZURE_AISERVICES_ENDPOINT)"
Write-Host "  Chat model     : $($env:AZURE_AISERVICES_CHAT_DEPLOYMENT)"
Write-Host "  Function API   : $($env:AZURE_FUNCTION_URI)"
Write-Host "  Internal site  : $($env:AZURE_INTERNAL_SITE_URI)"
Write-Host "  Public site    : $($env:AZURE_PUBLIC_SITE_URI)"
Write-Host "  Load testing   : $($env:AZURE_LOADTEST_NAME)"

# Data-plane RBAC on Cognitive Services / Search can take several minutes to
# propagate; child scripts should tolerate transient PermissionDenied.
Write-Host ''
Write-Host 'Note: data-plane RBAC may take a few minutes to propagate before Search and' -ForegroundColor Yellow
Write-Host '      Vision data operations succeed.' -ForegroundColor Yellow

$hookDir = $PSScriptRoot

# Stamp the Function API origin into each SPA's runtime config. Runs before azd builds
# the JS services, so the value flows into dist/config.js. Without it both sites POST to
# their own static origin and get HTTP 405.
Write-Host ''
& (Join-Path $hookDir 'configure-sites.ps1')

if ($SkipDemoData) {
    Write-Host ''
    Write-Host 'Skipping demo-data upload (-SkipDemoData).' -ForegroundColor Yellow
}
else {
    Write-Host ''
    & (Join-Path $hookDir 'deploy-demo-data.ps1')
}

if ($SkipSearch) {
    Write-Host ''
    Write-Host 'Skipping Search configuration (-SkipSearch).' -ForegroundColor Yellow
}
else {
    Write-Host ''
    & (Join-Path $hookDir 'configure-search.ps1')
}

if ($SkipLoadTest) {
    Write-Host ''
    Write-Host 'Skipping Load Testing deployment (-SkipLoadTest).' -ForegroundColor Yellow
}
else {
    Write-Host ''
    # Deploys the test definition only; auto-targets the Function host. Runs are
    # started on demand (portal or `configure-loadtest.ps1 -Run`).
    & (Join-Path $hookDir 'configure-loadtest.ps1') -TargetHost $env:AZURE_FUNCTION_URI
}

Write-Host ''
Write-Host 'Post-provision complete.' -ForegroundColor Cyan
