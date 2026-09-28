using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace VisionSearch.Api.Services;

/// <summary>
/// Generates 1024-dim query embeddings using the Vision multimodal retrieval API,
/// with the SAME model version used by the ingestion VectorizeSkill (hard gate).
/// </summary>
public sealed class VisionEmbeddingService
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly TokenProvider _tokens;
    private readonly ApiSettings _settings;

    public VisionEmbeddingService(IHttpClientFactory httpFactory, TokenProvider tokens, ApiSettings settings)
    {
        _httpFactory = httpFactory;
        _tokens = tokens;
        _settings = settings;
    }

    public Task<float[]> VectorizeImageBytesAsync(byte[] bytes, CancellationToken ct)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return VectorizeAsync("retrieval:vectorizeImage", content, ct);
    }

    public Task<float[]> VectorizeImageUrlAsync(string url, CancellationToken ct)
        => VectorizeAsync("retrieval:vectorizeImage", JsonContent.Create(new { url }), ct);

    private async Task<float[]> VectorizeAsync(string operation, HttpContent content, CancellationToken ct)
    {
        var endpoint = _settings.VisionEndpoint.TrimEnd('/');
        var uri = $"{endpoint}/computervision/{operation}" +
                  $"?api-version={_settings.VisionApiVersion}&model-version={_settings.VisionModelVersion}";

        using var request = new HttpRequestMessage(HttpMethod.Post, uri) { Content = content };
        var token = await _tokens.GetTokenAsync(TokenProvider.CognitiveServicesScope, ct);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var http = _httpFactory.CreateClient();
        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Vision embedding failed ({(int)response.StatusCode}): {body}");
        }

        using var doc = JsonDocument.Parse(body);
        var vectorElement = doc.RootElement.GetProperty("vector");
        var vector = new float[vectorElement.GetArrayLength()];
        var i = 0;
        foreach (var value in vectorElement.EnumerateArray())
        {
            vector[i++] = value.GetSingle();
        }
        return vector;
    }
}
