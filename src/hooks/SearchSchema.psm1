function Get-VisionSearchHybridFields {
    return @('caption', 'tags', 'category', 'subcategory', 'collection', 'color', 'season')
}

function New-VisionSearchIndexDefinition {
    param(
        [Parameter(Mandatory)][string]$IndexName,
        [Parameter(Mandatory)][int]$Dimensions
    )

    if ($Dimensions -ne 1024) {
        throw 'The POC contract requires a 1024-dimensional image vector.'
    }

    return [ordered]@{
        name         = $IndexName
        fields       = @(
            [ordered]@{ name = 'assetId'; type = 'Edm.String'; key = $true; filterable = $true; retrievable = $true; searchable = $false; sortable = $false; facetable = $false }
            [ordered]@{ name = 'blobPath'; type = 'Edm.String'; retrievable = $true; searchable = $false; filterable = $false; facetable = $false; sortable = $false }
            [ordered]@{ name = 'imageVector'; type = 'Collection(Edm.Single)'; searchable = $true; retrievable = $false; dimensions = $Dimensions; vectorSearchProfile = 'vs-hnsw-cosine' }
            [ordered]@{ name = 'caption'; type = 'Edm.String'; searchable = $true; retrievable = $true; filterable = $false; facetable = $false }
            [ordered]@{ name = 'tags'; type = 'Collection(Edm.String)'; searchable = $true; filterable = $true; facetable = $true; retrievable = $true }
            [ordered]@{ name = 'category'; type = 'Edm.String'; searchable = $true; filterable = $true; facetable = $true; retrievable = $true }
            [ordered]@{ name = 'subcategory'; type = 'Edm.String'; filterable = $true; facetable = $true; retrievable = $true; searchable = $true }
            [ordered]@{ name = 'collection'; type = 'Edm.String'; filterable = $true; facetable = $true; retrievable = $true; searchable = $true }
            [ordered]@{ name = 'color'; type = 'Edm.String'; filterable = $true; facetable = $true; retrievable = $true; searchable = $true }
            [ordered]@{ name = 'season'; type = 'Edm.String'; filterable = $true; facetable = $true; retrievable = $true; searchable = $true }
            [ordered]@{ name = 'celebrity'; type = 'Edm.String'; filterable = $true; facetable = $true; retrievable = $true; searchable = $false }
            [ordered]@{ name = 'celebritySource'; type = 'Edm.String'; retrievable = $true; searchable = $false; filterable = $false; facetable = $false }
            [ordered]@{ name = 'public'; type = 'Edm.Boolean'; filterable = $true; retrievable = $true; facetable = $false }
            [ordered]@{ name = 'metadataVersion'; type = 'Edm.String'; retrievable = $true; searchable = $false }
            [ordered]@{ name = 'embeddingModelVersion'; type = 'Edm.String'; retrievable = $true; searchable = $false }
            [ordered]@{ name = 'enrichmentModel'; type = 'Edm.String'; retrievable = $true; searchable = $false; filterable = $false; facetable = $false }
            [ordered]@{ name = 'indexedAt'; type = 'Edm.DateTimeOffset'; retrievable = $true; sortable = $true }
        )
        vectorSearch = [ordered]@{
            algorithms = @(
                [ordered]@{ name = 'alg-hnsw'; kind = 'hnsw'; hnswParameters = [ordered]@{ metric = 'cosine'; m = 4; efConstruction = 400; efSearch = 500 } }
            )
            profiles   = @(
                [ordered]@{ name = 'vs-hnsw-cosine'; algorithm = 'alg-hnsw' }
            )
        }
        semantic     = [ordered]@{
            defaultConfiguration = 'vision-semantic'
            configurations       = @(
                [ordered]@{
                    name              = 'vision-semantic'
                    prioritizedFields = [ordered]@{
                        titleField               = [ordered]@{ fieldName = 'caption' }
                        prioritizedContentFields = @()
                        prioritizedKeywordsFields = @(
                            (Get-VisionSearchHybridFields |
                                Where-Object { $_ -ne 'caption' } |
                                ForEach-Object { [ordered]@{ fieldName = $_ } })
                        )
                    }
                }
            )
        }
    }
}

function Get-SearchFieldAttribute {
    param(
        [Parameter(Mandatory)]$Field,
        [Parameter(Mandatory)][string]$Name
    )

    $property = $Field.PSObject.Properties[$Name]
    if ($null -ne $property) {
        return $property.Value
    }

    if ($Field -is [System.Collections.IDictionary] -and $Field.Contains($Name)) {
        return $Field[$Name]
    }

    return $null
}

function Get-IncompatibleSearchIndexChanges {
    param(
        [Parameter(Mandatory)]$Existing,
        [Parameter(Mandatory)]$Desired
    )

    $changes = [System.Collections.Generic.List[string]]::new()
    $existingFields = @{}
    foreach ($field in @($Existing.fields)) {
        $existingFields[[string](Get-SearchFieldAttribute $field 'name')] = $field
    }

    $attributes = @(
        'type', 'key', 'searchable', 'filterable', 'sortable', 'facetable',
        'retrievable', 'dimensions', 'vectorSearchProfile', 'analyzer',
        'indexAnalyzer', 'searchAnalyzer'
    )
    $booleanAttributes = @(
        'key', 'searchable', 'filterable', 'sortable', 'facetable', 'retrievable'
    )
    foreach ($desiredField in @($Desired.fields)) {
        $name = [string](Get-SearchFieldAttribute $desiredField 'name')
        if (-not $existingFields.ContainsKey($name)) {
            continue
        }

        $existingField = $existingFields[$name]
        foreach ($attribute in $attributes) {
            $existingValue = Get-SearchFieldAttribute $existingField $attribute
            $desiredValue = Get-SearchFieldAttribute $desiredField $attribute
            if ($attribute -in $booleanAttributes) {
                $defaultValue = $attribute -eq 'retrievable'
                $existingValue = if ($null -eq $existingValue) { $defaultValue } else { [bool]$existingValue }
                $desiredValue = if ($null -eq $desiredValue) { $defaultValue } else { [bool]$desiredValue }
            }
            if ([string]$existingValue -cne [string]$desiredValue) {
                $changes.Add("${name}.${attribute}: '$existingValue' -> '$desiredValue'")
            }
        }
    }

    return $changes.ToArray()
}

function Assert-VisionSearchIndexDefinition {
    param([Parameter(Mandatory)]$Index)

    $fields = @{}
    foreach ($field in @($Index.fields)) {
        $fields[[string](Get-SearchFieldAttribute $field 'name')] = $field
    }

    foreach ($name in Get-VisionSearchHybridFields) {
        if (-not $fields.ContainsKey($name) -or
            -not [bool](Get-SearchFieldAttribute $fields[$name] 'searchable')) {
            throw "Hybrid field '$name' must exist and be searchable."
        }
    }

    $vector = $fields['imageVector']
    if ($null -eq $vector -or
        [int](Get-SearchFieldAttribute $vector 'dimensions') -ne 1024 -or
        [bool](Get-SearchFieldAttribute $vector 'retrievable')) {
        throw 'imageVector must be 1024-dimensional and non-retrievable.'
    }

    $celebrity = $fields['celebrity']
    if ($null -eq $celebrity -or
        -not [bool](Get-SearchFieldAttribute $celebrity 'filterable') -or
        -not [bool](Get-SearchFieldAttribute $celebrity 'facetable') -or
        -not [bool](Get-SearchFieldAttribute $celebrity 'retrievable')) {
        throw 'celebrity must be filterable, facetable, and retrievable.'
    }
}

function Assert-CelebrityFacetReadiness {
    param([Parameter(Mandatory)]$Response)

    $facetProperty = $Response.PSObject.Properties['@search.facets']
    $facets = if ($null -ne $facetProperty) { $facetProperty.Value } else { $null }
    $celebrityProperty = if ($null -ne $facets) {
        $facets.PSObject.Properties['celebrity']
    } else {
        $null
    }
    $values = if ($null -ne $celebrityProperty) { @($celebrityProperty.Value) } else { @() }
    $seen = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $values) {
        $value = [string](Get-SearchFieldAttribute $entry 'value')
        $count = [int](Get-SearchFieldAttribute $entry 'count')
        if ([string]::IsNullOrWhiteSpace($value)) {
            throw 'Celebrity facet readiness failed: the index contains an empty celebrity value.'
        }
        if ($count -lt 1) {
            throw "Celebrity facet readiness failed: '$value' has a non-positive count."
        }
        if (-not $seen.Add($value)) {
            throw "Celebrity facet readiness failed: duplicate value '$value'."
        }
    }

    return $values.Count
}

Export-ModuleMember -Function @(
    'Get-VisionSearchHybridFields',
    'New-VisionSearchIndexDefinition',
    'Get-IncompatibleSearchIndexChanges',
    'Assert-VisionSearchIndexDefinition',
    'Assert-CelebrityFacetReadiness'
)
