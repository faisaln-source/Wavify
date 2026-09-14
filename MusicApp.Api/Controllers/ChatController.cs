using Microsoft.AspNetCore.Mvc;
using MusicApp.Api.Services;

namespace MusicApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ChatController : ControllerBase
{
    private readonly ChatService _chatService;

    public ChatController(ChatService chatService)
    {
        _chatService = chatService;
    }

    [HttpPost]
    public async Task<IActionResult> Chat([FromBody] ChatRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Message))
            return BadRequest(new { error = "Message cannot be empty." });

        var request = new ChatRequest(
            dto.Message,
            dto.History?.Select(h => new ChatMessage(h.Role, h.Content)).ToList() ?? [],
            dto.CurrentTrackTitle,
            dto.CurrentArtist
        );

        var result = await _chatService.SendMessageAsync(request);
        return Ok(new { reply = result.Reply, action = result.Action });
    }
}

public record ChatRequestDto(
    string Message,
    List<ChatMessageDto>? History,
    string? CurrentTrackTitle,
    string? CurrentArtist
);

public record ChatMessageDto(string Role, string Content);
