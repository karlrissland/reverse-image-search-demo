using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace VisionSearch.Api.Services;

public static class CelebrityIntentSources
{
    public const string Text = "text";
    public const string Image = "image";
}

public sealed record CelebrityMatch(string Name, string Source, string Filter);

public sealed record CelebrityRecognition(
    string? Name,
    double? Confidence,
    string ModelVersion,
    string? RejectionReason = null);

public sealed record CelebrityIntentResolution(
    CelebrityMatch? Match,
    bool RecognitionAttempted,
    double? RecognitionConfidence,
    string? RecognitionModelVersion,
    string? FallbackReason);

public interface ICelebrityAllowlistProvider
{
    Task<IReadOnlyList<string>> GetAllowedCelebritiesAsync(
        bool publicOnly,
        CancellationToken ct);
}

public interface ICelebrityImageRecognizer
{
    Task<CelebrityRecognition> RecognizeBytesAsync(
        byte[] bytes,
        string mediaType,
        IReadOnlyList<string> allowlist,
        CancellationToken ct);

    Task<CelebrityRecognition> RecognizeUrlAsync(
        string url,
        IReadOnlyList<string> allowlist,
        CancellationToken ct);
}

public sealed class CelebrityIntentService
{
    private readonly ICelebrityAllowlistProvider _allowlistProvider;
    private readonly ICelebrityImageRecognizer _recognizer;

    public CelebrityIntentService(
        ICelebrityAllowlistProvider allowlistProvider,
        ICelebrityImageRecognizer recognizer)
    {
        _allowlistProvider = allowlistProvider;
        _recognizer = recognizer;
    }

    public async Task<CelebrityIntentResolution> ResolveAsync(
        string? textQuery,
        byte[]? imageBytes,
        string? imageUrl,
        string imageMediaType,
        bool internalScope,
        bool imageRecognitionEnabled,
        double minimumConfidence,
        CancellationToken ct)
    {
        var hasImage = imageBytes is not null || imageUrl is not null;
        var needsAllowlist =
            !string.IsNullOrWhiteSpace(textQuery) ||
            (internalScope && imageRecognitionEnabled && hasImage);
        if (!needsAllowlist)
        {
            return new CelebrityIntentResolution(null, false, null, null, null);
        }

        IReadOnlyList<string> allowlist;
        try
        {
            allowlist = await _allowlistProvider.GetAllowedCelebritiesAsync(
                publicOnly: !internalScope,
                ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return new CelebrityIntentResolution(
                null,
                false,
                null,
                null,
                "allowlistUnavailable");
        }

        if (allowlist.Count == 0)
        {
            return new CelebrityIntentResolution(
                null,
                false,
                null,
                null,
                "allowlistEmpty");
        }

        var textMatch = CelebrityNameMatcher.MatchSingle(textQuery, allowlist);
        if (textMatch is not null)
        {
            return new CelebrityIntentResolution(
                CreateMatch(textMatch, CelebrityIntentSources.Text),
                false,
                null,
                null,
                null);
        }

        if (!internalScope || !imageRecognitionEnabled || !hasImage)
        {
            return new CelebrityIntentResolution(null, false, null, null, null);
        }

        CelebrityRecognition recognition;
        try
        {
            recognition = imageBytes is not null
                ? await _recognizer.RecognizeBytesAsync(
                    imageBytes,
                    imageMediaType,
                    allowlist,
                    ct)
                : await _recognizer.RecognizeUrlAsync(imageUrl!, allowlist, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return new CelebrityIntentResolution(
                null,
                true,
                null,
                null,
                "recognitionUnavailable");
        }

        if (recognition.RejectionReason is not null)
        {
            return new CelebrityIntentResolution(
                null,
                true,
                recognition.Confidence,
                recognition.ModelVersion,
                recognition.RejectionReason);
        }

        var canonical = CelebrityNameMatcher.MatchExact(recognition.Name, allowlist);
        if (canonical is null)
        {
            return new CelebrityIntentResolution(
                null,
                true,
                recognition.Confidence,
                recognition.ModelVersion,
                recognition.RejectionReason ?? "notRecognized");
        }

        if (recognition.Confidence is null || recognition.Confidence < minimumConfidence)
        {
            return new CelebrityIntentResolution(
                null,
                true,
                recognition.Confidence,
                recognition.ModelVersion,
                "lowConfidence");
        }

        return new CelebrityIntentResolution(
            CreateMatch(canonical, CelebrityIntentSources.Image),
            true,
            recognition.Confidence,
            recognition.ModelVersion,
            null);
    }

    private static CelebrityMatch CreateMatch(string name, string source)
        => new(
            name,
            source,
            $"celebrity eq '{QueryContract.EscapeOData(name)}'");
}

public static partial class CelebrityNameMatcher
{
    public static string? MatchSingle(
        string? text,
        IReadOnlyList<string> allowlist)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var normalizedText = Normalize(text);
        var matches = allowlist
            .Where(name => ContainsFullName(normalizedText, Normalize(name)))
            .Distinct(StringComparer.Ordinal)
            .Take(2)
            .ToArray();
        return matches.Length == 1 ? matches[0] : null;
    }

    public static string? MatchExact(
        string? candidate,
        IReadOnlyList<string> allowlist)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return null;
        }

        var normalizedCandidate = Normalize(candidate);
        return allowlist.FirstOrDefault(
            allowed => string.Equals(
                Normalize(allowed),
                normalizedCandidate,
                StringComparison.OrdinalIgnoreCase));
    }

    public static IReadOnlyList<string> NormalizeAllowlist(IEnumerable<string?> values)
        => values
            .Select(value => NormalizeDisplayValue(value))
            .Where(value => value is not null)
            .Select(value => value!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
            .ToArray();

    private static bool ContainsFullName(string text, string name)
    {
        if (name.Length == 0)
        {
            return false;
        }

        var searchStart = 0;
        while (searchStart <= text.Length - name.Length)
        {
            var matchStart = text.IndexOf(
                name,
                searchStart,
                StringComparison.Ordinal);
            if (matchStart < 0)
            {
                return false;
            }

            var matchEnd = matchStart + name.Length;
            if (!IsNameContinuationBefore(text, matchStart) &&
                !IsNameContinuationAt(text, matchEnd))
            {
                return true;
            }

            searchStart = matchStart + 1;
        }

        return false;
    }

    private static bool IsNameContinuationBefore(string text, int index)
    {
        if (index == 0)
        {
            return false;
        }

        Rune.DecodeLastFromUtf16(text.AsSpan(0, index), out var rune, out _);
        return IsNameContinuation(rune);
    }

    private static bool IsNameContinuationAt(string text, int index)
    {
        if (index == text.Length)
        {
            return false;
        }

        Rune.DecodeFromUtf16(text.AsSpan(index), out var rune, out _);
        return IsNameContinuation(rune);
    }

    private static bool IsNameContinuation(Rune rune)
        => Rune.GetUnicodeCategory(rune) is
            UnicodeCategory.UppercaseLetter or
            UnicodeCategory.LowercaseLetter or
            UnicodeCategory.TitlecaseLetter or
            UnicodeCategory.ModifierLetter or
            UnicodeCategory.OtherLetter or
            UnicodeCategory.NonSpacingMark or
            UnicodeCategory.SpacingCombiningMark or
            UnicodeCategory.EnclosingMark or
            UnicodeCategory.DecimalDigitNumber or
            UnicodeCategory.LetterNumber or
            UnicodeCategory.OtherNumber;

    private static string Normalize(string value)
        => NormalizeDisplayValue(value)?.ToUpperInvariant() ?? string.Empty;

    private static string? NormalizeDisplayValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var compatibility = value.Normalize(NormalizationForm.FormKC);
        if (compatibility.Any(character =>
                char.GetUnicodeCategory(character) == UnicodeCategory.Control))
        {
            return null;
        }

        var normalized = compatibility
            .Replace('\u2018', '\'')
            .Replace('\u2019', '\'')
            .Replace('\u02BC', '\'');
        normalized = Whitespace().Replace(normalized.Trim(), " ");
        if (normalized.Length is 0 or > 120)
        {
            return null;
        }

        return normalized;
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
