using System.Text.RegularExpressions;

namespace VisionSearch.Api.Services;

public sealed record QueryEnrichment(string? Caption, IReadOnlyList<string> Tags, string ModelVersion);

public sealed record QueryInterpretation(
    string? UserText,
    string? GeneratedCaption,
    IReadOnlyList<string> GeneratedTags,
    string? EffectiveText,
    bool HybridApplied,
    bool SemanticApplied,
    bool EnrichmentApplied,
    string? EnrichmentModelVersion,
    string? CelebrityName = null,
    string? CelebrityIntentSource = null,
    string? CelebrityFilter = null,
    bool CelebrityRecognitionAttempted = false,
    double? CelebrityRecognitionConfidence = null,
    string? CelebrityRecognitionModelVersion = null,
    string? CelebrityFallbackReason = null);

public static partial class HybridQueryPlanner
{
    public static bool ShouldEnrich(bool hybridEnabled, bool enrichmentEnabled)
        => hybridEnabled && enrichmentEnabled;

    public static string? NormalizeText(string? value, int maximumLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = Whitespace().Replace(value.Trim(), " ");
        if (normalized.Length > maximumLength)
        {
            throw new InvalidOperationException(
                $"'textQuery' must be {maximumLength} characters or fewer.");
        }

        return normalized;
    }

    public static QueryInterpretation Build(
        string? userText,
        QueryEnrichment? enrichment,
        bool hybridEnabled,
        bool semanticEnabled)
    {
        userText = NormalizeText(userText, int.MaxValue);
        var generatedCaption = NormalizeText(enrichment?.Caption, 500);
        var generatedTags = enrichment?.Tags
            .Select(tag => NormalizeText(tag, 100))
            .Where(tag => tag is not null)
            .Select(tag => tag!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToArray() ?? Array.Empty<string>();

        var signals = new List<string>();
        if (userText is not null)
        {
            signals.Add(userText);
        }
        if (generatedCaption is not null)
        {
            signals.Add(generatedCaption);
        }
        if (generatedTags.Length > 0)
        {
            signals.Add(string.Join(" ", generatedTags));
        }

        var effectiveText = signals.Count == 0 ? null : string.Join(". ", signals);
        var hybridApplied = hybridEnabled && effectiveText is not null;
        return new QueryInterpretation(
            userText,
            generatedCaption,
            generatedTags,
            effectiveText,
            hybridApplied,
            hybridApplied && semanticEnabled,
            enrichment is not null,
            enrichment?.ModelVersion);
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
