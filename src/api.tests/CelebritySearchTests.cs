using System.Text.Json;
using VisionSearch.Api;
using VisionSearch.Api.Services;
using Xunit;

namespace VisionSearch.Api.Tests;

public sealed class CelebritySearchTests
{
    private static readonly string[] Allowlist =
    [
        "Ariana Grande",
        "Cate Blanchett",
        "Emma Watson",
        "Lupita Nyong'o",
    ];

    [Fact]
    public void AllowlistNormalizesDistinctNonEmptyIndexFacetValues()
    {
        var values = CelebrityNameMatcher.NormalizeAllowlist(
            [" Ariana Grande ", "", null, "ariana grande", "Lupita Nyong’o"]);

        Assert.Equal(["Ariana Grande", "Lupita Nyong'o"], values);
    }

    [Fact]
    public void AllowlistLoadsFacetValuesAndHandlesAnEmptyIndex()
    {
        var response = new SearchResponse(
            Array.Empty<JsonElement>(),
            new Dictionary<string, IReadOnlyList<FacetValue>>
            {
                ["celebrity"] =
                [
                    new FacetValue("Ariana Grande", 2),
                    new FacetValue("", 1),
                    new FacetValue("Lupita Nyong’o", 1),
                ],
            });

        Assert.Equal(
            ["Ariana Grande", "Lupita Nyong'o"],
            CelebrityAllowlistProvider.ExtractAllowlist(response));
        Assert.Empty(CelebrityAllowlistProvider.ExtractAllowlist(
            new SearchResponse(
                Array.Empty<JsonElement>(),
                new Dictionary<string, IReadOnlyList<FacetValue>>())));
    }

    [Theory]
    [InlineData("show me ARIANA grande outfits", "Ariana Grande")]
    [InlineData("campaign imagery for Lupita Nyong’o", "Lupita Nyong'o")]
    [InlineData("Emma Watson", "Emma Watson")]
    [InlineData("campaign:   Emma   Watson!", "Emma Watson")]
    public void TextIntentMatchesOneFullCanonicalName(string query, string expected)
        => Assert.Equal(expected, CelebrityNameMatcher.MatchSingle(query, Allowlist));

    [Theory]
    [InlineData("Ariana")]
    [InlineData("Grande")]
    [InlineData("Ariana Grandest")]
    [InlineData("unknown person")]
    [InlineData("Ariana Grande and Emma Watson")]
    public void TextIntentRejectsPartialUnknownAndAmbiguousNames(string query)
        => Assert.Null(CelebrityNameMatcher.MatchSingle(query, Allowlist));

    [Theory]
    [InlineData("राम", "राम")]
    [InlineData("अभियान में राम के चित्र", "राम")]
    [InlineData("राम!", "राम")]
    public void NonLatinTextIntentMatchesStandaloneCanonicalName(
        string query,
        string expected)
    {
        var allowlist = new[] { "राम" };

        Assert.Equal(expected, CelebrityNameMatcher.MatchSingle(query, allowlist));
    }

    [Theory]
    [InlineData("रामा")]
    [InlineData("श्री रामा")]
    [InlineData("रामि")]
    [InlineData("रामं")]
    public void NonLatinTextIntentRejectsLongerCombiningMarkContinuations(string query)
    {
        var allowlist = new[] { "राम" };

        Assert.Null(CelebrityNameMatcher.MatchSingle(query, allowlist));
    }

    [Theory]
    [InlineData("Ariana Grandeville")]
    [InlineData("XAriana Grande")]
    [InlineData("Ariana Grande2")]
    public void LatinTextIntentRejectsAdjacentLetterAndNumberContinuations(string query)
        => Assert.Null(CelebrityNameMatcher.MatchSingle(query, Allowlist));

    [Fact]
    public void TextIntentHandlesCanonicalAccentsCaseApostrophesAndPunctuation()
    {
        var allowlist = new[] { "José Álvarez", "Lupita Nyong'o" };
        var decomposed = "show JOSE\u0301 A\u0301LVAREZ campaign";

        Assert.Equal(
            "José Álvarez",
            CelebrityNameMatcher.MatchSingle(decomposed, allowlist));
        Assert.Equal(
            "Lupita Nyong'o",
            CelebrityNameMatcher.MatchSingle(
                "  Lupita   Nyong\u2019o, please  ",
                allowlist));
    }

    [Fact]
    public async Task KnownTextIntentUsesEscapedMetadataFilterWithoutRecognition()
    {
        var recognizer = new StubRecognizer();
        var service = new CelebrityIntentService(
            new StubAllowlistProvider(Allowlist),
            recognizer);

        var result = await service.ResolveAsync(
            "show Lupita Nyong’o campaign assets",
            null,
            null,
            "image/jpeg",
            internalScope: true,
            imageRecognitionEnabled: true,
            minimumConfidence: 0.85,
            CancellationToken.None);

        Assert.Equal("Lupita Nyong'o", result.Match?.Name);
        Assert.Equal(CelebrityIntentSources.Text, result.Match?.Source);
        Assert.Equal("celebrity eq 'Lupita Nyong''o'", result.Match?.Filter);
        Assert.False(result.RecognitionAttempted);
        Assert.Equal(0, recognizer.Calls);
    }

    [Fact]
    public async Task KnownConstrainedImageResponseCreatesMetadataIntent()
    {
        var service = new CelebrityIntentService(
            new StubAllowlistProvider(Allowlist),
            new StubRecognizer(new CelebrityRecognition(
                "Cate Blanchett",
                0.93,
                "2024-11-20")));

        var result = await service.ResolveAsync(
            null,
            [1, 2, 3],
            null,
            "image/jpeg",
            internalScope: true,
            imageRecognitionEnabled: true,
            minimumConfidence: 0.85,
            CancellationToken.None);

        Assert.Equal("Cate Blanchett", result.Match?.Name);
        Assert.Equal(CelebrityIntentSources.Image, result.Match?.Source);
        Assert.True(result.RecognitionAttempted);
        Assert.Equal(0.93, result.RecognitionConfidence);
    }

    [Theory]
    [InlineData(null, 0.1, "notRecognized")]
    [InlineData("Unknown Person", 0.99, "nonAllowlistedOutput")]
    [InlineData("Emma Watson", 0.4, "lowConfidence")]
    public async Task NoneInvalidAndLowConfidenceResponsesFallBack(
        string? name,
        double confidence,
        string expectedReason)
    {
        var rejection = name == "Unknown Person" ? "nonAllowlistedOutput" :
            name is null ? "notRecognized" : null;
        var service = new CelebrityIntentService(
            new StubAllowlistProvider(Allowlist),
            new StubRecognizer(new CelebrityRecognition(
                name,
                confidence,
                "2024-11-20",
                rejection)));

        var result = await service.ResolveAsync(
            null,
            [1],
            null,
            "image/jpeg",
            internalScope: true,
            imageRecognitionEnabled: true,
            minimumConfidence: 0.85,
            CancellationToken.None);

        Assert.Null(result.Match);
        Assert.Equal(expectedReason, result.FallbackReason);
    }

    [Fact]
    public async Task PublicImageRequestsNeverInvokeCelebrityRecognition()
    {
        var recognizer = new StubRecognizer(new CelebrityRecognition(
            "Ariana Grande",
            0.99,
            "2024-11-20"));
        var service = new CelebrityIntentService(
            new StubAllowlistProvider(Allowlist),
            recognizer);

        var result = await service.ResolveAsync(
            null,
            [1],
            null,
            "image/jpeg",
            internalScope: false,
            imageRecognitionEnabled: true,
            minimumConfidence: 0.85,
            CancellationToken.None);

        Assert.Null(result.Match);
        Assert.False(result.RecognitionAttempted);
        Assert.Equal(0, recognizer.Calls);
    }

    [Fact]
    public async Task PublicTextIntentUsesOnlyPublicFacetValues()
    {
        var provider = new StubAllowlistProvider(
            internalValues: Allowlist,
            publicValues: Array.Empty<string>());
        var service = new CelebrityIntentService(provider, new StubRecognizer());

        var result = await service.ResolveAsync(
            "Ariana Grande",
            null,
            null,
            "image/jpeg",
            internalScope: false,
            imageRecognitionEnabled: true,
            minimumConfidence: 0.85,
            CancellationToken.None);

        Assert.Null(result.Match);
        Assert.True(provider.LastPublicOnly);
    }

    [Fact]
    public async Task AllowlistFailureAndRecognitionTimeoutFallBackWithoutGuessing()
    {
        var allowlistFailure = new CelebrityIntentService(
            new StubAllowlistProvider(new TimeoutException()),
            new StubRecognizer());
        var unavailable = await allowlistFailure.ResolveAsync(
            "Ariana Grande",
            [1],
            null,
            "image/jpeg",
            true,
            true,
            0.85,
            CancellationToken.None);
        Assert.Null(unavailable.Match);
        Assert.Equal("allowlistUnavailable", unavailable.FallbackReason);

        var recognitionFailure = new CelebrityIntentService(
            new StubAllowlistProvider(Allowlist),
            new StubRecognizer(new TimeoutException()));
        var timedOut = await recognitionFailure.ResolveAsync(
            null,
            [1],
            null,
            "image/jpeg",
            true,
            true,
            0.85,
            CancellationToken.None);
        Assert.Null(timedOut.Match);
        Assert.Equal("recognitionUnavailable", timedOut.FallbackReason);
    }

    [Fact]
    public void ModelOutputMustBeConfidentAllowlistedAndUnambiguous()
    {
        var known = CelebrityImageRecognitionService.ParseModelContent(
            """{"name":"Ariana Grande","confidence":0.94}""",
            Allowlist,
            "2024-11-20");
        Assert.Equal("Ariana Grande", known.Name);

        var none = CelebrityImageRecognitionService.ParseModelContent(
            """{"name":"none","confidence":0.2}""",
            Allowlist,
            "2024-11-20");
        Assert.Null(none.Name);
        Assert.Equal("notRecognized", none.RejectionReason);

        var unknown = CelebrityImageRecognitionService.ParseModelContent(
            """{"name":"Unlisted Person","confidence":0.99}""",
            Allowlist,
            "2024-11-20");
        Assert.Null(unknown.Name);
        Assert.Equal("nonAllowlistedOutput", unknown.RejectionReason);

        var extraField = CelebrityImageRecognitionService.ParseModelContent(
            """{"name":"Ariana Grande","confidence":0.99,"raw":"leak"}""",
            Allowlist,
            "2024-11-20");
        Assert.Equal("Ariana Grande", extraField.Name);
        Assert.Equal(0.99, extraField.Confidence);

        var wrapped = CelebrityImageRecognitionService.ParseModelContent(
            """{"result":{"name":"Emma Watson","confidence":0.98},"notes":"ignored"}""",
            Allowlist,
            "2024-11-20");
        Assert.Equal("Emma Watson", wrapped.Name);
        Assert.Equal(0.98, wrapped.Confidence);

        var stringConfidence = CelebrityImageRecognitionService.ParseModelContent(
            """{"Name":"Emma Watson","Confidence":"0.97"}""",
            Allowlist,
            "2024-11-20");
        Assert.Equal("Emma Watson", stringConfidence.Name);
        Assert.Equal(0.97, stringConfidence.Confidence);

        var percentConfidence = CelebrityImageRecognitionService.ParseModelContent(
            """{"name":"Emma Watson","confidence":99}""",
            Allowlist,
            "2024-11-20");
        Assert.Equal("Emma Watson", percentConfidence.Name);
        Assert.Equal(0.99, percentConfidence.Confidence);

        var aliases = CelebrityImageRecognitionService.ParseModelContent(
            """{"celebrity":"Emma Watson","score":"97"}""",
            Allowlist,
            "2024-11-20");
        Assert.Equal("Emma Watson", aliases.Name);
        Assert.Equal(0.97, aliases.Confidence);

        var freeForm = CelebrityImageRecognitionService.ParseModelContent(
            "Emma Watson",
            Allowlist,
            "2024-11-20");
        Assert.Equal("Emma Watson", freeForm.Name);
        Assert.Equal(0.9, freeForm.Confidence);

        var freeFormNone = CelebrityImageRecognitionService.ParseModelContent(
            "none",
            Allowlist,
            "2024-11-20");
        Assert.Null(freeFormNone.Name);
        Assert.Equal("notRecognized", freeFormNone.RejectionReason);

        var refusal = CelebrityImageRecognitionService.ParseModelContent(
            "I cannot identify Emma Watson from this image.",
            Allowlist,
            "2024-11-20");
        Assert.Null(refusal.Name);
        Assert.Equal("notRecognized", refusal.RejectionReason);

        var ambiguous = CelebrityImageRecognitionService.ParseModelContent(
            """{"primary":{"name":"Emma Watson","confidence":0.98},"alternate":{"name":"Ariana Grande","confidence":0.91}}""",
            Allowlist,
            "2024-11-20");
        Assert.Null(ambiguous.Name);
        Assert.Equal("invalidModelOutput", ambiguous.RejectionReason);

        var malformed = CelebrityImageRecognitionService.ParseModelContent(
            """{"name":""",
            Allowlist,
            "2024-11-20");
        Assert.Null(malformed.Name);
        Assert.Equal("invalidModelOutput", malformed.RejectionReason);
    }

    [Fact]
    public void PromptContainsOnlyCurrentAllowlistNames()
    {
        var prompt = CelebrityImageRecognitionService.BuildAllowlistPrompt(Allowlist);

        Assert.All(Allowlist, name => Assert.Contains($"- {name}", prompt));
        Assert.DoesNotContain("Unknown Person", prompt);
        Assert.Contains("\"none\"", prompt);
    }

    [Fact]
    public void AllowlistAndMetadataPayloadsAreFacetAndFilterOnly()
    {
        Assert.Equal(
            "celebrity ne null and celebrity ne ''",
            CelebrityAllowlistProvider.BuildFilter(publicOnly: false));
        Assert.Equal(
            "public eq true and celebrity ne null and celebrity ne ''",
            CelebrityAllowlistProvider.BuildFilter(publicOnly: true));

        var allowlistPayload = SearchQueryService.BuildMetadataPayload(
            new MetadataSearchQuery(
                0,
                "celebrity ne null and celebrity ne ''",
                ["assetId"],
                ["celebrity,count:100"]));
        Assert.Equal("*", allowlistPayload["search"]);
        Assert.Equal(0, allowlistPayload["top"]);
        Assert.DoesNotContain("vectorQueries", allowlistPayload.Keys);

        var query = SearchFunction.BuildCelebrityMetadataQuery(
            50,
            "public eq true",
            "celebrity eq 'Lupita Nyong''o'",
            internalScope: false);
        var payload = SearchQueryService.BuildMetadataPayload(query);
        Assert.Equal(
            "(public eq true) and (celebrity eq 'Lupita Nyong''o')",
            payload["filter"]);
        Assert.Equal(50, payload["top"]);
        Assert.DoesNotContain("celebrity", query.Select);
        Assert.DoesNotContain("vectorQueries", payload.Keys);
    }

    [Fact]
    public void InternalDiagnosticsArePresentAndPublicResponseOmitsThem()
    {
        var interpretation = HybridQueryPlanner.Build(
            "Ariana Grande",
            null,
            hybridEnabled: false,
            semanticEnabled: false) with
        {
            CelebrityName = "Ariana Grande",
            CelebrityIntentSource = CelebrityIntentSources.Text,
            CelebrityFilter = "celebrity eq 'Ariana Grande'",
        };

        var internalPayload = SearchFunction.BuildResponsePayload(
            true,
            QueryContract.Matches,
            Array.Empty<Dictionary<string, object?>>(),
            new Dictionary<string, object?>(),
            interpretation);
        using var internalJson = JsonDocument.Parse(
            SearchFunction.SerializeResponsePayload(internalPayload));
        Assert.Equal(
            "Ariana Grande",
            internalJson.RootElement
                .GetProperty("queryInterpretation")
                .GetProperty("celebrityName")
                .GetString());

        var publicPayload = SearchFunction.BuildResponsePayload(
            false,
            QueryContract.Matches,
            Array.Empty<Dictionary<string, object?>>(),
            new Dictionary<string, object?>(),
            interpretation);
        using var publicJson = JsonDocument.Parse(
            SearchFunction.SerializeResponsePayload(publicPayload));
        Assert.False(publicJson.RootElement.TryGetProperty("queryInterpretation", out _));
    }

    private sealed class StubAllowlistProvider : ICelebrityAllowlistProvider
    {
        private readonly IReadOnlyList<string>? _internalValues;
        private readonly IReadOnlyList<string>? _publicValues;
        private readonly Exception? _exception;

        public StubAllowlistProvider(IReadOnlyList<string> values)
        {
            _internalValues = values;
            _publicValues = values;
        }

        public StubAllowlistProvider(
            IReadOnlyList<string> internalValues,
            IReadOnlyList<string> publicValues)
        {
            _internalValues = internalValues;
            _publicValues = publicValues;
        }

        public StubAllowlistProvider(Exception exception)
        {
            _exception = exception;
        }

        public bool LastPublicOnly { get; private set; }

        public Task<IReadOnlyList<string>> GetAllowedCelebritiesAsync(
            bool publicOnly,
            CancellationToken ct)
        {
            LastPublicOnly = publicOnly;
            return _exception is null
                ? Task.FromResult(publicOnly ? _publicValues! : _internalValues!)
                : Task.FromException<IReadOnlyList<string>>(_exception);
        }
    }

    private sealed class StubRecognizer : ICelebrityImageRecognizer
    {
        private readonly CelebrityRecognition _result;
        private readonly Exception? _exception;

        public StubRecognizer(CelebrityRecognition? result = null)
        {
            _result = result ?? new CelebrityRecognition(
                null,
                0,
                "2024-11-20",
                "notRecognized");
        }

        public StubRecognizer(Exception exception)
        {
            _exception = exception;
            _result = new CelebrityRecognition(null, null, "2024-11-20");
        }

        public int Calls { get; private set; }

        public Task<CelebrityRecognition> RecognizeBytesAsync(
            byte[] bytes,
            string mediaType,
            IReadOnlyList<string> allowlist,
            CancellationToken ct)
            => Complete();

        public Task<CelebrityRecognition> RecognizeUrlAsync(
            string url,
            IReadOnlyList<string> allowlist,
            CancellationToken ct)
            => Complete();

        private Task<CelebrityRecognition> Complete()
        {
            Calls++;
            return _exception is null
                ? Task.FromResult(_result)
                : Task.FromException<CelebrityRecognition>(_exception);
        }
    }
}
