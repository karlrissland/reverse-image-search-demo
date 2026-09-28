using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using VisionSearch.Api.Services;

namespace VisionSearch.Api;

/// <summary>
/// POST /api/search           — public surface (forces public eq true, no provenance/scores).
/// POST /api/search/internal  — internal surface (all assets, full provenance and scores).
///
/// POC note: the internal route is separated by path only. In production it would be
/// protected by Entra authentication and/or network isolation so the public site cannot reach it.
/// </summary>
public sealed class SearchFunction
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping, // keep Unicode readable (e.g. rosé)
    };

    private readonly VisionEmbeddingService _embeddings;
    private readonly QueryImageEnrichmentService _queryEnrichment;
    private readonly CelebrityIntentService _celebrityIntent;
    private readonly SearchQueryService _search;
    private readonly IResultReranker _reranker;
    private readonly SasMinter _sas;
    private readonly ApiSettings _settings;
    private readonly ILogger<SearchFunction> _logger;

    public SearchFunction(
        VisionEmbeddingService embeddings,
        QueryImageEnrichmentService queryEnrichment,
        CelebrityIntentService celebrityIntent,
        SearchQueryService search,
        IResultReranker reranker,
        SasMinter sas,
        ApiSettings settings,
        ILogger<SearchFunction> logger)
    {
        _embeddings = embeddings;
        _queryEnrichment = queryEnrichment;
        _celebrityIntent = celebrityIntent;
        _search = search;
        _reranker = reranker;
        _sas = sas;
        _settings = settings;
        _logger = logger;
    }

    [Function("SearchPublic")]
    public Task<IActionResult> SearchPublic(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "search")] HttpRequest req,
        CancellationToken ct)
        => HandleAsync(req, internalScope: false, ct);

    [Function("SearchInternal")]
    public Task<IActionResult> SearchInternal(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "search/internal")] HttpRequest req,
        CancellationToken ct)
        => HandleAsync(req, internalScope: true, ct);

    private async Task<IActionResult> HandleAsync(HttpRequest req, bool internalScope, CancellationToken ct)
    {
        ParsedSearchRequest parsed;
        try
        {
            parsed = await SearchRequestParser.ParseAsync(req, _settings.TextQueryMaxLength, ct);
        }
        catch (Exception ex)
        {
            return Problem(StatusCodes.Status400BadRequest, ex.Message);
        }

        try
        {
            var celebrity = await _celebrityIntent.ResolveAsync(
                parsed.TextQuery,
                parsed.ImageBytes,
                parsed.ImageUrl,
                parsed.ImageMediaType,
                internalScope,
                _settings.CelebrityImageRecognitionEnabled,
                _settings.CelebrityRecognitionMinimumConfidence,
                ct);

            if (celebrity.Match is not null)
            {
                return await SearchCelebrityMetadataAsync(
                    parsed,
                    internalScope,
                    celebrity,
                    ct);
            }

            if (parsed.ImageBytes is null && parsed.ImageUrl is null)
            {
                if (celebrity.FallbackReason == "allowlistUnavailable")
                {
                    return Problem(
                        StatusCodes.Status502BadGateway,
                        "Celebrity metadata is temporarily unavailable.");
                }
                return Problem(
                    StatusCodes.Status400BadRequest,
                    "Text-only search requires one unambiguous full celebrity name from the current index.");
            }

            // 1. Embed the query image with the same Vision model version as ingestion.
            var vector = parsed.ImageBytes is not null
                ? await _embeddings.VectorizeImageBytesAsync(parsed.ImageBytes, ct)
                : await _embeddings.VectorizeImageUrlAsync(parsed.ImageUrl!, ct);

            // Query enrichment is an explicit, keyless, fail-closed feature. It is only
            // invoked when hybrid retrieval is enabled, so disabled hybrid preserves the
            // existing vector-only request path and latency exactly.
            QueryEnrichment? enrichment = null;
            if (HybridQueryPlanner.ShouldEnrich(
                _settings.HybridTextEnabled,
                _settings.QueryImageEnrichmentEnabled))
            {
                enrichment = parsed.ImageBytes is not null
                    ? await _queryEnrichment.EnrichBytesAsync(
                        parsed.ImageBytes,
                        parsed.ImageMediaType,
                        ct)
                    : await _queryEnrichment.EnrichUrlAsync(parsed.ImageUrl!, ct);
            }
            var interpretation = HybridQueryPlanner.Build(
                parsed.TextQuery,
                enrichment,
                _settings.HybridTextEnabled,
                _settings.SemanticRankingEnabled);
            interpretation = AddCelebrityDiagnostics(interpretation, celebrity);

            // 2. Build filter and run either the unchanged vector query or hybrid retrieval.
            var filter = BuildFilter(parsed.Filters, internalScope);
            var select = internalScope ? QueryContract.InternalSelect : QueryContract.PublicSelect;
            var candidateCount = _reranker.GetCandidateCount(parsed.Top);
            var retrieval = await SearchWithStableFacetsAsync(
                vector,
                parsed.Top,
                candidateCount,
                filter,
                select,
                interpretation,
                ct);
            var result = retrieval.Response;
            var matchState = MatchStatePolicy.Evaluate(
                retrieval.TopVisualScore,
                _settings.NoStrongMatchThreshold);
            var hasStrongMatch = matchState == QueryContract.Matches;

            // 3. Rerank only after match qualification. Visual qualification is independent
            // of the hybrid/semantic order preserved for final ranking.
            var rankedDocuments = _reranker.Rerank(result.Documents, parsed.Top);

            // 4. Shape results, minting a short-lived SAS per image.
            var documents = internalScope || hasStrongMatch
                ? rankedDocuments
                : Array.Empty<JsonElement>();
            var items = new List<Dictionary<string, object?>>(documents.Count);
            foreach (var doc in documents)
            {
                items.Add(await ShapeAsync(doc, internalScope, ct));
            }

            var facets = new Dictionary<string, object?>();
            if (internalScope || hasStrongMatch)
            {
                foreach (var (name, values) in result.Facets)
                {
                    facets[name] = values.Select(v => new { value = v.Value, count = v.Count });
                }
            }

            var payload = BuildResponsePayload(
                internalScope,
                matchState,
                items,
                facets,
                interpretation);
            return Json(StatusCodes.Status200OK, payload);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Search request failed.");
            return Problem(StatusCodes.Status502BadGateway, "Search request failed.");
        }
    }

    private async Task<IActionResult> SearchCelebrityMetadataAsync(
        ParsedSearchRequest parsed,
        bool internalScope,
        CelebrityIntentResolution celebrity,
        CancellationToken ct)
    {
        var filter = BuildFilter(parsed.Filters, internalScope);
        var query = BuildCelebrityMetadataQuery(
            parsed.Top,
            filter,
            celebrity.Match!.Filter,
            internalScope);
        var result = await _search.SearchMetadataAsync(query, ct);
        var items = new List<Dictionary<string, object?>>(result.Documents.Count);
        foreach (var document in result.Documents)
        {
            items.Add(await ShapeAsync(document, internalScope, ct));
        }

        var facets = new Dictionary<string, object?>();
        foreach (var (name, values) in result.Facets)
        {
            facets[name] = values.Select(value => new { value = value.Value, count = value.Count });
        }

        var interpretation = AddCelebrityDiagnostics(
            HybridQueryPlanner.Build(
                parsed.TextQuery,
                null,
                hybridEnabled: false,
                semanticEnabled: false),
            celebrity);
        var matchState = result.Documents.Count > 0
            ? QueryContract.Matches
            : QueryContract.NoStrongMatch;
        return Json(
            StatusCodes.Status200OK,
            BuildResponsePayload(
                internalScope,
                matchState,
                items,
                facets,
                interpretation));
    }

    private async Task<RetrievalResult> SearchWithStableFacetsAsync(
        float[] vector,
        int requestedTop,
        int candidateCount,
        string? filter,
        IReadOnlyList<string> select,
        QueryInterpretation interpretation,
        CancellationToken ct)
    {
        if (interpretation.HybridApplied)
        {
            return await SearchHybridWithStableFacetsAsync(
                vector,
                requestedTop,
                candidateCount,
                filter,
                select,
                interpretation,
                ct);
        }

        if (candidateCount == requestedTop)
        {
            var response = await _search.SearchAsync(
                new SearchQuery(vector, requestedTop, filter, select, QueryContract.Facets),
                ct);
            return new RetrievalResult(response, GetVectorOnlyQualificationScore(response.Documents));
        }

        var queries = BuildExpandedSearchQueries(
            vector,
            requestedTop,
            candidateCount,
            filter,
            select,
            interpretation: null);
        var candidatesTask = _search.SearchAsync(queries.Candidates, ct);
        var facetsTask = _search.SearchAsync(queries.Facets, ct);

        await Task.WhenAll(candidatesTask, facetsTask);
        var candidates = await candidatesTask;
        var facetResult = await facetsTask;
        return new RetrievalResult(
            new SearchResponse(candidates.Documents, facetResult.Facets),
            GetVectorOnlyQualificationScore(candidates.Documents));
    }

    private async Task<RetrievalResult> SearchHybridWithStableFacetsAsync(
        float[] vector,
        int requestedTop,
        int candidateCount,
        string? filter,
        IReadOnlyList<string> select,
        QueryInterpretation interpretation,
        CancellationToken ct)
    {
        var queries = BuildExpandedSearchQueries(
            vector,
            requestedTop,
            candidateCount,
            filter,
            select,
            interpretation);
        var candidatesTask = _search.SearchAsync(queries.Candidates, ct);
        var facetsTask = _search.SearchAsync(queries.Facets, ct);
        await Task.WhenAll(candidatesTask, facetsTask);
        var candidates = await candidatesTask;
        var facets = await facetsTask;
        var binding = await BindVisualScoresAsync(vector, filter, candidates.Documents, ct);
        return new RetrievalResult(
            new SearchResponse(binding.Documents, facets.Facets),
            binding.BestVisualScore);
    }

    private async Task<VisualScoreBinding> BindVisualScoresAsync(
        float[] vector,
        string? filter,
        IReadOnlyList<JsonElement> hybridDocuments,
        CancellationToken ct)
    {
        var assetIds = hybridDocuments
            .Select(document => GetString(document, "assetId"))
            .Where(assetId => !string.IsNullOrWhiteSpace(assetId))
            .Select(assetId => assetId!)
            .ToArray();
        if (assetIds.Length == 0)
        {
            return new VisualScoreBinding(hybridDocuments, null);
        }

        var assetFilter = $"({string.Join(" or ", assetIds.Select(
            assetId => $"assetId eq '{QueryContract.EscapeOData(assetId)}'"))})";
        var visualFilter = string.IsNullOrWhiteSpace(filter)
            ? assetFilter
            : $"({filter}) and {assetFilter}";
        var visual = await _search.SearchAsync(
            BuildVisualScoreQuery(vector, assetIds.Length, visualFilter),
            ct);
        return BindVisualScoresWithQualification(hybridDocuments, visual.Documents);
    }

    public static ExpandedSearchQueries BuildExpandedSearchQueries(
        float[] vector,
        int requestedTop,
        int candidateCount,
        string? filter,
        IReadOnlyList<string> select,
        QueryInterpretation? interpretation)
    {
        var text = interpretation?.HybridApplied == true
            ? interpretation.EffectiveText
            : null;
        var semantic = interpretation?.SemanticApplied == true;
        return new ExpandedSearchQueries(
            new SearchQuery(
                vector,
                candidateCount,
                filter,
                select,
                Array.Empty<string>(),
                text,
                semantic),
            new SearchQuery(
                vector,
                requestedTop,
                filter,
                new[] { "assetId" },
                QueryContract.Facets,
                text,
                semantic));
    }

    public static SearchQuery BuildVisualScoreQuery(float[] vector, int candidateCount, string filter)
        => new(
            vector,
            candidateCount,
            filter,
            new[] { "assetId" },
            Array.Empty<string>());

    public static MetadataSearchQuery BuildCelebrityMetadataQuery(
        int top,
        string? existingFilter,
        string celebrityFilter,
        bool internalScope)
    {
        var filter = string.IsNullOrWhiteSpace(existingFilter)
            ? celebrityFilter
            : $"({existingFilter}) and ({celebrityFilter})";
        return new MetadataSearchQuery(
            Math.Clamp(top, 1, 50),
            filter,
            internalScope ? QueryContract.InternalSelect : QueryContract.PublicSelect,
            QueryContract.Facets);
    }

    public static IReadOnlyList<JsonElement> BindVisualScores(
        IReadOnlyList<JsonElement> hybridDocuments,
        IReadOnlyList<JsonElement> visualDocuments)
        => BindVisualScoresWithQualification(hybridDocuments, visualDocuments).Documents;

    public static VisualScoreBinding BindVisualScoresWithQualification(
        IReadOnlyList<JsonElement> hybridDocuments,
        IReadOnlyList<JsonElement> visualDocuments)
    {
        var scores = visualDocuments
            .Select(document => (AssetId: GetString(document, "assetId"), Score: GetScore(document)))
            .Where(item => item.AssetId is not null && item.Score is not null)
            .GroupBy(item => item.AssetId!, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.Max(item => item.Score!.Value),
                StringComparer.Ordinal);

        var documents = hybridDocuments
            .Select((document, index) => AddHybridDiagnostics(document, scores, index))
            .ToArray();
        var boundScores = hybridDocuments
            .Select(document => GetString(document, "assetId"))
            .Where(assetId => assetId is not null && scores.ContainsKey(assetId))
            .Select(assetId => scores[assetId!])
            .ToArray();
        return new VisualScoreBinding(
            documents,
            boundScores.Length == 0 ? null : boundScores.Max());
    }

    public static double? GetVectorOnlyQualificationScore(
        IReadOnlyList<JsonElement> vectorDocuments)
        => GetScore(vectorDocuments.FirstOrDefault());

    public static object BuildResponsePayload(
        bool internalScope,
        string matchState,
        IReadOnlyList<Dictionary<string, object?>> results,
        IReadOnlyDictionary<string, object?> facets,
        QueryInterpretation interpretation)
    {
        if (!internalScope)
        {
            return new Dictionary<string, object?>
            {
                ["matchState"] = matchState,
                ["results"] = results,
                ["facets"] = facets,
            };
        }

        return new Dictionary<string, object?>
        {
            ["matchState"] = matchState,
            ["results"] = results,
            ["facets"] = facets,
            ["queryInterpretation"] = new Dictionary<string, object?>
            {
                ["userText"] = interpretation.UserText,
                ["generatedCaption"] = interpretation.GeneratedCaption,
                ["generatedTags"] = interpretation.GeneratedTags,
                ["effectiveText"] = interpretation.EffectiveText,
                ["hybridApplied"] = interpretation.HybridApplied,
                ["semanticApplied"] = interpretation.SemanticApplied,
                ["enrichmentApplied"] = interpretation.EnrichmentApplied,
                ["enrichmentModelVersion"] = interpretation.EnrichmentModelVersion,
                ["celebrityName"] = interpretation.CelebrityName,
                ["celebrityIntentSource"] = interpretation.CelebrityIntentSource,
                ["celebrityFilter"] = interpretation.CelebrityFilter,
                ["celebrityRecognitionAttempted"] = interpretation.CelebrityRecognitionAttempted,
                ["celebrityRecognitionConfidence"] = interpretation.CelebrityRecognitionConfidence,
                ["celebrityRecognitionModelVersion"] = interpretation.CelebrityRecognitionModelVersion,
                ["celebrityFallbackReason"] = interpretation.CelebrityFallbackReason,
            },
        };
    }

    private static QueryInterpretation AddCelebrityDiagnostics(
        QueryInterpretation interpretation,
        CelebrityIntentResolution celebrity)
        => interpretation with
        {
            CelebrityName = celebrity.Match?.Name,
            CelebrityIntentSource = celebrity.Match?.Source,
            CelebrityFilter = celebrity.Match?.Filter,
            CelebrityRecognitionAttempted = celebrity.RecognitionAttempted,
            CelebrityRecognitionConfidence = celebrity.RecognitionConfidence,
            CelebrityRecognitionModelVersion = celebrity.RecognitionModelVersion,
            CelebrityFallbackReason = celebrity.FallbackReason,
        };

    public static string SerializeResponsePayload(object payload)
        => JsonSerializer.Serialize(payload, JsonOptions);

    private static JsonElement AddHybridDiagnostics(
        JsonElement document,
        IReadOnlyDictionary<string, double> visualScores,
        int rank)
    {
        var node = JsonNode.Parse(document.GetRawText())!.AsObject();
        var hybridScore = GetScore(document);
        var rerankerScore = document.TryGetProperty("@search.rerankerScore", out var reranker) &&
            reranker.ValueKind == JsonValueKind.Number
                ? reranker.GetDouble()
                : (double?)null;
        var assetId = GetString(document, "assetId");
        node["@search.hybridScore"] = hybridScore;
        node["@search.semanticRerankerScore"] = rerankerScore;
        node["@search.rankingScore"] = 1d - (rank * 0.01d);
        node["@search.score"] = assetId is not null && visualScores.TryGetValue(assetId, out var visualScore)
            ? visualScore
            : null;
        return JsonSerializer.SerializeToElement(node, JsonOptions);
    }

    private async Task<Dictionary<string, object?>> ShapeAsync(JsonElement doc, bool internalScope, CancellationToken ct)
    {
        var blobPath = GetString(doc, "blobPath");
        var imageUrl = string.IsNullOrEmpty(blobPath) ? null : await _sas.CreateReadSasAsync(blobPath, ct);

        var item = new Dictionary<string, object?>
        {
            ["assetId"] = GetString(doc, "assetId"),
            ["imageUrl"] = imageUrl,
            ["caption"] = GetString(doc, "caption"),
            ["tags"] = GetStringArray(doc, "tags"),
            ["category"] = GetString(doc, "category"),
            ["subcategory"] = GetString(doc, "subcategory"),
            ["collection"] = GetString(doc, "collection"),
            ["color"] = GetString(doc, "color"),
            ["season"] = GetString(doc, "season"),
        };

        if (internalScope)
        {
            var score = GetScore(doc);
            item["score"] = score;
            item["confidence"] = score is null ? null : Math.Round(score.Value * 100, 1);
            item["celebrity"] = GetString(doc, "celebrity");
            item["celebritySource"] = GetString(doc, "celebritySource");
            item["public"] = doc.TryGetProperty("public", out var p) && p.ValueKind is JsonValueKind.True or JsonValueKind.False
                ? p.GetBoolean()
                : (bool?)null;
            item["blobPath"] = blobPath;
            item["metadataVersion"] = GetString(doc, "metadataVersion");
            item["embeddingModelVersion"] = GetString(doc, "embeddingModelVersion");
            item["enrichmentModel"] = GetString(doc, "enrichmentModel");
            item["indexedAt"] = GetString(doc, "indexedAt");
            item["hybridScore"] = GetNumber(doc, "@search.hybridScore");
            item["semanticRerankerScore"] = GetNumber(doc, "@search.semanticRerankerScore");
        }

        return item;
    }

    private static string? BuildFilter(Dictionary<string, JsonElement> filters, bool internalScope)
    {
        var clauses = new List<string>();

        // The public surface always constrains to public assets.
        if (!internalScope)
        {
            clauses.Add("public eq true");
        }

        foreach (var (field, value) in filters)
        {
            // Public surface silently ignores a celebrity filter.
            if (!QueryContract.IsFilterAllowed(field, internalScope))
            {
                continue;
            }

            var values = ExtractValues(value);
            if (values.Count == 0)
            {
                continue;
            }

            var isCollection = QueryContract.IsCollectionField(field);
            var terms = values.Select(v =>
            {
                var literal = QueryContract.EscapeOData(v);
                return isCollection
                    ? $"{field}/any(t: t eq '{literal}')"
                    : $"{field} eq '{literal}'";
            });

            clauses.Add($"({string.Join(" or ", terms)})");
        }

        return clauses.Count == 0 ? null : string.Join(" and ", clauses);
    }

    private static List<string> ExtractValues(JsonElement value)
    {
        var result = new List<string>();
        if (value.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in value.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String && item.GetString() is { Length: > 0 } s)
                {
                    result.Add(s);
                }
            }
        }
        else if (value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } single)
        {
            result.Add(single);
        }

        return result;
    }

    private static string? GetString(JsonElement doc, string name)
        => doc.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static double? GetScore(JsonElement doc)
        => GetNumber(doc, "@search.score");

    private static double? GetNumber(JsonElement doc, string name)
        => doc.ValueKind == JsonValueKind.Object &&
           doc.TryGetProperty(name, out var score) &&
           score.ValueKind == JsonValueKind.Number
            ? score.GetDouble()
            : null;

    private static string[] GetStringArray(JsonElement doc, string name)
    {
        if (!doc.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return v.EnumerateArray()
            .Where(e => e.ValueKind == JsonValueKind.String)
            .Select(e => e.GetString()!)
            .ToArray();
    }

    private static IActionResult Json(int statusCode, object payload)
        => new ContentResult
        {
            StatusCode = statusCode,
            ContentType = "application/json; charset=utf-8",
            Content = SerializeResponsePayload(payload),
        };

    private static IActionResult Problem(int statusCode, string message)
        => new ContentResult
        {
            StatusCode = statusCode,
            ContentType = "application/json; charset=utf-8",
            Content = JsonSerializer.Serialize(new { error = message }, JsonOptions),
        };

    private sealed record RetrievalResult(SearchResponse Response, double? TopVisualScore);
}

public sealed record ExpandedSearchQueries(SearchQuery Candidates, SearchQuery Facets);

public sealed record VisualScoreBinding(
    IReadOnlyList<JsonElement> Documents,
    double? BestVisualScore);
