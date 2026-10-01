using Microsoft.AspNetCore.Mvc;
using MusicApp.Api.Services;

namespace MusicApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class YouTubeController : ControllerBase
{
    private readonly YouTubeService _youtubeService;
    private readonly SpotifyService _spotifyService;

    public YouTubeController(YouTubeService youtubeService, SpotifyService spotifyService)
    {
        _youtubeService = youtubeService;
        _spotifyService = spotifyService;
    }

    [HttpGet("trending")]
    public async Task<IActionResult> GetTrending([FromQuery] string region = "US")
    {
        var trending = await _youtubeService.GetTrendingMusicAsync(region);
        return Ok(trending);
    }

    /// <summary>
    /// Universal AI trending — context can be any music context string:
    /// "Global pop", "Latin", "K-Pop", "Malayalam music", "songs similar to X by Y", etc.
    /// When a Spotify token is provided, real short-term top tracks are fetched and used
    /// as grounding context for the LLM, reducing hallucination and personalizing results.
    /// </summary>
    [HttpGet("ai-trending")]
    public async Task<IActionResult> GetAITrending(
        [FromQuery] string context,
        [FromQuery] string fallback = "",
        [FromHeader(Name = "X-Spotify-Token")] string? spotifyToken = null)
    {
        if (string.IsNullOrWhiteSpace(context))
            return BadRequest("Query parameter 'context' is required");

        // Fetch real-time Spotify chart data to ground the LLM in the user's listening habits
        IEnumerable<string>? chartHints = null;
        if (!string.IsNullOrEmpty(spotifyToken))
        {
            var topTracks = await _spotifyService.GetTopTracksAsync(spotifyToken, "short_term");
            if (topTracks.Count > 0)
                chartHints = topTracks.Take(5).Select(t => $"{t.Title} by {t.Artist}");
        }

        var results = await _youtubeService.GetAITrendingAsync(context, fallback, chartHints);
        return Ok(results);
    }

    /// <summary>
    /// Convenience endpoint for language-specific trending (delegates to ai-trending).
    /// </summary>
    [HttpGet("ai-trending-language")]
    public async Task<IActionResult> GetAITrendingLanguage([FromQuery] string language)
    {
        if (string.IsNullOrWhiteSpace(language))
            return BadRequest("Query parameter 'language' is required");

        var results = await _youtubeService.GetAITrendingLanguageAsync(language);
        return Ok(results);
    }

    /// <summary>
    /// Returns recent music sorted by view count.
    /// months = how far back to look (default 18, so always slides with today's date).
    /// </summary>
    [HttpGet("trending-language")]
    public async Task<IActionResult> GetTrendingLanguage([FromQuery] string q, [FromQuery] int months = 3)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest("Query parameter 'q' is required");

        months = Math.Clamp(months, 1, 60); // safety clamp
        var results = await _youtubeService.SearchTrendingLanguageAsync(q, months);
        return Ok(results);
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
