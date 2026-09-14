import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerService } from '../../core/services/player.service';
import { UnifiedTrack } from '../../core/models/track.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-queue-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="(playerService.queue$ | async)?.length">
      <!-- Toggle Button -->
      <button class="queue-toggle" (click)="toggle()" [class.active]="isOpen"
              title="Queue" id="btn-queue">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6h16M4 10h16M4 14h10M4 18h10"/>
          <circle cx="18" cy="16" r="3"/>
          <path d="M21 16v-5l-3 1.5"/>
        </svg>
        <span class="queue-count">{{ (playerService.queue$ | async)?.length }}</span>
      </button>

      <!-- Backdrop (mobile) -->
      <div class="queue-backdrop" *ngIf="isOpen" (click)="close()"></div>

      <!-- Queue Panel -->
      <div class="queue-content" *ngIf="isOpen">
        <!-- Header -->
        <div class="queue-header">
          <div class="queue-header-left">
            <h3>Queue</h3>
            <span class="track-counter">
              {{ getQueuePosition() }} / {{ (playerService.queue$ | async)?.length }} tracks
            </span>
          </div>
          <button class="close-btn" (click)="close()">✕</button>
        </div>

        <!-- Currently Playing -->
        <div class="current-track-highlight" *ngIf="playerService.currentTrack$ | async as curr">
          <div class="now-playing-label">NOW PLAYING</div>
          <div class="current-row">
            <div class="current-art-wrapper">
              <img [src]="curr.thumbnailUrl" [alt]="curr.title"/>
              <div class="current-equalizer" *ngIf="(playerService.isPlaying$ | async)">
                <span></span><span></span><span></span>
              </div>
            </div>
            <div class="current-info">
              <span class="current-title">{{ curr.title }}</span>
              <span class="current-artist">{{ curr.artist }}</span>
            </div>
            <span class="src-dot" [class.spotify]="curr.source==='spotify'" [class.youtube]="curr.source==='youtube'"></span>
          </div>
        </div>

        <div class="queue-divider"><span>Up Next ({{ getUpNextTracks().length }})</span></div>

        <!-- Full Queue List -->
        <div class="queue-list">
          <div
            class="queue-item"
            *ngFor="let track of (playerService.queue$ | async); let i = index"
            (click)="playTrack(track, $event)"
            [class.active]="isCurrentTrack(track)"
          >
            <span class="queue-idx">
              <svg *ngIf="isCurrentTrack(track)" viewBox="0 0 24 24" fill="currentColor" class="playing-icon">
                <path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z"/>
              </svg>
              <span *ngIf="!isCurrentTrack(track)">{{ i + 1 }}</span>
            </span>
            <div class="queue-thumb">
              <img [src]="track.thumbnailUrl" [alt]="track.title"/>
            </div>
            <div class="queue-meta">
              <span class="queue-title" [class.active-text]="isCurrentTrack(track)">{{ track.title }}</span>
              <span class="queue-artist">{{ track.artist }}</span>
            </div>
            <span class="src-dot" [class.spotify]="track.source==='spotify'" [class.youtube]="track.source==='youtube'"></span>
            <span class="queue-dur">{{ playerService.formatDuration(track.durationMs) }}</span>
          </div>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    /* ── Toggle Button ── */
    .queue-toggle {
      display: none;
    }
    .queue-toggle:hover { color: var(--text-primary); transform: scale(1.08); border-color: var(--accent-primary); }
    .queue-toggle.active { background: var(--accent-gradient); color: white; border-color: transparent; box-shadow: 0 4px 20px rgba(167,139,250,0.4); }
    .queue-toggle svg { width: 20px; height: 20px; }

    .queue-count {
      position: absolute; top: -4px; right: -4px;
      background: var(--accent-primary); color: white;
      font-size: 9px; font-weight: 700;
      width: 18px; height: 18px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Backdrop (mobile) ── */
    .queue-backdrop {
      display: none;
      position: fixed; inset: 0; z-index: 99;
      background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
    }

    /* ── Queue Panel ── */
    .queue-content {
      position: fixed;
      bottom: calc(var(--player-height) + 16px);
      left: calc(var(--sidebar-width) + 12px);
      width: 340px; max-height: 520px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-medium);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg), 0 0 40px rgba(0,0,0,0.4);
      overflow: hidden;
      animation: slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards;
      display: flex; flex-direction: column;
      z-index: 100;
    }

    @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

    /* Header */
    .queue-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }
    .queue-header-left { display: flex; align-items: center; gap: 10px; }
    .queue-header h3 {
      font-size: 15px; font-weight: 700;
      background: var(--accent-gradient);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .track-counter { font-size: 11px; color: var(--text-tertiary); font-weight: 500; }
    .close-btn {
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle);
      color: var(--text-tertiary); font-size: 12px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.15s;
    }
    .close-btn:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }

    /* Currently Playing */
    .current-track-highlight {
      padding: 10px 16px 12px;
      background: rgba(167,139,250,0.06);
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }
    .now-playing-label {
      font-size: 9px; font-weight: 800; letter-spacing: 1.5px;
      color: var(--accent-primary); margin-bottom: 8px;
    }
    .current-row { display: flex; align-items: center; gap: 12px; }
    .current-art-wrapper {
      width: 48px; height: 48px; border-radius: var(--radius-sm);
      overflow: hidden; flex-shrink: 0; position: relative;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
    }
    .current-art-wrapper img { width: 100%; height: 100%; object-fit: cover; }
    .current-equalizer {
      position: absolute; bottom: 3px; right: 3px;
      display: flex; align-items: flex-end; gap: 1.5px; height: 12px;
    }
    .current-equalizer span {
      width: 2.5px; background: var(--accent-primary); border-radius: 1px;
      animation: equalizer 0.8s ease-in-out infinite;
    }
    .current-equalizer span:nth-child(1) { animation-delay: 0s; }
    .current-equalizer span:nth-child(2) { animation-delay: 0.2s; }
    .current-equalizer span:nth-child(3) { animation-delay: 0.1s; }
    @keyframes equalizer { 0%,100% { height: 3px; } 50% { height: 12px; } }

    .current-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .current-title { font-size: 13px; font-weight: 600; color: var(--accent-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .current-artist { font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Divider */
    .queue-divider { padding: 10px 16px 6px; flex-shrink: 0; }
    .queue-divider span { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text-tertiary); }

    /* Queue List */
    .queue-list { flex: 1; overflow-y: auto; padding: 0 6px 10px; }
    .queue-list::-webkit-scrollbar { width: 4px; }
    .queue-list::-webkit-scrollbar-track { background: transparent; }
    .queue-list::-webkit-scrollbar-thumb { background: var(--border-medium); border-radius: 4px; }

    .queue-item {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px; border-radius: var(--radius-sm);
      cursor: pointer; transition: background 0.15s;
    }
    .queue-item:hover { background: var(--bg-card-hover); }
    .queue-item.active { background: rgba(167,139,250,0.1); }

    .queue-idx { width: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
    .playing-icon { width: 12px; height: 12px; color: var(--accent-primary); }

    .queue-thumb { width: 36px; height: 36px; border-radius: 4px; overflow: hidden; flex-shrink: 0; }
    .queue-thumb img { width: 100%; height: 100%; object-fit: cover; }

    .queue-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .queue-title { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .queue-title.active-text { color: var(--accent-primary); }
    .queue-artist { font-size: 10px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .src-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
    .src-dot.spotify { background: var(--accent-spotify); }
    .src-dot.youtube { background: var(--accent-youtube); }

    .queue-dur { font-size: 10px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; flex-shrink: 0; }

    /* ── Mobile ── */
    @media (max-width: 768px) {
      .queue-backdrop { display: block; }

      .queue-content {
        position: fixed;
        bottom: calc(var(--player-height) + 56px);
        left: 0; right: 0;
        width: 100%;
        max-height: 70vh;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        border-left: none; border-right: none; border-bottom: none;
      }
    }
  `]
})
export class QueuePanelComponent implements OnInit, OnDestroy {
  isOpen = false;
  private sub: Subscription | null = null;

  constructor(public playerService: PlayerService) {}

  ngOnInit() {
    // Auto-open when a playlist's Play button is clicked
    this.sub = this.playerService.queueOpenRequest$.subscribe(() => {
      this.isOpen = true;
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
  toggle() { this.isOpen = !this.isOpen; }
  close() { this.isOpen = false; }

  isCurrentTrack(track: UnifiedTrack): boolean {
    let isCurrent = false;
    this.playerService.currentTrack$.subscribe(c => {
      isCurrent = !!c && c.id === track.id && c.source === track.source;
    }).unsubscribe();
    return isCurrent;
  }

  playTrack(track: UnifiedTrack, event: Event) {
    event.stopPropagation();
    let queue: UnifiedTrack[] = [];
    this.playerService.queue$.subscribe(q => queue = q).unsubscribe();
    this.playerService.play(track, queue);
    // Don't close on click so user can queue-browse
  }

  getUpNextTracks(): UnifiedTrack[] {
    let tracks: UnifiedTrack[] = [];
    this.playerService.queue$.subscribe(q => {
      this.playerService.currentTrack$.subscribe(c => {
        if (c) {
          const idx = q.findIndex(t => t.id === c.id && t.source === c.source);
          tracks = idx >= 0 ? q.slice(idx + 1) : q;
        } else tracks = q;
      }).unsubscribe();
    }).unsubscribe();
    return tracks;
  }

  getQueuePosition(): number {
    let pos = 0;
    this.playerService.queue$.subscribe(q => {
      this.playerService.currentTrack$.subscribe(c => {
        if (c) {
          const idx = q.findIndex(t => t.id === c.id && t.source === c.source);
          pos = idx >= 0 ? idx + 1 : 0;
        }
      }).unsubscribe();
    }).unsubscribe();
    return pos;
  }
}
