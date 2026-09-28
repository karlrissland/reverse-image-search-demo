using System.Net.Http.Headers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace VisionSearch.Api.Services;

public sealed class QueryImageEnrichmentService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private const string SystemPrompt =
        """
        You are a retail catalog query interpreter. Describe only the visible product.
        Return strict JSON with exactly: caption (one concise sentence, at most 140
        characters) and tags (3-6 short lowercase product, color, material, or style
        terms). Preserve accents. Do not identify people, infer brands, or add provenance.
        """;

    private readonly IHttpClientFactory _httpFactory;
    private readonly TokenProvider _tokens;
    private readonly ApiSettings _settings;

    public QueryImageEnrichmentService(
        IHttpClientFactory httpFactory,
        TokenProvider tokens,
        ApiSettings settings)
    {
        _httpFactory = httpFactory;
        _tokens = tokens;
        _settings = settings;
    }

    public Task<QueryEnrichment> EnrichBytesAsync(
        byte[] bytes,
        string mediaType,
        CancellationToken ct)
    {
        var safeMediaType = mediaType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
            ? mediaType
            : "image/jpeg";
        var dataUrl = $"data:{safeMediaType};base64,{Convert.ToBase64String(bytes)}";
        return EnrichAsync(dataUrl, ct);
    }

    public Task<QueryEnrichment> EnrichUrlAsync(string url, CancellationToken ct)
        => EnrichAsync(url, ct);

    private async Task<QueryEnrichment> EnrichAsync(string imageUrl, CancellationToken ct)
    {
        var endpoint = _settings.VisionEndpoint.TrimEnd('/');
        var uri = $"{endpoint}/openai/deployments/{_settings.ChatDeployment}/chat/completions" +
                  $"?api-version={_settings.ChatApiVersion}";
        var payload = new
        {
            messages = new object[]
            {
                new { role = "system", content = SystemPrompt },
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "text", text = "Interpret this query image for catalog search." },
                        new { type = "image_url", image_url = new { url = imageUrl } },
                    },
                },
            },
            response_format = new { type = "json_object" },
            temperature = 0.1,
            max_tokens = 250,
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, uri)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(payload, JsonOptions),
                Encoding.UTF8,
                "application/json"),
        };
        var token = await _tokens.GetTokenAsync(TokenProvider.CognitiveServicesScope, ct);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var http = _httpFactory.CreateClient();
        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Query-image enrichment failed ({(int)response.StatusCode}): {body}");
        }

        using var responseDocument = JsonDocument.Parse(body);
        var content = responseDocument.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("Query-image enrichment returned no interpretation.");
        }

        using var interpretation = JsonDocument.Parse(content);
        var root = interpretation.RootElement;
        var caption = root.TryGetProperty("caption", out var captionElement) &&
            captionElement.ValueKind == JsonValueKind.String
                ? captionElement.GetString()
                : null;
        var tags = root.TryGetProperty("tags", out var tagsElement) &&
            tagsElement.ValueKind == JsonValueKind.Array
                ? tagsElement.EnumerateArray()
                    .Where(tag => tag.ValueKind == JsonValueKind.String)
                    .Select(tag => tag.GetString())
                    .Where(tag => !string.IsNullOrWhiteSpace(tag))
                    .Select(tag => tag!)
                    .ToArray()
                : Array.Empty<string>();

        if (string.IsNullOrWhiteSpace(caption) && tags.Length == 0)
        {
            throw new InvalidOperationException(
                "Query-image enrichment returned neither a caption nor tags.");
        }

        return new QueryEnrichment(caption, tags, _settings.ChatModelVersion);
    }
}
