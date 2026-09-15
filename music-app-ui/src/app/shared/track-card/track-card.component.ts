import { Component, Input, HostListener, HostBinding, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UnifiedTrack } from '../../core/models/track.model';
import { PlayerService } from '../../core/services/player.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { PlaylistsService } from '../../core/services/playlists.service';
import { LocalPlaylist } from '../../core/models/track.model';

@Component({
  selector: 'app-track-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="track-card" (click)="onPlay()" [class.active]="isCurrentTrack()" [class.dropdown-active]="dropdownOpen" id="track-{{ track.id }}">
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

      <!-- Add to Playlist button + dropdown -->
      <div class="playlist-add-wrap" (click)="$event.stopPropagation()">
        <button class="add-btn" [class.open]="dropdownOpen"
                (click)="toggleDropdown($event)"
                [attr.aria-label]="'Add to playlist'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <div class="playlist-dropdown" [class.drop-up]="dropUp" *ngIf="dropdownOpen">
          <div class="dropdown-header">Add to playlist</div>
          <div class="dropdown-empty" *ngIf="(playlists.playlists$ | async)?.length === 0">
            <span>No playlists yet.</span>
            <button class="create-inline-btn" (click)="createAndAdd()">+ Create one</button>
          </div>
          <button class="dropdown-item"
                  *ngFor="let pl of (playlists.playlists$ | async)"
                  (click)="toggleInPlaylist(pl)">
            <span class="dropdown-item-name">{{ pl.name }}</span>
            <svg class="check-icon" *ngIf="playlists.isTrackInPlaylist(pl.id, track)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span class="track-count">{{ pl.tracks.length }}</span>
          </button>
          <div class="dropdown-divider" *ngIf="(playlists.playlists$ | async)?.length! > 0"></div>
          <button class="dropdown-item create-item" (click)="createAndAdd()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New playlist
          </button>
        </div>
      </div>

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
      position: relative;
    }
    .track-card:hover { background: var(--bg-card-hover); transform: translateX(4px); }
    .track-card.active { background: rgba(167,139,250,0.08); border-left: 3px solid var(--accent-primary); }
    .track-card.dropdown-active { z-index: 50; }

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

    /* â”€â”€ Add to Playlist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .playlist-add-wrap { position: relative; flex-shrink: 0; }

    .add-btn {
      width: 30px; height: 30px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: none; border: none; cursor: pointer;
      color: var(--text-tertiary); flex-shrink: 0;
      opacity: 0; transition: all 0.2s ease;
    }
    .track-card:hover .add-btn, .add-btn.open { opacity: 1; }
    .add-btn svg { width: 15px; height: 15px; }
    .add-btn:hover, .add-btn.open { color: var(--accent-primary); background: rgba(139,92,246,0.12); }

    .playlist-dropdown {
      position: absolute; right: 0; top: calc(100% + 6px); z-index: 200;
      background: var(--bg-secondary); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); padding: 6px; min-width: 200px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      transform-origin: top right;
      animation: dropIn 0.15s ease forwards;
    }
    .playlist-dropdown.drop-up {
      top: auto;
      bottom: calc(100% + 6px);
      transform-origin: bottom right;
      animation: dropUpIn 0.15s ease forwards;
    }
    @keyframes dropIn { from { opacity: 0; transform: translateY(-6px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes dropUpIn { from { opacity: 0; transform: translateY(6px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

    .dropdown-header {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 1px; color: var(--text-tertiary); padding: 4px 10px 8px;
    }
    .dropdown-empty { padding: 8px 10px; font-size: 12px; color: var(--text-tertiary); display: flex; flex-direction: column; gap: 6px; }
    .create-inline-btn { background: none; border: none; color: var(--accent-primary); font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; text-align: left; }

    .dropdown-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: var(--radius-sm);
      font-size: 13px; color: var(--text-primary); cursor: pointer;
      width: 100%; background: none; border: none; text-align: left;
      transition: background 0.15s;
    }
    .dropdown-item:hover { background: var(--bg-card-hover); }
    .dropdown-item-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .check-icon { width: 14px; height: 14px; color: var(--accent-primary); flex-shrink: 0; }
    .track-count { font-size: 11px; color: var(--text-tertiary); flex-shrink: 0; }

    .dropdown-divider { height: 1px; background: var(--border-subtle); margin: 4px 0; }
    .create-item { color: var(--accent-primary); font-weight: 500; }
    .create-item svg { width: 14px; height: 14px; }

    /* â”€â”€ Like button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

    /* ── Mobile Track Card ── */
    @media (max-width: 768px) {
      .track-card { gap: 10px; padding: 8px 10px; }
      /* Prevent horizontal overflow from hover transform */
      .track-card:hover { transform: none; }
      /* Hide items that cause width overflow */
      .badge { display: none; }
      .track-duration { display: none; }
      .playlist-add-wrap { display: none; }
      .like-btn { display: none; }
      /* Make track-meta text clamp properly */
      .track-meta { min-width: 0; overflow: hidden; }
      .track-thumb { width: 42px; height: 42px; }
    }
  `]
})
export class TrackCardComponent {
  @Input() track!: UnifiedTrack;
  @Input() index?: number;
  @Input() playlist?: UnifiedTrack[];

  @HostBinding('style.display') display = 'block';
  @HostBinding('style.position') position = 'relative';
  @HostBinding('style.zIndex') get zIndex() {
    return this.dropdownOpen ? 1000 : 1;
  }

  dropdownOpen = false;
  dropUp = false;

  constructor(
    public playerService: PlayerService,
    public favorites: FavoritesService,
    public playlists: PlaylistsService,
    private elRef: ElementRef
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

  toggleDropdown(event: MouseEvent) {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
    if (this.dropdownOpen) {
      // Open upwards if clicked in the bottom 40% of the screen to prevent cutoff
      this.dropUp = event.clientY > (window.innerHeight * 0.6);
    }
  }

  toggleInPlaylist(pl: LocalPlaylist) {
    if (this.playlists.isTrackInPlaylist(pl.id, this.track)) {
      this.playlists.removeTrack(pl.id, this.track.id, this.track.source);
    } else {
      this.playlists.addTrack(pl.id, this.track);
    }
  }

  createAndAdd() {
    const name = prompt('Playlist name:');
    if (name === null) return;
    const pl = this.playlists.createPlaylist(name || 'My Playlist');
    this.playlists.addTrack(pl.id, this.track);
    this.dropdownOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.dropdownOpen && !this.elRef.nativeElement.contains(event.target)) {
      this.dropdownOpen = false;
    }
  }
}
