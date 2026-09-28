using System.Net.Http.Headers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace VisionSearch.Api.Services;

public sealed class CelebrityImageRecognitionService : ICelebrityImageRecognizer
{
    private static readonly string[] NameProperties =
        ["name", "celebrity", "person", "match", "candidate"];

    private static readonly string[] ConfidenceProperties =
        ["confidence", "score", "probability", "confidenceScore"];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private const string SystemPrompt =
        """
        You are a constrained visual verifier. You may select only from the names
        supplied in the user message. Do not identify or infer any other person.
        Reply with exactly one supplied canonical name or "none". Do not explain,
        wrap the answer, add JSON, markdown, punctuation, or any other text. Use
        "none" whenever uncertain, occluded, unusable, or no supplied person is
        clearly present. Never guess.
        """;

    private readonly IHttpClientFactory _httpFactory;
    private readonly TokenProvider _tokens;
    private readonly ApiSettings _settings;

    public CelebrityImageRecognitionService(
        IHttpClientFactory httpFactory,
        TokenProvider tokens,
        ApiSettings settings)
    {
        _httpFactory = httpFactory;
        _tokens = tokens;
        _settings = settings;
    }

    public Task<CelebrityRecognition> RecognizeBytesAsync(
        byte[] bytes,
        string mediaType,
        IReadOnlyList<string> allowlist,
        CancellationToken ct)
    {
        var safeMediaType = mediaType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
            ? mediaType
            : "image/jpeg";
        var dataUrl = $"data:{safeMediaType};base64,{Convert.ToBase64String(bytes)}";
        return RecognizeAsync(dataUrl, allowlist, ct);
    }

    public Task<CelebrityRecognition> RecognizeUrlAsync(
        string url,
        IReadOnlyList<string> allowlist,
        CancellationToken ct)
        => RecognizeAsync(url, allowlist, ct);

    public static string BuildAllowlistPrompt(IReadOnlyList<string> allowlist)
        => "Allowed celebrities:\n" +
           string.Join("\n", allowlist.Select(name => $"- {name}")) +
           "\n\nDoes the image contain exactly one of these people? " +
           "Return exactly one canonical allowed name or \"none\".";

    public static CelebrityRecognition ParseModelContent(
        string content,
        IReadOnlyList<string> allowlist,
        string modelVersion)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(content);
        }
        catch (JsonException)
        {
            return ParseFreeFormContent(content, allowlist, modelVersion);
        }
        using (document)
        {
            var recognitionObject = FindRecognitionObject(document.RootElement);
            if (recognitionObject is null)
            {
                return ParseFreeFormContent(content, allowlist, modelVersion);
            }

            if (!TryGetAnyPropertyIgnoreCase(recognitionObject.Value, NameProperties, out var nameElement) ||
                nameElement.ValueKind != JsonValueKind.String ||
                !TryGetAnyPropertyIgnoreCase(
                    recognitionObject.Value,
                    ConfidenceProperties,
                    out var confidenceElement) ||
                !TryGetConfidence(confidenceElement, out var confidence))
            {
                return ParseFreeFormContent(content, allowlist, modelVersion);
            }

            var name = nameElement.GetString();
            if (string.Equals(name?.Trim(), "none", StringComparison.OrdinalIgnoreCase))
            {
                return new CelebrityRecognition(null, confidence, modelVersion, "notRecognized");
            }

            var canonical = CelebrityNameMatcher.MatchExact(name, allowlist);
            return canonical is null
                ? new CelebrityRecognition(null, confidence, modelVersion, "nonAllowlistedOutput")
                : new CelebrityRecognition(canonical, confidence, modelVersion);
        }
    }

    private static JsonElement? FindRecognitionObject(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (HasRecognitionShape(root))
        {
            return root;
        }

        JsonElement? candidate = null;
        foreach (var property in root.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.Object ||
                !HasRecognitionShape(property.Value))
            {
                continue;
            }

            if (candidate is not null)
            {
                return null;
            }

            candidate = property.Value;
        }

        return candidate;
    }

    private static bool HasRecognitionShape(JsonElement element)
        => element.ValueKind == JsonValueKind.Object &&
           TryGetAnyPropertyIgnoreCase(element, NameProperties, out _) &&
           TryGetAnyPropertyIgnoreCase(element, ConfidenceProperties, out _);

    private static bool TryGetAnyPropertyIgnoreCase(
        JsonElement element,
        IReadOnlyList<string> names,
        out JsonElement value)
    {
        foreach (var name in names)
        {
            if (element.TryGetProperty(name, out value))
            {
                return true;
            }
        }

        foreach (var property in element.EnumerateObject())
        {
            if (names.Any(name => string.Equals(
                    property.Name,
                    name,
                    StringComparison.OrdinalIgnoreCase)))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static CelebrityRecognition ParseFreeFormContent(
        string content,
        IReadOnlyList<string> allowlist,
        string modelVersion)
    {
        if (content.Contains("none", StringComparison.OrdinalIgnoreCase) ||
            content.Contains("not recognized", StringComparison.OrdinalIgnoreCase) ||
            content.Contains("cannot identify", StringComparison.OrdinalIgnoreCase) ||
            content.Contains("can't identify", StringComparison.OrdinalIgnoreCase) ||
            content.Contains("unable to identify", StringComparison.OrdinalIgnoreCase))
        {
            return new CelebrityRecognition(null, 0, modelVersion, "notRecognized");
        }

        var match = CelebrityNameMatcher.MatchSingle(content, allowlist);
        if (match is null)
        {
            return new CelebrityRecognition(null, null, modelVersion, "invalidModelOutput");
        }

        return new CelebrityRecognition(match, 0.9, modelVersion);
    }

    private static bool TryGetConfidence(JsonElement element, out double confidence)
    {
        if (element.ValueKind == JsonValueKind.Number &&
            element.TryGetDouble(out confidence))
        {
            return NormalizeConfidence(ref confidence);
        }

        if (element.ValueKind == JsonValueKind.String &&
            double.TryParse(
                element.GetString(),
                System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture,
                out confidence))
        {
            return NormalizeConfidence(ref confidence);
        }

        confidence = default;
        return false;
    }

    private static bool NormalizeConfidence(ref double confidence)
    {
        if (confidence is >= 0 and <= 1)
        {
            return true;
        }

        if (confidence is > 1 and <= 100)
        {
            confidence /= 100;
            return true;
        }

        return false;
    }

    private async Task<CelebrityRecognition> RecognizeAsync(
        string imageUrl,
        IReadOnlyList<string> allowlist,
        CancellationToken ct)
    {
        if (allowlist.Count == 0)
        {
            return new CelebrityRecognition(
                null,
                null,
                _settings.ChatModelVersion,
                "allowlistEmpty");
        }

        var endpoint = _settings.VisionEndpoint.TrimEnd('/');
        var uri = $"{endpoint}/openai/deployments/{_settings.ChatDeployment}/chat/completions" +
                  $"?api-version={_settings.ChatApiVersion}";
        for (var attempt = 1; attempt <= 3; attempt++)
        {
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
                            new { type = "text", text = BuildAllowlistPrompt(allowlist) },
                            new { type = "image_url", image_url = new { url = imageUrl } },
                        },
                    },
                },
                temperature = 0,
                max_tokens = 20,
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

            using var response = await _httpFactory.CreateClient().SendAsync(request, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(
                    $"Celebrity recognition failed ({(int)response.StatusCode}).");
            }

            using var responseDocument = JsonDocument.Parse(body);
            var content = responseDocument.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();
            if (string.IsNullOrWhiteSpace(content))
            {
                if (attempt < 3)
                {
                    continue;
                }

                return new CelebrityRecognition(
                    null,
                    null,
                    _settings.ChatModelVersion,
                    "invalidModelOutput");
            }

            var recognition = ParseModelContent(content, allowlist, _settings.ChatModelVersion);
            if (recognition.RejectionReason != "invalidModelOutput" || attempt == 3)
            {
                return recognition;
            }
        }

        return new CelebrityRecognition(
            null,
            null,
            _settings.ChatModelVersion,
            "invalidModelOutput");
    }
}
