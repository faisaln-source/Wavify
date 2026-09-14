import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerService } from '../../core/services/player.service';

@Component({
  selector: 'app-player-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="player-bar" *ngIf="playerService.currentTrack$ | async as track; else emptyPlayer" [class.is-playing]="(playerService.isPlaying$ | async)">
      <!-- Ambient glow background -->
      <div class="ambient-glow" [class.active]="(playerService.isPlaying$ | async)"></div>

      <div class="track-info">
        <div class="album-art" [class.spinning]="(playerService.isPlaying$ | async)">
          <div class="vinyl-ring"></div>
          <img [src]="track.thumbnailUrl" [alt]="track.title" />
          <div class="art-glow" [class.active]="(playerService.isPlaying$ | async)"></div>
        </div>
        <div class="track-details">
          <span class="track-title">{{ track.title }}</span>
          <div class="track-sub">
            <span class="track-artist">{{ track.artist }}</span>
            <span class="source-dot" [class.spotify]="track.source === 'spotify'" [class.youtube]="track.source === 'youtube'"></span>
            <span class="badge" [class.badge-spotify]="track.source === 'spotify'" [class.badge-youtube]="track.source === 'youtube'">
              {{ track.source === 'spotify' ? '♫ SPOTIFY' : '▶ YOUTUBE' }}
            </span>
          </div>
        </div>
      </div>

      <div class="player-center">
        <div class="control-buttons">
          <button class="ctrl-btn" (click)="playerService.toggleShuffle()" [class.active]="(playerService.shuffle$ | async)" title="Shuffle" id="btn-shuffle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
          </button>
          <button class="ctrl-btn" (click)="playerService.playPrevious()" title="Previous" id="btn-prev">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button class="play-pause-btn" (click)="playerService.togglePlayPause()" id="btn-play-pause" [class.playing]="(playerService.isPlaying$ | async)">
            <div class="btn-ripple"></div>
            <ng-container *ngIf="(playerService.isPlaying$ | async); else playIcon">
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            </ng-container>
            <ng-template #playIcon>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z"/></svg>
            </ng-template>
          </button>
          <button class="ctrl-btn" (click)="playerService.playNext()" title="Next" id="btn-next">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zM6 18l8.5-6L6 6z"/></svg>
          </button>
          <button class="ctrl-btn" (click)="playerService.toggleRepeat()" [class.active]="(playerService.repeat$ | async) !== 'off'" title="Repeat" id="btn-repeat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
            <span class="repeat-indicator" *ngIf="(playerService.repeat$ | async) === 'one'">1</span>
          </button>
        </div>

        <div class="progress-section">
          <span class="time-display">{{ formatProgress() }}</span>
          <div class="progress-track" (click)="onProgressClick($event)" id="progress-bar">
            <div class="progress-fill" [style.width.%]="(playerService.progress$ | async) || 0">
              <div class="progress-glow"></div>
            </div>
            <div class="progress-thumb" [style.left.%]="(playerService.progress$ | async) || 0"></div>
          </div>
          <span class="time-display">{{ track.durationMs > 0 ? playerService.formatDuration(track.durationMs) : '--:--' }}</span>
        </div>
      </div>

      <div class="player-right">
        <!-- Mini equalizer -->
        <div class="mini-eq" *ngIf="(playerService.isPlaying$ | async)">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="volume-section">
          <button class="ctrl-btn" (click)="toggleMute()" id="btn-volume">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" *ngIf="(playerService.volume$ | async)! > 50"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" *ngIf="(playerService.volume$ | async)! > 0 && (playerService.volume$ | async)! <= 50"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" *ngIf="(playerService.volume$ | async)! === 0"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          </button>
          <div class="volume-track" (click)="onVolumeClick($event)" id="volume-bar">
            <div class="volume-fill" [style.width.%]="(playerService.volume$ | async) || 0"></div>
            <div class="volume-thumb" [style.left.%]="(playerService.volume$ | async) || 0"></div>
          </div>
        </div>
      </div>
    </div>

    <ng-template #emptyPlayer>
      <div class="player-bar empty-state">
        <div class="empty-content">
          <div class="empty-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <span>Select a track to start playing</span>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    .player-bar {
      height: var(--player-height);
      display: grid;
      grid-template-columns: 1fr 2fr 1fr;
      align-items: center;
      padding: 0 24px;
      gap: 20px;
      position: relative;
      overflow: hidden;
      background: var(--bg-glass-strong);
      backdrop-filter: blur(40px) saturate(1.6);
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      transition: all var(--transition-base);
    }

    /* Ambient glow behind player */
    .ambient-glow {
      position: absolute;
      inset: 0;
      opacity: 0;
      transition: opacity 1s ease;
      background: radial-gradient(ellipse at center, rgba(167, 139, 250, 0.06) 0%, transparent 70%);
      pointer-events: none;
    }
    .ambient-glow.active {
      opacity: 1;
    }

    .player-bar.empty-state {
      display: flex;
      justify-content: center;
    }

    .empty-content {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--text-tertiary);
      font-size: 13px;
      font-weight: 500;
    }

    .empty-icon-wrap {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.5;
      animation: float 3s ease-in-out infinite;
    }

    .empty-icon-wrap svg {
      width: 22px;
      height: 22px;
    }

    /* ── Track Info ── */
    .track-info {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
      z-index: 1;
      animation: slideInLeft 0.4s ease forwards;
    }

    .album-art {
      width: 60px;
      height: 60px;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
      flex-shrink: 0;
      box-shadow: var(--shadow-md);
      transition: all var(--transition-slow);
    }

    .album-art.spinning {
      border-radius: 50%;
      animation: vinyl-spin 8s linear infinite;
    }

    .album-art.spinning .vinyl-ring {
      opacity: 1;
    }

    .vinyl-ring {
      position: absolute;
      inset: 0;
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      opacity: 0;
      transition: opacity var(--transition-base);
      pointer-events: none;
      z-index: 2;
    }

    .vinyl-ring::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 10px;
      height: 10px;
      background: var(--bg-primary);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      border: 2px solid rgba(255, 255, 255, 0.15);
    }

    .album-art img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .art-glow {
      position: absolute;
      inset: -4px;
      border-radius: inherit;
      opacity: 0;
      transition: opacity var(--transition-slow);
      background: var(--accent-gradient);
      filter: blur(12px);
      z-index: -1;
    }

    .art-glow.active {
      opacity: 0.5;
      animation: glow-pulse 2.5s ease-in-out infinite;
    }

    .track-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .track-title {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.2px;
    }

    .track-sub {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .track-artist {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .source-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .source-dot.spotify { background: var(--accent-spotify); }
    .source-dot.youtube { background: var(--accent-youtube); }

    /* ── Controls ── */
    .player-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      z-index: 1;
    }

    .control-buttons {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .ctrl-btn {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      color: var(--text-secondary);
      transition: all var(--transition-fast);
      position: relative;
    }

    .ctrl-btn svg {
      width: 16px;
      height: 16px;
    }

    .ctrl-btn:hover {
      color: var(--text-primary);
      transform: scale(1.15);
    }

    .ctrl-btn.active {
      color: var(--accent-primary);
    }

    .ctrl-btn.active::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--accent-primary);
    }

    .repeat-indicator {
      position: absolute;
      font-size: 7px;
      font-weight: 800;
      bottom: 1px;
      right: 1px;
      color: var(--accent-primary);
    }

    /* Play/Pause button */
    .play-pause-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--accent-gradient);
      color: white;
      box-shadow: 0 4px 16px rgba(167, 139, 250, 0.4);
      transition: all var(--transition-spring);
      position: relative;
      overflow: hidden;
    }

    .play-pause-btn svg {
      width: 20px;
      height: 20px;
      position: relative;
      z-index: 1;
    }

    .play-pause-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 28px rgba(167, 139, 250, 0.55);
    }

    .play-pause-btn:active {
      transform: scale(0.95);
    }

    .play-pause-btn.playing {
      animation: pulse-glow 3s ease-in-out infinite;
    }

    .btn-ripple {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
      opacity: 0;
      animation: none;
    }

    .play-pause-btn:active .btn-ripple {
      opacity: 1;
      animation: scaleIn 0.3s ease forwards;
    }

    /* ── Progress Bar ── */
    .progress-section {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      max-width: 620px;
    }

    .time-display {
      font-size: 11px;
      color: var(--text-tertiary);
      min-width: 38px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }

    .progress-track {
      flex: 1;
      height: 4px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      cursor: pointer;
      position: relative;
      transition: height var(--transition-fast);
    }

    .progress-track:hover {
      height: 6px;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent-gradient);
      border-radius: 10px;
      position: relative;
      transition: width 0.15s linear;
    }

    .progress-glow {
      position: absolute;
      right: 0;
      top: -3px;
      width: 20px;
      height: 10px;
      background: var(--accent-primary);
      filter: blur(6px);
      opacity: 0.6;
      border-radius: 50%;
    }

    .progress-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: white;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%) scale(0);
      box-shadow: 0 0 8px rgba(167, 139, 250, 0.5);
      transition: transform var(--transition-spring);
    }

    .progress-track:hover .progress-thumb {
      transform: translate(-50%, -50%) scale(1);
    }

    /* ── Right Section ── */
    .player-right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
      z-index: 1;
    }

    .mini-eq {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 20px;
    }

    .mini-eq span {
      width: 3px;
      background: var(--accent-primary);
      border-radius: 2px;
      animation: equalizer 1.2s ease-in-out infinite;
      opacity: 0.7;
    }

    .mini-eq span:nth-child(1) { animation-delay: 0s; }
    .mini-eq span:nth-child(2) { animation-delay: 0.15s; }
    .mini-eq span:nth-child(3) { animation-delay: 0.3s; }
    .mini-eq span:nth-child(4) { animation-delay: 0.45s; }
    .mini-eq span:nth-child(5) { animation-delay: 0.1s; }

    .volume-section {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .volume-track {
      width: 100px;
      height: 4px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      cursor: pointer;
      position: relative;
      transition: height var(--transition-fast);
    }

    .volume-track:hover {
      height: 6px;
    }

    .volume-fill {
      height: 100%;
      background: var(--text-secondary);
      border-radius: 10px;
      transition: background var(--transition-fast);
    }

    .volume-track:hover .volume-fill {
      background: var(--accent-primary);
    }

    .volume-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: white;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%) scale(0);
      transition: transform var(--transition-spring);
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
    }

    .volume-track:hover .volume-thumb {
      transform: translate(-50%, -50%) scale(1);
    }

    /* ── Mobile Player Bar ── */
    @media (max-width: 768px) {
      .player-bar {
        grid-template-columns: 1fr auto auto;
        padding: 0 12px;
        gap: 10px;
        height: 100%;
      }

      /* Hide shuffle & repeat on mobile */
      #btn-shuffle, #btn-repeat { display: none; }

      /* Hide progress time labels */
      .time-display { display: none; }

      /* Hide equalizer and volume bar — use only the volume button */
      .mini-eq { display: none; }
      .volume-track { display: none; }

      /* Make progress bar full width below track info on mobile */
      .player-center { gap: 4px; }
      .control-buttons { gap: 12px; }
      .play-pause-btn { width: 38px; height: 38px; }
      .play-pause-btn svg { width: 17px; height: 17px; }

      .album-art { width: 44px; height: 44px; border-radius: 6px; }
      .album-art.spinning { border-radius: 50%; }

      .track-title { font-size: 13px; }
      .track-artist { font-size: 11px; }

      /* Hide source badge on mobile to save space */
      .source-dot, .badge { display: none; }
    }
  `]
})
export class PlayerBarComponent {
  private previousVolume = 80;

  constructor(public playerService: PlayerService) {}

  onProgressClick(event: MouseEvent) {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    this.playerService.seekTo(Math.max(0, Math.min(100, percent)));
  }

  onVolumeClick(event: MouseEvent) {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    this.playerService.setVolume(Math.max(0, Math.min(100, percent)));
  }

  toggleMute() {
    this.playerService.volume$.subscribe(v => {
      if (v > 0) {
        this.previousVolume = v;
        this.playerService.setVolume(0);
      } else {
        this.playerService.setVolume(this.previousVolume);
      }
    }).unsubscribe();
  }

  formatProgress(): string {
    let result = '0:00';
    this.playerService.progress$.subscribe(p => {
      this.playerService.currentTrack$.subscribe(track => {
        if (track && track.durationMs > 0) {
          const currentMs = (p / 100) * track.durationMs;
          result = this.playerService.formatDuration(currentMs);
        }
      }).unsubscribe();
    }).unsubscribe();
    return result;
  }
}
