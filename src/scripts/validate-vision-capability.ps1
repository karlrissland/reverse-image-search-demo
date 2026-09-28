[CmdletBinding()]
param(
    [string]$VisionEndpoint = $env:VISION_ENDPOINT,
    [string]$VisionApiVersion = $(if ($env:VISION_API_VERSION) { $env:VISION_API_VERSION } else { '2024-02-01' }),
    [string]$ModelVersion = $(if ($env:VISION_MODEL_VERSION) { $env:VISION_MODEL_VERSION } else { '2023-04-15' }),
    [int]$ExpectedDimensions = $(if ($env:VISION_VECTOR_DIMENSIONS) { [int]$env:VISION_VECTOR_DIMENSIONS } else { 1024 }),
    [string]$SampleImagePath = $(if ($env:VISION_SAMPLE_IMAGE) { $env:VISION_SAMPLE_IMAGE } else { 'data/images/Women/001.jpg' }),
    [string]$SampleText = 'a red silk evening gown with lace detail',
    [string]$SearchEndpoint = $env:VISION_SEARCH_ENDPOINT,
    [string]$SearchApiVersion = $(if ($env:VISION_SEARCH_API_VERSION) { $env:VISION_SEARCH_API_VERSION } else { '2025-09-01' }),
    [string]$EvidencePath = 'docs/capability-gate.evidence.json',
    # Local-only fallback for the spike while data-plane RBAC propagates. Production uses DefaultAzureCredential; never commit a key.
    [string]$VisionKey = $env:VISION_KEY,
    [string]$SearchKey = $env:SEARCH_KEY,
    [switch]$RunRemoteProbe
)

$ErrorActionPreference = 'Stop'

Write-Output 'Vision VectorizeSkill capability gate'
Write-Output "Vision API version:  $VisionApiVersion"
Write-Output "Model version:       $ModelVersion"
Write-Output "Expected dimensions: $ExpectedDimensions"
Write-Output "Search API version:  $SearchApiVersion"

if ($ExpectedDimensions -ne 1024) {
    throw 'The POC contract requires a 1024-dimensional image vector.'
}

if (-not $VisionEndpoint) {
    Write-Warning 'VISION_ENDPOINT not set. Set it to the Azure AI Vision / AI Services endpoint in a multimodal-embeddings region, then re-run with -RunRemoteProbe.'
    exit 2
}

if (-not $RunRemoteProbe) {
    Write-Output 'Configuration present. Re-run with -RunRemoteProbe to execute the authenticated capability probe.'
    exit 0
}

function Get-AadToken([string]$Resource) {
    # Entra token keeps the probe key-free, matching the DefaultAzureCredential path the API uses.
    $t = az account get-access-token --resource $Resource --query accessToken -o tsv 2>$null
    if (-not $t) { throw "Could not acquire an Entra token for $Resource. Run 'az login' and ensure RBAC access." }
    return $t.Trim()
}

$evidence = [ordered]@{
    timestamp        = (Get-Date).ToUniversalTime().ToString('o')
    visionEndpoint   = $VisionEndpoint
    visionApiVersion = $VisionApiVersion
    modelVersion     = $ModelVersion
    expectedDims     = $ExpectedDimensions
    vectorizeText    = $null
    vectorizeImage   = $null
    searchSkillset   = $null
    decision         = 'unknown'
}

$visionBase = $VisionEndpoint.TrimEnd('/')
if ($VisionKey) {
    Write-Warning 'Using VISION_KEY for the probe (local only). Production uses DefaultAzureCredential.'
    $visionAuth = @{ 'Ocp-Apim-Subscription-Key' = $VisionKey }
}
else {
    $visionAuth = @{ Authorization = "Bearer $(Get-AadToken 'https://cognitiveservices.azure.com')" }
}

# --- Query-time embedding paths (text + image), independent of the Search check ---
$visionPass = $false
try {
    $textUri = "$visionBase/computervision/retrieval:vectorizeText?api-version=$VisionApiVersion&model-version=$ModelVersion"
    $textResp = Invoke-RestMethod -Method Post -Uri $textUri `
        -Headers $visionAuth `
        -ContentType 'application/json' `
        -Body (@{ text = $SampleText } | ConvertTo-Json)
    $textDims = @($textResp.vector).Count
    Write-Output "vectorizeText: modelVersion=$($textResp.modelVersion) dims=$textDims"
    $evidence.vectorizeText = [ordered]@{ modelVersion = $textResp.modelVersion; dims = $textDims }
    if ($textDims -ne $ExpectedDimensions) { throw "vectorizeText returned $textDims dimensions; expected $ExpectedDimensions." }

    if (-not (Test-Path $SampleImagePath)) { throw "Sample image not found: $SampleImagePath" }
    $imgUri = "$visionBase/computervision/retrieval:vectorizeImage?api-version=$VisionApiVersion&model-version=$ModelVersion"
    $imgResp = Invoke-RestMethod -Method Post -Uri $imgUri `
        -Headers $visionAuth `
        -ContentType 'application/octet-stream' `
        -InFile $SampleImagePath
    $imgDims = @($imgResp.vector).Count
    Write-Output "vectorizeImage: modelVersion=$($imgResp.modelVersion) dims=$imgDims (sample: $SampleImagePath)"
    $evidence.vectorizeImage = [ordered]@{ modelVersion = $imgResp.modelVersion; dims = $imgDims; sample = $SampleImagePath }
    if ($imgDims -ne $ExpectedDimensions) { throw "vectorizeImage returned $imgDims dimensions; expected $ExpectedDimensions." }
    $visionPass = $true
}
catch {
    $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    Write-Warning "Vision embedding probe failed: $msg"
    if (-not $evidence.vectorizeText) { $evidence.vectorizeText = [ordered]@{ error = $msg } }
}

# --- Search skillset acceptance (optional, independent) ---
$searchPass = $true
if ($SearchEndpoint) {
    $searchPass = $false
    $searchBase = $SearchEndpoint.TrimEnd('/')
    if ($SearchKey) {
        $hdr = @{ 'api-key' = $SearchKey }
    }
    else {
        $hdr = @{ Authorization = "Bearer $(Get-AadToken 'https://search.azure.com')" }
    }
    $skillsetName = 'capability-probe-vision-vectorize'
    $skillset = @{
        name        = $skillsetName
        description = 'Temporary capability probe for Microsoft.Skills.Vision.VectorizeSkill. Safe to delete.'
        skills      = @(
            @{
                '@odata.type' = '#Microsoft.Skills.Vision.VectorizeSkill'
                name          = 'probe-image'
                context       = '/document'
                modelVersion  = $ModelVersion
                inputs        = @(@{ name = 'url'; source = '/document/metadata_storage_path' })
                outputs       = @(@{ name = 'vector'; targetName = 'image_vector' })
            }
        )
    } | ConvertTo-Json -Depth 10
    $skillUri = "$searchBase/skillsets/$skillsetName" + "?api-version=$SearchApiVersion"
    try {
        Invoke-RestMethod -Method Put -Uri $skillUri -Headers $hdr -ContentType 'application/json' -Body $skillset | Out-Null
        Write-Output "Search skillset accepted VectorizeSkill (api-version=$SearchApiVersion)."
        $evidence.searchSkillset = [ordered]@{ accepted = $true; apiVersion = $SearchApiVersion }
        Invoke-RestMethod -Method Delete -Uri $skillUri -Headers $hdr | Out-Null
        Write-Output 'Probe skillset deleted.'
        $searchPass = $true
    }
    catch {
        $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        $evidence.searchSkillset = [ordered]@{ accepted = $false; error = $msg }
        Write-Warning "Search rejected the VectorizeSkill skillset: $msg"
    }
}
else {
    Write-Warning 'VISION_SEARCH_ENDPOINT not set. Skipped Search skillset acceptance check.'
}

$evidence.decision = if ($visionPass -and $searchPass) { 'go' } else { 'no-go' }
$evidence | ConvertTo-Json -Depth 10 | Set-Content -Path $EvidencePath -Encoding utf8
Write-Output "Decision: $($evidence.decision.ToUpper()). Evidence written to $EvidencePath"
if ($evidence.decision -ne 'go') { exit 4 }
exit 0
