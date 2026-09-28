using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;

namespace VisionSearch.Api.Services;

/// <summary>
/// Mints short-lived, read-only user-delegation SAS URLs for result images.
/// Uses the function's managed identity (no account keys). The delegation key is
/// cached and refreshed before expiry.
/// </summary>
public sealed class SasMinter
{
    private readonly BlobServiceClient _blobService;
    private readonly ApiSettings _settings;
    private readonly SemaphoreSlim _keyLock = new(1, 1);
    private UserDelegationKey? _key;
    private DateTimeOffset _keyExpiresOn = DateTimeOffset.MinValue;

    public SasMinter(Azure.Core.TokenCredential credential, ApiSettings settings)
    {
        _settings = settings;
        _blobService = new BlobServiceClient(new Uri(settings.ImagesBlobEndpoint), credential);
    }

    public async Task<string> CreateReadSasAsync(string blobPath, CancellationToken ct)
    {
        // blobPath is the full storage URL captured from the index (metadata_storage_path).
        var blobUri = new Uri(blobPath);
        var accountName = blobUri.Host.Split('.')[0];
        var segments = blobUri.AbsolutePath.TrimStart('/').Split('/', 2);
        var containerName = segments[0];
        var blobName = segments.Length > 1 ? Uri.UnescapeDataString(segments[1]) : string.Empty;

        var now = DateTimeOffset.UtcNow;
        var expiresOn = now.AddMinutes(_settings.SasTtlMinutes);
        var key = await GetDelegationKeyAsync(now, ct);

        var builder = new BlobSasBuilder
        {
            BlobContainerName = containerName,
            BlobName = blobName,
            Resource = "b",
            StartsOn = now.AddMinutes(-5),
            ExpiresOn = expiresOn,
        };
        builder.SetPermissions(BlobSasPermissions.Read);

        var sas = builder.ToSasQueryParameters(key, accountName).ToString();
        return $"{blobUri.GetLeftPart(UriPartial.Path)}?{sas}";
    }

    private async Task<UserDelegationKey> GetDelegationKeyAsync(DateTimeOffset now, CancellationToken ct)
    {
        if (_key is not null && _keyExpiresOn > now.AddMinutes(5))
        {
            return _key;
        }

        await _keyLock.WaitAsync(ct);
        try
        {
            if (_key is null || _keyExpiresOn <= now.AddMinutes(5))
            {
                var keyExpiry = now.AddHours(1);
                _key = await _blobService.GetUserDelegationKeyAsync(now.AddMinutes(-5), keyExpiry, ct);
                _keyExpiresOn = keyExpiry;
            }
        }
        finally
        {
            _keyLock.Release();
        }

        return _key!;
    }
}
