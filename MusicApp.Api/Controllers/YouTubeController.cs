using Microsoft.AspNetCore.Mvc;
using MusicApp.Api.Services;

namespace MusicApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class YouTubeController : ControllerBase
{
    private readonly YouTubeService _youtubeService;

    public YouTubeController(YouTubeService youtubeService)
    {
        _youtubeService = youtubeService;
    }

    [HttpGet("trending")]
    public async Task<IActionResult> GetTrending()
    {
        var trending = await _youtubeService.GetTrendingMusicAsync();
        return Ok(trending);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest("Query parameter 'q' is required");

        var results = await _youtubeService.SearchAsync(q);
        return Ok(results);
    }

    [HttpGet("playlists")]
    public async Task<IActionResult> SearchPlaylists([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest("Query parameter 'q' is required");

        var playlists = await _youtubeService.SearchPlaylistsAsync(q);
        return Ok(playlists);
    }

    [HttpGet("playlist/{playlistId}/items")]
    public async Task<IActionResult> GetPlaylistItems(string playlistId)
    {
        if (string.IsNullOrWhiteSpace(playlistId))
            return BadRequest("Playlist ID is required");

        var items = await _youtubeService.GetPlaylistItemsAsync(playlistId);
        return Ok(items);
    }
}
