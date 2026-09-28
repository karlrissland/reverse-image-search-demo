namespace VisionSearch.Api.Services;

public sealed class CelebrityAllowlistProvider : ICelebrityAllowlistProvider
{
    private readonly SearchQueryService _search;

    public CelebrityAllowlistProvider(SearchQueryService search)
    {
        _search = search;
    }

    public async Task<IReadOnlyList<string>> GetAllowedCelebritiesAsync(
        bool publicOnly,
        CancellationToken ct)
    {
        var filter = BuildFilter(publicOnly);
        var response = await _search.SearchMetadataAsync(
            new MetadataSearchQuery(
                Top: 0,
                Filter: filter,
                Select: new[] { "assetId" },
                Facets: new[] { "celebrity,count:100" }),
            ct);

        return ExtractAllowlist(response);
    }

    public static IReadOnlyList<string> ExtractAllowlist(SearchResponse response)
        => response.Facets.TryGetValue("celebrity", out var values)
            ? CelebrityNameMatcher.NormalizeAllowlist(values.Select(value => value.Value))
            : Array.Empty<string>();

    public static string BuildFilter(bool publicOnly)
        => publicOnly
            ? "public eq true and celebrity ne null and celebrity ne ''"
            : "celebrity ne null and celebrity ne ''";
}
