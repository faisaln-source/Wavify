using Microsoft.AspNetCore.Mvc;
using MusicApp.Api.Services;

namespace MusicApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly SpotifyService _spotifyService;

    public AuthController(SpotifyService spotifyService)
    {
        _spotifyService = spotifyService;
    }

    [HttpGet("spotify/login")]
    public IActionResult SpotifyLogin()
    {
        var redirectUri = GetDynamicRedirectUri();
        var url = _spotifyService.GetAuthorizationUrl(redirectUri);
        return Ok(new { url });
    }

    [HttpGet("spotify/callback")]
    public async Task<IActionResult> SpotifyCallback([FromQuery] string code, [FromQuery] string? state)
    {
        if (string.IsNullOrEmpty(code))
            return BadRequest("Authorization code is required");

        var redirectUri = GetDynamicRedirectUri();
        var token = await _spotifyService.ExchangeCodeAsync(code, redirectUri);
        if (token == null)
            return BadRequest("Failed to exchange code for token");

        // In production: store tokens server-side in a session or database
        // For now, return to the frontend with token info
        return Ok(token);
    }

    /// <summary>
    /// Derives the Spotify redirect URI from the current request's Origin or Referer header.
    /// Falls back to the configured value so it works on localhost and any tunnel URL.
    /// </summary>
    private string? GetDynamicRedirectUri()
    {
        // Try Origin header first (set by browsers on XHR/fetch)
        var origin = Request.Headers["Origin"].FirstOrDefault();
        if (!string.IsNullOrEmpty(origin))
            return $"{origin}/auth/callback";

        // Try Referer header as fallback
        var referer = Request.Headers["Referer"].FirstOrDefault();
        if (!string.IsNullOrEmpty(referer) && Uri.TryCreate(referer, UriKind.Absolute, out var refUri))
            return $"{refUri.Scheme}://{refUri.Host}{(refUri.IsDefaultPort ? "" : $":{refUri.Port}")}/auth/callback";

        // Fall back to configured value
        return null;
    }

    [HttpPost("spotify/refresh")]
    public async Task<IActionResult> RefreshSpotifyToken([FromBody] RefreshRequest request)
    {
        if (string.IsNullOrEmpty(request.RefreshToken))
            return BadRequest("Refresh token is required");

        var token = await _spotifyService.RefreshTokenAsync(request.RefreshToken);
        if (token == null)
            return BadRequest("Failed to refresh token");

        return Ok(token);
    }
}

public class RefreshRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}
