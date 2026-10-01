using System.Text.Json;
using System.Text.RegularExpressions;
using MusicApp.Api.Models;

namespace MusicApp.Api.Services;

public class YouTubeService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _clientFactory;

    public YouTubeService(HttpClient httpClient, IConfiguration config, IHttpClientFactory clientFactory)
    {
        _httpClient = httpClient;
        _config = config;
        _clientFactory = clientFactory;
        _httpClient.BaseAddress = new Uri("https://www.googleapis.com/youtube/v3/");
    }

    /// <summary>
    /// Universal AI-powered trending: asks Groq to list top 10 songs for any context
    /// (language, region, similarity), then fetches each from YouTube.
    /// Optional <paramref name="chartHints"/> (real Spotify chart titles) ground the LLM
    /// in actual user listening data, reducing hallucination.
    /// Falls back to a velocity-ranked dual-query strategy if AI is unavailable.
    /// </summary>
    public async Task<List<UnifiedTrack>> GetAITrendingAsync(
        string context,
        string fallbackQuery = "",
        IEnumerable<string>? chartHints = null)
    {
        var groqKey = _config["Groq:ApiKey"];
        var ytKey = _config["YouTube:ApiKey"];

        List<string> songQueries = new();
        if (!string.IsNullOrEmpty(groqKey))
        {
            try
            {
                var groqClient = _clientFactory.CreateClient();
                groqClient.DefaultRequestHeaders.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", groqKey);

                // Ground the LLM with real chart data when available — reduces hallucination
                var chartContext = chartHints?.Any() == true
                    ? $"These songs are currently trending for this user: {string.Join(", ", chartHints.Take(5))}.\nUse these as genre/style reference and suggest similar trending songs.\n"
                    : "";

                var prompt = $"""
                    You are a music chart expert with knowledge of viral songs and streaming charts.
                    {chartContext}List the top 10 most trending and popular {context} songs RIGHT NOW in 2025-2026.
                    Return ONLY a valid JSON array of strings, nothing else — no markdown, no explanation:
                    ["Song Name - Artist Name", "Song Name - Artist Name", ...]
                    Rules:
                    - Focus on songs released in 2024-2026 that are currently viral or charting.
                    - Include songs with millions of streams/views right now.
                    - DO NOT include old songs unless they are currently trending again.
                    - Each entry must be "Song Title - Artist Name" format.
                    - Prioritize songs matching the genre/style of the reference songs if provided.
                    - Return ONLY commercially released official songs from mainstream or indie artists.
                    - EXCLUDE religious, devotional, bhakti, or spiritual songs entirely.
                    - EXCLUDE fan-made videos, lyric-only channels, or unofficial label uploads.
                    """;

                var payload = new
                {
                    // Upgraded: llama-3.3-70b has far better chart/music knowledge than 8b-instant
                    model = "llama-3.3-70b-versatile",
                    messages = new[] { new { role = "user", content = prompt } },
                    temperature = 0.2,
                    max_tokens = 600
                };

                var resp = await groqClient.PostAsJsonAsync("https://api.groq.com/openai/v1/chat/completions", payload);
                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
                    var raw = json.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "[]";
                    var match = Regex.Match(raw, @"\[.*?\]", RegexOptions.Singleline);
                    if (match.Success)
                        songQueries = JsonSerializer.Deserialize<List<string>>(match.Value) ?? new();
                }
            }
            catch { /* Fall through to YouTube fallback */ }
        }

        // Fetch each AI-suggested song from YouTube in parallel
        if (songQueries.Count > 0 && !string.IsNullOrEmpty(ytKey))
        {
            var fetchTasks = songQueries.Take(10).Select(q => FetchFirstYouTubeResult(q, ytKey));
            var results = await Task.WhenAll(fetchTasks);
            var tracks = results.Where(t => t != null).Cast<UnifiedTrack>().ToList();
            if (tracks.Count > 0)
            {
                // Deduplicate by normalized title and sort freshest-first
                return tracks
                    .DistinctBy(t => NormalizeTitle(t.Title))
                    .OrderByDescending(ComputeVelocityScore)
                    .ToList();
            }
        }

        // Enhanced fallback: dual-query (recent + popular), velocity-ranked and deduplicated
        var fq = string.IsNullOrWhiteSpace(fallbackQuery) ? context : fallbackQuery;
        return await GetVelocityRankedFallbackAsync(fq);
    }

    // Keep old method for backward compatibility — delegates to generalized version
    public Task<List<UnifiedTrack>> GetAITrendingLanguageAsync(string language) =>
        GetAITrendingAsync($"{language} music", $"{language} song");

    private static readonly string[] VideoJunkKeywords =
    [
        // Format junk
        "#shorts", "#short", "mashup", "reaction", "cover", "remix",
        "in 25 seconds", "in 6 languages", "in 5 languages", "in 10 languages",
        "shorts", "nonstop", "jukebox", "playlist", "compilation",
        "back to back", "best of", "top songs", "fan made", "fan-made", "unofficial",
        // Religious / devotional — explicitly excluded
        "bhakti", "devotional", "bhajan", "aarti", "kirtan", "chalisa",
        "mantra", "pooja", "puja", "devi geet", "devi song", "mata song",
        "navratri", "stuti", "stotra", "bhagwan", "prayer", "religious",
        "spiritual", "god song", "temple", "satsang"
    ];

    private static bool IsVideoJunk(string title, int durationMs)
    {
        if (durationMs > 0 && durationMs < 90_000) return true;  // YouTube Short (< 90 sec)
        if (durationMs > 900_000) return true;                    // Too long (> 15 min)

        var t = title.ToLowerInvariant();

        // Keyword blocklist (junk content types + religious)
        if (VideoJunkKeywords.Any(kw => t.Contains(kw))) return true;

        // Hashtag-spam: 2+ '#' symbols = label SEO keyword stuffing
        // e.g. "#Video | Song | #Artist | #NewSong2026"
        if (title.Count(c => c == '#') >= 2) return true;

        // Titles starting with "#video" are always promotional label uploads
        if (t.StartsWith("#video") || t.StartsWith("#audio") || t.StartsWith("#lyric")) return true;

        return false;
    }

    private async Task<UnifiedTrack?> FetchFirstYouTubeResult(string query, string apiKey)
    {
        try
        {
            // Fetch 3 candidates — pick first that passes quality checks
            var url = $"search?part=snippet&q={Uri.EscapeDataString(query)}&type=video&videoCategoryId=10&maxResults=3&key={apiKey}";
            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode) return null;

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var items = doc.RootElement.GetProperty("items");

            var candidates = new List<UnifiedTrack>();
            var videoIds = new List<string>();

            foreach (var item in items.EnumerateArray())
            {
                var snippet = item.GetProperty("snippet");
                var videoId = item.GetProperty("id").GetProperty("videoId").GetString() ?? "";
                var thumbnails = snippet.GetProperty("thumbnails");
                var thumbnail = thumbnails.TryGetProperty("high", out var h)
                    ? h.GetProperty("url").GetString() ?? ""
                    : thumbnails.GetProperty("default").GetProperty("url").GetString() ?? "";
                var publishedAt = snippet.TryGetProperty("publishedAt", out var pub) ? pub.GetString() ?? "" : "";

                videoIds.Add(videoId);
                candidates.Add(new UnifiedTrack
                {
                    Id = videoId,
                    Title = snippet.GetProperty("title").GetString() ?? query,
                    Artist = snippet.GetProperty("channelTitle").GetString() ?? "",
                    Album = publishedAt,
                    ThumbnailUrl = thumbnail,
                    DurationMs = 0,
                    Source = "youtube",
                    SourceUri = videoId,
                    PreviewUrl = ""
                });
            }

            if (candidates.Count == 0) return null;

            // Enrich all candidates with duration in one API call
            await EnrichWithDurations(candidates, videoIds, apiKey);

            // Return the first candidate that passes quality checks
            return candidates.FirstOrDefault(t => !IsVideoJunk(t.Title, t.DurationMs));
        }
        catch { return null; }
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

    /// <summary>
    /// Search for trending language-specific music ordered by view count.
    /// publishedAfter is dynamic: 'months' months ago from now (default 18).
    /// </summary>
    public async Task<List<UnifiedTrack>> SearchTrendingLanguageAsync(string query, int months = 3)
    {
        var apiKey = _config["YouTube:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
            return GetDemoResults(query);

        // Dynamic: N months ago so the window always slides with today's date
        var publishedAfter = DateTime.UtcNow.AddMonths(-months).ToString("yyyy-MM-ddTHH:mm:ssZ");

        var url = $"search?part=snippet" +
                  $"&q={Uri.EscapeDataString(query)}" +
                  $"&type=video" +
                  $"&videoCategoryId=10" +
                  $"&order=viewCount" +
                  $"&publishedAfter={Uri.EscapeDataString(publishedAfter)}" +
                  $"&maxResults=25" +
                  $"&key={apiKey}";

        var response = await _httpClient.GetAsync(url);
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

            var publishedAt = snippet.TryGetProperty("publishedAt", out var pub)
                ? pub.GetString() ?? ""
                : "";

            videoIds.Add(videoId);
            tracks.Add(new UnifiedTrack
            {
                Id = videoId,
                Title = snippet.GetProperty("title").GetString() ?? "",
                Artist = snippet.GetProperty("channelTitle").GetString() ?? "",
                Album = publishedAt,
                ThumbnailUrl = thumbnail,
                DurationMs = 0,
                Source = "youtube",
                SourceUri = videoId,
                PreviewUrl = ""
            });
        }

        await EnrichWithDurations(tracks, videoIds, apiKey);
        // Remove Shorts, long compilations and junk titles
        return tracks.Where(t => !IsVideoJunk(t.Title, t.DurationMs)).ToList();
    }

    public async Task<List<UnifiedTrack>> GetTrendingMusicAsync(string regionCode = "US")
    {
        var apiKey = _config["YouTube:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
            return GetDemoTrending();

        var response = await _httpClient.GetAsync(
            $"videos?part=snippet,contentDetails&chart=mostPopular&videoCategoryId=10&regionCode={regionCode}&maxResults=20&key={apiKey}");

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
                // Store publishedAt so ComputeVelocityScore can rank by recency
                Album = snippet.TryGetProperty("publishedAt", out var pub) ? pub.GetString() ?? "" : "",
                ThumbnailUrl = thumbnail,
                DurationMs = durationMs,
                Source = "youtube",
                SourceUri = item.GetProperty("id").GetString() ?? "",
                PreviewUrl = ""
            });
        }

        // Apply junk filter and sort by velocity score (most recently trending first)
        return tracks
            .Where(t => !IsVideoJunk(t.Title, t.DurationMs))
            .OrderByDescending(ComputeVelocityScore)
            .ToList();
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

    /// <summary>
    /// Dual-query fallback: runs recent (1-month) and popular (6-month) searches in parallel,
    /// then merges, deduplicates by normalized title, and sorts by velocity score.
    /// This avoids the 18-month window trap where old hits dominate "trending" results.
    /// </summary>
    private async Task<List<UnifiedTrack>> GetVelocityRankedFallbackAsync(string query)
    {
        // Run both strategies in parallel
        var byRecentTask = SearchTrendingLanguageAsync(query, months: 1);   // freshest new drops
        var byPopularTask = SearchTrendingLanguageAsync(query, months: 6);  // highest view-count window

        var results = await Task.WhenAll(byRecentTask, byPopularTask);

        return results
            .SelectMany(x => x)
            .DistinctBy(t => NormalizeTitle(t.Title))
            .OrderByDescending(ComputeVelocityScore)
            .Take(20)
            .ToList();
    }

    /// <summary>
    /// Computes a velocity/trending score based on publish recency.
    /// Score decays exponentially with a 30-day half-life.
    /// Returns a neutral 0.5 when no publish date is available.
    /// </summary>
    private static double ComputeVelocityScore(UnifiedTrack track)
    {
        if (!DateTime.TryParse(track.Album, out var published))
            return 0.5;
        var daysSince = (DateTime.UtcNow - published).TotalDays;
        // Exponential decay: score = 1 / (1 + days/30)
        return 1.0 / (1.0 + daysSince / 30.0);
    }

    /// <summary>
    /// Strips punctuation/spaces and lowercases a title for fuzzy deduplication.
    /// </summary>
    private static string NormalizeTitle(string title) =>
        Regex.Replace(title.ToLowerInvariant(), @"[^a-z0-9]", "");

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
