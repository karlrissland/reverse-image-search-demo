using Azure.Core;
using Azure.Identity;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using VisionSearch.Api.Services;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

// Managed identity in Azure; developer identity locally. Key auth is disabled tenant-wide,
// so DefaultAzureCredential (AAD) is the only supported path for Search, Vision, and Blob SAS.
builder.Services.AddSingleton<TokenCredential>(_ => new DefaultAzureCredential());
builder.Services.AddSingleton<ApiSettings>();
builder.Services.AddSingleton<TokenProvider>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<VisionEmbeddingService>();
builder.Services.AddSingleton<QueryImageEnrichmentService>();
builder.Services.AddSingleton<SearchQueryService>();
builder.Services.AddSingleton<ICelebrityAllowlistProvider, CelebrityAllowlistProvider>();
builder.Services.AddSingleton<ICelebrityImageRecognizer, CelebrityImageRecognitionService>();
builder.Services.AddSingleton<CelebrityIntentService>();
builder.Services.AddSingleton<IResultReranker, MetadataConsensusReranker>();
builder.Services.AddSingleton<SasMinter>();

builder.Build().Run();
