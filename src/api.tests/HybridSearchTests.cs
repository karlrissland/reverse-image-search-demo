using System.Text.Json;
using VisionSearch.Api;
using VisionSearch.Api.Services;
using Xunit;

namespace VisionSearch.Api.Tests;

public sealed class HybridSearchTests
{
    private static readonly float[] Vector = [0.1f, 0.2f];

    [Fact]
    public void DisabledHybridPreservesVectorOnlyPayload()
    {
        var interpretation = HybridQueryPlanner.Build(
            "navy linen",
            null,
            hybridEnabled: false,
            semanticEnabled: true);
        var payload = SearchQueryService.BuildPayload(new SearchQuery(
            Vector,
            10,
            "public eq true",
            QueryContract.PublicSelect,
            QueryContract.Facets,
            interpretation.HybridApplied ? interpretation.EffectiveText : null,
            interpretation.SemanticApplied));

        Assert.False(interpretation.HybridApplied);
        Assert.False(interpretation.SemanticApplied);
        Assert.DoesNotContain("search", payload.Keys);
        Assert.DoesNotContain("searchFields", payload.Keys);
        Assert.DoesNotContain("queryType", payload.Keys);
        Assert.DoesNotContain("semanticConfiguration", payload.Keys);
        Assert.Equal(10, GetVectorK(payload));
        Assert.Equal(10, payload["top"]);
        Assert.Equal(QueryContract.Facets, payload["facets"]);
    }

    [Fact]
    public void TextSignalBuildsHybridSemanticPayload()
    {
        var interpretation = HybridQueryPlanner.Build(
            "  rosé   summer polo  ",
            null,
            hybridEnabled: true,
            semanticEnabled: true);
        var payload = SearchQueryService.BuildPayload(new SearchQuery(
            Vector,
            40,
            null,
            QueryContract.InternalSelect,
            Array.Empty<string>(),
            interpretation.EffectiveText,
            interpretation.SemanticApplied));

        Assert.Equal("rosé summer polo", interpretation.UserText);
        Assert.True(interpretation.HybridApplied);
        Assert.True(interpretation.SemanticApplied);
        Assert.Equal("rosé summer polo", payload["search"]);
        Assert.Equal(string.Join(",", QueryContract.HybridSearchFields), payload["searchFields"]);
        Assert.Equal("semantic", payload["queryType"]);
        Assert.Equal(QueryContract.SemanticConfiguration, payload["semanticConfiguration"]);
        Assert.Equal(40, GetVectorK(payload));
        Assert.Equal(40, payload["top"]);
    }

    [Theory]
    [InlineData(40, false)]
    [InlineData(10, true)]
    [InlineData(3, false)]
    public void EverySearchPayloadUsesExplicitMatchingTop(int top, bool withFacets)
    {
        var payload = SearchQueryService.BuildPayload(new SearchQuery(
            Vector,
            top,
            null,
            withFacets ? new[] { "assetId" } : QueryContract.InternalSelect,
            withFacets ? QueryContract.Facets : Array.Empty<string>(),
            withFacets ? "navy polo" : null));

        Assert.Equal(top, payload["top"]);
        Assert.Equal(top, GetVectorK(payload));
        Assert.Equal(withFacets, payload.ContainsKey("facets"));
    }

    [Fact]
    public void ExpandedCandidateAndFacetQueriesUseTheirIntendedWindows()
    {
        var interpretation = HybridQueryPlanner.Build(
            "navy polo",
            null,
            hybridEnabled: true,
            semanticEnabled: true);
        var queries = SearchFunction.BuildExpandedSearchQueries(
            Vector,
            requestedTop: 10,
            candidateCount: 40,
            "public eq true",
            QueryContract.PublicSelect,
            interpretation);

        var candidatePayload = SearchQueryService.BuildPayload(queries.Candidates);
        var facetPayload = SearchQueryService.BuildPayload(queries.Facets);

        Assert.Equal(40, candidatePayload["top"]);
        Assert.Equal(40, GetVectorK(candidatePayload));
        Assert.DoesNotContain("facets", candidatePayload.Keys);
        Assert.Equal(10, facetPayload["top"]);
        Assert.Equal(10, GetVectorK(facetPayload));
        Assert.Equal(QueryContract.Facets, facetPayload["facets"]);
        Assert.Equal("navy polo", facetPayload["search"]);
        Assert.Equal("semantic", facetPayload["queryType"]);
    }

    [Fact]
    public void VisualScoreQueryUsesCandidateAssetWindow()
    {
        var query = SearchFunction.BuildVisualScoreQuery(
            Vector,
            candidateCount: 2,
            "(assetId eq 'a' or assetId eq 'b')");
        var payload = SearchQueryService.BuildPayload(query);

        Assert.Equal(2, payload["top"]);
        Assert.Equal(2, GetVectorK(payload));
        Assert.Equal("assetId", payload["select"]);
        Assert.Equal("(assetId eq 'a' or assetId eq 'b')", payload["filter"]);
        Assert.DoesNotContain("search", payload.Keys);
    }

    [Fact]
    public void SearchResponseParserPreservesReturnedWindowAndFacets()
    {
        using var json = JsonDocument.Parse("""
            {
              "value": [
                {"assetId":"a","@search.score":0.91},
                {"assetId":"b","@search.score":0.82}
              ],
              "@search.facets": {
                "category": [
                  {"value":"womens","count":7},
                  {"value":"mens","count":3}
                ]
              }
            }
            """);

        var response = SearchQueryService.ParseResponse(json.RootElement);

        Assert.Equal(2, response.Documents.Count);
        Assert.Equal("a", response.Documents[0].GetProperty("assetId").GetString());
        Assert.Equal(2, response.Facets["category"].Count);
        Assert.Equal(new FacetValue("womens", 7), response.Facets["category"][0]);
    }

    [Fact]
    public void VisualScoresBindByAssetIdWithoutChangingHybridOrder()
    {
        var hybrid = ParseDocuments("""
            [
              {"assetId":"b","@search.score":0.032,"@search.rerankerScore":2.5},
              {"assetId":"a","@search.score":0.029}
            ]
            """);
        var visual = ParseDocuments("""
            [
              {"assetId":"a","@search.score":0.94},
              {"assetId":"b","@search.score":0.81}
            ]
            """);

        var binding = SearchFunction.BindVisualScoresWithQualification(hybrid, visual);
        var bound = binding.Documents;

        Assert.Equal("b", bound[0].GetProperty("assetId").GetString());
        Assert.Equal(0.81, bound[0].GetProperty("@search.score").GetDouble());
        Assert.Equal(0.032, bound[0].GetProperty("@search.hybridScore").GetDouble());
        Assert.Equal(2.5, bound[0].GetProperty("@search.semanticRerankerScore").GetDouble());
        Assert.Equal("a", bound[1].GetProperty("assetId").GetString());
        Assert.Equal(0.94, bound[1].GetProperty("@search.score").GetDouble());
        Assert.Equal(0.94, binding.BestVisualScore);
        Assert.Equal("matches", MatchStatePolicy.Evaluate(binding.BestVisualScore, 0.78));
    }

    [Fact]
    public void AllWeakVisualScoresDoNotQualify()
    {
        var hybrid = ParseDocuments("""
            [
              {"assetId":"b","@search.score":0.032},
              {"assetId":"a","@search.score":0.029}
            ]
            """);
        var visual = ParseDocuments("""
            [
              {"assetId":"a","@search.score":0.77},
              {"assetId":"b","@search.score":0.61}
            ]
            """);

        var binding = SearchFunction.BindVisualScoresWithQualification(hybrid, visual);

        Assert.Equal(0.77, binding.BestVisualScore);
        Assert.Equal("noStrongMatch", MatchStatePolicy.Evaluate(binding.BestVisualScore, 0.78));
    }

    [Fact]
    public void MissingVisualScoresStayUnboundAndDoNotPromoteQuery()
    {
        var hybrid = ParseDocuments("""
            [
              {"assetId":"b","@search.score":0.032},
              {"assetId":"a","@search.score":0.029}
            ]
            """);
        var visual = ParseDocuments("""
            [
              {"assetId":"unreturned-candidate","@search.score":0.99},
              {"assetId":"a"}
            ]
            """);

        var binding = SearchFunction.BindVisualScoresWithQualification(hybrid, visual);

        Assert.Null(binding.BestVisualScore);
        Assert.Equal(JsonValueKind.Null, binding.Documents[0].GetProperty("@search.score").ValueKind);
        Assert.Equal(JsonValueKind.Null, binding.Documents[1].GetProperty("@search.score").ValueKind);
        Assert.Equal("noStrongMatch", MatchStatePolicy.Evaluate(binding.BestVisualScore, 0.78));
    }

    [Fact]
    public void VectorOnlyBaselineUsesRawLeadingVisualScore()
    {
        var vectorDocuments = ParseDocuments("""
            [
              {"assetId":"a","@search.score":0.94},
              {"assetId":"b","@search.score":0.81}
            ]
            """);

        var visualScore = SearchFunction.GetVectorOnlyQualificationScore(vectorDocuments);

        Assert.Equal(0.94, visualScore);
        Assert.Equal("matches", MatchStatePolicy.Evaluate(visualScore, 0.78));
    }

    [Fact]
    public void EnrichmentProducesEphemeralTextWithoutChangingCorpusContract()
    {
        var interpretation = HybridQueryPlanner.Build(
            null,
            new QueryEnrichment(
                "A navy linen sport coat.",
                ["navy", "linen", "sport coat"],
                "2024-11-20"),
            hybridEnabled: true,
            semanticEnabled: false);

        Assert.True(interpretation.EnrichmentApplied);
        Assert.True(interpretation.HybridApplied);
        Assert.False(interpretation.SemanticApplied);
        Assert.Contains("A navy linen sport coat.", interpretation.EffectiveText);
        Assert.Equal("2024-11-20", interpretation.EnrichmentModelVersion);
    }

    [Theory]
    [InlineData(null, "noStrongMatch")]
    [InlineData(0.77, "noStrongMatch")]
    [InlineData(0.78, "matches")]
    [InlineData(0.95, "matches")]
    public void MatchStateUsesOnlyRawVisualSimilarity(double? visualScore, string expected)
    {
        Assert.Equal(expected, MatchStatePolicy.Evaluate(visualScore, 0.78));
    }

    [Fact]
    public void PublicContractOmitsAllHybridAndInternalDiagnostics()
    {
        Assert.DoesNotContain("celebrity", QueryContract.PublicSelect);
        Assert.DoesNotContain("metadataVersion", QueryContract.PublicSelect);
        Assert.DoesNotContain("enrichmentModel", QueryContract.PublicSelect);
        Assert.DoesNotContain("hybridScore", QueryContract.PublicSelect);
        Assert.DoesNotContain("semanticRerankerScore", QueryContract.PublicSelect);
        Assert.Contains("enrichmentModel", QueryContract.InternalSelect);
    }

    [Fact]
    public void InternalResponseSerializesQueryInterpretationAsCamelCase()
    {
        var interpretation = HybridQueryPlanner.Build(
            "rosé polo",
            new QueryEnrichment("A rosé polo.", ["rosé", "polo"], "2024-11-20"),
            hybridEnabled: true,
            semanticEnabled: true);
        var payload = SearchFunction.BuildResponsePayload(
            internalScope: true,
            QueryContract.Matches,
            Array.Empty<Dictionary<string, object?>>(),
            new Dictionary<string, object?>(),
            interpretation);

        using var json = JsonDocument.Parse(SearchFunction.SerializeResponsePayload(payload));
        var diagnostic = json.RootElement.GetProperty("queryInterpretation");

        Assert.Equal("rosé polo", diagnostic.GetProperty("userText").GetString());
        Assert.Equal("A rosé polo.", diagnostic.GetProperty("generatedCaption").GetString());
        Assert.Equal(new[] { "rosé", "polo" }, diagnostic.GetProperty("generatedTags")
            .EnumerateArray().Select(value => value.GetString()!).ToArray());
        Assert.True(diagnostic.GetProperty("hybridApplied").GetBoolean());
        Assert.True(diagnostic.GetProperty("semanticApplied").GetBoolean());
        Assert.False(diagnostic.TryGetProperty("UserText", out _));
    }

    [Fact]
    public void PublicResponseOmitsQueryInterpretation()
    {
        var interpretation = HybridQueryPlanner.Build(
            "navy polo",
            null,
            hybridEnabled: true,
            semanticEnabled: false);
        var payload = SearchFunction.BuildResponsePayload(
            internalScope: false,
            QueryContract.Matches,
            Array.Empty<Dictionary<string, object?>>(),
            new Dictionary<string, object?>(),
            interpretation);

        using var json = JsonDocument.Parse(SearchFunction.SerializeResponsePayload(payload));

        Assert.False(json.RootElement.TryGetProperty("queryInterpretation", out _));
        Assert.Equal(QueryContract.Matches, json.RootElement.GetProperty("matchState").GetString());
    }

    [Fact]
    public void TextLengthIsBounded()
    {
        Assert.Throws<InvalidOperationException>(() =>
            HybridQueryPlanner.NormalizeText(new string('x', 501), 500));
    }

    [Theory]
    [InlineData(false, false, false)]
    [InlineData(false, true, false)]
    [InlineData(true, false, false)]
    [InlineData(true, true, true)]
    public void QueryEnrichmentRequiresBothIndependentFlags(
        bool hybridEnabled,
        bool enrichmentEnabled,
        bool expected)
    {
        Assert.Equal(
            expected,
            HybridQueryPlanner.ShouldEnrich(hybridEnabled, enrichmentEnabled));
    }

    private static int GetVectorK(Dictionary<string, object?> payload)
    {
        var json = JsonSerializer.Serialize(payload);
        using var document = JsonDocument.Parse(json);
        return document.RootElement.GetProperty("vectorQueries")[0].GetProperty("k").GetInt32();
    }

    private static JsonElement[] ParseDocuments(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.EnumerateArray().Select(item => item.Clone()).ToArray();
    }
}
