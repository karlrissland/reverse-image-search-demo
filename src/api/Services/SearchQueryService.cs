using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace VisionSearch.Api.Services;

public sealed record FacetValue(string Value, long Count);

public sealed record SearchResponse(
    IReadOnlyList<JsonElement> Documents,
    IReadOnlyDictionary<string, IReadOnlyList<FacetValue>> Facets);

public sealed record SearchQuery(
    float[] Vector,
    int Top,
    string? Filter,
    IReadOnlyList<string> Select,
    IReadOnlyList<string> Facets,
    string? Text = null,
    bool UseSemanticRanking = false);

public sealed record MetadataSearchQuery(
    int Top,
    string? Filter,
    IReadOnlyList<string> Select,
    IReadOnlyList<string> Facets);

/// <summary>
/// Executes vector-only or hybrid image/text queries over the same Search document.
/// </summary>
public sealed class SearchQueryService
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly TokenProvider _tokens;
    private readonly ApiSettings _settings;

    public SearchQueryService(IHttpClientFactory httpFactory, TokenProvider tokens, ApiSettings settings)
    {
        _httpFactory = httpFactory;
        _tokens = tokens;
        _settings = settings;
    }

    public async Task<SearchResponse> SearchAsync(SearchQuery query, CancellationToken ct)
    {
        var payload = BuildPayload(query);
        return await SendAsync(payload, ct);
    }

    public async Task<SearchResponse> SearchMetadataAsync(
        MetadataSearchQuery query,
        CancellationToken ct)
    {
        var payload = BuildMetadataPayload(query);
        return await SendAsync(payload, ct);
    }

    private async Task<SearchResponse> SendAsync(
        Dictionary<string, object?> payload,
        CancellationToken ct)
    {
        var endpoint = _settings.SearchEndpoint.TrimEnd('/');
        var uri = $"{endpoint}/indexes/{_settings.SearchIndexName}/docs/search" +
                  $"?api-version={_settings.SearchApiVersion}";

        using var request = new HttpRequestMessage(HttpMethod.Post, uri)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json"),
        };
        var token = await _tokens.GetTokenAsync(TokenProvider.SearchScope, ct);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var http = _httpFactory.CreateClient();
        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Search query failed ({(int)response.StatusCode}): {body}");
        }

        using var doc = JsonDocument.Parse(body);
        return ParseResponse(doc.RootElement);
    }

    public static SearchResponse ParseResponse(JsonElement root)
    {
        var documents = new List<JsonElement>();
        foreach (var hit in root.GetProperty("value").EnumerateArray())
        {
            documents.Add(hit.Clone());
        }

        var facetResult = new Dictionary<string, IReadOnlyList<FacetValue>>();
        if (root.TryGetProperty("@search.facets", out var facetsElement))
        {
            foreach (var facet in facetsElement.EnumerateObject())
            {
                var values = new List<FacetValue>();
                foreach (var entry in facet.Value.EnumerateArray())
                {
                    if (entry.TryGetProperty("value", out var v) && entry.TryGetProperty("count", out var c))
                    {
                        values.Add(new FacetValue(v.ToString(), c.GetInt64()));
                    }
                }
                facetResult[facet.Name] = values;
            }
        }

        return new SearchResponse(documents, facetResult);
    }

    public static Dictionary<string, object?> BuildPayload(SearchQuery query)
    {
        var payload = new Dictionary<string, object?>
        {
            ["count"] = false,
            // Azure Search otherwise defaults the final result window to 50. Keep
            // vector k and final top aligned for candidate, facet, and score requests.
            ["top"] = query.Top,
            ["select"] = string.Join(",", query.Select),
            ["vectorQueries"] = new[]
            {
                new Dictionary<string, object?>
                {
                    ["kind"] = "vector",
                    ["vector"] = query.Vector,
                    ["fields"] = "imageVector",
                    ["k"] = query.Top,
                    // Exact scoring is affordable for the 200-document POC. Reassess this at production catalog scale.
                    ["exhaustive"] = true,
                },
            },
        };
        if (query.Facets.Count > 0)
        {
            payload["facets"] = query.Facets;
        }

        if (!string.IsNullOrWhiteSpace(query.Filter))
        {
            payload["filter"] = query.Filter;
        }

        if (!string.IsNullOrWhiteSpace(query.Text))
        {
            payload["search"] = query.Text;
            payload["searchFields"] = string.Join(",", QueryContract.HybridSearchFields);
            if (query.UseSemanticRanking)
            {
                payload["queryType"] = "semantic";
                payload["semanticConfiguration"] = QueryContract.SemanticConfiguration;
            }
        }

        return payload;
    }

    public static Dictionary<string, object?> BuildMetadataPayload(MetadataSearchQuery query)
    {
        var payload = new Dictionary<string, object?>
        {
            ["count"] = true,
            ["search"] = "*",
            ["top"] = Math.Clamp(query.Top, 0, 50),
            ["select"] = string.Join(",", query.Select),
        };
        if (query.Facets.Count > 0)
        {
            payload["facets"] = query.Facets;
        }
        if (!string.IsNullOrWhiteSpace(query.Filter))
        {
            payload["filter"] = query.Filter;
        }

        return payload;
    }
}
