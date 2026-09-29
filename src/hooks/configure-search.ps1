#Requires -Version 7.0
<#
.SYNOPSIS
  Phase 5 — configure Azure AI Search (index, Blob data source, Vision skillset, indexer).

.DESCRIPTION
  Creates or updates, idempotently, the Search objects that ingest the private image
  library and produce one logical document per asset with a 1024-dim multimodal image
  vector. Invoked by the azd post-provision orchestrator (deploy.ps1) or run directly.

  Objects created (all keyless / AAD only):
    - index        `vision-assets`         — lifted verbatim from docs/contracts.md
                                              (HNSW cosine, 1024-dim imageVector, facets, provenance).
    - data source  `vision-assets-blob`    — the `images` container via the Search
                                              service's managed identity (ResourceId connection).
    - skillset     `vision-assets-skillset`— #Microsoft.Skills.Vision.VectorizeSkill
                                              (modelVersion 2023-04-15) over normalized images,
                                              bound to AI Services by managed identity.
    - indexer      `vision-assets-indexer` — generateNormalizedImages; maps blob metadata to
                                              facet/provenance fields and the skill vector to imageVector.

  Runs the indexer and polls to completion, reporting items processed/failed and errors.

  No keys, no SAS. Uses the caller's Entra token (Search Service Contributor +
  Search Index Data Contributor) for the Search control/data plane.

.NOTES
  Reads configuration from the azd-exported environment. The Blob data source and the
  VectorizeSkill call succeed only once the Search service's managed-identity RBAC
  (Storage Blob Data Reader, Cognitive Services User) has propagated.

.PARAMETER Reset
  Explicitly delete and recreate the disposable POC index and ingestion objects before
  reindexing. Required for immutable field changes and never selected automatically.
#>
[CmdletBinding()]
param(
    [string]$SearchEndpoint = $env:AZURE_SEARCH_ENDPOINT,
    [string]$StorageAccount = $env:AZURE_STORAGE_ACCOUNT_NAME,
    [string]$Container = $(if ($env:AZURE_STORAGE_IMAGES_CONTAINER) { $env:AZURE_STORAGE_IMAGES_CONTAINER } else { 'images' }),
    [string]$AiServicesEndpoint = $env:AZURE_AISERVICES_ENDPOINT,
    [string]$ResourceGroup = $env:AZURE_RESOURCE_GROUP,
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
    [string]$IndexName = 'vision-assets',
    [string]$ApiVersion = '2026-04-01',
    [string]$ModelVersion = '2023-04-15',
    [int]$Dimensions = 1024,
    [switch]$Reset,
    [switch]$SkipRun
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'SearchSchema.psm1') -Force

Write-Host '=== Configure Azure AI Search (Phase 5) ===' -ForegroundColor Cyan

if (-not $SearchEndpoint) { throw 'AZURE_SEARCH_ENDPOINT not set. Pass -SearchEndpoint or run from an azd env.' }
if (-not $StorageAccount) { throw 'AZURE_STORAGE_ACCOUNT_NAME not set. Pass -StorageAccount or run from an azd env.' }
if (-not $AiServicesEndpoint) { throw 'AZURE_AISERVICES_ENDPOINT not set. Pass -AiServicesEndpoint or run from an azd env.' }
if (-not $ResourceGroup) { throw 'AZURE_RESOURCE_GROUP not set. Pass -ResourceGroup or run from an azd env.' }
if ($Dimensions -ne 1024) { throw 'The POC contract requires a 1024-dimensional image vector.' }

if (-not $SubscriptionId) {
    $SubscriptionId = (az account show --query id -o tsv 2>$null)
    if (-not $SubscriptionId) { throw "Could not resolve the subscription. Run 'az login' or set AZURE_SUBSCRIPTION_ID." }
}

$searchBase = $SearchEndpoint.TrimEnd('/')
$aiBase = $AiServicesEndpoint.TrimEnd('/')
$storageResourceId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts/$StorageAccount"

$dataSourceName = 'vision-assets-blob'
$skillsetName = 'vision-assets-skillset'
$indexerName = 'vision-assets-indexer'

Write-Host "Search endpoint : $searchBase"
Write-Host "Index           : $IndexName"
Write-Host "Data source     : $dataSourceName ($Container @ $StorageAccount)"
Write-Host "AI Services     : $aiBase"
Write-Host "Search API      : $ApiVersion  | model: $ModelVersion  | dims: $Dimensions"

function Get-SearchToken {
    # Keyless: the Search data/control plane accepts an Entra token for search.azure.com.
    $t = az account get-access-token --resource https://search.azure.com --query accessToken -o tsv 2>$null
    if (-not $t) { throw "Could not acquire an Entra token for Search. Run 'az login' and ensure Search RBAC access." }
    return $t.Trim()
}

function Invoke-Search {
    param(
        [Parameter(Mandatory)][ValidateSet('Get', 'Put', 'Post', 'Delete')][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [object]$Body,
        [switch]$AllowNotFound
    )
    $sep = if ($Path.Contains('?')) { '&' } else { '?' }
    $uri = "$searchBase/$Path$sep" + "api-version=$ApiVersion"
    $headers = @{ Authorization = "Bearer $(Get-SearchToken)" }
    $params = @{ Method = $Method; Uri = $uri; Headers = $headers }
    if ($null -ne $Body) {
        $params.ContentType = 'application/json'
        $params.Body = ($Body | ConvertTo-Json -Depth 20)
    }
    try {
        return Invoke-RestMethod @params
    }
    catch {
        if ($AllowNotFound -and [int]$_.Exception.Response.StatusCode -eq 404) {
            return $null
        }
        $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        throw "Search $Method $Path failed: $msg"
    }
}

# ── Index (verbatim from docs/contracts.md) ────────────────────────────────
$index = New-VisionSearchIndexDefinition -IndexName $IndexName -Dimensions $Dimensions
Assert-VisionSearchIndexDefinition -Index $index

# ── Blob data source (managed identity via ResourceId) ─────────────────────
$dataSource = [ordered]@{
    name        = $dataSourceName
    type        = 'azureblob'
    credentials = [ordered]@{ connectionString = "ResourceId=$storageResourceId;" }
    container   = [ordered]@{ name = $Container }
}

# ── Skillset: Vision multimodal embeddings over normalized images ──────────
$skillset = [ordered]@{
    name              = $skillsetName
    description       = 'Azure AI Vision multimodal image embeddings for one-doc-per-image ingestion.'
    skills            = @(
        [ordered]@{
            '@odata.type' = '#Microsoft.Skills.Vision.VectorizeSkill'
            name          = 'image-embedding'
            description   = "Azure AI Vision multimodal embeddings (modelVersion $ModelVersion)."
            context       = '/document/normalized_images/*'
            modelVersion  = $ModelVersion
            inputs        = @( [ordered]@{ name = 'image'; source = '/document/normalized_images/*' } )
            outputs       = @( [ordered]@{ name = 'vector'; targetName = 'vector' } )
        }
    )
    # Keyless binding to the AI Services account; the Search identity holds Cognitive Services User.
    cognitiveServices = [ordered]@{
        '@odata.type' = '#Microsoft.Azure.Search.AIServicesByIdentity'
        subdomainUrl  = $aiBase
    }
}

# ── Indexer: normalized images + blob-metadata field mappings ──────────────
$indexer = [ordered]@{
    name                = $indexerName
    dataSourceName      = $dataSourceName
    targetIndexName     = $IndexName
    skillsetName        = $skillsetName
    parameters          = [ordered]@{
        batchSize     = 5
        configuration = [ordered]@{
            dataToExtract = 'contentAndMetadata'
            imageAction   = 'generateNormalizedImages'
            parsingMode   = 'default'
        }
    }
    # Manifest values are stamped as blob metadata by deploy-demo-data.ps1.
    fieldMappings       = @(
        [ordered]@{ sourceFieldName = 'assetId'; targetFieldName = 'assetId' }
        [ordered]@{ sourceFieldName = 'category'; targetFieldName = 'category' }
        [ordered]@{ sourceFieldName = 'subcategory'; targetFieldName = 'subcategory' }
        [ordered]@{ sourceFieldName = 'collection'; targetFieldName = 'collection' }
        [ordered]@{ sourceFieldName = 'color'; targetFieldName = 'color' }
        [ordered]@{ sourceFieldName = 'season'; targetFieldName = 'season' }
        [ordered]@{ sourceFieldName = 'caption'; targetFieldName = 'caption'; mappingFunction = [ordered]@{ name = 'urlDecode' } }
        [ordered]@{ sourceFieldName = 'tags'; targetFieldName = 'tags'; mappingFunction = [ordered]@{ name = 'jsonArrayToStringCollection' } }
        [ordered]@{ sourceFieldName = 'celebrity'; targetFieldName = 'celebrity' }
        [ordered]@{ sourceFieldName = 'celebritySource'; targetFieldName = 'celebritySource' }
        [ordered]@{ sourceFieldName = 'public'; targetFieldName = 'public' }
        [ordered]@{ sourceFieldName = 'embeddingModelVersion'; targetFieldName = 'embeddingModelVersion' }
        [ordered]@{ sourceFieldName = 'metadataVersion'; targetFieldName = 'metadataVersion' }
        [ordered]@{ sourceFieldName = 'enrichmentModel'; targetFieldName = 'enrichmentModel' }
        [ordered]@{ sourceFieldName = 'metadata_storage_path'; targetFieldName = 'blobPath' }
        [ordered]@{ sourceFieldName = 'metadata_storage_last_modified'; targetFieldName = 'indexedAt' }
    )
    outputFieldMappings = @(
        [ordered]@{ sourceFieldName = '/document/normalized_images/0/vector'; targetFieldName = 'imageVector' }
    )
}

# ── Apply (idempotent PUT create-or-update) ────────────────────────────────
$existingIndex = Invoke-Search -Method Get -Path "indexes/$IndexName" -AllowNotFound
if ($null -ne $existingIndex -and -not $Reset) {
    $incompatibleChanges = @(Get-IncompatibleSearchIndexChanges -Existing $existingIndex -Desired $index)
    if ($incompatibleChanges.Count -gt 0) {
        $details = $incompatibleChanges -join [Environment]::NewLine
        throw @"
Index '$IndexName' has immutable field differences and cannot be updated in place:
$details

For this disposable 200-image POC, obtain maintainer approval and rerun:
  .\src\hooks\configure-search.ps1 -Reset

This deletes and recreates the index and ingestion objects, then reindexes Blob data.
Production recommendation: create a versioned index, reindex, validate, and switch an alias.
"@
    }
}

if ($Reset) {
    Write-Host 'Reset requested: deleting existing indexer, skillset, data source, and index...' -ForegroundColor Yellow
    foreach ($p in "indexers/$indexerName", "skillsets/$skillsetName", "datasources/$dataSourceName", "indexes/$IndexName") {
        try { Invoke-Search -Method Delete -Path $p | Out-Null; Write-Host "  deleted $p" }
        catch { Write-Host "  (skip) $p — $($_.Exception.Message)" -ForegroundColor DarkGray }
    }
}

Write-Host ''
Write-Host 'Creating/updating index...' -ForegroundColor Cyan
Invoke-Search -Method Put -Path "indexes/$IndexName" -Body $index | Out-Null
Write-Host "  index '$IndexName' ready." -ForegroundColor Green

Write-Host 'Creating/updating data source...' -ForegroundColor Cyan
Invoke-Search -Method Put -Path "datasources/$dataSourceName" -Body $dataSource | Out-Null
Write-Host "  data source '$dataSourceName' ready." -ForegroundColor Green

Write-Host 'Creating/updating skillset...' -ForegroundColor Cyan
Invoke-Search -Method Put -Path "skillsets/$skillsetName" -Body $skillset | Out-Null
Write-Host "  skillset '$skillsetName' ready." -ForegroundColor Green

Write-Host 'Creating/updating indexer...' -ForegroundColor Cyan
Invoke-Search -Method Put -Path "indexers/$indexerName" -Body $indexer | Out-Null
Write-Host "  indexer '$indexerName' ready." -ForegroundColor Green

function Test-CelebrityFacetReadiness {
    $response = Invoke-Search -Method Post -Path "indexes/$IndexName/docs/search" -Body ([ordered]@{
        search = '*'
        top = 0
        filter = 'celebrity ne null'
        facets = @('celebrity,count:100')
        select = 'assetId'
    })
    $count = Assert-CelebrityFacetReadiness -Response $response
    Write-Host "  celebrity facet ready: $count distinct non-empty value(s)." -ForegroundColor Green
}

if ($SkipRun) {
    Test-CelebrityFacetReadiness
    Write-Host ''
    Write-Host 'Skipping indexer run (-SkipRun).' -ForegroundColor Yellow
    return
}

# ── Run and poll to completion ─────────────────────────────────────────────
Write-Host ''
Write-Host 'Running indexer...' -ForegroundColor Cyan
# A freshly created indexer auto-starts; an explicit run then returns 409 "invocation in
# progress". That is the desired state, so swallow it and let the poll below wait it out.
try { Invoke-Search -Method Post -Path "indexers/$indexerName/run" | Out-Null }
catch { if ($_.Exception.Message -notmatch '409|in progress|concurrent invocation') { throw } }

$deadline = (Get-Date).AddMinutes(20)
$last = $null
do {
    Start-Sleep -Seconds 10
    $status = Invoke-Search -Method Get -Path "indexers/$indexerName/status"
    $last = $status.lastResult
    $state = if ($last) { $last.status } else { 'notStarted' }
    $processed = if ($last) { [int]$last.itemsProcessed } else { 0 }
    $failed = if ($last) { [int]$last.itemsFailed } else { 0 }
    Write-Host ("  status={0}  processed={1}  failed={2}" -f $state, $processed, $failed)
    if ((Get-Date) -gt $deadline) { throw "Indexer did not finish within the timeout. Last status: $state." }
} while (-not $last -or $last.status -eq 'inProgress')

Write-Host ''
if ($last.status -eq 'success') {
    Write-Host ("Indexer succeeded: {0} processed, {1} failed." -f [int]$last.itemsProcessed, [int]$last.itemsFailed) -ForegroundColor Green
}
else {
    Write-Host ("Indexer finished with status '{0}': {1} processed, {2} failed." -f $last.status, [int]$last.itemsProcessed, [int]$last.itemsFailed) -ForegroundColor Yellow
    foreach ($e in @($last.errors) | Select-Object -First 5) {
        Write-Host ("  error: key={0} msg={1}" -f $e.key, $e.errorMessage) -ForegroundColor Red
    }
    foreach ($w in @($last.warnings) | Select-Object -First 5) {
        Write-Host ("  warn : key={0} msg={1}" -f $w.key, $w.message) -ForegroundColor DarkYellow
    }
}

$docCount = Invoke-Search -Method Get -Path "indexes/$IndexName/docs/`$count"
Write-Host ("Index '{0}' document count: {1}" -f $IndexName, $docCount) -ForegroundColor Cyan
Test-CelebrityFacetReadiness
