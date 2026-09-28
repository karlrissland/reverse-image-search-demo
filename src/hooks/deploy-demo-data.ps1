#Requires -Version 7.0
<#
.SYNOPSIS
  Demo data — manifest-driven upload of the image dataset to private Blob Storage.

.DESCRIPTION
  Validates the asset manifest (unique IDs, required fields, on-disk files), then
  uploads every referenced image to the `images` container, preserving the
  category/file path. Verifies each expected blob exists after upload and reports
  counts per category. AAD-only: authenticates as the signed-in identity via
  `--auth-mode login` (DefaultAzureCredential parity). No keys, no SAS, no binaries
  in Search. Idempotent and safe to re-run (overwrites existing blobs).

.NOTES
  Resolves the storage account from -StorageAccount, then AZURE_STORAGE_ACCOUNT_NAME,
  then `azd env get-value`. Blob names strip the leading `images/` from imagePath so
  the manifest path `images/Mens/001.jpg` becomes blob `Mens/001.jpg` in container `images`.
#>
[CmdletBinding()]
param(
    [string]$StorageAccount = $env:AZURE_STORAGE_ACCOUNT_NAME,
    [string]$Container = $(if ($env:AZURE_STORAGE_IMAGES_CONTAINER) { $env:AZURE_STORAGE_IMAGES_CONTAINER } else { 'images' }),
    [string]$ManifestPath = 'data/manifest.json',
    [string]$ImagesRoot = 'data/images',
    [string]$EmbeddingModelVersion = '2023-04-15',
    [string]$MetadataVersion = '1',
    [switch]$SkipUpload,
    [switch]$SkipMetadata
)

$ErrorActionPreference = 'Stop'

function Resolve-StorageAccount([string]$Explicit) {
    if ($Explicit) { return $Explicit }
    $fromAzd = (& azd env get-value AZURE_STORAGE_ACCOUNT_NAME 2>$null)
    if ($LASTEXITCODE -eq 0 -and $fromAzd) { return $fromAzd.Trim() }
    throw 'Storage account not found. Pass -StorageAccount, set AZURE_STORAGE_ACCOUNT_NAME, or run from an azd env.'
}

Write-Host '=== Vision Search — Phase 4 image upload ===' -ForegroundColor Cyan

# --- Validate manifest -----------------------------------------------------
if (-not (Test-Path $ManifestPath)) { throw "Manifest not found: $ManifestPath" }
$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$total = @($manifest).Count
if ($total -eq 0) { throw "Manifest is empty: $ManifestPath" }

$errors = [System.Collections.Generic.List[string]]::new()
$seen = [System.Collections.Generic.HashSet[string]]::new()
$expected = [ordered]@{}  # blobName -> localPath

foreach ($item in $manifest) {
    foreach ($field in 'assetId', 'imagePath', 'category') {
        if (-not $item.$field) { $errors.Add("Missing '$field' on entry: $($item | ConvertTo-Json -Compress)") }
    }
    if ($item.assetId -and -not $seen.Add($item.assetId)) {
        $errors.Add("Duplicate assetId: $($item.assetId)")
    }
    if ($item.imagePath) {
        $local = Join-Path (Split-Path $ImagesRoot -Parent) $item.imagePath
        if (-not (Test-Path $local)) {
            $errors.Add("File not found for $($item.assetId): $local")
        }
        else {
            # Blob name is imagePath minus the leading 'images/' segment.
            $blobName = $item.imagePath -replace '^images/', ''
            $expected[$blobName] = (Resolve-Path $local).Path
        }
    }
}

if ($errors.Count -gt 0) {
    Write-Host "Manifest validation FAILED ($($errors.Count) issue(s)):" -ForegroundColor Red
    $errors | Select-Object -First 20 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw 'Fix manifest/data issues before uploading.'
}
Write-Host "Manifest OK: $total entries, $($expected.Count) unique image paths, $($seen.Count) unique assetIds." -ForegroundColor Green

# --- Resolve context -------------------------------------------------------
$StorageAccount = Resolve-StorageAccount $StorageAccount
Write-Host "Storage account: $StorageAccount"
Write-Host "Container      : $Container"

$acct = az account show --query '{user:user.name, sub:name}' -o json 2>$null | ConvertFrom-Json
if (-not $acct) { throw "Not signed in. Run 'az login' first." }
Write-Host "Signed in as   : $($acct.user)  (subscription: $($acct.sub))"

# --- Upload ----------------------------------------------------------------
if ($SkipUpload) {
    Write-Host 'Skipping upload (-SkipUpload); running verification only.' -ForegroundColor Yellow
}
else {
    Write-Host "Uploading $($expected.Count) images (AAD auth)..." -ForegroundColor Cyan
    az storage blob upload-batch `
        --account-name $StorageAccount `
        --destination $Container `
        --source $ImagesRoot `
        --pattern '*.jpg' `
        --auth-mode login `
        --overwrite `
        --no-progress `
        --only-show-errors | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Blob batch upload failed.' }
    Write-Host 'Upload complete.' -ForegroundColor Green
}

# --- Verify linkage --------------------------------------------------------
Write-Host 'Verifying blob linkage...' -ForegroundColor Cyan
$actual = az storage blob list `
    --account-name $StorageAccount `
    --container-name $Container `
    --auth-mode login `
    --query '[].name' `
    --only-show-errors -o json | ConvertFrom-Json
$actualSet = [System.Collections.Generic.HashSet[string]]::new()
foreach ($n in $actual) { [void]$actualSet.Add($n) }

$missing = $expected.Keys | Where-Object { -not $actualSet.Contains($_) }
$byCategory = $expected.Keys | Group-Object { ($_ -split '/')[0] } | Sort-Object Name

Write-Host ''
Write-Host 'Uploaded blobs by category:' -ForegroundColor Green
foreach ($g in $byCategory) { Write-Host ("  {0,-12} {1}" -f $g.Name, $g.Count) }
Write-Host ("  {0,-12} {1}" -f 'TOTAL', $expected.Count)
Write-Host "Blobs present in container: $($actualSet.Count)"

if ($missing) {
    Write-Host "MISSING $($missing.Count) expected blob(s):" -ForegroundColor Red
    $missing | Select-Object -First 20 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw 'Verification failed: some manifest images are not in Blob Storage.'
}

Write-Host ''
Write-Host "Phase 4 upload verified: all $($expected.Count) images present in '$Container'." -ForegroundColor Cyan

# --- Stamp manifest metadata onto blobs -------------------------------------
# The indexer reads blobs, not the manifest. Stamping the manifest fields as blob
# metadata lets the indexer field-map them into the Search document (assetId is the
# contract KEY; the rest populate facets/provenance). Idempotent; safe to re-run.
if ($SkipMetadata) {
    Write-Host 'Skipping metadata stamping (-SkipMetadata).' -ForegroundColor Yellow
}
else {
    Write-Host ''
    Write-Host "Stamping blob metadata from manifest ($total entries)..." -ForegroundColor Cyan
    # Manifest-declared optional fields (human-authored) carried straight through.
    $optional = 'collection', 'celebrity', 'celebritySource'
    $i = 0; $enriched = 0
    foreach ($item in $manifest) {
        $i++
        $blobName = $item.imagePath -replace '^images/', ''
        $md = [System.Collections.Generic.List[string]]::new()
        $md.Add("assetId=$($item.assetId)")
        $md.Add("category=$($item.category)")
        $md.Add("public=$([bool]$item.public ? 'true' : 'false')")
        $md.Add("embeddingModelVersion=$EmbeddingModelVersion")
        $md.Add("metadataVersion=$MetadataVersion")
        foreach ($field in $optional) {
            $val = $item.$field
            if ($null -ne $val -and "$val".Trim()) { $md.Add("$field=$val") }
        }
        # AI enrichment sidecar (Phase 5.5), co-located with the image. Facet fields go in
        # direct; caption is URL-encoded (Latin-1 header safe -> urlDecode at index time);
        # tags is a compact JSON array string (-> jsonArrayToStringCollection at index time).
        $sidecarPath = (Join-Path (Split-Path $ImagesRoot -Parent) $item.imagePath) -replace '\.jpg$', '.metadata.json'
        if (Test-Path $sidecarPath) {
            $e = Get-Content $sidecarPath -Raw -Encoding utf8 | ConvertFrom-Json
            foreach ($field in 'subcategory', 'color', 'season') {
                $val = $e.$field
                if ($null -ne $val -and "$val".Trim()) { $md.Add("$field=$val") }
            }
            if ($e.caption -and "$($e.caption)".Trim()) {
                $md.Add("caption=$([uri]::EscapeDataString([string]$e.caption))")
            }
            if ($e.tags -and @($e.tags).Count) {
                # Escape quotes so the JSON array survives the az CLI (the CLI strips bare quotes);
                # jsonArrayToStringCollection parses it back into a Collection(Edm.String) at index time.
                $tagsJson = (@($e.tags) | ConvertTo-Json -Compress -AsArray) -replace '"', '\"'
                $md.Add("tags=$tagsJson")
            }
            if ($e.enrichment -and $e.enrichment.model) {
                $md.Add("enrichmentModel=$($e.enrichment.model)@$($e.enrichment.modelVersion)")
            }
            $enriched++
        }
        az storage blob metadata update `
            --account-name $StorageAccount `
            --container-name $Container `
            --name $blobName `
            --metadata $md `
            --auth-mode login `
            --only-show-errors | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to set metadata on blob '$blobName'." }
        # One dot per stamped blob = live progress; the running total lands every 50.
        Write-Host '.' -NoNewline
        if ($i % 50 -eq 0) { Write-Host " $i / $total" }
    }
    if ($i % 50 -ne 0) { Write-Host '' }  # close the trailing dot line
    Write-Host "Blob metadata stamped on $total blobs ($enriched with AI enrichment)." -ForegroundColor Green
}
