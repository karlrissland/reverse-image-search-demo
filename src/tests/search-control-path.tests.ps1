#Requires -Version 7.0
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$configurePath = Join-Path $repoRoot 'src\hooks\configure-search.ps1'
Import-Module (Join-Path $repoRoot 'src\hooks\SearchSchema.psm1') -Force

$global:searchTestExistingIndex = $null
$global:searchTestOperations = [System.Collections.Generic.List[string]]::new()

function az {
    return 'synthetic-search-token'
}

function Start-Sleep {
    param([int]$Seconds)
}

function Invoke-RestMethod {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][uri]$Uri,
        [hashtable]$Headers,
        [string]$ContentType,
        [string]$Body
    )

    $path = $Uri.AbsolutePath.TrimStart('/')
    $global:searchTestOperations.Add("$($Method.ToUpperInvariant()) $path")

    if ($Method -eq 'Get' -and $path -eq 'indexes/vision-assets') {
        return $global:searchTestExistingIndex
    }
    if ($Method -eq 'Get' -and $path -eq 'indexers/vision-assets-indexer/status') {
        return [pscustomobject]@{
            lastResult = [pscustomobject]@{
                status = 'success'
                itemsProcessed = 204
                itemsFailed = 0
                errors = @()
                warnings = @()
            }
        }
    }
    if ($Method -eq 'Get' -and $path -eq 'indexes/vision-assets/docs/$count') {
        return 204
    }
    if ($Method -eq 'Post' -and $path -eq 'indexes/vision-assets/docs/search') {
        return [pscustomobject]@{
            '@search.facets' = [pscustomobject]@{
                celebrity = @(
                    [pscustomobject]@{ value = 'Ariana Grande'; count = 1 }
                    [pscustomobject]@{ value = "Lupita Nyong'o"; count = 1 }
                )
            }
        }
    }

    return $null
}

function Assert-Sequence {
    param(
        [Parameter(Mandatory)][string[]]$Expected,
        [Parameter(Mandatory)][string[]]$Actual,
        [Parameter(Mandatory)][string]$Message
    )

    $expectedText = $Expected -join [Environment]::NewLine
    $actualText = $Actual -join [Environment]::NewLine
    if ($expectedText -cne $actualText) {
        throw @"
$Message
Expected:
$expectedText
Actual:
$actualText
"@
    }
}

function Invoke-ControlPathScenario {
    param(
        [Parameter(Mandatory)][ValidateSet('compatible', 'incompatible', 'reset')][string]$Name
    )

    $global:searchTestOperations.Clear()
    $desired = New-VisionSearchIndexDefinition -IndexName 'vision-assets' -Dimensions 1024
    $global:searchTestExistingIndex = $desired | ConvertTo-Json -Depth 20 | ConvertFrom-Json

    if ($Name -eq 'incompatible') {
        foreach ($field in $global:searchTestExistingIndex.fields |
            Where-Object name -in @('subcategory', 'collection', 'color', 'season')) {
            $field.searchable = $false
        }
    }

    $parameters = @{
        SearchEndpoint = 'https://synthetic.search.windows.net'
        StorageAccount = 'syntheticstorage'
        Container = 'images'
        AiServicesEndpoint = 'https://synthetic.cognitiveservices.azure.com'
        ResourceGroup = 'synthetic-rg'
        SubscriptionId = '00000000-0000-0000-0000-000000000000'
    }
    if ($Name -eq 'reset') {
        $parameters.Reset = $true
    }
    else {
        $parameters.SkipRun = $true
    }

    & $configurePath @parameters
}

Invoke-ControlPathScenario -Name compatible
Assert-Sequence -Message 'Compatible schema must update in place without deletes or an indexer run.' `
    -Expected @(
        'GET indexes/vision-assets'
        'PUT indexes/vision-assets'
        'PUT datasources/vision-assets-blob'
        'PUT skillsets/vision-assets-skillset'
        'PUT indexers/vision-assets-indexer'
        'POST indexes/vision-assets/docs/search'
    ) `
    -Actual $global:searchTestOperations.ToArray()

$incompatibleError = $null
try {
    Invoke-ControlPathScenario -Name incompatible
}
catch {
    $incompatibleError = $_.Exception.Message
}
if (-not $incompatibleError) {
    throw 'Incompatible immutable schema must fail before mutation.'
}
foreach ($expectedDiagnostic in @(
    'immutable field differences',
    'subcategory.searchable',
    'collection.searchable',
    'color.searchable',
    'season.searchable',
    'configure-search.ps1 -Reset',
    'Production recommendation: create a versioned index'
)) {
    if ($incompatibleError -notmatch [regex]::Escape($expectedDiagnostic)) {
        throw "Incompatible-schema diagnostic is missing '$expectedDiagnostic'."
    }
}
Assert-Sequence -Message 'Incompatible schema must perform only the existing-index read.' `
    -Expected @('GET indexes/vision-assets') `
    -Actual $global:searchTestOperations.ToArray()

Invoke-ControlPathScenario -Name reset
Assert-Sequence -Message 'Reset must delete ingestion objects, recreate them, run the indexer, and verify readiness.' `
    -Expected @(
        'GET indexes/vision-assets'
        'DELETE indexers/vision-assets-indexer'
        'DELETE skillsets/vision-assets-skillset'
        'DELETE datasources/vision-assets-blob'
        'DELETE indexes/vision-assets'
        'PUT indexes/vision-assets'
        'PUT datasources/vision-assets-blob'
        'PUT skillsets/vision-assets-skillset'
        'PUT indexers/vision-assets-indexer'
        'POST indexers/vision-assets-indexer/run'
        'GET indexers/vision-assets-indexer/status'
        'GET indexes/vision-assets/docs/$count'
        'POST indexes/vision-assets/docs/search'
    ) `
    -Actual $global:searchTestOperations.ToArray()

Write-Host 'Search configuration control-path tests passed.' -ForegroundColor Green

Remove-Variable searchTestExistingIndex, searchTestOperations -Scope Global
