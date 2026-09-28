#Requires -Version 7.0
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Import-Module (Join-Path $repoRoot 'src\hooks\SearchSchema.psm1') -Force

function Assert-Equal {
    param($Expected, $Actual, [string]$Message)
    if ($Expected -cne $Actual) {
        throw "$Message Expected '$Expected', got '$Actual'."
    }
}

$desired = New-VisionSearchIndexDefinition -IndexName 'vision-assets' -Dimensions 1024
Assert-VisionSearchIndexDefinition -Index $desired
$celebrity = $desired.fields | Where-Object name -eq 'celebrity'
Assert-Equal $true $celebrity.filterable 'Celebrity field must be filterable.'
Assert-Equal $true $celebrity.facetable 'Celebrity field must be facetable.'
Assert-Equal $true $celebrity.retrievable 'Celebrity field must be retrievable.'

$readiness = [pscustomobject]@{
    '@search.facets' = [pscustomobject]@{
        celebrity = @(
            [pscustomobject]@{ value = 'Ariana Grande'; count = 2 }
            [pscustomobject]@{ value = "Lupita Nyong'o"; count = 1 }
        )
    }
}
Assert-Equal 2 (Assert-CelebrityFacetReadiness -Response $readiness) `
    'Celebrity readiness must count distinct non-empty values.'

$emptyReadiness = [pscustomobject]@{
    '@search.facets' = [pscustomobject]@{
        celebrity = @([pscustomobject]@{ value = ' '; count = 1 })
    }
}
$emptyError = $null
try { Assert-CelebrityFacetReadiness -Response $emptyReadiness | Out-Null }
catch { $emptyError = $_.Exception.Message }
if ($emptyError -notmatch 'empty celebrity value') {
    throw 'Celebrity readiness must reject empty facet values.'
}

$compatible = $desired | ConvertTo-Json -Depth 20 | ConvertFrom-Json
$compatibleChanges = @(Get-IncompatibleSearchIndexChanges -Existing $compatible -Desired $desired)
Assert-Equal 0 $compatibleChanges.Count 'Compatible schema must remain idempotent.'

$incompatible = $desired | ConvertTo-Json -Depth 20 | ConvertFrom-Json
foreach ($field in $incompatible.fields | Where-Object name -in @('subcategory', 'collection', 'color', 'season')) {
    $field.searchable = $false
}
$incompatibleChanges = @(Get-IncompatibleSearchIndexChanges -Existing $incompatible -Desired $desired)
Assert-Equal 4 $incompatibleChanges.Count 'Legacy non-searchable fields must require reset/recreate.'
foreach ($fieldName in @('subcategory', 'collection', 'color', 'season')) {
    if (-not ($incompatibleChanges -match "^$fieldName\.searchable:")) {
        throw "Missing incompatible searchable change for '$fieldName'."
    }

    $celebrityIncompatible = $desired | ConvertTo-Json -Depth 20 | ConvertFrom-Json
    ($celebrityIncompatible.fields | Where-Object name -eq 'celebrity').facetable = $false
    $celebrityChanges = @(Get-IncompatibleSearchIndexChanges `
        -Existing $celebrityIncompatible `
        -Desired $desired)
    if (-not ($celebrityChanges -match '^celebrity\.facetable:')) {
        throw 'A non-facetable celebrity field must fail readiness before mutation.'
    }
}

$contractPath = Join-Path $repoRoot 'src\api\QueryContract.cs'
$contract = Get-Content -Raw $contractPath
$hybridBlock = [regex]::Match(
    $contract,
    'HybridSearchFields\s*=\s*\{(?<fields>.*?)\};',
    [System.Text.RegularExpressions.RegexOptions]::Singleline)
if (-not $hybridBlock.Success) {
    throw 'Could not parse QueryContract.HybridSearchFields.'
}
$contractFields = [regex]::Matches($hybridBlock.Groups['fields'].Value, '"([^"]+)"') |
    ForEach-Object { $_.Groups[1].Value }
$schemaFields = @(Get-VisionSearchHybridFields)
Assert-Equal ($schemaFields -join ',') ($contractFields -join ',') 'API hybrid fields must match the Search schema.'

Write-Host 'Search schema migration tests passed.' -ForegroundColor Green
