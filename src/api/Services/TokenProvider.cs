using System.Collections.Concurrent;
using Azure.Core;

namespace VisionSearch.Api.Services;

/// <summary>
/// Acquires and caches AAD bearer tokens per resource scope via DefaultAzureCredential.
/// Tokens are refreshed a couple of minutes before expiry.
/// </summary>
public sealed class TokenProvider
{
    public const string SearchScope = "https://search.azure.com/.default";
    public const string CognitiveServicesScope = "https://cognitiveservices.azure.com/.default";

    private readonly TokenCredential _credential;
    private readonly ConcurrentDictionary<string, AccessToken> _cache = new();

    public TokenProvider(TokenCredential credential) => _credential = credential;

    public async ValueTask<string> GetTokenAsync(string scope, CancellationToken ct)
    {
        if (_cache.TryGetValue(scope, out var cached) && cached.ExpiresOn > DateTimeOffset.UtcNow.AddMinutes(2))
        {
            return cached.Token;
        }

        var token = await _credential.GetTokenAsync(new TokenRequestContext(new[] { scope }), ct);
        _cache[scope] = token;
        return token.Token;
    }
}
