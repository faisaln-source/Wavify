import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerService } from '../../core/services/player.service';
import { FavoritesService } from '../../core/services/favorites.service';

@Component({
  selector: 'app-now-playing-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="playerService.nowPlaying$ | async as open">
      <!-- Backdrop (absorbs swipe-down / tap outside) -->
      <div class="np-overlay" [class.visible]="open" (click)="close()"></div>

      <!-- Modal sheet -->
      <div class="np-modal" [class.open]="open" role="dialog" aria-label="Now Playing">

        <!-- Blurred art background -->
        <ng-container *ngIf="playerService.currentTrack$ | async as track">
          <div class="np-bg-art"
               [style.background-image]="'url(' + track.thumbnailUrl + ')'">
          </div>
          <div class="np-bg-overlay"></div>

          <!-- Handle -->
          <div class="np-handle-wrap" (click)="close()">
            <div class="np-handle"></div>
          </div>

          <!-- Header -->
          <header class="np-header">
            <button class="np-close" (click)="close()" id="btn-np-close" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <span class="np-header-title">Now Playing</span>
            <div class="np-source-badge"
                 [class.spotify]="track.source === 'spotify'"
                 [class.youtube]="track.source === 'youtube'">
              {{ track.source === 'spotify' ? '♫' : '▶' }}
            </div>
          </header>

          <!-- Album Art -->
          <div class="np-art-wrap">
            <div class="np-vinyl-ring" [class.spinning]="playerService.isPlaying$ | async"></div>
            <div class="np-art" [class.spinning]="playerService.isPlaying$ | async">
              <img [src]="track.thumbnailUrl" [alt]="track.title" />
              <div class="np-art-glow" [class.active]="playerService.isPlaying$ | async"></div>
            </div>
          </div>

          <!-- Track Info -->
          <div class="np-info">
            <div class="np-info-text">
              <h2 class="np-title">{{ track.title }}</h2>
              <p class="np-artist">{{ track.artist }}</p>
            </div>
            <button class="np-like"
                    [class.liked]="favorites.isFavorite(track)"
                    (click)="favorites.toggle(track)"
                    id="btn-np-like">
              <svg viewBox="0 0 24 24" [attr.fill]="favorites.isFavorite(track) ? 'currentColor' : 'none'"
                   stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
            </button>
          </div>

          <!-- Progress -->
          <div class="np-progress-section">
            <div class="np-progress-track"
                 (click)="onProgressClick($event)" id="np-progress-bar">
              <div class="np-progress-fill"
                   [style.width.%]="playerService.progress$ | async"></div>
              <div class="np-progress-thumb"
                   [style.left.%]="playerService.progress$ | async"></div>
            </div>
            <div class="np-times">
              <span>{{ formatCurrent() }}</span>
              <span>{{ formatTotal(track) }}</span>
            </div>
          </div>

          <!-- Controls -->
          <div class="np-controls">
            <button class="np-ctrl-btn"
                    [class.active]="playerService.shuffle$ | async"
                    (click)="playerService.toggleShuffle()"
                    id="np-btn-shuffle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 3 21 3 21 8"/>
                <line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/>
                <line x1="15" y1="15" x2="21" y2="21"/>
                <line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
            </button>

            <button class="np-ctrl-btn np-skip" (click)="playerService.playPrevious()" id="np-btn-prev">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>

            <button class="np-play-btn"
                    [class.playing]="playerService.isPlaying$ | async"
                    (click)="playerService.togglePlayPause()"
                    id="np-btn-play">
              <div class="np-btn-ripple"></div>
              <ng-container *ngIf="playerService.isPlaying$ | async; else npPlay">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1"/>
                  <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
              </ng-container>
              <ng-template #npPlay>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z"/>
                </svg>
              </ng-template>
            </button>

            <button class="np-ctrl-btn np-skip" (click)="playerService.playNext()" id="np-btn-next">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 18h2V6h-2zM6 18l8.5-6L6 6z"/>
              </svg>
            </button>

            <button class="np-ctrl-btn"
                    [class.active]="(playerService.repeat$ | async) !== 'off'"
                    (click)="playerService.toggleRepeat()"
                    id="np-btn-repeat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 014-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 01-4 4H3"/>
              </svg>
              <span class="np-repeat-dot"
                    *ngIf="(playerService.repeat$ | async) === 'one'">1</span>
            </button>
          </div>

          <!-- Volume -->
          <div class="np-volume">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="np-vol-icon">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            </svg>
            <div class="np-vol-track" (click)="onVolumeClick($event)" id="np-volume-bar">
              <div class="np-vol-fill"
                   [style.width.%]="playerService.volume$ | async"></div>
              <div class="np-vol-thumb"
                   [style.left.%]="playerService.volume$ | async"></div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="np-vol-icon">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 010 7.07"/>
              <path d="M19.07 4.93a10 10 0 010 14.14"/>
            </svg>
          </div>
        </ng-container>

        <!-- Empty state if no track -->
        <ng-container *ngIf="!(playerService.currentTrack$ | async)">
          <div class="np-handle-wrap" (click)="close()">
            <div class="np-handle"></div>
          </div>
          <div class="np-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            <p>No track selected</p>
          </div>
        </ng-container>
      </div>
    </ng-container>
  `,
  styles: [`
    /* ── Overlay ── */
    .np-overlay {
      position: fixed; inset: 0; z-index: 1900;
      background: rgba(0,0,0,0);
      pointer-events: none;
      transition: background 0.4s ease;
    }
    .np-overlay.visible {
      background: rgba(0,0,0,0.5);
      pointer-events: all;
    }

    /* ── Modal Sheet ── */
    .np-modal {
      position: fixed; left: 0; right: 0; bottom: 0;
      height: 100dvh; /* full viewport height */
      z-index: 2000;
      display: flex; flex-direction: column; align-items: center;
      overflow: hidden;
      transform: translateY(100%);
      transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
      will-change: transform;
    }
    .np-modal.open { transform: translateY(0); }

    /* Blurred art background */
    .np-bg-art {
      position: absolute; inset: -20px;
      background-size: cover; background-position: center;
      filter: blur(40px) saturate(1.8) brightness(0.4);
      transform: scale(1.1);
      z-index: 0;
    }
    .np-bg-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(180deg,
        rgba(10,8,20,0.6) 0%,
        rgba(10,8,20,0.3) 40%,
        rgba(10,8,20,0.85) 80%,
        rgba(10,8,20,0.98) 100%);
      z-index: 1;
    }

    /* Everything on top of the bg */
    .np-handle-wrap, .np-header, .np-art-wrap,
    .np-info, .np-progress-section, .np-controls,
    .np-volume, .np-empty { position: relative; z-index: 2; }

    /* ── Handle ── */
    .np-handle-wrap {
      width: 100%; display: flex; justify-content: center;
      padding: 12px 0 6px; cursor: pointer;
    }
    .np-handle {
      width: 40px; height: 4px; border-radius: 2px;
      background: rgba(255,255,255,0.3);
    }

    /* ── Header ── */
    .np-header {
      width: 100%; display: flex; align-items: center;
      padding: 6px 20px 0; gap: 12px;
    }
    .np-close {
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: rgba(255,255,255,0.7);
      background: rgba(255,255,255,0.08);
      transition: all 0.2s;
    }
    .np-close:hover { background: rgba(255,255,255,0.15); color: white; }
    .np-close svg { width: 20px; height: 20px; }
    .np-header-title {
      flex: 1; text-align: center;
      font-size: 13px; font-weight: 700; letter-spacing: 1.5px;
      text-transform: uppercase; color: rgba(255,255,255,0.6);
    }
    .np-source-badge {
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700;
    }
    .np-source-badge.spotify { background: rgba(29,185,84,0.2); color: #1db954; }
    .np-source-badge.youtube { background: rgba(255,0,0,0.2); color: #ff4444; }

    /* ── Album Art ── */
    .np-art-wrap {
      position: relative; width: 240px; height: 240px;
      margin: 24px auto 28px;
      flex-shrink: 0;
    }
    .np-vinyl-ring {
      position: absolute; inset: -14px; border-radius: 50%;
      border: 14px solid rgba(255,255,255,0.04);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.06);
      transition: opacity 0.4s;
    }
    .np-vinyl-ring.spinning { animation: npSpin 8s linear infinite; }
    .np-art {
      width: 240px; height: 240px; border-radius: 50%;
      overflow: hidden; position: relative;
      box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 4px rgba(255,255,255,0.08);
    }
    .np-art img { width: 100%; height: 100%; object-fit: cover; }
    .np-art.spinning { animation: npSpin 8s linear infinite; }
    .np-art-glow {
      position: absolute; inset: 0; border-radius: 50%;
      opacity: 0; transition: opacity 0.6s;
      box-shadow: inset 0 0 40px rgba(167,139,250,0.3);
    }
    .np-art-glow.active { opacity: 1; }

    @keyframes npSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    /* ── Track Info ── */
    .np-info {
      width: 100%; padding: 0 28px;
      display: flex; align-items: center; gap: 16px;
      margin-bottom: 20px;
    }
    .np-info-text { flex: 1; min-width: 0; }
    .np-title {
      font-size: 22px; font-weight: 800; letter-spacing: -0.5px;
      color: white; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; margin-bottom: 4px;
    }
    .np-artist { font-size: 15px; color: rgba(255,255,255,0.6); font-weight: 500; }
    .np-like {
      width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      color: rgba(255,255,255,0.5); transition: all 0.2s;
    }
    .np-like:hover { color: white; transform: scale(1.1); }
    .np-like.liked { color: #a78bfa; }
    .np-like svg { width: 26px; height: 26px; }

    /* ── Progress ── */
    .np-progress-section { width: 100%; padding: 0 28px; margin-bottom: 20px; }
    .np-progress-track {
      position: relative; height: 4px; border-radius: 2px;
      background: rgba(255,255,255,0.15); cursor: pointer; margin-bottom: 8px;
    }
    .np-progress-track:hover { height: 6px; margin-top: -1px; }
    .np-progress-fill {
      height: 100%; border-radius: 2px;
      background: linear-gradient(90deg, #a78bfa, #7c3aed);
      transition: width 0.5s linear;
    }
    .np-progress-thumb {
      position: absolute; top: 50%; transform: translate(-50%, -50%);
      width: 14px; height: 14px; border-radius: 50%; background: white;
      opacity: 0; transition: opacity 0.2s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .np-progress-track:hover .np-progress-thumb { opacity: 1; }
    .np-times {
      display: flex; justify-content: space-between;
      font-size: 12px; color: rgba(255,255,255,0.45); font-weight: 500;
    }

    /* ── Controls ── */
    .np-controls {
      width: 100%; padding: 0 20px;
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 28px;
    }
    .np-ctrl-btn {
      width: 44px; height: 44px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: rgba(255,255,255,0.55); position: relative;
      transition: all 0.2s;
    }
    .np-ctrl-btn:hover { color: white; background: rgba(255,255,255,0.08); }
    .np-ctrl-btn.active { color: #a78bfa; }
    .np-ctrl-btn svg { width: 20px; height: 20px; }
    .np-skip svg { width: 26px; height: 26px; }
    .np-repeat-dot {
      position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%);
      font-size: 9px; font-weight: 800; color: #a78bfa;
    }

    .np-play-btn {
      width: 70px; height: 70px; border-radius: 50%;
      background: linear-gradient(135deg, #a78bfa, #7c3aed);
      display: flex; align-items: center; justify-content: center;
      color: white; position: relative; overflow: hidden;
      box-shadow: 0 8px 30px rgba(124,58,237,0.5);
      transition: transform 0.15s, box-shadow 0.2s;
    }
    .np-play-btn:active { transform: scale(0.93); }
    .np-play-btn.playing { box-shadow: 0 8px 30px rgba(124,58,237,0.7); }
    .np-play-btn svg { width: 28px; height: 28px; }
    .np-btn-ripple {
      position: absolute; inset: 0; border-radius: 50%;
      background: rgba(255,255,255,0.1);
      opacity: 0; transition: opacity 0.3s;
    }
    .np-play-btn:hover .np-btn-ripple { opacity: 1; }

    /* ── Volume ── */
    .np-volume {
      width: 100%; padding: 0 28px;
      display: flex; align-items: center; gap: 12px;
    }
    .np-vol-icon { width: 18px; height: 18px; color: rgba(255,255,255,0.4); flex-shrink: 0; }
    .np-vol-track {
      flex: 1; height: 4px; border-radius: 2px;
      background: rgba(255,255,255,0.15); cursor: pointer; position: relative;
    }
    .np-vol-track:hover { height: 6px; }
    .np-vol-fill {
      height: 100%; border-radius: 2px;
      background: rgba(255,255,255,0.7);
      transition: width 0.1s;
    }
    .np-vol-thumb {
      position: absolute; top: 50%; transform: translate(-50%, -50%);
      width: 14px; height: 14px; border-radius: 50%; background: white;
      opacity: 0; transition: opacity 0.2s;
    }
    .np-vol-track:hover .np-vol-thumb { opacity: 1; }

    /* ── Empty state ── */
    .np-empty {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; flex: 1; gap: 16px;
      color: rgba(255,255,255,0.3);
    }
    .np-empty svg { width: 64px; height: 64px; }
    .np-empty p { font-size: 15px; }
  `]
})
export class NowPlayingModalComponent {
  private previousVolume = parseInt(localStorage.getItem('wavify_volume') || '50', 10);

  constructor(
    public playerService: PlayerService,
    public favorites: FavoritesService
  ) {}

  @HostListener('document:keydown.escape')
  close() { this.playerService.closeNowPlaying(); }

  onProgressClick(event: MouseEvent) {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    this.playerService.seekTo(pct);
  }

  onVolumeClick(event: MouseEvent) {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    this.playerService.setVolume(pct);
  }

  formatCurrent(): string {
    let result = '0:00';
    this.playerService.progress$.subscribe(p => {
      this.playerService.currentTrack$.subscribe(track => {
        if (track && track.durationMs > 0) {
          result = this.playerService.formatDuration((p / 100) * track.durationMs);
        }
      }).unsubscribe();
    }).unsubscribe();
    return result;
  }

  formatTotal(track: any): string {
    return track?.durationMs > 0
      ? this.playerService.formatDuration(track.durationMs)
      : '--:--';
  }
}
