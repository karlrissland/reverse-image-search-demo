#Requires -Version 7.0
<#
.SYNOPSIS
  Mirror enriched sidecar fields into data/manifest.json.

.DESCRIPTION
  For each manifest entry, reads the image's companion <image>.metadata.json sidecar
  (written by enrich-metadata.ps1) and copies the descriptive fields (subcategory,
  color, season, caption, tags) onto the manifest entry so the manifest is fully
  populated and easy to review. Structural fields are preserved; Unicode is preserved.

  The sidecars remain the source of truth that deploy-demo-data.ps1 stamps onto blob
  metadata; this step only mirrors them into the manifest for readability.

.PARAMETER ManifestPath
  Manifest to update in place. Default: data/manifest.json.

.PARAMETER ImagesRoot
  Root of the committed image library. Default: data/images.
#>
[CmdletBinding()]
param(
    [string]$ManifestPath = 'data/manifest.json',
    [string]$ImagesRoot = 'data/images'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $ManifestPath)) { throw "Manifest not found: $ManifestPath" }
$dataRoot = Split-Path $ImagesRoot -Parent

$manifest = @(Get-Content $ManifestPath -Raw -Encoding utf8 | ConvertFrom-Json)
$merged = 0; $noSidecar = 0

$out = foreach ($item in $manifest) {
    $local = Join-Path $dataRoot $item.imagePath
    $sidecar = $local -replace '\.jpg$', '.metadata.json'

    $e = [ordered]@{
        assetId   = $item.assetId
        imagePath = $item.imagePath
        category  = $item.category
    }
    if (Test-Path $sidecar) {
        $s = Get-Content $sidecar -Raw -Encoding utf8 | ConvertFrom-Json
        if ($s.subcategory) { $e['subcategory'] = "$($s.subcategory)" }
        if ($s.color) { $e['color'] = "$($s.color)" }
        if ($s.season) { $e['season'] = "$($s.season)" }
        if ($s.caption) { $e['caption'] = "$($s.caption)" }
        if ($s.tags) { $e['tags'] = @($s.tags) }
        $merged++
    }
    else { $noSidecar++ }
    $e['public'] = [bool]$item.public
    [pscustomobject]$e
}

$json = @($out) | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText([IO.Path]::GetFullPath($ManifestPath), $json + "`n", (New-Object Text.UTF8Encoding($false)))
Write-Host ("Merged {0} sidecars into {1} ({2} without sidecar)." -f $merged, $ManifestPath, $noSidecar) -ForegroundColor Green
