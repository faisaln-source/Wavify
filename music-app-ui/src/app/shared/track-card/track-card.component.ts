import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UnifiedTrack } from '../../core/models/track.model';
import { PlayerService } from '../../core/services/player.service';
import { FavoritesService } from '../../core/services/favorites.service';

@Component({
  selector: 'app-track-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="track-card" (click)="onPlay()" [class.active]="isCurrentTrack()" id="track-{{ track.id }}">
      <div class="track-number" *ngIf="index !== undefined">
        <span class="num" *ngIf="!isCurrentTrack()">{{ index + 1 }}</span>
        <div class="eq-mini" *ngIf="isCurrentTrack()">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="track-thumb">
        <img [src]="track.thumbnailUrl" [alt]="track.title" loading="lazy" />
        <div class="play-overlay">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div class="track-meta">
        <span class="track-title" [class.playing]="isCurrentTrack()">{{ track.title }}</span>
        <span class="track-artist">{{ track.artist }}</span>
      </div>
      <span class="badge" [class.badge-spotify]="track.source === 'spotify'" [class.badge-youtube]="track.source === 'youtube'">
        {{ track.source === 'spotify' ? '♫' : '▶' }} {{ track.source }}
      </span>
      <button class="like-btn" [class.liked]="favorites.isFavorite(track)"
              (click)="toggleLike($event)" [attr.aria-label]="favorites.isFavorite(track) ? 'Unlike' : 'Like'">
        <svg viewBox="0 0 24 24" [attr.fill]="favorites.isFavorite(track) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
      </button>
      <span class="track-duration">{{ playerService.formatDuration(track.durationMs) }}</span>
    </div>
  `,
  styles: [`
    .track-card {
      display: flex; align-items: center; gap: 14px;
      padding: 10px 14px; border-radius: var(--radius-sm);
      cursor: pointer; transition: all var(--transition-fast);
      animation: fadeIn 0.3s ease forwards;
    }
    .track-card:hover { background: var(--bg-card-hover); transform: translateX(4px); }
    .track-card.active { background: rgba(167,139,250,0.08); border-left: 3px solid var(--accent-primary); }

    .track-number { width: 24px; text-align: center; flex-shrink: 0; }
    .num { font-size: 14px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

    .eq-mini { display: flex; align-items: flex-end; justify-content: center; gap: 2px; height: 14px; }
    .eq-mini span { width: 3px; background: var(--accent-primary); border-radius: 1px; animation: equalizer 0.7s ease-in-out infinite; }
    .eq-mini span:nth-child(1) { animation-delay: 0s; }
    .eq-mini span:nth-child(2) { animation-delay: 0.15s; }
    .eq-mini span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes equalizer { 0%, 100% { height: 3px; } 50% { height: 14px; } }

    .track-thumb { width: 48px; height: 48px; border-radius: 6px; overflow: hidden; flex-shrink: 0; position: relative; }
    .track-thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform var(--transition-slow); }
    .track-card:hover .track-thumb img { transform: scale(1.08); }

    .play-overlay {
      position: absolute; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity var(--transition-fast); color: white;
    }
    .play-overlay svg { width: 22px; height: 22px; }
    .track-card:hover .play-overlay { opacity: 1; }

    .track-meta { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .track-title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .track-title.playing { color: var(--accent-primary); }
    .track-artist { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* ── Like button ─────────────────────────────────────────── */
    .like-btn {
      width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: none; border: none; cursor: pointer;
      color: var(--text-tertiary); flex-shrink: 0;
      opacity: 0; transition: all 0.2s ease;
    }
    .track-card:hover .like-btn, .like-btn.liked { opacity: 1; }
    .like-btn svg { width: 16px; height: 16px; transition: all 0.2s; }
    .like-btn:hover { color: #f472b6; background: rgba(244,114,182,0.12); }
    .like-btn.liked { color: #f472b6; }
    .like-btn.liked:hover { color: #e11d48; }
    .like-btn:hover svg { transform: scale(1.2); }

    .badge {
      font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 100px;
      letter-spacing: 0.5px; flex-shrink: 0; text-transform: uppercase;
    }
    .badge-spotify { background: rgba(29,185,84,0.15); color: #1db954; }
    .badge-youtube { background: rgba(255,0,0,0.12); color: #ff4444; }

    .track-duration { font-size: 13px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; flex-shrink: 0; }
  `]
})
export class TrackCardComponent {
  @Input() track!: UnifiedTrack;
  @Input() index?: number;
  @Input() playlist?: UnifiedTrack[];

  constructor(
    public playerService: PlayerService,
    public favorites: FavoritesService
  ) {}

  onPlay() {
    this.playerService.play(this.track, this.playlist);
  }

  toggleLike(event: Event) {
    event.stopPropagation();
    this.favorites.toggle(this.track);
  }

  isCurrentTrack(): boolean {
    let isCurrent = false;
    this.playerService.currentTrack$.subscribe(current => {
      isCurrent = !!current && current.id === this.track.id && current.source === this.track.source;
    }).unsubscribe();
    return isCurrent;
  }
}
