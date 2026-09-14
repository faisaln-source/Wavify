import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TrackCardComponent } from '../../shared/track-card/track-card.component';
import { ApiService } from '../../core/services/api.service';
import { PlayerService } from '../../core/services/player.service';
import { UnifiedTrack, SearchResponse, PlaylistInfo } from '../../core/models/track.model';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, forkJoin } from 'rxjs';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule, TrackCardComponent],
  template: `
    <div class="search-page">
      <header class="search-header">
        <h1>Search</h1>
        <div class="search-bar glass" id="search-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder="Search songs, artists, playlists..."
            [(ngModel)]="query"
            (ngModelChange)="onSearch($event)"
            id="search-input"
          />
          <button class="clear-btn" *ngIf="query" (click)="clearSearch()" id="btn-clear-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="filter-tabs" *ngIf="hasResults()">
          <button class="tab" [class.active]="activeTab === 'all'" (click)="activeTab = 'all'" id="tab-all">All</button>
          <button class="tab" [class.active]="activeTab === 'spotify'" (click)="activeTab = 'spotify'" id="tab-spotify">
            <span class="tab-dot spotify"></span> Spotify
          </button>
          <button class="tab" [class.active]="activeTab === 'youtube'" (click)="activeTab = 'youtube'" id="tab-youtube">
            <span class="tab-dot youtube"></span> YouTube
          </button>
          <button class="tab" [class.active]="activeTab === 'playlists'" (click)="activeTab = 'playlists'" id="tab-playlists" *ngIf="playlists.length > 0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="tab-icon"><path d="M4 6h16M4 10h16M4 14h10"/><circle cx="18" cy="16" r="3"/></svg>
            Playlists <span class="tab-count">({{ playlists.length }})</span>
          </button>
        </div>
      </header>

      <div class="search-results" *ngIf="hasResults()">
        <!-- Spotify Results -->
        <section *ngIf="(activeTab === 'all' || activeTab === 'spotify') && results.spotifyResults.length > 0">
          <div class="section-header" *ngIf="activeTab === 'all'">
            <h2>Spotify <span class="result-count">({{ results.spotifyResults.length }})</span></h2>
          </div>
          <div class="track-list">
            <app-track-card
              *ngFor="let track of getSpotifyResults(); let i = index"
              [track]="track"
              [index]="i"
              [playlist]="results.spotifyResults"
            ></app-track-card>
          </div>
        </section>

        <!-- YouTube Results -->
        <section *ngIf="(activeTab === 'all' || activeTab === 'youtube') && results.youTubeResults.length > 0">
          <div class="section-header" *ngIf="activeTab === 'all'">
            <h2>YouTube <span class="result-count">({{ results.youTubeResults.length }})</span></h2>
          </div>
          <div class="track-list">
            <app-track-card
              *ngFor="let track of getYouTubeResults(); let i = index"
              [track]="track"
              [index]="i"
              [playlist]="results.youTubeResults"
            ></app-track-card>
          </div>
        </section>

        <!-- Playlists Section -->
        <section *ngIf="(activeTab === 'all' || activeTab === 'playlists') && playlists.length > 0">
          <div class="section-header" *ngIf="activeTab === 'all'">
            <h2>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:20px;height:20px"><path d="M4 6h16M4 10h16M4 14h10"/><circle cx="18" cy="16" r="3"/></svg>
              Playlists <span class="result-count">({{ playlists.length }})</span>
            </h2>
          </div>
          <div class="playlist-grid">
            <div class="playlist-card" *ngFor="let pl of playlists" [class.expanded]="expandedPlaylist === pl.playlistId">
              <div class="playlist-header" (click)="togglePlaylist(pl)">
                <div class="playlist-thumb">
                  <img [src]="pl.thumbnailUrl" [alt]="pl.title" />
                  <div class="playlist-play-overlay">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div class="playlist-info">
                  <span class="playlist-title">{{ pl.title }}</span>
                  <span class="playlist-channel">{{ pl.channelTitle }}</span>
                  <span class="playlist-desc" *ngIf="pl.description">{{ pl.description }}</span>
                </div>
                <div class="playlist-actions">
                  <button class="playlist-play-all-btn" (click)="playAllPlaylist(pl, $event)" title="Play All" *ngIf="playlistTracks[pl.playlistId]?.length">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                  <div class="expand-icon" [class.rotated]="expandedPlaylist === pl.playlistId">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
              </div>

              <!-- Expanded Playlist Tracks -->
              <div class="playlist-tracks" *ngIf="expandedPlaylist === pl.playlistId">
                <div class="playlist-loading" *ngIf="loadingPlaylistId === pl.playlistId">
                  <div class="mini-spinner"></div>
                  <span>Loading tracks...</span>
                </div>
                <div class="playlist-track-list" *ngIf="playlistTracks[pl.playlistId]?.length">
                  <div class="playlist-track-count">
                    {{ playlistTracks[pl.playlistId].length }} tracks
                  </div>
                  <app-track-card
                    *ngFor="let track of playlistTracks[pl.playlistId]; let i = index"
                    [track]="track"
                    [index]="i"
                    [playlist]="playlistTracks[pl.playlistId]"
                  ></app-track-card>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="empty-state" *ngIf="!hasResults() && !loading && searched">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <h3>No results found</h3>
        <p>Try a different search term</p>
      </div>

      <div class="empty-state" *ngIf="!searched && !loading">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <h3>Search for music</h3>
        <p>Find songs and playlists from Spotify and YouTube</p>
      </div>

      <div class="loading" *ngIf="loading">
        <div class="spinner"></div>
        <span>Searching...</span>
      </div>
    </div>
  `,
  styles: [`
    .search-page {
      padding: 24px 28px;
      padding-bottom: 120px;
      height: 100%;
      overflow-y: auto;
    }

    .search-header { margin-bottom: 24px; }

    .search-header h1 {
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 16px;
    }

    .search-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 18px;
      border-radius: 100px;
      margin-bottom: 16px;
    }

    .search-bar svg {
      width: 20px;
      height: 20px;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .search-bar input {
      flex: 1;
      font-size: 15px;
      color: var(--text-primary);
    }

    .search-bar input::placeholder { color: var(--text-tertiary); }

    .clear-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      color: var(--text-tertiary);
      transition: all var(--transition-fast);
    }

    .clear-btn:hover {
      background: var(--bg-card-hover);
      color: var(--text-primary);
    }

    .clear-btn svg { width: 16px; height: 16px; }

    .filter-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 18px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      transition: all var(--transition-fast);
    }

    .tab:hover {
      background: var(--bg-card-hover);
      color: var(--text-primary);
    }

    .tab.active {
      background: rgba(167, 139, 250, 0.15);
      color: var(--accent-primary);
      border-color: rgba(167, 139, 250, 0.3);
    }

    .tab-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .tab-dot.spotify { background: var(--accent-spotify); }
    .tab-dot.youtube { background: var(--accent-youtube); }

    .tab-icon { width: 14px; height: 14px; }
    .tab-count { opacity: 0.6; font-size: 12px; }

    .search-results section { margin-bottom: 24px; }

    .section-header { margin-bottom: 12px; }

    .section-header h2 {
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .result-count {
      font-size: 14px;
      color: var(--text-tertiary);
      font-weight: 400;
    }

    .track-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    /* ── Playlist Cards ── */
    .playlist-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .playlist-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;
      transition: all var(--transition-base);
      animation: fadeIn 0.4s ease forwards;
    }

    .playlist-card:hover {
      border-color: var(--border-medium);
    }

    .playlist-card.expanded {
      border-color: rgba(167, 139, 250, 0.2);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .playlist-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .playlist-header:hover {
      background: var(--bg-card-hover);
    }

    .playlist-thumb {
      width: 64px;
      height: 64px;
      border-radius: var(--radius-sm);
      overflow: hidden;
      flex-shrink: 0;
      position: relative;
    }

    .playlist-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .playlist-play-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity var(--transition-fast);
      color: white;
    }

    .playlist-play-overlay svg { width: 24px; height: 24px; }

    .playlist-header:hover .playlist-play-overlay { opacity: 1; }

    .playlist-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .playlist-title {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .playlist-channel {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .playlist-desc {
      font-size: 11px;
      color: var(--text-tertiary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 400px;
    }

    .playlist-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .playlist-play-all-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--accent-gradient);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      transition: all var(--transition-fast);
      box-shadow: 0 2px 10px rgba(167, 139, 250, 0.3);
    }

    .playlist-play-all-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 16px rgba(167, 139, 250, 0.5);
    }

    .playlist-play-all-btn svg { width: 16px; height: 16px; }

    .expand-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-tertiary);
      transition: transform var(--transition-base);
    }

    .expand-icon svg { width: 16px; height: 16px; }
    .expand-icon.rotated { transform: rotate(180deg); }

    /* Expanded Tracks */
    .playlist-tracks {
      border-top: 1px solid var(--border-subtle);
      padding: 8px 8px 12px;
      background: rgba(0, 0, 0, 0.15);
      max-height: 400px;
      overflow-y: auto;
    }

    .playlist-track-count {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 4px 10px 8px;
    }

    .playlist-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px;
      color: var(--text-tertiary);
      font-size: 13px;
    }

    .mini-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid var(--border-medium);
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Empty & Loading */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      text-align: center;
    }

    .empty-state svg {
      width: 64px;
      height: 64px;
      color: var(--text-tertiary);
      margin-bottom: 16px;
      opacity: 0.4;
    }

    .empty-state h3 { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
    .empty-state p { font-size: 14px; color: var(--text-secondary); }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px;
      color: var(--text-tertiary);
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--border-medium);
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  `]
})
export class SearchComponent {
  query = '';
  results: SearchResponse = { query: '', spotifyResults: [], youTubeResults: [] };
  playlists: PlaylistInfo[] = [];
  playlistTracks: { [playlistId: string]: UnifiedTrack[] } = {};
  expandedPlaylist: string | null = null;
  loadingPlaylistId: string | null = null;
  activeTab: 'all' | 'spotify' | 'youtube' | 'playlists' = 'all';
  loading = false;
  searched = false;

  private searchSubject = new Subject<string>();

  constructor(
    private apiService: ApiService,
    public playerService: PlayerService
  ) {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query.trim()) {
          this.searched = false;
          this.playlists = [];
          this.playlistTracks = {};
          this.expandedPlaylist = null;
          return of(null);
        }
        this.loading = true;
        this.searched = true;
        // Search both tracks and playlists in parallel
        return forkJoin({
          tracks: this.apiService.search(query),
          playlists: this.apiService.searchPlaylists(query)
        });
      })
    ).subscribe({
      next: (res) => {
        if (res) {
          this.results = res.tracks;
          this.playlists = res.playlists;
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onSearch(query: string) {
    this.searchSubject.next(query);
  }

  clearSearch() {
    this.query = '';
    this.results = { query: '', spotifyResults: [], youTubeResults: [] };
    this.playlists = [];
    this.playlistTracks = {};
    this.expandedPlaylist = null;
    this.searched = false;
  }

  hasResults(): boolean {
    return this.results.spotifyResults.length > 0 ||
           this.results.youTubeResults.length > 0 ||
           this.playlists.length > 0;
  }

  getSpotifyResults(): UnifiedTrack[] {
    return this.activeTab === 'youtube' || this.activeTab === 'playlists' ? [] : this.results.spotifyResults;
  }

  getYouTubeResults(): UnifiedTrack[] {
    return this.activeTab === 'spotify' || this.activeTab === 'playlists' ? [] : this.results.youTubeResults;
  }

  togglePlaylist(pl: PlaylistInfo) {
    if (this.expandedPlaylist === pl.playlistId) {
      this.expandedPlaylist = null;
      return;
    }

    this.expandedPlaylist = pl.playlistId;

    // Fetch playlist items if not already loaded
    if (!this.playlistTracks[pl.playlistId]) {
      this.loadingPlaylistId = pl.playlistId;
      this.apiService.getPlaylistItems(pl.playlistId).subscribe({
        next: (tracks) => {
          this.playlistTracks[pl.playlistId] = tracks;
          this.loadingPlaylistId = null;
        },
        error: () => {
          this.loadingPlaylistId = null;
        }
      });
    }
  }

  playAllPlaylist(pl: PlaylistInfo, event: Event) {
    event.stopPropagation();
    const tracks = this.playlistTracks[pl.playlistId];
    if (tracks && tracks.length > 0) {
      this.playerService.play(tracks[0], tracks);
    }
  }
}
