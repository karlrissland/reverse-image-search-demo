using System.Text.Json;

namespace VisionSearch.Api.Services;

public interface IResultReranker
{
    int GetCandidateCount(int requestedTop);

    IReadOnlyList<JsonElement> Rerank(
        IReadOnlyList<JsonElement> candidates,
        int requestedTop);
}
