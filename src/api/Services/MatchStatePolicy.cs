namespace VisionSearch.Api.Services;

public static class MatchStatePolicy
{
    public static string Evaluate(double? topVisualScore, double threshold)
        => topVisualScore is not null && topVisualScore >= threshold
            ? QueryContract.Matches
            : QueryContract.NoStrongMatch;
}
