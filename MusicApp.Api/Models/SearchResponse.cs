namespace MusicApp.Api.Models;

public class SearchResponse
{
    public List<UnifiedTrack> SpotifyResults { get; set; } = new();
    public List<UnifiedTrack> YouTubeResults { get; set; } = new();
    public string Query { get; set; } = string.Empty;
}
