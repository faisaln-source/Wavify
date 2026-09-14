using System.Text.Json;

namespace MusicApp.Api.Services;

public record ChatMessage(string Role, string Content);
public record ChatRequest(string Message, List<ChatMessage> History, string? CurrentTrackTitle = null, string? CurrentArtist = null);
public record ChatAction(string Type, string Query, string Source);
public record ChatResult(string Reply, ChatAction? Action);

public class ChatService
{
    private readonly HttpClient _http;
    private const string ApiUrl = "https://api.groq.com/openai/v1/chat/completions";
    private const string Model = "groq/compound";

    public ChatService(HttpClient http, IConfiguration config)
    {
        _http = http;
        var apiKey = config["Groq:ApiKey"] ?? throw new InvalidOperationException("Groq API key not configured.");
        _http.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
    }

    public async Task<ChatResult> SendMessageAsync(ChatRequest request)
    {
        var messages = new List<object>
        {
            new { role = "system", content = BuildSystemPrompt(request) }
        };

        foreach (var msg in request.History)
        {
            var role = msg.Role == "model" ? "assistant" : msg.Role;
            messages.Add(new { role, content = msg.Content });
        }

        messages.Add(new { role = "user", content = request.Message });

        var payload = new
        {
            model = Model,
            messages,
            temperature = 0.8,
            max_tokens = 512,
            response_format = new { type = "json_object" }
        };

        var response = await _http.PostAsJsonAsync(ApiUrl, payload);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            if ((int)response.StatusCode == 429)
                return new ChatResult("I'm a bit busy right now 🎵 Please wait a few seconds and try again!", null);
            throw new Exception($"Groq API error {response.StatusCode}: {error}");
        }

        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        var raw = result
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? "{}";

        return ParseResponse(raw);
    }

    private ChatResult ParseResponse(string raw)
    {
        try
        {
            var doc = JsonSerializer.Deserialize<JsonElement>(raw);
            var reply = doc.TryGetProperty("reply", out var r) ? r.GetString() ?? raw : raw;
            ChatAction? action = null;

            if (doc.TryGetProperty("action", out var a) && a.ValueKind == JsonValueKind.Object)
            {
                var type   = a.TryGetProperty("type",   out var t)   ? t.GetString()   ?? "" : "";
                var query  = a.TryGetProperty("query",  out var q)   ? q.GetString()   ?? "" : "";
                var source = a.TryGetProperty("source", out var src) ? src.GetString() ?? "youtube" : "youtube";
                if (!string.IsNullOrEmpty(type) && !string.IsNullOrEmpty(query))
                    action = new ChatAction(type, query, source);
            }
            return new ChatResult(reply, action);
        }
        catch
        {
            return new ChatResult(raw, null);
        }
    }

    private string BuildSystemPrompt(ChatRequest request)
    {
        var prompt = """
            You are Wavify AI 🎵, a friendly music assistant inside the Wavify music app.
            You MUST always respond in valid JSON with this exact structure:
            {"reply": "your response here", "action": null}

            When the user asks to PLAY a specific song, artist, genre, or mood, use:
            {"reply": "Playing [song] for you! 🎵", "action": {"type": "play", "query": "artist song title", "source": "youtube"}}

            Rules:
            - "reply" must always be a friendly, conversational message (2-4 sentences max).
            - "action" is null unless the user explicitly wants to play something.
            - Use "source": "spotify" only if the user specifically mentions Spotify, otherwise use "youtube".
            - Use music emojis. Stay focused on music topics.
            - The "query" for play actions should be a good search query like "The Weeknd Blinding Lights".
            """;

        if (!string.IsNullOrEmpty(request.CurrentTrackTitle))
        {
            var artist = string.IsNullOrEmpty(request.CurrentArtist) ? "Unknown Artist" : request.CurrentArtist;
            prompt += $"\n\nContext: User is currently listening to \"{request.CurrentTrackTitle}\" by {artist}.";
        }

        return prompt;
    }
}
