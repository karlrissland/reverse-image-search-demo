using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace VisionSearch.Api.Services;

public sealed record ParsedSearchRequest(
    byte[]? ImageBytes,
    string? ImageUrl,
    string ImageMediaType,
    string? TextQuery,
    int Top,
    Dictionary<string, JsonElement> Filters);

public static class SearchRequestParser
{
    public const string RawBinaryTextQueryParameter = "textQuery";
    public const string ImageSourceError =
        "Provide at most one image source: 'crop', 'image', or 'imageUrl'.";
    public const string QuerySourceError =
        "Provide an image source or a textQuery containing a full indexed celebrity name.";

    public static async Task<ParsedSearchRequest> ParseAsync(
        HttpRequest request,
        int textQueryMaxLength,
        CancellationToken ct)
    {
        var top = 10;
        var filters = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        string? imageUrl = null;
        byte[]? imageBytes = null;
        var imageMediaType = "image/jpeg";
        string? textQuery = null;

        if (request.HasFormContentType)
        {
            var form = await request.ReadFormAsync(ct);
            var cropFile = form.Files.GetFile("crop");
            var imageFile = form.Files.GetFile("image");
            imageUrl = NormalizeImageUrl(form["imageUrl"].ToString());
            EnsureAtMostOneSource(cropFile, imageFile, imageUrl);

            var chosen = cropFile ?? imageFile;
            if (chosen is not null)
            {
                imageBytes = await ReadAllBytesAsync(chosen.OpenReadStream(), ct);
                imageMediaType = string.IsNullOrWhiteSpace(chosen.ContentType)
                    ? "image/jpeg"
                    : chosen.ContentType;
            }

            if (form.TryGetValue("top", out var topValue) &&
                int.TryParse(topValue.ToString(), out var parsedTop))
            {
                top = parsedTop;
            }

            if (form.TryGetValue("filters", out var filtersValue) &&
                !string.IsNullOrWhiteSpace(filtersValue))
            {
                filters = ParseFilters(filtersValue.ToString());
            }

            if (form.TryGetValue("textQuery", out var textValue))
            {
                textQuery = textValue.ToString();
            }
        }
        else if (IsJson(request.ContentType))
        {
            using var document = await JsonDocument.ParseAsync(request.Body, cancellationToken: ct);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                throw new InvalidOperationException("JSON request body must be an object.");
            }

            if (root.TryGetProperty("imageUrl", out var url) &&
                url.ValueKind == JsonValueKind.String)
            {
                imageUrl = NormalizeImageUrl(url.GetString());
            }

            EnsureAtMostOneSource(null, null, imageUrl);

            if (root.TryGetProperty("top", out var topElement) &&
                topElement.ValueKind == JsonValueKind.Number)
            {
                top = topElement.GetInt32();
            }

            if (root.TryGetProperty("filters", out var filterElement) &&
                filterElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var property in filterElement.EnumerateObject())
                {
                    filters[property.Name] = property.Value.Clone();
                }
            }

            if (root.TryGetProperty("textQuery", out var textElement) &&
                textElement.ValueKind == JsonValueKind.String)
            {
                textQuery = textElement.GetString();
            }
        }
        else
        {
            imageBytes = await ReadAllBytesAsync(request.Body, ct);
            if (imageBytes.Length == 0)
            {
                throw new InvalidOperationException(ImageSourceError);
            }

            imageMediaType = request.ContentType ?? "application/octet-stream";
            if (request.Query.TryGetValue("top", out var topValue) &&
                int.TryParse(topValue.ToString(), out var parsedTop))
            {
                top = parsedTop;
            }

            if (request.Query.TryGetValue(RawBinaryTextQueryParameter, out var textValue))
            {
                textQuery = textValue.ToString();
            }
        }

        var normalizedText = HybridQueryPlanner.NormalizeText(textQuery, textQueryMaxLength);
        if (imageBytes is null && imageUrl is null && normalizedText is null)
        {
            throw new InvalidOperationException(QuerySourceError);
        }

        return new ParsedSearchRequest(
            imageBytes,
            imageUrl,
            imageMediaType,
            normalizedText,
            Math.Clamp(top, 1, 50),
            filters);
    }

    private static void EnsureAtMostOneSource(
        IFormFile? cropFile,
        IFormFile? imageFile,
        string? imageUrl)
    {
        var sourceCount =
            (cropFile is null ? 0 : 1) +
            (imageFile is null ? 0 : 1) +
            (imageUrl is null ? 0 : 1);
        if (sourceCount > 1)
        {
            throw new InvalidOperationException(ImageSourceError);
        }
    }

    private static string? NormalizeImageUrl(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static Dictionary<string, JsonElement> ParseFilters(string json)
    {
        var filters = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        using var document = JsonDocument.Parse(json);
        if (document.RootElement.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in document.RootElement.EnumerateObject())
            {
                filters[property.Name] = property.Value.Clone();
            }
        }

        return filters;
    }

    private static async Task<byte[]> ReadAllBytesAsync(Stream stream, CancellationToken ct)
    {
        using var memory = new MemoryStream();
        await stream.CopyToAsync(memory, ct);
        return memory.ToArray();
    }

    private static bool IsJson(string? contentType)
        => contentType is not null &&
           contentType.Contains("application/json", StringComparison.OrdinalIgnoreCase);
}
