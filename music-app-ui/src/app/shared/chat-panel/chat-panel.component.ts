import { Component, ElementRef, ViewChild, signal, OnInit, OnDestroy, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService, ChatMessage, ChatAction } from '../../core/services/chat.service';
import { PlayerService } from '../../core/services/player.service';
import { ApiService } from '../../core/services/api.service';
import { WakeWordService } from '../../core/services/wake-word.service';
import { UnifiedTrack } from '../../core/models/track.model';
import { Subscription } from 'rxjs';

interface DisplayMessage {
  role: 'user' | 'model';
  content: string;
  action?: ChatAction | null;
  actionState?: 'loading' | 'done' | 'error';
  actionTrack?: UnifiedTrack;
}

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Wake word toggle button -->
    <button
      *ngIf="wakeWord.isSupported"
      class="wake-fab"
      id="btn-wake-word"
      (click)="wakeWord.toggle()"
      [class.armed]="wakeWord.isActive()"
      [class.hidden]="isOpen()"
      [title]="wakeWord.isActive() ? 'Wake word ON — say Hey Wavify' : 'Enable Hey Wavify wake word'"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
        <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
      </svg>
      <span class="wake-ring" *ngIf="wakeWord.isActive()"></span>
    </button>

    <!-- Floating chat button -->
    <button class="chat-fab" id="btn-open-chat" (click)="togglePanel()" [class.active]="isOpen()" aria-label="Open AI chat">
      <span class="fab-icon" *ngIf="!isOpen()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
          <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
        </svg>
      </span>
      <span class="fab-icon" *ngIf="isOpen()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </span>
      <span class="fab-label">{{ isOpen() ? '' : 'AI' }}</span>
    </button>

    <!-- Chat Panel -->
    <div class="chat-panel" [class.open]="isOpen()" id="chat-panel">
      <!-- Header -->
      <div class="panel-header">
        <div class="header-left">
          <div class="ai-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            </svg>
          </div>
          <div>
            <span class="panel-title">Wavify AI</span>
            <span class="panel-subtitle">Music Assistant</span>
          </div>
        </div>
        <button class="clear-btn" (click)="clearChat()" id="btn-clear-chat" title="Clear conversation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
          </svg>
        </button>
      </div>

      <!-- Now playing bar -->
      <div class="now-playing-bar" *ngIf="currentTrack()">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px;flex-shrink:0">
          <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
        </svg>
        <span>Listening to <strong>{{ currentTrack()!.title }}</strong></span>
      </div>

      <!-- Messages -->
      <div class="messages-area" #messagesArea>
        <!-- Welcome state -->
        <div class="welcome" *ngIf="messages().length === 0">
          <div class="welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            </svg>
          </div>
          <p class="welcome-title">Wavify AI</p>
          <p class="welcome-sub">Ask me anything about music, or just ask me to play something!</p>
          <div class="suggestions">
            <button class="suggestion-chip" (click)="sendSuggestion('Play something relaxing')" id="chip-relax">🎵 Play something relaxing</button>
            <button class="suggestion-chip" (click)="sendSuggestion('What song is playing?')" id="chip-now">🎧 What\'s playing?</button>
            <button class="suggestion-chip" (click)="sendSuggestion('Play Blinding Lights by The Weeknd')" id="chip-play">▶️ Play a song</button>
            <button class="suggestion-chip" (click)="sendSuggestion('Recommend similar artists')" id="chip-similar">✨ Similar artists</button>
          </div>
        </div>

        <!-- Message bubbles -->
        <div *ngFor="let msg of messages()" class="message-row" [class.user-row]="msg.role === 'user'" [class.ai-row]="msg.role === 'model'">
          <div class="ai-msg-avatar" *ngIf="msg.role === 'model'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            </svg>
          </div>
          <div class="bubble-wrap" [class.user-side]="msg.role === 'user'">
            <div class="bubble" [class.user-bubble]="msg.role === 'user'" [class.ai-bubble]="msg.role === 'model'">
              {{ msg.content }}
            </div>
            <!-- Play action card -->
            <div class="action-card" *ngIf="msg.action?.type === 'play'" [class.done]="msg.actionState === 'done'" [class.error]="msg.actionState === 'error'">
              <div class="action-loading" *ngIf="msg.actionState === 'loading'">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                <span style="font-size:12px;color:var(--text-secondary)">Finding track...</span>
              </div>
              <div class="action-track" *ngIf="msg.actionState === 'done' && msg.actionTrack">
                <img [src]="msg.actionTrack.thumbnailUrl" [alt]="msg.actionTrack.title" class="action-thumb"/>
                <div class="action-info">
                  <span class="action-title">{{ msg.actionTrack.title }}</span>
                  <span class="action-artist">{{ msg.actionTrack.artist }}</span>
                </div>
                <div class="action-playing-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;color:var(--accent-primary)">
                    <path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z"/>
                  </svg>
                </div>
              </div>
              <div class="action-error" *ngIf="msg.actionState === 'error'">
                <span>⚠️ Couldn't find that track. Try searching manually.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Typing indicator -->
        <div class="message-row ai-row" *ngIf="isTyping()">
          <div class="ai-msg-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            </svg>
          </div>
          <div class="bubble ai-bubble typing-bubble">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        </div>
      </div>

      <!-- Input area -->
      <div class="input-area">
        <!-- Voice button -->
        <button class="mic-btn" id="btn-voice" (click)="startVoiceInput()"
                [class.listening]="isListening()"
                [disabled]="isTyping()"
                [title]="voiceSupported ? (isListening() ? 'Listening...' : 'Speak') : 'Voice not supported in this browser'"
                [class.unsupported]="!voiceSupported">
          <svg *ngIf="!isListening()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
            <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
          </svg>
          <span class="listening-ring" *ngIf="isListening()"></span>
        </button>

        <textarea #inputRef class="chat-input" id="chat-input"
                  [(ngModel)]="inputText"
                  placeholder="{{ isListening() ? 'Listening...' : 'Ask about music or say play...' }}"
                  rows="1"
                  (keydown)="onKeyDown($event)"
                  (input)="autoResize($event)"
                  [disabled]="isTyping() || isListening()"></textarea>

        <button class="send-btn" id="btn-send-chat" (click)="send()"
                [disabled]="!inputText.trim() || isTyping()" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* ─── Wake Word FAB ─── */
    .wake-fab {
      position: fixed;
      bottom: calc(var(--player-height) + 78px);
      right: 20px;
      width: 36px; height: 36px;
      border-radius: 12px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: var(--text-tertiary);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; z-index: 301;
      transition: all var(--transition-fast);
      position: fixed;
    }
    .wake-fab:hover { background: rgba(167,139,250,0.15); color: var(--accent-primary); border-color: rgba(167,139,250,0.3); }
    .wake-fab.armed { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.4); color: #ef4444; }
    .wake-fab.hidden { opacity: 0; pointer-events: none; transform: scale(0.8); }
    .wake-fab svg { width: 16px; height: 16px; }
    .wake-ring {
      position: absolute; inset: -5px; border-radius: 17px;
      border: 2px solid #ef4444;
      animation: wake-pulse 2s ease-in-out infinite;
    }
    @keyframes wake-pulse { 0%, 100% { opacity: 0.8; transform: scale(1); } 50% { opacity: 0.2; transform: scale(1.1); } }

    /* ─── FAB ─── */
    .chat-fab {
      position: fixed;
      bottom: calc(var(--player-height) + 16px);
      right: 20px;
      width: 52px; height: 52px;
      border-radius: 16px;
      background: var(--accent-gradient);
      color: white;
      display: flex; align-items: center; justify-content: center;
      gap: 4px; cursor: pointer; z-index: 300;
      box-shadow: 0 4px 20px rgba(167,139,250,0.4), 0 2px 8px rgba(0,0,0,0.4);
      transition: all var(--transition-spring);
      border: none; flex-direction: column;
    }
    .chat-fab:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 8px 32px rgba(167,139,250,0.5); }
    .chat-fab.active { border-radius: 50%; }
    .fab-icon { display: flex; align-items: center; justify-content: center; }
    .fab-icon svg { width: 22px; height: 22px; }
    .fab-label { font-size: 9px; font-weight: 800; letter-spacing: 0.5px; line-height: 1; }

    /* ─── Chat Panel ─── */
    .chat-panel {
      position: fixed;
      bottom: calc(var(--player-height) + 80px);
      right: 20px;
      width: 360px; height: 540px;
      background: rgba(13, 13, 20, 0.96);
      backdrop-filter: blur(40px) saturate(1.8);
      -webkit-backdrop-filter: blur(40px) saturate(1.8);
      border: 1px solid rgba(167,139,250,0.2);
      border-radius: 20px;
      display: flex; flex-direction: column;
      overflow: hidden; z-index: 299;
      box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 60px rgba(167,139,250,0.08);
      transform: translateY(20px) scale(0.95);
      opacity: 0; pointer-events: none;
      transition: all 0.45s cubic-bezier(0.16,1,0.3,1);
    }
    .chat-panel.open { transform: translateY(0) scale(1); opacity: 1; pointer-events: all; }

    /* ─── Header ─── */
    .panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 16px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      background: linear-gradient(135deg, rgba(167,139,250,0.08) 0%, transparent 100%);
      flex-shrink: 0;
    }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .ai-avatar {
      width: 36px; height: 36px; background: var(--accent-gradient);
      border-radius: 10px; display: flex; align-items: center; justify-content: center;
      color: white; box-shadow: 0 0 20px rgba(167,139,250,0.3);
    }
    .ai-avatar svg { width: 18px; height: 18px; }
    .panel-title { display: block; font-size: 14px; font-weight: 700; color: var(--text-primary); }
    .panel-subtitle { display: block; font-size: 11px; color: var(--accent-primary); font-weight: 500; }
    .clear-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: var(--text-tertiary); transition: all var(--transition-fast); }
    .clear-btn:hover { background: rgba(255,255,255,0.06); color: #f87171; }
    .clear-btn svg { width: 16px; height: 16px; }

    /* ─── Now playing bar ─── */
    .now-playing-bar {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 14px;
      background: rgba(167,139,250,0.06);
      border-bottom: 1px solid rgba(167,139,250,0.1);
      font-size: 11px; color: var(--text-accent); flex-shrink: 0;
    }
    .now-playing-bar strong { color: var(--accent-primary); }

    /* ─── Messages ─── */
    .messages-area {
      flex: 1; overflow-y: auto; padding: 16px 14px;
      display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth;
    }

    /* Welcome */
    .welcome { display: flex; flex-direction: column; align-items: center; text-align: center; flex: 1; gap: 10px; padding: 20px; animation: fadeIn 0.4s ease; }
    .welcome-icon { width: 56px; height: 56px; background: var(--accent-gradient); border-radius: 18px; display: flex; align-items: center; justify-content: center; color: white; margin-bottom: 4px; box-shadow: 0 0 40px rgba(167,139,250,0.25); }
    .welcome-icon svg { width: 28px; height: 28px; }
    .welcome-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
    .welcome-sub { font-size: 12px; color: var(--text-secondary); line-height: 1.5; max-width: 260px; }
    .suggestions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 4px; }
    .suggestion-chip { padding: 6px 12px; border-radius: 100px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); color: var(--text-accent); font-size: 11px; font-weight: 500; cursor: pointer; transition: all var(--transition-fast); }
    .suggestion-chip:hover { background: rgba(167,139,250,0.2); border-color: rgba(167,139,250,0.4); transform: translateY(-1px); }

    /* Message rows */
    .message-row { display: flex; align-items: flex-start; gap: 8px; animation: fadeIn 0.25s ease; }
    .user-row { justify-content: flex-end; }
    .ai-row { justify-content: flex-start; }
    .ai-msg-avatar { width: 28px; height: 28px; flex-shrink: 0; background: var(--accent-gradient); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; margin-top: 2px; }
    .ai-msg-avatar svg { width: 14px; height: 14px; }
    .bubble-wrap { display: flex; flex-direction: column; gap: 6px; max-width: 80%; }
    .user-side { align-items: flex-end; }
    .bubble { padding: 10px 14px; border-radius: 16px; font-size: 13px; line-height: 1.5; word-break: break-word; }
    .user-bubble { background: var(--accent-gradient); color: white; border-bottom-right-radius: 4px; }
    .ai-bubble { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); color: var(--text-primary); border-bottom-left-radius: 4px; }

    /* Action card */
    .action-card {
      background: rgba(167,139,250,0.08);
      border: 1px solid rgba(167,139,250,0.2);
      border-radius: 12px; padding: 10px 12px;
      animation: fadeIn 0.3s ease;
    }
    .action-card.done { border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.06); }
    .action-card.error { border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.06); }
    .action-loading { display: flex; align-items: center; gap: 8px; }
    .action-track { display: flex; align-items: center; gap: 10px; }
    .action-thumb { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
    .action-info { flex: 1; min-width: 0; }
    .action-title { display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .action-artist { display: block; font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .action-playing-icon { flex-shrink: 0; animation: pulse 1.5s ease-in-out infinite; }
    .action-error { font-size: 12px; color: #f87171; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    /* Typing indicator */
    .typing-bubble { display: flex; align-items: center; gap: 4px; padding: 12px 16px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-primary); animation: bounce 1.2s ease-in-out infinite; }
    .dot:nth-child(2) { animation-delay: 0.15s; }
    .dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-6px); opacity: 1; } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    /* ─── Input ─── */
    .input-area { display: flex; align-items: flex-end; gap: 6px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(0,0,0,0.2); flex-shrink: 0; }
    .chat-input { flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 10px 12px; font-size: 13px; color: var(--text-primary); resize: none; max-height: 100px; overflow-y: auto; line-height: 1.4; transition: border-color var(--transition-fast); font-family: inherit; }
    .chat-input:focus { outline: none; border-color: rgba(167,139,250,0.4); }
    .chat-input::placeholder { color: var(--text-tertiary); }
    .chat-input:disabled { opacity: 0.5; }

    /* Mic button */
    .mic-btn {
      width: 38px; height: 38px; flex-shrink: 0;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px; color: var(--text-secondary);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all var(--transition-fast);
      position: relative;
    }
    .mic-btn:hover:not(:disabled):not(.unsupported) { background: rgba(167,139,250,0.15); color: var(--accent-primary); border-color: rgba(167,139,250,0.3); }
    .mic-btn.listening { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.4); color: #ef4444; }
    .mic-btn.unsupported { opacity: 0.3; cursor: not-allowed; }
    .mic-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .mic-btn svg { width: 18px; height: 18px; }
    .listening-ring {
      position: absolute; inset: -4px; border-radius: 14px;
      border: 2px solid #ef4444;
      animation: ring-pulse 1s ease-in-out infinite;
    }
    @keyframes ring-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(1.08); } }

    /* Send button */
    .send-btn { width: 38px; height: 38px; flex-shrink: 0; background: var(--accent-gradient); border-radius: 10px; color: white; display: flex; align-items: center; justify-content: center; transition: all var(--transition-fast); }
    .send-btn:hover:not(:disabled) { transform: scale(1.08); box-shadow: 0 4px 16px rgba(167,139,250,0.4); }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .send-btn svg { width: 18px; height: 18px; }

      /* Mobile */
      @media (max-width: 768px) {
        .chat-panel { 
          top: 52px; 
          bottom: 0; 
          left: 0; 
          right: 0; 
          width: auto; 
          height: auto; 
          border-radius: 0; 
          z-index: 1000; 
          border: none;
        }
        .chat-fab { right: 12px; bottom: calc(var(--player-height) + 68px); }
        .wake-fab { right: 12px; bottom: calc(var(--player-height) + 68px); }
      }
    `]
})
export class ChatPanelComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesArea') messagesArea!: ElementRef<HTMLDivElement>;
  @ViewChild('inputRef') inputRef!: ElementRef<HTMLTextAreaElement>;

  isOpen = signal(false);
  isTyping = signal(false);
  isListening = signal(false);
  messages = signal<DisplayMessage[]>([]);
  inputText = '';
  currentTrackSnapshot: UnifiedTrack | null = null;
  voiceSupported = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;

  private shouldScroll = false;
  private trackSub!: Subscription;
  private wakeSub!: Subscription;
  private recognition: any = null;

  constructor(
    private chatService: ChatService,
    private playerService: PlayerService,
    private apiService: ApiService,
    public wakeWord: WakeWordService
  ) {}

  ngOnInit() {
    this.trackSub = this.playerService.currentTrack$.subscribe(t => {
      this.currentTrackSnapshot = t;
    });

    // Auto-open + listen when wake word is detected
    this.wakeSub = this.wakeWord.wakeDetected$.subscribe(() => {
      if (!this.isOpen()) this.isOpen.set(true);
      setTimeout(() => this.startVoiceInput(), 500);
    });
  }

  ngOnDestroy() {
    this.trackSub?.unsubscribe();
    this.wakeSub?.unsubscribe();
    this.recognition?.abort();
    this.wakeWord.stop();
  }

  currentTrack() { return this.currentTrackSnapshot; }

  togglePanel() {
    this.isOpen.update(v => !v);
    if (this.isOpen()) {
      setTimeout(() => this.inputRef?.nativeElement?.focus(), 500);
    }
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  autoResize(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  // ── Voice Input ─────────────────────────────────────────────────────────────
  startVoiceInput() {
    if (!this.voiceSupported || this.isTyping()) return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.isListening.set(true);

    this.recognition.onresult = (event: any) => {
      const transcript: string = event.results[0][0].transcript;
      this.inputText = transcript;
      this.isListening.set(false);
      setTimeout(() => this.send(), 200);
    };

    this.recognition.onerror = () => this.isListening.set(false);
    this.recognition.onend = () => this.isListening.set(false);
    this.recognition.start();
  }

  // ── Send Message ────────────────────────────────────────────────────────────
  send() {
    const text = this.inputText.trim();
    if (!text || this.isTyping()) return;

    const userMsg: DisplayMessage = { role: 'user', content: text };
    this.messages.update(m => [...m, userMsg]);
    this.chatService.addToHistory({ role: 'user', content: text });

    this.inputText = '';
    this.isTyping.set(true);
    this.shouldScroll = true;

    if (this.inputRef?.nativeElement) this.inputRef.nativeElement.style.height = 'auto';

    const track = this.currentTrack();
    this.chatService.sendMessage(text, track?.title, track?.artist).subscribe({
      next: (res) => {
        const aiMsg: DisplayMessage = {
          role: 'model',
          content: res.reply,
          action: res.action,
          actionState: res.action ? 'loading' : undefined
        };
        this.messages.update(m => [...m, aiMsg]);
        this.chatService.addToHistory({ role: 'model', content: res.reply });
        this.isTyping.set(false);
        this.shouldScroll = true;

        if (res.action?.type === 'play') {
          this.handlePlayAction(res.action);
        }
      },
      error: () => {
        const err: DisplayMessage = { role: 'model', content: 'Sorry, something went wrong. Please try again 🎵' };
        this.messages.update(m => [...m, err]);
        this.isTyping.set(false);
        this.shouldScroll = true;
      }
    });
  }

  // ── Play Action ─────────────────────────────────────────────────────────────
  private handlePlayAction(action: { type: string; query: string; source: string }) {
    const source = action.source === 'spotify' ? 'spotify' : 'youtube';

    this.apiService.search(action.query, source).subscribe({
      next: (response) => {
        const tracks = source === 'spotify' ? response.spotifyResults : response.youTubeResults;
        const lastAiIdx = this.findLastAiMessageIndex();

        if (tracks && tracks.length > 0) {
          const track = tracks[0];
          this.playerService.play(track, tracks.slice(0, 10));
          this.updateLastAction('done', track);
        } else {
          this.updateLastAction('error');
        }
      },
      error: () => this.updateLastAction('error')
    });
  }

  private findLastAiMessageIndex(): number {
    const msgs = this.messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'model' && msgs[i].action) return i;
    }
    return -1;
  }

  private updateLastAction(state: 'done' | 'error', track?: UnifiedTrack) {
    this.messages.update(msgs => {
      const copy = [...msgs];
      const idx = copy.map(m => !!(m.role === 'model' && m.action)).lastIndexOf(true);
      if (idx !== -1) {
        copy[idx] = { ...copy[idx], actionState: state, actionTrack: track };
      }
      return copy;
    });
    this.shouldScroll = true;
  }

  sendSuggestion(text: string) { this.inputText = text; this.send(); }

  clearChat() { this.messages.set([]); this.chatService.clearHistory(); }

  ngAfterViewChecked() {
    if (this.shouldScroll && this.messagesArea) {
      this.messagesArea.nativeElement.scrollTop = this.messagesArea.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }
}
