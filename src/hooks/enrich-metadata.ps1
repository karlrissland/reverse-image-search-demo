#Requires -Version 7.0
<#
.SYNOPSIS
  Phase 5.5 — AI enrichment: gpt-4o vision writes a per-image metadata sidecar.

.DESCRIPTION
  For each asset in the manifest, sends the local image to the deployed gpt-4o (vision)
  model and asks for structured catalog metadata (subcategory, color, season, caption,
  tags). The result is written as a companion sidecar next to the image
  (e.g. data/images/Mens/001.jpg -> data/images/Mens/001.metadata.json) with an
  `enrichment` provenance block. deploy-demo-data.ps1 later reads each sidecar and
  stamps the fields onto the image blob's metadata, so the indexer emits ONE document
  carrying both the image vector and these descriptive fields.

  Decoupled and one-time: this generator is NOT wired into the azd post-provision hook.
  Run it once (or again when images change). Idempotent — an asset whose sidecar already
  exists is skipped unless -Force. Keyless / AAD only.

.NOTES
  POC shortcut: production would run this enrichment in-pipeline as a
  #Microsoft.Skills.Custom.ChatCompletionSkill (or WebApiSkill) inside the indexer
  skillset, so no external stamping step is needed. Captions may contain Unicode
  (e.g. rosé); they are preserved verbatim in the JSON sidecar and carried through blob
  metadata URL-encoded (decoded losslessly at index time via the urlDecode mapping).
#>
[CmdletBinding()]
param(
    [string]$AiServicesEndpoint = $env:AZURE_AISERVICES_ENDPOINT,
    [string]$ChatDeployment = $(if ($env:AZURE_AISERVICES_CHAT_DEPLOYMENT) { $env:AZURE_AISERVICES_CHAT_DEPLOYMENT } else { 'gpt-4o' }),
    [string]$ChatModelVersion = $(if ($env:AZURE_AISERVICES_CHAT_MODEL_VERSION) { $env:AZURE_AISERVICES_CHAT_MODEL_VERSION } else { '2024-11-20' }),
    [string]$ChatApiVersion = '2024-10-21',
    [string]$ManifestPath = 'data/manifest.json',
    [string]$ImagesRoot = 'data/images',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

Write-Host '=== AI enrichment (Phase 5.5) — per-image sidecars ===' -ForegroundColor Cyan

if (-not $AiServicesEndpoint) { throw 'AZURE_AISERVICES_ENDPOINT not set. Pass -AiServicesEndpoint or run from an azd env.' }
if (-not (Test-Path $ManifestPath)) { throw "Manifest not found: $ManifestPath" }

$aiBase = $AiServicesEndpoint.TrimEnd('/')
$chatUri = "$aiBase/openai/deployments/$ChatDeployment/chat/completions?api-version=$ChatApiVersion"

# Canonical season casing for the fixed facet vocabulary.
$validSeasons = @{
    'spring' = 'Spring'; 'summer' = 'Summer'; 'fall' = 'Fall'; 'autumn' = 'Fall';
    'winter' = 'Winter'; 'all-season' = 'All-Season'; 'all season' = 'All-Season'; 'year-round' = 'All-Season'
}

function Get-Token([string]$Resource) {
    $t = az account get-access-token --resource $Resource --query accessToken -o tsv 2>$null
    if (-not $t) { throw "Could not acquire an Entra token for $Resource. Run 'az login'." }
    return $t.Trim()
}

$manifest = Get-Content $ManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$total = @($manifest).Count
Write-Host "Manifest: $total assets. Chat: $ChatDeployment ($ChatModelVersion) @ $aiBase"

$systemPrompt = @'
You are a retail catalog tagger for apparel, kids, and home products. Look at the
product image and return STRICT JSON with exactly these keys:
  subcategory: short product-type noun (e.g. "polo shirt", "table lamp"), or null
  color: single primary color word, or null
  season: one of "Spring","Summer","Fall","Winter","All-Season", or null
  caption: one concise sentence (<=140 chars) describing the item
  tags: array of 3-6 short lowercase keywords
Only describe what is visible. Preserve accents. Do not invent brands or people.
'@

$aiHeaders = @{ Authorization = "Bearer $(Get-Token 'https://cognitiveservices.azure.com')" }
$done = 0; $made = 0; $skipped = 0; $failed = 0
foreach ($item in $manifest) {
    $done++
    $id = $item.assetId
    $local = Join-Path (Split-Path $ImagesRoot -Parent) $item.imagePath
    if (-not (Test-Path $local)) { Write-Host "  (skip) $id — image not found: $local" -ForegroundColor DarkYellow; continue }
    $sidecar = $local -replace '\.jpg$', '.metadata.json'
    if ((Test-Path $sidecar) -and -not $Force) { $skipped++; continue }

    try {
        $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($local))
        $body = @{
            messages        = @(
                @{ role = 'system'; content = $systemPrompt },
                @{ role = 'user'; content = @(
                        @{ type = 'text'; text = 'Tag this product image.' },
                        @{ type = 'image_url'; image_url = @{ url = "data:image/jpeg;base64,$b64" } }
                    )
                }
            )
            response_format = @{ type = 'json_object' }
            temperature     = 0.2
            max_tokens      = 400
        } | ConvertTo-Json -Depth 12
        $bytes = [Text.Encoding]::UTF8.GetBytes($body)
        $resp = Invoke-RestMethod -Method Post -Uri $chatUri -Headers $aiHeaders -ContentType 'application/json; charset=utf-8' -Body $bytes
        $parsed = $resp.choices[0].message.content | ConvertFrom-Json

        $season = $null
        if ($parsed.season) {
            $key = "$($parsed.season)".Trim().ToLower()
            if ($validSeasons.ContainsKey($key)) { $season = $validSeasons[$key] }
        }
        $tags = @()
        if ($parsed.tags) {
            $tags = @($parsed.tags | ForEach-Object { "$_".Trim().ToLower() } | Where-Object { $_ } | Select-Object -Unique -First 6)
        }
        $out = [ordered]@{
            assetId     = $id
            subcategory = if ($parsed.subcategory) { "$($parsed.subcategory)".Trim() } else { $null }
            color       = if ($parsed.color) { "$($parsed.color)".Trim().ToLower() } else { $null }
            season      = $season
            caption     = if ($parsed.caption) { "$($parsed.caption)".Trim() } else { $null }
            tags        = $tags
            enrichment  = [ordered]@{
                model        = $ChatDeployment
                modelVersion = $ChatModelVersion
                generatedAt  = (Get-Date).ToUniversalTime().ToString('o')
            }
        }
        $out | ConvertTo-Json -Depth 8 | Set-Content $sidecar -Encoding utf8
        $made++
        if ($made % 25 -eq 0) { Write-Host "  enriched $made (processed $done / $total)" }
    }
    catch {
        $failed++
        $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        Write-Host "  (fail) $id — $msg" -ForegroundColor Red
    }
}
Write-Host "Enrichment complete: $made written, $skipped skipped (existing), $failed failed." -ForegroundColor Green
Write-Host 'Sidecars live next to each image as *.metadata.json. Re-run deploy-demo-data.ps1 to stamp + index.' -ForegroundColor Cyan
