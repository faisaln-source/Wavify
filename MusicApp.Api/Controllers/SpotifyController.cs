using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using MusicApp.Api.Services;

namespace MusicApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SpotifyController : ControllerBase
{
    private readonly SpotifyService _spotifyService;
    private readonly IMemoryCache _cache;

    public SpotifyController(SpotifyService spotifyService, IMemoryCache cache)
    {
        _spotifyService = spotifyService;
        _cache = cache;
    }

    [HttpGet("auth-url")]
    public IActionResult GetAuthUrl()
    {
        var url = _spotifyService.GetAuthorizationUrl();
        return Ok(new { url });
    }

    [HttpPost("callback")]
    public async Task<IActionResult> Callback([FromQuery] string code)
    {
        if (string.IsNullOrWhiteSpace(code))
            return BadRequest("Code is required");

        var token = await _spotifyService.ExchangeCodeAsync(code);
        if (token == null)
            return BadRequest("Failed to exchange code for token");

        return Ok(new
        {
            accessToken = token.AccessToken,
            refreshToken = token.RefreshToken,
            expiresIn = token.ExpiresIn
        });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromQuery] string refreshToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return BadRequest("Refresh token is required");

        var token = await _spotifyService.RefreshTokenAsync(refreshToken);
        if (token == null)
            return BadRequest("Failed to refresh token");

        return Ok(new
        {
            accessToken = token.AccessToken,
            refreshToken = token.RefreshToken ?? refreshToken,
            expiresIn = token.ExpiresIn
        });
    }

    [HttpGet("new-releases")]
    public async Task<IActionResult> GetNewReleases([FromHeader(Name = "X-Spotify-Token")] string? token = null)
    {
        // Use per-user cache key when a token is provided, shared key for anonymous
        var cacheKey = string.IsNullOrEmpty(token) ? "spotify:new-releases:anon" : $"spotify:new-releases:user";

        if (_cache.TryGetValue(cacheKey, out var cached))
            return Ok(cached);

        var releases = await _spotifyService.GetNewReleasesAsync(token);

        if (releases.Count > 0)
            _cache.Set(cacheKey, releases, TimeSpan.FromMinutes(30));

        return Ok(releases);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q, [FromHeader(Name = "X-Spotify-Token")] string? token = null)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest("Query parameter 'q' is required");

        try
        {
            var results = await _spotifyService.SearchAsync(q, token);
            return Ok(results);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Spotify Controller search EXCEPTION: {ex}");
            return Ok(new List<Models.UnifiedTrack>());
        }
    }

    [HttpGet("playlists")]
    public async Task<IActionResult> GetUserPlaylists([FromHeader(Name = "X-Spotify-Token")] string? token = null)
    {
        if (string.IsNullOrWhiteSpace(token))
            return Unauthorized("Spotify access token required");

        var playlists = await _spotifyService.GetUserPlaylistsAsync(token);
        return Ok(playlists);
    }

    [HttpGet("liked-tracks")]
    public async Task<IActionResult> GetLikedTracks([FromHeader(Name = "X-Spotify-Token")] string? token = null)
    {
        if (string.IsNullOrWhiteSpace(token)) return Unauthorized("Spotify access token required");
        var tracks = await _spotifyService.GetLikedTracksAsync(token);
        return Ok(tracks);
    }

    [HttpGet("playlists/{playlistId}/tracks")]
    public async Task<IActionResult> GetPlaylistTracks(string playlistId, [FromHeader(Name = "X-Spotify-Token")] string? token = null)
    {
        if (string.IsNullOrWhiteSpace(token))
            return Unauthorized("Spotify access token required");

        var tracks = await _spotifyService.GetPlaylistTracksAsync(playlistId, token);
        return Ok(tracks);
    }

    [HttpGet("playlists/{playlistId}/raw")]
    public async Task<IActionResult> GetPlaylistTracksRaw(string playlistId, [FromHeader(Name = "X-Spotify-Token")] string? token = null)
    {
        if (string.IsNullOrWhiteSpace(token)) return Unauthorized("token required");
        using var client = new System.Net.Http.HttpClient();
        var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Get,
            $"https://api.spotify.com/v1/playlists/{playlistId}/tracks?limit=3");
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        var res = await client.SendAsync(req);
        var json = await res.Content.ReadAsStringAsync();
        return Content(json, "application/json");
    }
}
