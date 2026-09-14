namespace MusicApp.Api.Models;

public class PlaylistInfo
{
    public string PlaylistId { get; set; } = "";
    public string Title { get; set; } = "";
    public string ChannelTitle { get; set; } = "";
    public string ThumbnailUrl { get; set; } = "";
    public string Description { get; set; } = "";
    public int TrackCount { get; set; } = 0;
}
