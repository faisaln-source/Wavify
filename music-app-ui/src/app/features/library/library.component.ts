import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrackCardComponent } from '../../shared/track-card/track-card.component';
import { PlayerService } from '../../core/services/player.service';
import { ApiService } from '../../core/services/api.service';
import { SpotifyAuthService } from '../../core/services/spotify-auth.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { UnifiedTrack, SpotifyPlaylist } from '../../core/models/track.model';
import { firstValueFrom, Subscription } from 'rxjs';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [CommonModule, TrackCardComponent],
  template: `
    <div class="library-page">
      <header class="page-header">
        <h1>Your Library</h1>
        <p>Your favorites, recently played, and Spotify playlists</p>
      </header>

      <div class="library-tabs">
        <button class="tab" [class.active]="activeTab === 'recent'" (click)="activeTab = 'recent'" id="tab-recent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Recently Played
        </button>
        <button class="tab" [class.active]="activeTab === 'playlists'" (click)="switchToPlaylists()" id="tab-playlists">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 17H5a2 2 0 00-2 2"/><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v14"/><circle cx="16" cy="17" r="3"/><path d="M19 4v10"/></svg>
          Spotify Playlists
        </button>
        <button class="tab" [class.active]="activeTab === 'favorites'" (click)="activeTab = 'favorites'" id="tab-favorites">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          Favorites
        </button>
      </div>

      <!-- Recently Played -->
      <div class="library-content" *ngIf="activeTab === 'recent'">
        <div class="track-list" *ngIf="recentTracks.length > 0">
          <app-track-card
            *ngFor="let track of recentTracks; let i = index"
            [track]="track"
            [index]="i"
            [playlist]="recentTracks"
          ></app-track-card>
        </div>
        <div class="empty-state" *ngIf="recentTracks.length === 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <h3>No recent tracks</h3>
          <p>Start playing music to see your history here</p>
        </div>
      </div>

      <!-- Spotify Playlists -->
      <div class="library-content" *ngIf="activeTab === 'playlists'">
        <!-- Not logged in -->
        <div class="empty-state" *ngIf="!isSpotifyConnected">
          <svg viewBox="0 0 24 24" fill="currentColor" style="color:#1db954;opacity:0.5"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          <h3>Connect Spotify</h3>
          <p>Connect your Spotify account to see your playlists here</p>
        </div>

        <!-- Loading playlists -->
        <div class="loading-state" *ngIf="isSpotifyConnected && loadingPlaylists && !selectedPlaylist">
          <div class="spinner-ring"></div>
          <p>Loading your playlists…</p>
        </div>

        <!-- Playlists grid -->
        <ng-container *ngIf="isSpotifyConnected && !loadingPlaylists && !selectedPlaylist">
          <div class="empty-state" *ngIf="playlists.length === 0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 17H5a2 2 0 00-2 2"/><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v14"/><circle cx="16" cy="17" r="3"/><path d="M19 4v10"/></svg>
            <h3>No playlists found</h3>
            <p>Create a playlist in Spotify to see it here</p>
          </div>
          <div class="playlists-grid" *ngIf="playlists.length > 0 || likedTracks.length > 0">
            <!-- Special: Liked Songs card -->
            <div class="playlist-card liked-songs-card" *ngIf="likedTracks.length > 0" (click)="openLikedSongs()">
              <div class="playlist-art liked-songs-art">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                <div class="playlist-play-overlay">
                  <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                </div>
              </div>
              <div class="playlist-meta">
                <span class="playlist-name">Liked Songs</span>
                <span class="playlist-info">{{ likedTracks.length }} tracks</span>
              </div>
            </div>
            <!-- User playlists -->
            <div class="playlist-card" *ngFor="let pl of playlists" (click)="openPlaylist(pl)">
              <div class="playlist-art">
                <img *ngIf="pl.imageUrl" [src]="pl.imageUrl" [alt]="pl.name" loading="lazy"/>
                <div *ngIf="!pl.imageUrl" class="playlist-art-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="playlist-play-overlay">
                  <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                </div>
              </div>
              <div class="playlist-meta">
                <span class="playlist-name">{{ pl.name }}</span>
                <span class="playlist-info">{{ pl.owner }}</span>
              </div>
            </div>
          </div>
        </ng-container>

        <!-- Playlist detail (track list) -->
          <ng-container *ngIf="isSpotifyConnected && (selectedPlaylist || isLikedSongsView)">
            <div class="playlist-header">
              <button class="back-btn" (click)="clearSelectedPlaylist()" id="btn-back-playlists">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                All Playlists
              </button>
            <div class="playlist-header-info">
              <div class="playlist-header-art liked-songs-art-lg" *ngIf="isLikedSongsView">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              </div>
              <img *ngIf="!isLikedSongsView && selectedPlaylist?.imageUrl" [src]="selectedPlaylist!.imageUrl" [alt]="selectedPlaylist!.name" class="playlist-header-art"/>
              <div class="playlist-header-text">
                <h2>{{ isLikedSongsView ? 'Liked Songs' : selectedPlaylist?.name }}</h2>
                <p>{{ isLikedSongsView ? (likedTracks.length + ' tracks') : selectedPlaylist?.owner }}</p>
              </div>
              <!-- Liked songs: Play All --- Regular playlist: Play  --->
              <button class="play-all-btn" (click)="playAll()" *ngIf="isLikedSongsView" [disabled]="playlistTracks.length === 0" id="btn-play-all-playlist">
                <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Play All
              </button>
              <button class="play-all-btn" (click)="playPlaylistContext()" *ngIf="!isLikedSongsView" id="btn-play-playlist-context">
                <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Play 
              </button>
            </div>
          </div>

          <div class="loading-state" *ngIf="loadingTracks">
            <div class="spinner-ring"></div>
            <p>Loading tracks…</p>
          </div>

          <!-- Track list: shows for both liked songs and regular playlists when tracks loaded -->
          <div class="track-list" *ngIf="!loadingTracks && playlistTracks.length > 0">
            <app-track-card
              *ngFor="let track of playlistTracks; let i = index"
              [track]="track"
              [index]="i"
              [playlist]="playlistTracks"
            ></app-track-card>
          </div>
          <!-- For regular playlists with no tracks: show context play CTA -->
          <div class="playlist-context-cta" *ngIf="!loadingTracks && playlistTracks.length === 0 && !isLikedSongsView">
            <div class="cta-icon">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            </div>
            <h3>Ready to Play</h3>
            <p>Click "Play " above to start this playlist in the Wavify player</p>
          </div>
        </ng-container>
      </div>

      <!-- Favorites -->
      <div class="library-content" *ngIf="activeTab === 'favorites'">
        <div class="track-list" *ngIf="favoriteTracks.length > 0">
          <app-track-card
            *ngFor="let track of favoriteTracks; let i = index"
            [track]="track"
            [index]="i"
            [playlist]="favoriteTracks"
          ></app-track-card>
        </div>
        <div class="empty-state" *ngIf="favoriteTracks.length === 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <h3>No favorites yet</h3>
          <p>Click the ♡ heart on any track to save it here</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .library-page { padding: 28px 32px; padding-bottom: 120px; height: 100%; overflow-y: auto; }

    .page-header { margin-bottom: 24px; }
    .page-header h1 { font-size: 28px; font-weight: 800; margin-bottom: 6px; }
    .page-header p { color: var(--text-secondary); font-size: 15px; }

    .library-tabs { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }

    .tab {
      display: flex; align-items: center; gap: 8px; padding: 10px 20px;
      border-radius: 100px; font-size: 14px; font-weight: 500;
      color: var(--text-secondary); background: var(--bg-card);
      border: 1px solid var(--border-subtle); transition: all var(--transition-fast);
    }
    .tab svg { width: 16px; height: 16px; }
    .tab:hover { background: var(--bg-card-hover); color: var(--text-primary); }
    .tab.active { background: rgba(139,92,246,0.15); color: var(--accent-primary); border-color: rgba(139,92,246,0.3); }

    .track-list { display: flex; flex-direction: column; gap: 2px; }

    /* ── Playlists Grid ─────────────────────────────────────────── */
    .playlists-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px;
    }

    .playlist-card {
      background: var(--bg-card); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); overflow: hidden;
      cursor: pointer; transition: all 0.2s ease;
    }
    .playlist-card:hover { transform: translateY(-4px); border-color: rgba(139,92,246,0.4); background: var(--bg-card-hover); }
    .playlist-card:hover .playlist-play-overlay { opacity: 1; transform: scale(1); }

    .playlist-art {
      position: relative; aspect-ratio: 1; overflow: hidden;
      background: rgba(139,92,246,0.08);
    }
    .playlist-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .playlist-art-placeholder {
      width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
      color: var(--text-tertiary);
    }
    .playlist-art-placeholder svg { width: 40px; height: 40px; }

    .playlist-play-overlay {
      position: absolute; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: all 0.2s ease;
    }
    .playlist-play-overlay svg { width: 36px; height: 36px; color: white; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); }

    .playlist-meta { padding: 12px; }
    .playlist-name { display: block; font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
    .playlist-info { font-size: 11px; color: var(--text-tertiary); }

    .liked-songs-art {
      background: linear-gradient(135deg, #c026d3, #7c3aed, #2563eb) !important;
      display: flex; align-items: center; justify-content: center;
    }
    .liked-songs-art svg { width: 44px; height: 44px; color: white; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4)); }
    .liked-songs-art-lg {
      width: 80px; height: 80px; border-radius: var(--radius-md); flex-shrink: 0;
      background: linear-gradient(135deg, #c026d3, #7c3aed, #2563eb);
      display: flex; align-items: center; justify-content: center;
    }
    .liked-songs-art-lg svg { width: 36px; height: 36px; color: white; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.3)); }

    /* ── Playlist Context Play CTA ─────────────────────────────── */
    .playlist-context-cta {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 60px 20px; text-align: center;
      gap: 12px;
    }
    .cta-icon svg { width: 64px; height: 64px; fill: #1db954; opacity: 0.7; }
    .playlist-context-cta h3 { font-size: 20px; font-weight: 700; margin: 0; }
    .playlist-context-cta p { font-size: 14px; color: var(--text-secondary); margin: 0; max-width: 320px; }

    /* ── Playlist Header ───────────────────────────────────────── */
    .playlist-header { margin-bottom: 24px; }

    .back-btn {
      display: flex; align-items: center; gap: 6px; padding: 8px 14px;
      border-radius: 100px; font-size: 13px; font-weight: 500;
      color: var(--text-secondary); background: var(--bg-card);
      border: 1px solid var(--border-subtle); cursor: pointer;
      transition: all 0.2s; margin-bottom: 20px;
    }
    .back-btn svg { width: 16px; height: 16px; }
    .back-btn:hover { color: var(--text-primary); background: var(--bg-card-hover); }

    .playlist-header-info {
      display: flex; align-items: center; gap: 20px;
      background: var(--bg-card); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg); padding: 20px;
    }

    .playlist-header-art {
      width: 80px; height: 80px; border-radius: var(--radius-md); object-fit: cover; flex-shrink: 0;
    }

    .playlist-header-text { flex: 1; min-width: 0; }
    .playlist-header-text h2 { font-size: 22px; font-weight: 800; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .playlist-header-text p { font-size: 13px; color: var(--text-secondary); }

    .play-all-btn {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 24px; border-radius: 100px;
      background: var(--accent-gradient); color: white;
      font-size: 14px; font-weight: 700; cursor: pointer;
      border: none; transition: all 0.2s; flex-shrink: 0;
    }
    .play-all-btn svg { width: 16px; height: 16px; }
    .play-all-btn:hover { opacity: 0.9; transform: scale(1.03); }
    .play-all-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    /* ── Loading / Empty ───────────────────────────────────────── */
    .loading-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 80px 20px; gap: 16px;
      color: var(--text-secondary); font-size: 14px;
    }
    .spinner-ring {
      width: 40px; height: 40px;
      border: 3px solid rgba(167,139,250,0.2);
      border-top-color: var(--accent-primary);
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 80px 20px; text-align: center;
    }
    .empty-state svg { width: 64px; height: 64px; color: var(--text-tertiary); margin-bottom: 16px; opacity: 0.4; }
    .empty-state h3 { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
    .empty-state p { font-size: 14px; color: var(--text-secondary); }

    /* ── Mobile ── */
    @media (max-width: 768px) {
      .library-page { padding: 14px 14px; padding-bottom: 20px; }

      .page-header h1 { font-size: 22px; }
      .page-header p { font-size: 13px; }

      .library-tabs { gap: 6px; margin-bottom: 16px; }
      .tab { padding: 8px 14px; font-size: 13px; gap: 6px; }
      .tab svg { width: 14px; height: 14px; }

      .playlists-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }

      /* Playlist detail header stacks vertically */
      .playlist-header { flex-direction: column; align-items: flex-start; gap: 12px; }
      .playlist-header-img { width: 64px; height: 64px; }
      .playlist-header-text h2 { font-size: 18px; }
      .play-all-btn { width: 100%; justify-content: center; }
    }
  `]
})
export class LibraryComponent implements OnInit, OnDestroy {
  activeTab: 'recent' | 'playlists' | 'favorites' = 'recent';
  recentTracks: UnifiedTrack[] = [];

  // Spotify playlists state
  isSpotifyConnected = false;
  playlists: SpotifyPlaylist[] = [];
  loadingPlaylists = false;
  selectedPlaylist: SpotifyPlaylist | null = null;
  playlistTracks: UnifiedTrack[] = [];
  loadingTracks = false;

  // Liked songs (always accessible)
  likedTracks: UnifiedTrack[] = [];
  loadingLiked = false;
  isLikedSongsView = false;

  // Favorites
  favoriteTracks: UnifiedTrack[] = [];

  private trackChangeSub: Subscription | null = null;

  constructor(
    private playerService: PlayerService,
    private apiService: ApiService,
    private spotifyAuth: SpotifyAuthService,
    private favoritesService: FavoritesService
  ) { }

  ngOnInit() {
    // Track recently played
    this.playerService.currentTrack$.subscribe(track => {
      if (track) {
        this.recentTracks = [
          track,
          ...this.recentTracks.filter(t => !(t.id === track.id && t.source === track.source))
        ].slice(0, 50);
      }
    });

    // Monitor Spotify login state
    this.spotifyAuth.isLoggedIn$.subscribe(loggedIn => {
      this.isSpotifyConnected = loggedIn;
    });

    // Sync favorites
    this.favoritesService.favorites$.subscribe(favs => {
      this.favoriteTracks = favs;
    });

    // Progressive track discovery: when track changes while a playlist is open,
    // re-fetch queue and merge any new tracks into the displayed list.
    this.trackChangeSub = this.playerService.currentTrack$.subscribe(async track => {
      if (!track || track.source !== 'spotify') return;
      if (!this.selectedPlaylist && !this.isLikedSongsView) return;
      if (this.isLikedSongsView) return; // liked songs already loaded in full

      // Small delay to let Spotify's queue update after track change
      await new Promise(r => setTimeout(r, 1500));

      try {
        const token = await this.spotifyAuth.getAccessToken();
        if (!token) return;
        const queueTracks = await this.apiService.getPlaybackQueue(token);
        if (queueTracks.length === 0) return;

        // Merge: add any tracks not already in playlistTracks (deduplicate by spotifyUri)
        const existingUris = new Set(this.playlistTracks.map(t => t.sourceUri));
        const newTracks = queueTracks.filter(t => !existingUris.has(t.sourceUri));
        if (newTracks.length > 0) {
          this.playlistTracks = [...this.playlistTracks, ...newTracks];
        }
      } catch { /* ignore queue polling errors */ }
    });
  }

  ngOnDestroy() {
    this.trackChangeSub?.unsubscribe();
  }

  async switchToPlaylists() {
    this.activeTab = 'playlists';
    if (this.isSpotifyConnected && this.playlists.length === 0) {
      // Load both playlists and liked tracks in parallel
      await Promise.all([this.loadPlaylists(), this.loadLikedTracks()]);
    }
  }

  async loadPlaylists() {
    const token = await this.spotifyAuth.getAccessToken();
    if (!token) return;
    this.loadingPlaylists = true;
    try {
      this.playlists = await firstValueFrom(this.apiService.getSpotifyPlaylists(token));
    } catch (e) {
      console.error('Failed to load playlists:', e);
      this.playlists = [];
    } finally {
      this.loadingPlaylists = false;
    }
  }

  async loadLikedTracks() {
    const token = await this.spotifyAuth.getAccessToken();
    if (!token) return;
    this.loadingLiked = true;
    try {
      this.likedTracks = await firstValueFrom(this.apiService.getLikedTracks(token));
    } catch (e) {
      console.error('Failed to load liked tracks:', e);
      this.likedTracks = [];
    } finally {
      this.loadingLiked = false;
    }
  }

  openLikedSongs() {
    this.isLikedSongsView = true;
    this.selectedPlaylist = null;
    this.playlistTracks = this.likedTracks;
  }

  async openPlaylist(playlist: SpotifyPlaylist) {
    this.isLikedSongsView = false;
    this.selectedPlaylist = playlist;
    this.playlistTracks = [];
    this.loadingTracks = true;

    try {
      const token = await this.spotifyAuth.getAccessToken();
      if (token) {
        // Try direct Spotify API call from browser (bypasses backend dev-mode restriction)
        const tracks = await this.apiService.getSpotifyPlaylistTracksDirect(playlist.id, token);
        this.playlistTracks = tracks;
      }
    } catch (e) {
      console.error('Failed to load playlist tracks:', e);
      this.playlistTracks = [];
    } finally {
      this.loadingTracks = false;
    }
  }

  clearSelectedPlaylist() {
    this.selectedPlaylist = null;
    this.playlistTracks = [];
    this.isLikedSongsView = false;
  }

  playAll() {
    if (this.playlistTracks.length === 0) return;
    this.playerService.play(this.playlistTracks[0], this.playlistTracks);
    this.playerService.requestQueueOpen();
  }

  async playPlaylistContext() {
    if (!this.selectedPlaylist) return;
    const contextUri = `spotify:playlist:${this.selectedPlaylist.id}`;
    await this.playerService.playContext(contextUri);
    this.playerService.requestQueueOpen();

    // Wait for playback to start, then fetch queue (this endpoint is allowed in Spotify dev mode)
    this.loadingTracks = true;
    await new Promise(resolve => setTimeout(resolve, 2500));
    try {
      const token = await this.spotifyAuth.getAccessToken();
      if (token) {
        const queueTracks = await this.apiService.getPlaybackQueue(token);
        if (queueTracks.length > 0) {
          this.playlistTracks = queueTracks;
        }
      }
    } catch (e) {
      console.error('Failed to fetch queue:', e);
    } finally {
      this.loadingTracks = false;
    }
  }
}
