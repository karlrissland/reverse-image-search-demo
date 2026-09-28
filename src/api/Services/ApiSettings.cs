using System.Globalization;

namespace VisionSearch.Api.Services;

/// <summary>
/// Strongly typed view over the function app settings. Values are supplied by
/// infra/modules/function.bicep at deploy time; defaults keep local runs working.
/// </summary>
public sealed class ApiSettings
{
    public string SearchEndpoint { get; }
    public string SearchIndexName { get; }
    public string SearchApiVersion { get; }
    public double NoStrongMatchThreshold { get; }
    public bool RerankingEnabled { get; }
    public int RerankingCandidateCount { get; }
    public bool HybridTextEnabled { get; }
    public bool SemanticRankingEnabled { get; }
    public bool QueryImageEnrichmentEnabled { get; }
    public bool CelebrityImageRecognitionEnabled { get; }
    public double CelebrityRecognitionMinimumConfidence { get; }
    public int TextQueryMaxLength { get; }

    public string VisionEndpoint { get; }
    public string VisionApiVersion { get; }
    public string VisionModelVersion { get; }
    public string ChatDeployment { get; }
    public string ChatApiVersion { get; }
    public string ChatModelVersion { get; }

    public string ImagesBlobEndpoint { get; }
    public string ImagesContainer { get; }
    public int SasTtlMinutes { get; }

    public ApiSettings()
    {
        SearchEndpoint = Require("SEARCH_ENDPOINT");
        SearchIndexName = Get("SEARCH_INDEX_NAME", "vision-assets");
        SearchApiVersion = Get("SEARCH_API_VERSION", "2026-04-01");
        NoStrongMatchThreshold = GetDouble("NO_STRONG_MATCH_THRESHOLD", 0.78);
        RerankingEnabled = GetBool("RERANKING_ENABLED", true);
        RerankingCandidateCount = GetInt("RERANKING_CANDIDATE_COUNT", 40, 30, 50);
        HybridTextEnabled = GetBool("HYBRID_TEXT_ENABLED", false);
        SemanticRankingEnabled = GetBool("SEMANTIC_RANKING_ENABLED", false);
        QueryImageEnrichmentEnabled = GetBool("QUERY_IMAGE_ENRICHMENT_ENABLED", false);
        CelebrityImageRecognitionEnabled = GetBool(
            "CELEBRITY_IMAGE_RECOGNITION_ENABLED",
            false);
        CelebrityRecognitionMinimumConfidence = GetDouble(
            "CELEBRITY_RECOGNITION_MIN_CONFIDENCE",
            0.85);
        TextQueryMaxLength = GetInt("TEXT_QUERY_MAX_LENGTH", 500, 1, 2000);

        VisionEndpoint = Require("VISION_ENDPOINT");
        VisionApiVersion = Get("VISION_API_VERSION", "2024-02-01");
        VisionModelVersion = Get("VISION_MODEL_VERSION", "2023-04-15");
        ChatDeployment = Get("CHAT_DEPLOYMENT", "gpt-4o");
        ChatApiVersion = Get("CHAT_API_VERSION", "2024-10-21");
        ChatModelVersion = Get("CHAT_MODEL_VERSION", "2024-11-20");

        ImagesBlobEndpoint = Require("IMAGES_BLOB_ENDPOINT");
        ImagesContainer = Get("IMAGES_CONTAINER", "images");
        SasTtlMinutes = int.TryParse(Get("SAS_TTL_MINUTES", "15"), out var ttl) ? ttl : 15;
    }

    private static string Get(string name, string fallback)
        => Environment.GetEnvironmentVariable(name) is { Length: > 0 } v ? v : fallback;

    private static double GetDouble(string name, double fallback)
    {
        var raw = Get(name, fallback.ToString(CultureInfo.InvariantCulture));
        if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ||
            value is < 0 or > 1)
        {
            throw new InvalidOperationException(
                $"App setting '{name}' must be a number between 0 and 1.");
        }

        return value;
    }

    private static bool GetBool(string name, bool fallback)
    {
        var raw = Get(name, fallback.ToString(CultureInfo.InvariantCulture));
        if (!bool.TryParse(raw, out var value))
        {
            throw new InvalidOperationException(
                $"App setting '{name}' must be 'true' or 'false'.");
        }

        return value;
    }

    private static int GetInt(string name, int fallback, int minimum, int maximum)
    {
        var raw = Get(name, fallback.ToString(CultureInfo.InvariantCulture));
        if (!int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ||
            value < minimum ||
            value > maximum)
        {
            throw new InvalidOperationException(
                $"App setting '{name}' must be an integer between {minimum} and {maximum}.");
        }

        return value;
    }

    private static string Require(string name)
        => Environment.GetEnvironmentVariable(name) is { Length: > 0 } v
            ? v
            : throw new InvalidOperationException($"Required app setting '{name}' is not configured.");
}
