namespace MusicApp.Api.Models;

public class SpotifyPlaylistInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string ImageUrl { get; set; } = "";
    public int TrackCount { get; set; }
    public string Owner { get; set; } = "";
}
