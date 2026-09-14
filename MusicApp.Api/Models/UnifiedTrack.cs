namespace MusicApp.Api.Models;

public class UnifiedTrack
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Artist { get; set; } = string.Empty;
    public string Album { get; set; } = string.Empty;
    public string ThumbnailUrl { get; set; } = string.Empty;
    public int DurationMs { get; set; }
    public string Source { get; set; } = string.Empty; // "spotify" or "youtube"
    public string SourceUri { get; set; } = string.Empty; // Spotify URI or YouTube Video ID
    public string PreviewUrl { get; set; } = string.Empty;
}
