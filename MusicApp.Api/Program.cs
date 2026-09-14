using MusicApp.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Load local secrets (gitignored) — overrides appsettings.json placeholders
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// Allow secrets to be injected via environment variables (used by Render cloud hosting)
// e.g. Groq__ApiKey, Spotify__ClientId, Spotify__ClientSecret, Spotify__RedirectUri, YouTube__ApiKey
builder.Configuration.AddEnvironmentVariables();

// Read allowed frontend origins from env var (comma-separated) or fall back to defaults
var allowedOriginsEnv = builder.Configuration["AllowedOrigins"] ?? "";
var allowedOrigins = allowedOriginsEnv
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Concat(new[]
    {
        "http://localhost:4200",
        "https://localhost:4200"
    })
    .Distinct()
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .SetIsOriginAllowedToAllowWildcardSubdomains()
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

builder.Services.AddControllers();
builder.Services.AddMemoryCache();

// Register services
builder.Services.AddHttpClient();
builder.Services.AddSingleton<SpotifyService>();
builder.Services.AddHttpClient<YouTubeService>();
builder.Services.AddHttpClient<ChatService>();

var app = builder.Build();

app.UseCors();
app.MapControllers();

app.Run();



