using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MusicApp.Api.Models;

namespace MusicApp.Api.Services;

public class SpotifyService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private static string? _clientCredentialToken;
    private static DateTime _tokenExpiry = DateTime.MinValue;
    private const string SpotifyApiBase = "https://api.spotify.com/v1/";

    public SpotifyService(IHttpClientFactory httpClientFactory, IConfiguration config)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
    }

    public string GetAuthorizationUrl(string? redirectUriOverride = null)
    {
        var clientId = _config["Spotify:ClientId"];
        var redirectUri = redirectUriOverride ?? _config["Spotify:RedirectUri"];
        var scopes = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-library-read user-library-modify playlist-read-private playlist-modify-public playlist-modify-private user-top-read user-read-recently-played";

        return $"https://accounts.spotify.com/authorize?client_id={clientId}&response_type=code&redirect_uri={Uri.EscapeDataString(redirectUri!)}&scope={Uri.EscapeDataString(scopes)}&show_dialog=true";
    }

    public async Task<SpotifyTokenResponse?> ExchangeCodeAsync(string code, string? redirectUriOverride = null)
    {
        var clientId = _config["Spotify:ClientId"];
        var clientSecret = _config["Spotify:ClientSecret"];
        var redirectUri = redirectUriOverride ?? _config["Spotify:RedirectUri"];

        using var client = new HttpClient();
        var request = new HttpRequestMessage(HttpMethod.Post, "https://accounts.spotify.com/api/token");

        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);

        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirectUri!
        });

        var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode) return null;

        var json = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<SpotifyTokenResponse>(json);
    }

    public async Task<SpotifyTokenResponse?> RefreshTokenAsync(string refreshToken)
    {
        var clientId = _config["Spotify:ClientId"];
        var clientSecret = _config["Spotify:ClientSecret"];

        using var client = new HttpClient();
        var request = new HttpRequestMessage(HttpMethod.Post, "https://accounts.spotify.com/api/token");

        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);

        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken
        });

        var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode) return null;

        var json = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<SpotifyTokenResponse>(json);
    }

    private async Task EnsureClientCredentialTokenAsync()
    {
        if (_clientCredentialToken != null && DateTime.UtcNow < _tokenExpiry)
            return;

        var clientId = _config["Spotify:ClientId"];
        var clientSecret = _config["Spotify:ClientSecret"];

        using var client = new HttpClient();
        var request = new HttpRequestMessage(HttpMethod.Post, "https://accounts.spotify.com/api/token");

        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);

        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials"
        });

        var response = await client.SendAsync(request);
        if (response.IsSuccessStatusCode)
        {
            var json = await response.Content.ReadAsStringAsync();
            var token = JsonSerializer.Deserialize<SpotifyTokenResponse>(json);
            if (token != null)
            {
                _clientCredentialToken = token.AccessToken;
                _tokenExpiry = DateTime.UtcNow.AddSeconds(token.ExpiresIn - 60);
            }
        }
        else
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            Console.WriteLine($"Spotify Token Error: {response.StatusCode} - {errorBody}");
        }
    }

    public async Task<List<UnifiedTrack>> SearchAsync(string query, string? accessToken = null)
    {
        // Only fetch client credential token if no user token is provided
        string? token;
        if (!string.IsNullOrEmpty(accessToken))
        {
            token = accessToken;
            Console.WriteLine($"[Spotify Search] Using USER token: {token[..Math.Min(10, token.Length)]}...");
        }
        else
        {
            await EnsureClientCredentialTokenAsync();
            token = _clientCredentialToken;
            Console.WriteLine($"[Spotify Search] Using CLIENT CREDENTIALS token: {(string.IsNullOrEmpty(token) ? "NULL/EMPTY" : token[..Math.Min(10, token.Length)] + "...")}");
        }

        if (string.IsNullOrWhiteSpace(token))
            return new List<UnifiedTrack>();

        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"{SpotifyApiBase}search?q={Uri.EscapeDataString(query)}&type=track&limit=10");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var client = _httpClientFactory.CreateClient();
        var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            Console.WriteLine($"Spotify Search Error: {response.StatusCode} - {errorBody}");

            // If token expired, clear the cache so next call fetches a fresh one
            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                _clientCredentialToken = null;
                _tokenExpiry = DateTime.MinValue;

                // Retry once with a fresh token (only if we were using client credentials)
                if (string.IsNullOrEmpty(accessToken))
                {
                    await EnsureClientCredentialTokenAsync();
                    token = _clientCredentialToken;
                    if (!string.IsNullOrEmpty(token))
                    {
                        using var retryRequest = new HttpRequestMessage(HttpMethod.Get,
                            $"{SpotifyApiBase}search?q={Uri.EscapeDataString(query)}&type=track&limit=10");
                        retryRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                        using var retryClient = _httpClientFactory.CreateClient();
                        var retryResponse = await retryClient.SendAsync(retryRequest);
                        if (retryResponse.IsSuccessStatusCode)
                        {
                            var retryJson = await retryResponse.Content.ReadAsStringAsync();
                            return ParseTrackSearchResults(retryJson);
                        }
                    }
                }
            }
            return new List<UnifiedTrack>();
        }

        var json = await response.Content.ReadAsStringAsync();
        return ParseTrackSearchResults(json);
    }

    private List<UnifiedTrack> ParseTrackSearchResults(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var tracks = new List<UnifiedTrack>();
        var items = doc.RootElement.GetProperty("tracks").GetProperty("items");

        foreach (var item in items.EnumerateArray())
        {
            var artists = item.GetProperty("artists");
            var artistName = artists.GetArrayLength() > 0
                ? artists[0].GetProperty("name").GetString() ?? ""
                : "";

            var albumImages = item.GetProperty("album").GetProperty("images");
            var thumbnail = albumImages.GetArrayLength() > 0
                ? albumImages[0].GetProperty("url").GetString() ?? ""
                : "";

            tracks.Add(new UnifiedTrack
            {
                Id = item.GetProperty("id").GetString() ?? "",
                Title = item.GetProperty("name").GetString() ?? "",
                Artist = artistName,
                Album = item.GetProperty("album").GetProperty("name").GetString() ?? "",
                ThumbnailUrl = thumbnail,
                DurationMs = item.GetProperty("duration_ms").GetInt32(),
                Source = "spotify",
                SourceUri = item.GetProperty("uri").GetString() ?? "",
                PreviewUrl = item.TryGetProperty("preview_url", out var preview) && preview.ValueKind != JsonValueKind.Null
                    ? preview.GetString() ?? ""
                    : ""
            });
        }

        return tracks;
    }

    public async Task<List<UnifiedTrack>> GetNewReleasesAsync(string? accessToken = null)
    {
        // Spotify Development Mode blocks search and top-tracks (without user-top-read scope).
        // Fall back to liked tracks — user-library-read is already in the existing token scope.
        if (string.IsNullOrWhiteSpace(accessToken))
            return new List<UnifiedTrack>();

        // Try top tracks first (requires user-top-read scope — available after re-login)
        var topTracks = await GetTopTracksAsync(accessToken);
        if (topTracks.Count > 0) return topTracks;

        // Fallback: liked tracks (user-library-read scope — always available)
        var liked = await GetLikedTracksAsync(accessToken);
        return liked.Take(20).ToList();
    }

    public async Task<List<UnifiedTrack>> GetTopTracksAsync(string accessToken, string timeRange = "short_term")
    {
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"{SpotifyApiBase}me/top/tracks?limit=20&time_range={timeRange}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var client = _httpClientFactory.CreateClient();
        var response = await client.SendAsync(request);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync();
            Console.WriteLine($"[Spotify TopTracks] Error: {response.StatusCode} - {err}");
            return new List<UnifiedTrack>();
        }

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var tracks = new List<UnifiedTrack>();

        if (!doc.RootElement.TryGetProperty("items", out var items)) return tracks;

        foreach (var item in items.EnumerateArray())
        {
            try
            {
                var artists = item.GetProperty("artists");
                var artistName = artists.GetArrayLength() > 0
                    ? artists[0].GetProperty("name").GetString() ?? "" : "";
                var albumImages = item.GetProperty("album").GetProperty("images");
                var thumbnail = albumImages.GetArrayLength() > 0
                    ? albumImages[0].GetProperty("url").GetString() ?? "" : "";

                tracks.Add(new UnifiedTrack
                {
                    Id = item.GetProperty("id").GetString() ?? "",
                    Title = item.GetProperty("name").GetString() ?? "",
                    Artist = artistName,
                    Album = item.GetProperty("album").GetProperty("name").GetString() ?? "",
                    ThumbnailUrl = thumbnail,
                    DurationMs = item.GetProperty("duration_ms").GetInt32(),
                    Source = "spotify",
                    SourceUri = item.GetProperty("uri").GetString() ?? "",
                    PreviewUrl = item.TryGetProperty("preview_url", out var prev) && prev.ValueKind != JsonValueKind.Null
                        ? prev.GetString() ?? "" : ""
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Spotify TopTracks] Skip track: {ex.Message}");
            }
        }
        return tracks;
    }

    private async Task<(string? Id, int DurationMs, string? Uri, string? PreviewUrl)> GetAlbumFirstTrackAsync(string token, string albumId)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{SpotifyApiBase}albums/{albumId}/tracks?limit=1");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var client = _httpClientFactory.CreateClient();
            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
                return (null, 0, null, null);

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var items = doc.RootElement.GetProperty("items");
            if (items.GetArrayLength() == 0)
                return (null, 0, null, null);

            var track = items[0];
            var previewUrl = track.TryGetProperty("preview_url", out var preview) && preview.ValueKind != JsonValueKind.Null
                ? preview.GetString() : null;

            return (
                track.GetProperty("id").GetString(),
                track.GetProperty("duration_ms").GetInt32(),
                track.GetProperty("uri").GetString(),
                previewUrl
            );
        }
        catch
        {
            return (null, 0, null, null);
        }
    }

    public async Task<List<UnifiedTrack>> GetLikedTracksAsync(string accessToken)
    {
        var tracks = new List<UnifiedTrack>();
        var url = $"{SpotifyApiBase}me/tracks?limit=50";

        while (!string.IsNullOrEmpty(url))
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            using var client = _httpClientFactory.CreateClient();
            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode) break;

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            if (!doc.RootElement.TryGetProperty("items", out var items)) break;

            foreach (var item in items.EnumerateArray())
            {
                try
                {
                    if (!item.TryGetProperty("track", out var track) || track.ValueKind == JsonValueKind.Null) continue;
                    if (!track.TryGetProperty("id", out var idEl) || idEl.ValueKind == JsonValueKind.Null) continue;
                    if (!track.TryGetProperty("artists", out var artists) || !track.TryGetProperty("album", out var album)) continue;

                    var artistName = artists.GetArrayLength() > 0 && artists[0].TryGetProperty("name", out var an) ? an.GetString() ?? "" : "";
                    var thumbnail = album.TryGetProperty("images", out var imgs) && imgs.GetArrayLength() > 0 && imgs[0].TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";
                    var albumName = album.TryGetProperty("name", out var albumNameEl) ? albumNameEl.GetString() ?? "" : "";
                    var previewUrl = track.TryGetProperty("preview_url", out var prev) && prev.ValueKind != JsonValueKind.Null ? prev.GetString() ?? "" : "";

                    tracks.Add(new UnifiedTrack
                    {
                        Id = idEl.GetString() ?? "",
                        Title = track.TryGetProperty("name", out var t) ? t.GetString() ?? "" : "",
                        Artist = artistName,
                        Album = albumName,
                        ThumbnailUrl = thumbnail,
                        DurationMs = track.TryGetProperty("duration_ms", out var dur) ? dur.GetInt32() : 0,
                        Source = "spotify",
                        SourceUri = track.TryGetProperty("uri", out var uri) ? uri.GetString() ?? "" : "",
                        PreviewUrl = previewUrl
                    });
                }
                catch (Exception ex) { Console.Error.WriteLine($"Skip liked track: {ex.Message}"); }
            }

            // Pagination
            url = doc.RootElement.TryGetProperty("next", out var next) && next.ValueKind != JsonValueKind.Null ? next.GetString() ?? "" : "";
        }
        return tracks;
    }

    public async Task<List<SpotifyPlaylistInfo>> GetUserPlaylistsAsync(string accessToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{SpotifyApiBase}me/playlists?limit=50");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var client = _httpClientFactory.CreateClient();
        var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync();
            Console.Error.WriteLine($"Spotify GetUserPlaylists Error: {response.StatusCode} - {err}");
            return new List<SpotifyPlaylistInfo>();
        }

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var playlists = new List<SpotifyPlaylistInfo>();

        if (!doc.RootElement.TryGetProperty("items", out var items)) return playlists;

        foreach (var item in items.EnumerateArray())
        {
            try
            {
                if (item.ValueKind == JsonValueKind.Null) continue;

                // Image URL
                var imageUrl = "";
                if (item.TryGetProperty("images", out var images) && images.GetArrayLength() > 0)
                    imageUrl = images[0].TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";

                // Track count
                var trackCount = 0;
                if (item.TryGetProperty("tracks", out var tracksObj) && tracksObj.TryGetProperty("total", out var total))
                    trackCount = total.GetInt32();

                // Owner display name + id
                var owner = "";
                var ownerId = "";
                if (item.TryGetProperty("owner", out var ownerObj))
                {
                    if (ownerObj.TryGetProperty("display_name", out var dn)) owner = dn.GetString() ?? "";
                    if (ownerObj.TryGetProperty("id", out var oi)) ownerId = oi.GetString() ?? "";
                }

                var id = item.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
                var name = item.TryGetProperty("name", out var nameEl) ? nameEl.GetString() ?? "" : "";
                if (string.IsNullOrEmpty(id)) continue;

                // Skip Spotify-system playlists (Discover Weekly, Daily Mixes, etc.)
                // These are owned by 'spotify' and always return 403 for tracks
                if (ownerId == "spotify") continue;

                playlists.Add(new SpotifyPlaylistInfo
                {
                    Id = id,
                    Name = name,
                    ImageUrl = imageUrl,
                    TrackCount = trackCount,
                    Owner = owner
                });
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Skipping playlist due to parse error: {ex.Message}");
            }
        }

        return playlists;
    }

    public async Task<List<UnifiedTrack>> GetPlaylistTracksAsync(string playlistId, string accessToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{SpotifyApiBase}playlists/{playlistId}/tracks?limit=100");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var client = _httpClientFactory.CreateClient();
        var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync();
            Console.Error.WriteLine($"Spotify GetPlaylistTracks Error: {response.StatusCode} - {err}");
            return new List<UnifiedTrack>();
        }

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var tracks = new List<UnifiedTrack>();

        if (!doc.RootElement.TryGetProperty("items", out var items)) return tracks;

        foreach (var item in items.EnumerateArray())
        {
            try
            {
                if (item.ValueKind == JsonValueKind.Null) continue;
                if (!item.TryGetProperty("track", out var track) || track.ValueKind == JsonValueKind.Null) continue;

                // Skip episodes / local files — they have no artists or album
                if (!track.TryGetProperty("artists", out var artists)) continue;
                if (!track.TryGetProperty("album", out var album)) continue;
                if (!track.TryGetProperty("id", out var idEl) || idEl.ValueKind == JsonValueKind.Null) continue;

                var artistName = artists.GetArrayLength() > 0 && artists[0].TryGetProperty("name", out var an)
                    ? an.GetString() ?? "" : "";

                var thumbnail = "";
                if (album.TryGetProperty("images", out var albumImages) && albumImages.GetArrayLength() > 0)
                    thumbnail = albumImages[0].TryGetProperty("url", out var tu) ? tu.GetString() ?? "" : "";

                var albumName = album.TryGetProperty("name", out var albumNameEl) ? albumNameEl.GetString() ?? "" : "";

                var previewUrl = track.TryGetProperty("preview_url", out var preview) && preview.ValueKind != JsonValueKind.Null
                    ? preview.GetString() ?? "" : "";

                var durationMs = track.TryGetProperty("duration_ms", out var dur) ? dur.GetInt32() : 0;
                var uri = track.TryGetProperty("uri", out var uriEl) ? uriEl.GetString() ?? "" : "";
                var title = track.TryGetProperty("name", out var titleEl) ? titleEl.GetString() ?? "" : "";

                tracks.Add(new UnifiedTrack
                {
                    Id = idEl.GetString() ?? "",
                    Title = title,
                    Artist = artistName,
                    Album = albumName,
                    ThumbnailUrl = thumbnail,
                    DurationMs = durationMs,
                    Source = "spotify",
                    SourceUri = uri,
                    PreviewUrl = previewUrl
                });
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Skipping playlist track due to parse error: {ex.Message}");
            }
        }

        return tracks;
    }
}
