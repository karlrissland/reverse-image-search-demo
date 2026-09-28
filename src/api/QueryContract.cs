namespace VisionSearch.Api;

/// <summary>
/// Central definition of the public/internal field boundary and request filter rules,
/// per docs/contracts.md. Public responses must never leak provenance or scores.
/// </summary>
public static class QueryContract
{
    public const string Matches = "matches";
    public const string NoStrongMatch = "noStrongMatch";
    public const string SemanticConfiguration = "vision-semantic";
    public static readonly string[] HybridSearchFields =
    {
        "caption", "tags", "category", "subcategory", "collection", "color", "season",
    };

    // Fields retrieved from the index for shaping public results. blobPath is fetched
    // only to mint a SAS URL and is never returned on the public surface.
    public static readonly string[] PublicSelect =
    {
        "assetId", "blobPath", "caption", "tags",
        "category", "subcategory", "collection", "color", "season",
    };

    // Internal results add provenance and diagnostics.
    public static readonly string[] InternalSelect =
    {
        "assetId", "blobPath", "caption", "tags",
        "category", "subcategory", "collection", "color", "season",
        "celebrity", "celebritySource", "public",
        "metadataVersion", "embeddingModelVersion", "enrichmentModel", "indexedAt",
    };

    public static readonly string[] Facets = { "category", "color", "season", "collection", "tags" };

    // Filterable request fields. Internal additionally permits celebrity.
    private static readonly HashSet<string> PublicFilterFields =
        new(StringComparer.OrdinalIgnoreCase) { "category", "color", "season", "collection", "subcategory", "tags" };

    private static readonly HashSet<string> InternalFilterFields =
        new(PublicFilterFields, StringComparer.OrdinalIgnoreCase) { "celebrity" };

    // tags is a Collection(Edm.String) and requires the any() lambda in OData.
    private static readonly HashSet<string> CollectionFields =
        new(StringComparer.OrdinalIgnoreCase) { "tags" };

    public static bool IsFilterAllowed(string field, bool internalScope)
        => (internalScope ? InternalFilterFields : PublicFilterFields).Contains(field);

    public static bool IsCollectionField(string field) => CollectionFields.Contains(field);

    /// <summary>Escapes a value for safe inclusion in an OData string literal.</summary>
    public static string EscapeOData(string value) => value.Replace("'", "''");
}
