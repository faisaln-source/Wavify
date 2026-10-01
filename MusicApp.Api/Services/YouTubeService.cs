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
        IEnumerable<string>? chartHints = null,
        string? relevanceLang = null)
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
                    - CRITICAL: Only suggest songs you are 100% certain EXIST and were officially released.
                    - DO NOT invent or hallucinate song titles, artist collaborations, or fake releases.
                    - If unsure whether a song exists, skip it and suggest a confirmed charting song instead.
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
            var fetchTasks = songQueries.Take(10).Select(q => FetchFirstYouTubeResult(q, ytKey, relevanceLang));
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
        return await GetVelocityRankedFallbackAsync(fq, relevanceLang: relevanceLang, languageName: null);
    }

    // ISO 639-1 codes for YouTube relevanceLanguage parameter.
    // This is the single most effective way to keep language results pure —
    // YouTube will strongly prefer content in the target language.
    private static readonly Dictionary<string, string> LanguageToYouTubeCode = new(StringComparer.OrdinalIgnoreCase)
    {
        ["hindi"]     = "hi",
        ["malayalam"] = "ml",
        ["tamil"]     = "ta",
        ["telugu"]    = "te",
        ["kannada"]   = "kn",
        ["bengali"]   = "bn",
        ["punjabi"]   = "pa",
        ["marathi"]   = "mr",
        ["odia"]      = "or",
        ["bhojpuri"]  = "bh",
    };

    public Task<List<UnifiedTrack>> GetAITrendingLanguageAsync(string language)
    {
        LanguageToYouTubeCode.TryGetValue(language, out var langCode);

        // BYPASS AI LLM for regional Indian language trending.
        // relevanceLanguage alone is insufficient: YouTube treats it as an audience-preference
        // signal, not a content-language filter. Tamil songs by Anirudh Ravichander appear in
        // Malayalam results because Kerala audiences watch Tamil films.
        //
        // Solution: two specific film/album queries + IsLikelyTargetLanguage script filter.
        // The script filter rejects any result whose title has no target-language Unicode
        // characters AND no language name keywords AND channel score < 2.
        var q1 = $"new {language} movie songs 2025 2026 official";
        var q2 = $"latest {language} album songs 2026 official";
        return GetVelocityRankedFallbackAsync(q1, q2, langCode, language);
    }

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

    private static bool IsVideoJunk(string title, int durationMs, int channelScore = 0)
    {
        if (durationMs > 0 && durationMs < 90_000) return true;  // YouTube Short (< 90 sec)
        if (durationMs > 900_000) return true;                    // Too long (> 15 min)

        var t = title.ToLowerInvariant();

        // Keyword blocklist (junk content types + religious)
        if (VideoJunkKeywords.Any(kw => t.Contains(kw))) return true;

        // Hashtag-spam: 2+ '#' symbols = label SEO keyword stuffing
        if (title.Count(c => c == '#') >= 2) return true;

        // Titles starting with "#video" are always promotional label uploads
        if (t.StartsWith("#video") || t.StartsWith("#audio") || t.StartsWith("#lyric")) return true;

        // Emoji spam: 2+ emoji characters = aggregator clickbait title
        // Emojis are supplementary Unicode encoded as surrogate pairs in UTF-16.
        // Indian script chars (Devanagari, Malayalam, etc.) are BMP and don't use surrogates.
        int emojiCount = 0;
        for (int i = 0; i < title.Length - 1; i++)
            if (char.IsHighSurrogate(title[i]) && char.IsLowSurrogate(title[i + 1]))
            { emojiCount++; i++; }
        if (emojiCount >= 2) return true;

        // Pipe-spam: 3+ pipes = keyword-stuffed re-upload title.
        // EXCEPTION: major label channels (score >= 4) legitimately list cast members with pipes.
        // e.g. T-Series: "Song | Film | Actor | Singer" is valid — Gaurav Mall doing the same is not.
        if (channelScore < 4 && title.Count(c => c == '|') >= 3) return true;

        // Re-upload signature: starts with "New [Language] Song"
        if (Regex.IsMatch(t, @"^new\s+(song|hindi|punjabi|bengali|tamil|telugu|bhojpuri|haryanvi|marathi|odia|kannada|malayalam)"))
            return true;

        // Trailing "| New [X] Song" suffix = SEO keyword suffix
        if (Regex.IsMatch(t, @"\|\s*new\s+\w*\s*song\s*$"))
            return true;

        // Trailing "| ... songs" (plural) = category keyword stuffing at end of title
        // Handles emojis before words: "| 🔥 Romantic Malayalam Songs" or "| Latest Tamil Songs"
        // [^|]* matches anything within the last pipe segment (including emojis)
        if (Regex.IsMatch(t, @"\|[^|]*\bsongs\s*$"))
            return true;

        // Trailing "| ... trending ... song" = "| 🔥 Latest Trending Tamil Video Song"
        // Catches single-pipe SEO suffix from non-official channels with emoji + "Trending" keyword
        if (Regex.IsMatch(t, @"\|[^|]*\btrending\b[^|]*\bsong\s*$"))
            return true;

        return false;
    }

    /// <summary>
    /// Scores a YouTube channel for "officialness".
    /// Higher score = more likely to be the legitimate official upload.
    /// IMPORTANT: Do NOT give high scores to generic words like "music" or "entertainment" —
    /// aggregator channels like "MusicMayhem", "Hit Music Global" abuse these words.
    /// </summary>
    private static int GetChannelOfficialScore(string channelTitle)
    {
        var ch = channelTitle.ToLowerInvariant();

        // Tier 5: Auto-generated YouTube channels (always official) & VEVO
        if (ch.EndsWith("- topic") || ch.Contains("vevo")) return 5;

        // Tier 4: Known trusted music labels (major international + major regional)
        if (ch.Contains("t-series")    || ch.Contains("sony music")   || ch.Contains("warner music") ||
            ch.Contains("universal music") || ch.Contains("zee music") || ch.Contains("saregama")    ||
            ch.Contains("think music") || ch.Contains("speed records") || ch.Contains("lahari")      ||
            ch.Contains("yash raj")    || ch.Contains("dharma")        || ch.Contains("def jam")      ||
            ch.Contains("interscope")  || ch.Contains("columbia")      || ch.Contains("atlantic")     ||
            ch.Contains("republic records") || ch.Contains("rca records") || ch.Contains("capitol")   ||
            ch.Contains("island records") || ch.Contains("tips films") || ch.Contains("junglee music") ||
            ch.Contains("nadaan")      || ch.Contains("divo music")    || ch.Contains("aditya music")  ||
            ch.Contains("sun music")   || ch.Contains("kv music")      || ch.Contains("warnerbros")) return 4;

        // Tier 3: Channel name explicitly says "Official"
        if (ch.Contains("official")) return 3;

        // Tier 2: "Records" in name (most labels have this, aggregators rarely do)
        if (ch.Contains("records")) return 2;

        // Everything else: personal re-upload/aggregator channels score 0
        // This includes: "MusicMayhem", "Hit Music Global", "Best Of Anik",
        //   "iPop Superhits", "Pop Chartbusters", "All Good Music", "Afropulse music", etc.
        return 0;
    }

    private async Task<UnifiedTrack?> FetchFirstYouTubeResult(string query, string apiKey, string? relevanceLang = null)
    {
        try
        {
            // Fetch 5 candidates so we have a larger pool to rank by channel quality
            var langParam = relevanceLang != null ? $"&relevanceLanguage={relevanceLang}" : "";
            var url = $"search?part=snippet&q={Uri.EscapeDataString(query)}&type=video&videoCategoryId=10&maxResults=5{langParam}&key={apiKey}";
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
                    Title = System.Net.WebUtility.HtmlDecode(snippet.GetProperty("title").GetString() ?? query),
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

            // Sort by channel official score (VEVO/Topic=5 > Labels=4 > Generic=3 > Personal=0)
            // then pick first that passes junk filter.
            // This ensures "Gaurav Mall" / personal re-upload channels lose to T-Series/VEVO/Topic.
            return candidates
                .OrderByDescending(t => GetChannelOfficialScore(t.Artist))
                .FirstOrDefault(t => !IsVideoJunk(t.Title, t.DurationMs, GetChannelOfficialScore(t.Artist)));
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
    public async Task<List<UnifiedTrack>> SearchTrendingLanguageAsync(string query, int months = 3, string? relevanceLang = null)
    {
        var apiKey = _config["YouTube:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
            return GetDemoResults(query);

        // Dynamic: N months ago so the window always slides with today's date
        var publishedAfter = DateTime.UtcNow.AddMonths(-months).ToString("yyyy-MM-ddTHH:mm:ssZ");
        var langParam = relevanceLang != null ? $"&relevanceLanguage={relevanceLang}" : "";

        var url = $"search?part=snippet" +
                  $"&q={Uri.EscapeDataString(query)}" +
                  $"&type=video" +
                  $"&videoCategoryId=10" +
                  $"&order=viewCount" +
                  $"&publishedAfter={Uri.EscapeDataString(publishedAfter)}" +
                  $"&maxResults=25" +
                  langParam +
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
                Title = System.Net.WebUtility.HtmlDecode(snippet.GetProperty("title").GetString() ?? ""),
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
        // Remove Shorts, long compilations and junk titles. Pass channel score so major labels
        // (score >= 4) are allowed longer pipe-separated titles listing cast members.
        return tracks.Where(t => !IsVideoJunk(t.Title, t.DurationMs, GetChannelOfficialScore(t.Artist))).ToList();
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
                Title = System.Net.WebUtility.HtmlDecode(snippet.GetProperty("title").GetString() ?? ""),
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
            .Where(t => !IsVideoJunk(t.Title, t.DurationMs, GetChannelOfficialScore(t.Artist)))
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
    /// Takes a list of Spotify editorial chart tracks (title + artist) and finds their
    /// official YouTube videos by searching "Song Artist official audio".
    /// This produces chart-quality results equivalent to Spotify/YouTube Music trending —
    /// verified official uploads, zero keyword-stuffed label spam.
    /// </summary>
    public async Task<List<UnifiedTrack>> GetChartBasedTrendingAsync(
        IEnumerable<(string Title, string Artist)> chartTracks)
    {
        var ytKey = _config["YouTube:ApiKey"];
        if (string.IsNullOrEmpty(ytKey) || !chartTracks.Any())
            return new List<UnifiedTrack>();

        // "official audio" steers YouTube search toward VEVO / artist-owned uploads
        var fetchTasks = chartTracks.Take(20)
            .Select(t => FetchFirstYouTubeResult($"{t.Title} {t.Artist} official audio", ytKey));

        var results = await Task.WhenAll(fetchTasks);
        return results
            .Where(t => t != null).Cast<UnifiedTrack>()
            .DistinctBy(t => NormalizeTitle(t.Title))
            .ToList();
    }

    /// <summary>
    /// Dual-query fallback: runs recent (1-month) and popular (6-month) searches in parallel,
    /// then merges, deduplicates by normalized title, and sorts by velocity score.
    /// This avoids the 18-month window trap where old hits dominate "trending" results.
    /// </summary>
    /// <summary>
    /// Returns true if the track is likely in the target language.
    /// Checks Unicode script ranges (e.g. Malayalam U+0D00-U+0D7F), language name keywords,
    /// and industry terms. Used to reject Tamil/Sambalpuri/Santhali songs from Malayalam tab.
    /// A result passes if ANY indicator matches — we only reject when NONE match AND score &lt; 2.
    /// </summary>
    private static bool IsLikelyTargetLanguage(UnifiedTrack t, string language)
    {
        var title = t.Title.ToLowerInvariant();
        var channel = t.Artist.ToLowerInvariant();
        var langLower = language.ToLowerInvariant();

        // Explicit language name or industry term in title or channel
        if (title.Contains(langLower) || channel.Contains(langLower)) return true;

        var industryTerms = language.ToUpperInvariant() switch
        {
            "MALAYALAM" => new[] { "mollywood", "kerala", "manorama", "surya tv" },
            "TAMIL"     => new[] { "kollywood", "tamilnadu", "kodambakkam" },
            "TELUGU"    => new[] { "tollywood", "hyderabad" },
            "KANNADA"   => new[] { "sandalwood", "bangalore" },
            "HINDI"     => new[] { "bollywood", "mumbai" },
            "BENGALI"   => new[] { "tollywood", "kolkata" },
            _           => Array.Empty<string>()
        };
        if (industryTerms.Any(term => title.Contains(term) || channel.Contains(term))) return true;

        // Unicode script detection in title — the most reliable signal.
        // Each Indian language has its own Unicode block; presence of even one char confirms language.
        bool hasScript = language.ToUpperInvariant() switch
        {
            "MALAYALAM" => t.Title.Any(ch => ch >= 0x0D00 && ch <= 0x0D7F),
            "TAMIL"     => t.Title.Any(ch => ch >= 0x0B80 && ch <= 0x0BFF),
            "TELUGU"    => t.Title.Any(ch => ch >= 0x0C00 && ch <= 0x0C7F),
            "KANNADA"   => t.Title.Any(ch => ch >= 0x0C80 && ch <= 0x0CFF),
            "HINDI"     => t.Title.Any(ch => ch >= 0x0900 && ch <= 0x097F),
            "BENGALI"   => t.Title.Any(ch => ch >= 0x0980 && ch <= 0x09FF),
            "PUNJABI"   => t.Title.Any(ch => ch >= 0x0A00 && ch <= 0x0A7F),
            _           => true   // Unknown language: don't filter
        };
        if (hasScript) return true;

        // No language indicator in title or channel.
        // Allow if from a known major label (score >= 2) — they rarely mis-categorise.
        // Reject score-0 aggregators with no language signal (Santhali, Sambalpuri, Tamil, etc.)
        return GetChannelOfficialScore(t.Artist) >= 2;
    }

    private async Task<List<UnifiedTrack>> GetVelocityRankedFallbackAsync(
        string query, string? relevanceLang = null, string? languageName = null)
        => await GetVelocityRankedFallbackAsync(query, query, relevanceLang, languageName);

    private async Task<List<UnifiedTrack>> GetVelocityRankedFallbackAsync(
        string recentQuery, string popularQuery, string? relevanceLang = null, string? languageName = null)
    {
        // Two queries: one for freshest drops, one for highest-view-count over longer window
        var byRecentTask  = SearchTrendingLanguageAsync(recentQuery,  months: 2, relevanceLang);
        var byPopularTask = SearchTrendingLanguageAsync(popularQuery, months: 12, relevanceLang);

        var results = await Task.WhenAll(byRecentTask, byPopularTask);

        var candidates = results
            .SelectMany(x => x)
            .DistinctBy(t => NormalizeTitle(t.Title));

        // Language-purity filter: for regional language tabs, reject results that have
        // no script chars, no language keywords, AND are from low-score channels.
        // This filters: Anirudh's Tamil DC songs, Santhali, Sambalpuri, etc. from Malayalam tab.
        if (!string.IsNullOrEmpty(languageName))
            candidates = candidates.Where(t => IsLikelyTargetLanguage(t, languageName));

        return candidates
            // Dual-key sort: channel official score (×2) + velocity.
            .OrderByDescending(t => GetChannelOfficialScore(t.Artist) * 2.0 + ComputeVelocityScore(t))
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
