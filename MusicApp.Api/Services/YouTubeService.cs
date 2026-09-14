using System.Text.Json;
using System.Text.RegularExpressions;
using MusicApp.Api.Models;

namespace MusicApp.Api.Services;

public class YouTubeService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _config;

    public YouTubeService(HttpClient httpClient, IConfiguration config)
    {
        _httpClient = httpClient;
        _config = config;
        _httpClient.BaseAddress = new Uri("https://www.googleapis.com/youtube/v3/");
    }

    public async Task<List<UnifiedTrack>> SearchAsync(string query)
    {
        var apiKey = _config["YouTube:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
            return GetDemoResults(query);

        var response = await _httpClient.GetAsync(
            $"search?part=snippet&q={Uri.EscapeDataString(query + " music")}&type=video&videoCategoryId=10&maxResults=20&key={apiKey}");

        if (!response.IsSuccessStatusCode)
            return GetDemoResults(query);

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        var tracks = new List<UnifiedTrack>();
        var videoIds = new List<string>();
        var items = doc.RootElement.GetProperty("items");

        foreach (var item in items.EnumerateArray())
        {
            var snippet = item.GetProperty("snippet");
            var videoId = item.GetProperty("id").GetProperty("videoId").GetString() ?? "";
            var thumbnails = snippet.GetProperty("thumbnails");
            var thumbnail = thumbnails.TryGetProperty("high", out var highThumb)
                ? highThumb.GetProperty("url").GetString() ?? ""
                : thumbnails.GetProperty("default").GetProperty("url").GetString() ?? "";

            videoIds.Add(videoId);
            tracks.Add(new UnifiedTrack
            {
                Id = videoId,
                Title = snippet.GetProperty("title").GetString() ?? "",
                Artist = snippet.GetProperty("channelTitle").GetString() ?? "",
                Album = "",
                ThumbnailUrl = thumbnail,
                DurationMs = 0,
                Source = "youtube",
                SourceUri = videoId,
                PreviewUrl = ""
            });
        }

        // Fetch durations for all videos in bulk
        await EnrichWithDurations(tracks, videoIds, apiKey);

        return tracks;
    }

    public async Task<List<UnifiedTrack>> GetTrendingMusicAsync()
    {
        var apiKey = _config["YouTube:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
            return GetDemoTrending();

        var response = await _httpClient.GetAsync(
            $"videos?part=snippet,contentDetails&chart=mostPopular&videoCategoryId=10&maxResults=20&key={apiKey}");

        if (!response.IsSuccessStatusCode)
            return GetDemoTrending();

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        var tracks = new List<UnifiedTrack>();
        var items = doc.RootElement.GetProperty("items");

        foreach (var item in items.EnumerateArray())
        {
            var snippet = item.GetProperty("snippet");
            var thumbnails = snippet.GetProperty("thumbnails");
            var thumbnail = thumbnails.TryGetProperty("high", out var highThumb)
                ? highThumb.GetProperty("url").GetString() ?? ""
                : thumbnails.GetProperty("default").GetProperty("url").GetString() ?? "";

            // Trending endpoint already includes contentDetails
            var durationMs = 0;
            if (item.TryGetProperty("contentDetails", out var contentDetails))
            {
                var durationStr = contentDetails.GetProperty("duration").GetString() ?? "";
                durationMs = ParseISO8601Duration(durationStr);
            }

            tracks.Add(new UnifiedTrack
            {
                Id = item.GetProperty("id").GetString() ?? "",
                Title = snippet.GetProperty("title").GetString() ?? "",
                Artist = snippet.GetProperty("channelTitle").GetString() ?? "",
                Album = "",
                ThumbnailUrl = thumbnail,
                DurationMs = durationMs,
                Source = "youtube",
                SourceUri = item.GetProperty("id").GetString() ?? "",
                PreviewUrl = ""
            });
        }

        return tracks;
    }

    public async Task<List<PlaylistInfo>> SearchPlaylistsAsync(string query)
    {
        var apiKey = _config["YouTube:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
            return new List<PlaylistInfo>();

        var response = await _httpClient.GetAsync(
            $"search?part=snippet&q={Uri.EscapeDataString(query)}&type=playlist&maxResults=5&key={apiKey}");

        if (!response.IsSuccessStatusCode)
            return new List<PlaylistInfo>();

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        var playlists = new List<PlaylistInfo>();
        var items = doc.RootElement.GetProperty("items");

        foreach (var item in items.EnumerateArray())
        {
            var snippet = item.GetProperty("snippet");
            var thumbnails = snippet.GetProperty("thumbnails");
            var thumbnail = thumbnails.TryGetProperty("high", out var highThumb)
                ? highThumb.GetProperty("url").GetString() ?? ""
                : thumbnails.GetProperty("default").GetProperty("url").GetString() ?? "";

            playlists.Add(new PlaylistInfo
            {
                PlaylistId = item.GetProperty("id").GetProperty("playlistId").GetString() ?? "",
                Title = snippet.GetProperty("title").GetString() ?? "",
                ChannelTitle = snippet.GetProperty("channelTitle").GetString() ?? "",
                ThumbnailUrl = thumbnail,
                Description = snippet.GetProperty("description").GetString() ?? ""
            });
        }

        return playlists;
    }

    public async Task<List<UnifiedTrack>> GetPlaylistItemsAsync(string playlistId)
    {
        var apiKey = _config["YouTube:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
            return new List<UnifiedTrack>();

        var url = $"playlistItems?part=snippet,contentDetails&playlistId={Uri.EscapeDataString(playlistId)}&maxResults=50&key={apiKey}";

        var response = await _httpClient.GetAsync(url);
        if (!response.IsSuccessStatusCode)
        {
            Console.WriteLine($"YouTube Playlist Items Error: {response.StatusCode}");
            return new List<UnifiedTrack>();
        }

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        var tracks = new List<UnifiedTrack>();
        var videoIds = new List<string>();
        var items = doc.RootElement.GetProperty("items");

        foreach (var item in items.EnumerateArray())
        {
            var snippet = item.GetProperty("snippet");
            var contentDetails = item.GetProperty("contentDetails");
            var videoId = contentDetails.GetProperty("videoId").GetString() ?? "";

            if (string.IsNullOrEmpty(videoId)) continue;
            var title = snippet.GetProperty("title").GetString() ?? "";
            if (title == "Deleted video" || title == "Private video") continue;

            var thumbnails = snippet.GetProperty("thumbnails");
            var thumbnail = "";
            if (thumbnails.TryGetProperty("high", out var highThumb))
                thumbnail = highThumb.GetProperty("url").GetString() ?? "";
            else if (thumbnails.TryGetProperty("default", out var defThumb))
                thumbnail = defThumb.GetProperty("url").GetString() ?? "";

            videoIds.Add(videoId);
            tracks.Add(new UnifiedTrack
            {
                Id = videoId,
                Title = title,
                Artist = snippet.GetProperty("videoOwnerChannelTitle").GetString() ?? "",
                Album = "",
                ThumbnailUrl = thumbnail,
                DurationMs = 0,
                Source = "youtube",
                SourceUri = videoId,
                PreviewUrl = ""
            });
        }

        // Fetch durations for all playlist videos
        await EnrichWithDurations(tracks, videoIds, apiKey);

        return tracks;
    }

    /// <summary>
    /// Fetches video durations from the YouTube videos endpoint and updates the tracks in-place.
    /// Batches requests in groups of 50 (YouTube API limit).
    /// </summary>
    private async Task EnrichWithDurations(List<UnifiedTrack> tracks, List<string> videoIds, string apiKey)
    {
        if (videoIds.Count == 0) return;

        try
        {
            // YouTube API accepts up to 50 IDs per request
            var idsParam = string.Join(",", videoIds);
            var response = await _httpClient.GetAsync(
                $"videos?part=contentDetails&id={idsParam}&key={apiKey}");

            if (!response.IsSuccessStatusCode) return;

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            var durationsMap = new Dictionary<string, int>();
            var items = doc.RootElement.GetProperty("items");

            foreach (var item in items.EnumerateArray())
            {
                var id = item.GetProperty("id").GetString() ?? "";
                var duration = item.GetProperty("contentDetails").GetProperty("duration").GetString() ?? "";
                durationsMap[id] = ParseISO8601Duration(duration);
            }

            // Update tracks with durations
            foreach (var track in tracks)
            {
                if (durationsMap.TryGetValue(track.Id, out var durationMs))
                {
                    track.DurationMs = durationMs;
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error fetching video durations: {ex.Message}");
        }
    }

    /// <summary>
    /// Parses ISO 8601 duration format (e.g., PT3M45S, PT1H2M30S) to milliseconds.
    /// </summary>
    private static int ParseISO8601Duration(string duration)
    {
        if (string.IsNullOrEmpty(duration)) return 0;

        var match = Regex.Match(duration, @"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?");
        if (!match.Success) return 0;

        var hours = match.Groups[1].Success ? int.Parse(match.Groups[1].Value) : 0;
        var minutes = match.Groups[2].Success ? int.Parse(match.Groups[2].Value) : 0;
        var seconds = match.Groups[3].Success ? int.Parse(match.Groups[3].Value) : 0;

        return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
    }

    private List<UnifiedTrack> GetDemoResults(string query)
    {
        return new List<UnifiedTrack>
        {
            new() { Id = "dQw4w9WgXcQ", Title = $"{query} - Top Result", Artist = "YouTube Music", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", DurationMs = 213000, Source = "youtube", SourceUri = "dQw4w9WgXcQ" },
            new() { Id = "9bZkp7q19f0", Title = $"{query} - Music Video", Artist = "YouTube Music", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg", DurationMs = 252000, Source = "youtube", SourceUri = "9bZkp7q19f0" },
            new() { Id = "kJQP7kiw5Fk", Title = $"{query} - Popular", Artist = "YouTube Music", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg", DurationMs = 281000, Source = "youtube", SourceUri = "kJQP7kiw5Fk" },
            new() { Id = "RgKAFK5djSk", Title = $"{query} - Trending", Artist = "YouTube Music", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg", DurationMs = 278000, Source = "youtube", SourceUri = "RgKAFK5djSk" }
        };
    }

    private List<UnifiedTrack> GetDemoTrending()
    {
        return new List<UnifiedTrack>
        {
            new() { Id = "dQw4w9WgXcQ", Title = "Never Gonna Give You Up", Artist = "Rick Astley", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", DurationMs = 213000, Source = "youtube", SourceUri = "dQw4w9WgXcQ" },
            new() { Id = "9bZkp7q19f0", Title = "Gangnam Style", Artist = "PSY", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg", DurationMs = 252000, Source = "youtube", SourceUri = "9bZkp7q19f0" },
            new() { Id = "kJQP7kiw5Fk", Title = "Despacito", Artist = "Luis Fonsi", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg", DurationMs = 281000, Source = "youtube", SourceUri = "kJQP7kiw5Fk" },
            new() { Id = "RgKAFK5djSk", Title = "See You Again", Artist = "Wiz Khalifa", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg", DurationMs = 278000, Source = "youtube", SourceUri = "RgKAFK5djSk" },
            new() { Id = "OPf0YbXqDm0", Title = "Uptown Funk", Artist = "Mark Ronson ft. Bruno Mars", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg", DurationMs = 271000, Source = "youtube", SourceUri = "OPf0YbXqDm0" },
            new() { Id = "JGwWNGJdvx8", Title = "Shape of You", Artist = "Ed Sheeran", Album = "", ThumbnailUrl = "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg", DurationMs = 262000, Source = "youtube", SourceUri = "JGwWNGJdvx8" }
        };
    }
}
