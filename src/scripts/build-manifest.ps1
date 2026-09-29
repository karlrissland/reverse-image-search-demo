#Requires -Version 7.0
<#
.SYNOPSIS
  Build data/manifest.json by scanning the committed image folders.

.DESCRIPTION
  Scans each category subfolder under -ImagesRoot for *.jpg images and emits one
  manifest entry per image with the required structural fields (assetId, imagePath,
  category, public). Descriptive fields (subcategory, color, season, caption, tags)
  are added later by enrich-metadata.ps1 / the mirror step.

  assetId is "<category-lowercased>_<filename-stem>" (a valid Azure AI Search key).
  imagePath is relative to the data/ folder (e.g. images/Men/<hash>.jpg).

  Idempotent + merge-aware: if the manifest already exists, existing per-asset fields
  (e.g. enriched descriptive fields) are preserved; only the structural fields are
  refreshed. Assets whose images no longer exist are dropped.

.PARAMETER ImagesRoot
  Root of the committed image library. Default: data/images.

.PARAMETER ManifestPath
  Output manifest path. Default: data/manifest.json.

.PARAMETER ExcludeDirs
  Category folder names to skip (e.g. the technical fixture). Default: Evaluation.

.PARAMETER Public
  Value stamped into each entry's public flag. Default: $true.
#>
[CmdletBinding()]
param(
    [string]$ImagesRoot = 'data/images',
    [string]$ManifestPath = 'data/manifest.json',
    [string[]]$ExcludeDirs = @('Evaluation'),
    [bool]$Public = $true
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ImagesRoot)) { throw "Images root not found: $ImagesRoot" }
$dataRoot = Split-Path $ImagesRoot -Parent

# Preserve any existing per-asset fields (e.g. enriched metadata) across regenerations.
$existing = @{}
if (Test-Path $ManifestPath) {
    foreach ($e in @(Get-Content $ManifestPath -Raw -Encoding utf8 | ConvertFrom-Json)) {
        if ($e.assetId) { $existing[$e.assetId] = $e }
    }
}

$categories = Get-ChildItem -Path $ImagesRoot -Directory |
    Where-Object { $_.Name -notin $ExcludeDirs } |
    Sort-Object Name

$entries = [System.Collections.Generic.List[object]]::new()
foreach ($cat in $categories) {
    $images = Get-ChildItem -Path $cat.FullName -Filter '*.jpg' -File | Sort-Object Name
    foreach ($img in $images) {
        $stem = [IO.Path]::GetFileNameWithoutExtension($img.Name)
        $assetId = "$($cat.Name.ToLowerInvariant())_$stem"
        $imagePath = "images/$($cat.Name)/$($img.Name)"

        $entry = [ordered]@{}
        # Carry forward previously enriched fields for this asset, if any.
        if ($existing.ContainsKey($assetId)) {
            foreach ($p in $existing[$assetId].PSObject.Properties) { $entry[$p.Name] = $p.Value }
        }
        # Refresh the structural fields (these always win).
        $entry['assetId'] = $assetId
        $entry['imagePath'] = $imagePath
        $entry['category'] = $cat.Name
        if (-not $entry.Contains('public')) { $entry['public'] = $Public } else { $entry['public'] = $Public }

        $entries.Add([pscustomobject]$entry)
    }
    Write-Host ("  {0,-8} {1} images" -f $cat.Name, $images.Count)
}

# Emit as a JSON array; ConvertTo-Json wraps a single element oddly, so guard for that.
$json = if ($entries.Count -eq 1) { '[' + ($entries[0] | ConvertTo-Json -Depth 8) + ']' }
        else { $entries | ConvertTo-Json -Depth 8 }
[IO.File]::WriteAllText([IO.Path]::GetFullPath($ManifestPath), $json + "`n", (New-Object Text.UTF8Encoding($false)))

Write-Host ("Wrote {0} entries to {1}" -f $entries.Count, $ManifestPath) -ForegroundColor Green
