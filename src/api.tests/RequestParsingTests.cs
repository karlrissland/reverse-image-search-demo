using System.Text;
using Microsoft.AspNetCore.Http;
using VisionSearch.Api.Services;
using Xunit;

namespace VisionSearch.Api.Tests;

public sealed class RequestParsingTests
{
    [Fact]
    public async Task JsonParsesTextWithoutFilters()
    {
        var request = JsonRequest("""
            {"imageUrl":"https://example.test/query.jpg","textQuery":"  rosé   summer  ","top":7}
            """);

        var parsed = await SearchRequestParser.ParseAsync(request, 500, CancellationToken.None);

        Assert.Equal("https://example.test/query.jpg", parsed.ImageUrl);
        Assert.Equal("rosé summer", parsed.TextQuery);
        Assert.Equal(7, parsed.Top);
        Assert.Empty(parsed.Filters);
    }

    [Theory]
    [InlineData("""{"imageUrl":"https://example.test/query.jpg"}""")]
    [InlineData("""{"imageUrl":"https://example.test/query.jpg","textQuery":null}""")]
    [InlineData("""{"imageUrl":"https://example.test/query.jpg","textQuery":""}""")]
    [InlineData("""{"imageUrl":"https://example.test/query.jpg","textQuery":"   "}""")]
    public async Task JsonNormalizesAbsentNullAndEmptyText(string json)
    {
        var request = JsonRequest(json);

        var parsed = await SearchRequestParser.ParseAsync(request, 500, CancellationToken.None);

        Assert.Null(parsed.TextQuery);
    }

    [Fact]
    public async Task MultipartPreservesCropAndText()
    {
        using var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent([1, 2, 3]), "crop", "crop.png");
        content.Add(new StringContent("  navy   polo "), "textQuery");
        content.Add(new StringContent("""{"color":["navy"]}"""), "filters");
        var request = await MultipartRequest(content);

        var parsed = await SearchRequestParser.ParseAsync(request, 500, CancellationToken.None);

        Assert.Equal(new byte[] { 1, 2, 3 }, parsed.ImageBytes);
        Assert.Null(parsed.ImageUrl);
        Assert.Equal("navy polo", parsed.TextQuery);
        Assert.Equal("navy", parsed.Filters["color"][0].GetString());
    }

    [Fact]
    public async Task RawBinarySupportsTextQueryParameter()
    {
        var context = new DefaultHttpContext();
        context.Request.ContentType = "image/png";
        context.Request.Body = new MemoryStream([4, 5, 6]);
        context.Request.QueryString = new QueryString("?top=12&textQuery=%20%20ros%C3%A9%20%20%20linen%20%20");

        var parsed = await SearchRequestParser.ParseAsync(
            context.Request,
            500,
            CancellationToken.None);

        Assert.Equal(new byte[] { 4, 5, 6 }, parsed.ImageBytes);
        Assert.Equal("rosé linen", parsed.TextQuery);
        Assert.Equal(12, parsed.Top);
        Assert.Equal("image/png", parsed.ImageMediaType);
    }

    [Theory]
    [InlineData(true, true, false)]
    [InlineData(true, false, true)]
    [InlineData(false, true, true)]
    public async Task MultipartRejectsConflictingImageSources(
        bool includeCrop,
        bool includeImage,
        bool includeUrl)
    {
        using var content = new MultipartFormDataContent();
        if (includeCrop)
        {
            content.Add(new ByteArrayContent([1]), "crop", "crop.png");
        }
        if (includeImage)
        {
            content.Add(new ByteArrayContent([2]), "image", "image.png");
        }
        if (includeUrl)
        {
            content.Add(new StringContent("https://example.test/query.jpg"), "imageUrl");
        }
        var request = await MultipartRequest(content);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            SearchRequestParser.ParseAsync(request, 500, CancellationToken.None));

        Assert.Equal(SearchRequestParser.ImageSourceError, error.Message);
    }

    [Fact]
    public async Task MultipartAcceptsTextOnlyCelebrityIntent()
    {
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent("navy"), "textQuery");
        var request = await MultipartRequest(content);

        var parsed = await SearchRequestParser.ParseAsync(
            request,
            500,
            CancellationToken.None);

        Assert.Null(parsed.ImageBytes);
        Assert.Null(parsed.ImageUrl);
        Assert.Equal("navy", parsed.TextQuery);
    }

    [Fact]
    public async Task JsonAcceptsTextOnlyCelebrityIntent()
    {
        var request = JsonRequest("""{"textQuery":"navy"}""");

        var parsed = await SearchRequestParser.ParseAsync(
            request,
            500,
            CancellationToken.None);

        Assert.Null(parsed.ImageBytes);
        Assert.Null(parsed.ImageUrl);
        Assert.Equal("navy", parsed.TextQuery);
    }

    [Fact]
    public async Task JsonRejectsMissingImageAndText()
    {
        var request = JsonRequest("""{}""");

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            SearchRequestParser.ParseAsync(request, 500, CancellationToken.None));

        Assert.Equal(SearchRequestParser.QuerySourceError, error.Message);
    }

    [Fact]
    public async Task EmptyRawBinaryRejectsMissingImageSource()
    {
        var context = new DefaultHttpContext();
        context.Request.ContentType = "application/octet-stream";
        context.Request.Body = new MemoryStream();

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            SearchRequestParser.ParseAsync(context.Request, 500, CancellationToken.None));

        Assert.Equal(SearchRequestParser.ImageSourceError, error.Message);
    }

    private static HttpRequest JsonRequest(string json)
    {
        var context = new DefaultHttpContext();
        context.Request.ContentType = "application/json";
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(json));
        return context.Request;
    }

    private static async Task<HttpRequest> MultipartRequest(MultipartFormDataContent content)
    {
        var context = new DefaultHttpContext();
        context.Request.ContentType = content.Headers.ContentType!.ToString();
        var stream = new MemoryStream();
        await content.CopyToAsync(stream);
        stream.Position = 0;
        context.Request.Body = stream;
        return context.Request;
    }
}
