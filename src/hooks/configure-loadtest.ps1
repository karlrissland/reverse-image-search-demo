#Requires -Version 7.0
<#
.SYNOPSIS
  Deploy (create or update) the Vision Search Locust test to Azure Load Testing.

.DESCRIPTION
  Idempotently uploads the parameterized Locust test in src/loadtest to the
  provisioned Azure Load Testing resource (AZURE_LOADTEST_NAME). If the test id
  already exists it is updated in place; otherwise it is created. Optionally
  starts a test run with -Run.

  Uses the caller's Entra token via the Azure CLI `load` extension. No keys or
  SAS are stored. The target host and image-URL fixture come from the config
  file's `env` block (or -TargetHost / -ApiImageUrl overrides here); leave them
  unset to deploy the definition only and run it later from the portal/CLI.

.PARAMETER LoadTestName
  Azure Load Testing resource name. Defaults to $env:AZURE_LOADTEST_NAME.

.PARAMETER ResourceGroup
  Resource group. Defaults to $env:AZURE_RESOURCE_GROUP.

.PARAMETER TestId
  Logical test id in the service. Defaults to 'vision-search-api'.

.PARAMETER ConfigFile
  Azure Load Testing config YAML. Defaults to ../loadtest/loadtest.yaml.

.PARAMETER TargetHost
  Optional target host (e.g. https://vs-fn-xxxx.azurewebsites.net) injected as
  the LOCUST_HOST env value for the test.

.PARAMETER ApiImageUrl
  Optional publicly reachable image URL injected as API_IMAGE_URL.

.PARAMETER Run
  Also start a test run after deploying the definition.
#>
[CmdletBinding()]
param(
    [string]$LoadTestName = $env:AZURE_LOADTEST_NAME,
    [string]$ResourceGroup = $env:AZURE_RESOURCE_GROUP,
    [string]$TestId = 'vision-search-api',
    [string]$ConfigFile,
    [string]$TargetHost,
    [string]$ApiImageUrl,
    [switch]$Run
)

$ErrorActionPreference = 'Stop'

Write-Host '=== Deploy Locust test to Azure Load Testing ===' -ForegroundColor Cyan

if (-not $LoadTestName) { throw 'AZURE_LOADTEST_NAME not set. Pass -LoadTestName or run from an azd env.' }
if (-not $ResourceGroup) { throw 'AZURE_RESOURCE_GROUP not set. Pass -ResourceGroup or run from an azd env.' }

$loadTestDir = (Resolve-Path (Join-Path $PSScriptRoot '..' 'loadtest')).Path
if (-not $ConfigFile) { $ConfigFile = Join-Path $loadTestDir 'loadtest.yaml' }
if (-not (Test-Path $ConfigFile)) { throw "Config file not found: $ConfigFile" }

# The CLI `load` extension resolves testPlan/configurationFiles relative to the
# current directory, so run from the loadtest folder.
Push-Location $loadTestDir
try {
    # Ensure the `load` extension is present (idempotent).
    $hasExt = az extension show --name load --query name -o tsv 2>$null
    if (-not $hasExt) {
        Write-Host 'Installing Azure CLI "load" extension...' -ForegroundColor Yellow
        az extension add --name load --only-show-errors | Out-Null
    }

    # Optional runtime overrides passed through to the test definition's env.
    $envArgs = @()
    if ($TargetHost) { $envArgs += @('--env', "LOCUST_HOST=$TargetHost") }
    if ($ApiImageUrl) { $envArgs += @('--env', "API_IMAGE_URL=$ApiImageUrl") }

    $existing = az load test show `
        --load-test-resource $LoadTestName `
        --resource-group $ResourceGroup `
        --test-id $TestId `
        --query testId -o tsv 2>$null

    $verb = if ($existing) { 'update' } else { 'create' }
    Write-Host "Test '$TestId' will be ${verb}d on '$LoadTestName'." -ForegroundColor Green

    az load test $verb `
        --load-test-resource $LoadTestName `
        --resource-group $ResourceGroup `
        --test-id $TestId `
        --load-test-config-file (Split-Path $ConfigFile -Leaf) `
        @envArgs `
        --only-show-errors | Out-Null

    Write-Host "Test definition deployed." -ForegroundColor Green

    if ($Run) {
        $runId = "run-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Write-Host "Starting test run '$runId'..." -ForegroundColor Cyan
        az load test-run create `
            --load-test-resource $LoadTestName `
            --resource-group $ResourceGroup `
            --test-id $TestId `
            --test-run-id $runId `
            --only-show-errors | Out-Null
        Write-Host "Test run '$runId' started. Track it in the Azure Load Testing portal." -ForegroundColor Green
    }
    else {
        Write-Host 'Run it with -Run, or from the Azure Load Testing portal / `az load test-run create`.' -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Load test deployment complete.' -ForegroundColor Cyan
