using System.Text.Json;

namespace VisionSearch.Api.Services;

/// <summary>
/// Applies a small, deterministic metadata-consensus adjustment around the strongest
/// vector hit. Raw Vision similarity remains the qualification and displayed score.
/// </summary>
public sealed class MetadataConsensusReranker : IResultReranker
{
    private const double CategoryWeight = 0.012;
    private const double SubcategoryWeight = 0.010;
    private const double CollectionWeight = 0.006;
    private const double TagsWeight = 0.008;

    private readonly ApiSettings _settings;

    public MetadataConsensusReranker(ApiSettings settings)
    {
        _settings = settings;
    }

    public int GetCandidateCount(int requestedTop)
        => _settings.RerankingEnabled
            ? Math.Max(requestedTop, _settings.RerankingCandidateCount)
            : requestedTop;

    public IReadOnlyList<JsonElement> Rerank(
        IReadOnlyList<JsonElement> candidates,
        int requestedTop)
    {
        if (candidates.Count == 0)
        {
            return Array.Empty<JsonElement>();
        }

        var finalCount = Math.Min(requestedTop, candidates.Count);
        if (!_settings.RerankingEnabled ||
            GetScore(candidates[0]) is not { } topScore ||
            topScore < _settings.NoStrongMatchThreshold)
        {
            return candidates.Take(finalCount).ToArray();
        }

        var anchor = candidates[0];
        var ranked = candidates
            .Select((document, index) => new
            {
                Document = document,
                OriginalIndex = index,
                Score = GetRankingScore(document) ?? double.NegativeInfinity,
                Adjustment = GetAdjustment(anchor, document),
            })
            .OrderByDescending(item => item.Score + item.Adjustment)
            .ThenBy(item => item.OriginalIndex)
            .Take(finalCount)
            .Select(item => item.Document)
            .ToArray();

        return ranked;
    }

    private static double GetAdjustment(JsonElement anchor, JsonElement candidate)
    {
        var adjustment = 0d;
        adjustment += ExactMatch(anchor, candidate, "category") ? CategoryWeight : 0;
        adjustment += ExactMatch(anchor, candidate, "subcategory") ? SubcategoryWeight : 0;
        adjustment += ExactMatch(anchor, candidate, "collection") ? CollectionWeight : 0;
        adjustment += TagsWeight * TagOverlap(anchor, candidate);
        return adjustment;
    }

    private static bool ExactMatch(JsonElement left, JsonElement right, string propertyName)
    {
        var leftValue = GetString(left, propertyName);
        var rightValue = GetString(right, propertyName);
        return leftValue is not null &&
            rightValue is not null &&
            string.Equals(leftValue, rightValue, StringComparison.OrdinalIgnoreCase);
    }

    private static double TagOverlap(JsonElement left, JsonElement right)
    {
        var leftTags = GetStrings(left, "tags");
        var rightTags = GetStrings(right, "tags");
        if (leftTags.Count == 0 || rightTags.Count == 0)
        {
            return 0;
        }

        var intersection = leftTags.Intersect(rightTags, StringComparer.OrdinalIgnoreCase).Count();
        var union = leftTags.Union(rightTags, StringComparer.OrdinalIgnoreCase).Count();
        return union == 0 ? 0 : (double)intersection / union;
    }

    private static string? GetString(JsonElement document, string propertyName)
        => document.TryGetProperty(propertyName, out var value) &&
           value.ValueKind == JsonValueKind.String &&
           !string.IsNullOrWhiteSpace(value.GetString())
            ? value.GetString()
            : null;

    private static HashSet<string> GetStrings(JsonElement document, string propertyName)
    {
        if (!document.TryGetProperty(propertyName, out var value) ||
            value.ValueKind != JsonValueKind.Array)
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        return value.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static double? GetScore(JsonElement document)
        => document.TryGetProperty("@search.score", out var score) &&
           score.ValueKind == JsonValueKind.Number
            ? score.GetDouble()
            : null;

    private static double? GetRankingScore(JsonElement document)
        => document.TryGetProperty("@search.rankingScore", out var score) &&
           score.ValueKind == JsonValueKind.Number
            ? score.GetDouble()
            : GetScore(document);
}
