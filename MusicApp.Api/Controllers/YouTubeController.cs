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

    // Spotify editorial chart playlist IDs — all public, accessible via client credentials.
    // These are Spotify's own curated charts: official songs only, zero junk.
    private static readonly Dictionary<string, string> RegionToSpotifyPlaylist = new()
    {
        ["US"] = "37i9dQZEVXbMDoHDwVN2tF",  // Global Top 50
        ["ES"] = "37i9dQZEVXbLRQgLOQjLVm",  // Viva Latino
        ["KR"] = "37i9dQZF1DX9tPFwDMOaN1",  // K-Pop Daebak
        ["IN"] = "37i9dQZF1DX0XUfTFmNBRM",  // Bollywood Arenas
    };

    /// <summary>
    /// Trending music endpoint — 3-tier quality pipeline:
    /// 1. Spotify editorial chart (official, curated, zero junk) → searched on YouTube
    /// 2. AI-based trending fallback if Spotify chart unavailable
    /// 3. YouTube mostPopular chart (last resort, heavily filtered)
    /// </summary>
    [HttpGet("trending")]
    public async Task<IActionResult> GetTrending([FromQuery] string region = "US")
    {
        // Tier 1: Spotify editorial chart → YouTube official audio search
        if (RegionToSpotifyPlaylist.TryGetValue(region.ToUpper(), out var playlistId))
        {
            var spotifyTracks = await _spotifyService.GetPublicPlaylistTracksAsync(playlistId, limit: 20);
            if (spotifyTracks.Count > 0)
            {
                var chartItems = spotifyTracks.Select(t => (t.Title, t.Artist));
                var ytTracks = await _youtubeService.GetChartBasedTrendingAsync(chartItems);
                if (ytTracks.Count > 0) return Ok(ytTracks);
            }
        }

        // Tier 2: AI trending (Groq LLM + velocity ranking)
        var regionAIContext = region.ToUpper() switch
        {
            "ES" => "Latin Spanish trending pop reggaeton",
            "KR" => "K-Pop Korean trending",
            "IN" => "Indian Bollywood Hindi trending",
            _    => "global pop English trending"
        };
        var aiTracks = await _youtubeService.GetAITrendingAsync(regionAIContext);
        if (aiTracks.Count > 0) return Ok(aiTracks);

        // Tier 3: YouTube mostPopular chart with junk filter (last resort)
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
