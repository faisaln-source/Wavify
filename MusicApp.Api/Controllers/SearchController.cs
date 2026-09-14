using Microsoft.AspNetCore.Mvc;
using MusicApp.Api.Services;

namespace MusicApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SearchController : ControllerBase
{
    private readonly SpotifyService _spotifyService;
    private readonly YouTubeService _youtubeService;

    public SearchController(SpotifyService spotifyService, YouTubeService youtubeService)
    {
        _spotifyService = spotifyService;
        _youtubeService = youtubeService;
    }

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] string? source = null, [FromHeader(Name = "X-Spotify-Token")] string? spotifyToken = null)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest("Query parameter 'q' is required");

        var spotifyTask = source == "youtube" 
            ? Task.FromResult(new List<Models.UnifiedTrack>()) 
            : _spotifyService.SearchAsync(q, spotifyToken);

        var youtubeTask = source == "spotify" 
            ? Task.FromResult(new List<Models.UnifiedTrack>()) 
            : _youtubeService.SearchAsync(q);

        await Task.WhenAll(spotifyTask, youtubeTask);

        return Ok(new Models.SearchResponse
        {
            Query = q,
            SpotifyResults = spotifyTask.Result,
            YouTubeResults = youtubeTask.Result
        });
    }
}
