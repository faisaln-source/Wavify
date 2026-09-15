import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TrackCardComponent } from '../../shared/track-card/track-card.component';
import { PlayerService } from '../../core/services/player.service';
import { ApiService } from '../../core/services/api.service';
import { SpotifyAuthService } from '../../core/services/spotify-auth.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { RecentlyPlayedService } from '../../core/services/recently-played.service';
import { PlaylistsService } from '../../core/services/playlists.service';
import { UnifiedTrack, SpotifyPlaylist, LocalPlaylist } from '../../core/models/track.model';
import { firstValueFrom, Subscription } from 'rxjs';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [CommonModule, FormsModule, TrackCardComponent],
  template: `
    <div class="library-page">
      <header class="page-header">
        <h1>Your Library</h1>
        <p>Your favorites, recently played, Spotify playlists & custom playlists</p>
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
        <button class="tab" [class.active]="activeTab === 'myplaylists'" (click)="activeTab = 'myplaylists'" id="tab-myplaylists">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16M4 10h16M4 14h10"/><line x1="19" y1="17" x2="19" y2="23"/><line x1="16" y1="20" x2="22" y2="20"/></svg>
          My Playlists
          <span class="tab-count" *ngIf="(playlistsService.playlists$ | async)?.length">{{ (playlistsService.playlists$ | async)?.length }}</span>
        </button>
        <button class="tab" [class.active]="activeTab === 'favorites'" (click)="activeTab = 'favorites'" id="tab-favorites">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          Favorites
          <span class="tab-count" *ngIf="favoriteTracks.length">{{ favoriteTracks.length }}</span>
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
          <p>Loading your playlistsâ€¦</p>
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
              <!-- Liked songs: Play All --- Regular playlist: Play  -->
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
            <p>Loading tracksâ€¦</p>
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

      <!-- â”€â”€â”€ My Playlists Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      <div class="library-content" *ngIf="activeTab === 'myplaylists'">

        <!-- No local playlist selected -->
        <ng-container *ngIf="!selectedLocalPlaylist">
          <!-- Create playlist bar -->
          <div class="create-playlist-bar">
            <div class="create-input-wrap" *ngIf="!showCreateForm">
              <button class="create-playlist-btn" (click)="showCreateForm = true" id="btn-create-playlist">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New Playlist
              </button>
            </div>
            <div class="create-form" *ngIf="showCreateForm">
              <input #nameInput class="playlist-name-input" [(ngModel)]="newPlaylistName"
                     placeholder="Playlist name..." (keyup.enter)="confirmCreate()"
                     (keyup.escape)="cancelCreate()" autofocus id="input-playlist-name"/>
              <button class="create-confirm-btn" (click)="confirmCreate()" id="btn-confirm-create">Create</button>
              <button class="create-cancel-btn" (click)="cancelCreate()" id="btn-cancel-create">Cancel</button>
            </div>
          </div>

          <!-- Empty state -->
          <div class="empty-state" *ngIf="(playlistsService.playlists$ | async)?.length === 0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 6h16M4 10h16M4 14h10"/><line x1="19" y1="17" x2="19" y2="23"/><line x1="16" y1="20" x2="22" y2="20"/></svg>
            <h3>No playlists yet</h3>
            <p>Create a playlist and add tracks using the âŠ• button on any track</p>
          </div>

          <!-- Playlists grid -->
          <div class="playlists-grid" *ngIf="(playlistsService.playlists$ | async)?.length! > 0">
            <div class="playlist-card local-playlist-card"
                 *ngFor="let lp of (playlistsService.playlists$ | async)"
                 (click)="openLocalPlaylist(lp)">
              <!-- Art: show thumbnail of first track, or gradient placeholder -->
              <div class="playlist-art local-art"
                   [style.background]="lp.tracks[0]?.thumbnailUrl ? 'none' : 'linear-gradient(135deg,#7c3aed,#2563eb)'">
                <img *ngIf="lp.tracks[0]?.thumbnailUrl" [src]="lp.tracks[0].thumbnailUrl" [alt]="lp.name" loading="lazy"/>
                <div *ngIf="!lp.tracks[0]?.thumbnailUrl" class="playlist-art-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="playlist-play-overlay">
                  <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                </div>
              </div>
              <div class="playlist-meta">
                <span class="playlist-name">{{ lp.name }}</span>
                <span class="playlist-info">{{ lp.tracks.length }} tracks</span>
              </div>
              <!-- Delete button -->
              <button class="delete-playlist-btn"
                      (click)="deleteLocalPlaylist($event, lp.id)"
                      title="Delete playlist" id="btn-delete-{{ lp.id }}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            </div>
          </div>
        </ng-container>

        <!-- Local playlist detail view -->
        <ng-container *ngIf="selectedLocalPlaylist">
          <div class="playlist-header">
            <button class="back-btn" (click)="selectedLocalPlaylist = null" id="btn-back-myplaylists">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
              My Playlists
            </button>
            <div class="playlist-header-info">
              <div class="playlist-header-art local-art-sm">
                <img *ngIf="selectedLocalPlaylist.tracks[0]?.thumbnailUrl"
                     [src]="selectedLocalPlaylist.tracks[0].thumbnailUrl"
                     [alt]="selectedLocalPlaylist.name"/>
                <svg *ngIf="!selectedLocalPlaylist.tracks[0]?.thumbnailUrl"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <div class="playlist-header-text">
                <!-- Inline rename -->
                <div class="rename-wrap" *ngIf="!renamingPlaylist">
                  <h2>{{ selectedLocalPlaylist.name }}</h2>
                  <button class="rename-btn" (click)="startRename()" title="Rename" id="btn-rename-playlist">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
                <div class="rename-form" *ngIf="renamingPlaylist">
                  <input class="playlist-name-input sm" [(ngModel)]="renameValue"
                         (keyup.enter)="confirmRename()" (keyup.escape)="renamingPlaylist = false" id="input-rename-playlist"/>
                  <button class="create-confirm-btn sm" (click)="confirmRename()">Save</button>
                  <button class="create-cancel-btn sm" (click)="renamingPlaylist = false">âœ•</button>
                </div>
                <p>{{ selectedLocalPlaylist.tracks.length }} tracks</p>
              </div>
              <button class="play-all-btn" (click)="playLocalPlaylist()" [disabled]="selectedLocalPlaylist.tracks.length === 0" id="btn-play-local-playlist">
                <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Play All
              </button>
            </div>
          </div>

          <!-- Tracks -->
          <div class="local-track-list" *ngIf="selectedLocalPlaylist.tracks.length > 0">
            <div class="local-track-row" *ngFor="let track of selectedLocalPlaylist.tracks; let i = index">
              <app-track-card
                [track]="track"
                [index]="i"
                [playlist]="selectedLocalPlaylist.tracks"
                style="flex:1;min-width:0"
              ></app-track-card>
              <button class="remove-track-btn"
                      (click)="removeFromLocalPlaylist(track)"
                      title="Remove from playlist"
                      id="btn-remove-{{ track.id }}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <div class="empty-state" *ngIf="selectedLocalPlaylist.tracks.length === 0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <h3>Empty playlist</h3>
            <p>Use the âŠ• button on any track to add it here</p>
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
          <p>Click the â™¡ heart on any track to save it here</p>
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
    .tab-count {
      background: var(--accent-primary); color: white; border-radius: 100px;
      font-size: 10px; font-weight: 700; padding: 1px 6px; min-width: 18px; text-align: center;
    }

    .track-list { display: flex; flex-direction: column; gap: 2px; }

    /* â”€â”€ Playlists Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .playlists-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px;
    }

    .playlist-card {
      background: var(--bg-card); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); overflow: hidden;
      cursor: pointer; transition: all 0.2s ease; position: relative;
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

    /* â”€â”€ Local playlist card extras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .local-playlist-card { padding-bottom: 0; }
    .local-art { background: linear-gradient(135deg,#7c3aed,#2563eb); }
    .delete-playlist-btn {
      position: absolute; top: 8px; right: 8px;
      width: 26px; height: 26px; border-radius: 50%;
      background: rgba(0,0,0,0.6); border: none; cursor: pointer;
      color: #f87171; display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: all 0.2s;
    }
    .delete-playlist-btn svg { width: 13px; height: 13px; }
    .playlist-card:hover .delete-playlist-btn { opacity: 1; }
    .delete-playlist-btn:hover { background: rgba(239,68,68,0.3); transform: scale(1.1); }

    /* â”€â”€ Create Playlist Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .create-playlist-bar { margin-bottom: 20px; }
    .create-playlist-btn {
      display: flex; align-items: center; gap: 8px; padding: 10px 20px;
      border-radius: 100px; font-size: 14px; font-weight: 600;
      color: var(--accent-primary); background: rgba(139,92,246,0.1);
      border: 1px dashed rgba(139,92,246,0.4); cursor: pointer; transition: all 0.2s;
    }
    .create-playlist-btn svg { width: 16px; height: 16px; }
    .create-playlist-btn:hover { background: rgba(139,92,246,0.18); border-color: rgba(139,92,246,0.6); }

    .create-form { display: flex; align-items: center; gap: 10px; }
    .playlist-name-input {
      flex: 1; max-width: 340px; padding: 10px 16px; border-radius: 100px;
      background: var(--bg-card); border: 1px solid var(--border-subtle);
      color: var(--text-primary); font-size: 14px; outline: none;
      transition: border-color 0.2s;
    }
    .playlist-name-input:focus { border-color: var(--accent-primary); }
    .playlist-name-input.sm { max-width: 200px; padding: 7px 12px; font-size: 13px; }

    .create-confirm-btn {
      padding: 9px 20px; border-radius: 100px; font-size: 13px; font-weight: 700;
      background: var(--accent-gradient); color: white; border: none; cursor: pointer; transition: opacity 0.2s;
    }
    .create-confirm-btn:hover { opacity: 0.88; }
    .create-confirm-btn.sm { padding: 6px 14px; font-size: 12px; }
    .create-cancel-btn {
      padding: 9px 16px; border-radius: 100px; font-size: 13px;
      background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--text-secondary); cursor: pointer; transition: all 0.2s;
    }
    .create-cancel-btn:hover { color: var(--text-primary); background: var(--bg-card-hover); }
    .create-cancel-btn.sm { padding: 6px 12px; font-size: 12px; }

    /* â”€â”€ Local track row (card + remove btn) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .local-track-list { display: flex; flex-direction: column; gap: 2px; }
    .local-track-row { display: flex; align-items: center; gap: 4px; }
    .remove-track-btn {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      color: var(--text-tertiary); display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: all 0.2s;
    }
    .local-track-row:hover .remove-track-btn { opacity: 1; }
    .remove-track-btn svg { width: 14px; height: 14px; }
    .remove-track-btn:hover { color: #f87171; background: rgba(248,113,113,0.12); }

    /* â”€â”€ Rename â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .rename-wrap { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .rename-wrap h2 { margin: 0; font-size: 22px; font-weight: 800; }
    .rename-btn { background: none; border: none; cursor: pointer; color: var(--text-tertiary); display: flex; padding: 4px; border-radius: 6px; transition: all 0.2s; }
    .rename-btn svg { width: 14px; height: 14px; }
    .rename-btn:hover { color: var(--accent-primary); background: rgba(139,92,246,0.1); }
    .rename-form { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }

    .local-art-sm {
      width: 80px; height: 80px; border-radius: var(--radius-md);
      overflow: hidden; flex-shrink: 0; background: linear-gradient(135deg,#7c3aed,#2563eb);
      display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);
    }
    .local-art-sm img { width: 100%; height: 100%; object-fit: cover; }
    .local-art-sm svg { width: 32px; height: 32px; color: rgba(255,255,255,0.6); }

    /* â”€â”€ Playlist Context Play CTA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .playlist-context-cta {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 60px 20px; text-align: center;
      gap: 12px;
    }
    .cta-icon svg { width: 64px; height: 64px; fill: #1db954; opacity: 0.7; }
    .playlist-context-cta h3 { font-size: 20px; font-weight: 700; margin: 0; }
    .playlist-context-cta p { font-size: 14px; color: var(--text-secondary); margin: 0; max-width: 320px; }

    /* â”€â”€ Playlist Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

    /* â”€â”€ Loading / Empty â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

    /* â”€â”€ Mobile â”€â”€ */
    @media (max-width: 768px) {
      .library-page { padding: 14px 14px; padding-bottom: 20px; }

        .page-header h1 { font-size: 22px; }
        .page-header p { font-size: 13px; }

        .library-tabs { gap: 6px; margin-bottom: 16px; flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
        .library-tabs::-webkit-scrollbar { display: none; }
        .tab { padding: 8px 14px; font-size: 13px; gap: 6px; white-space: nowrap; }
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
  activeTab: 'recent' | 'playlists' | 'myplaylists' | 'favorites' = 'recent';
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

  // My Playlists state
  selectedLocalPlaylist: LocalPlaylist | null = null;
  showCreateForm = false;
  newPlaylistName = '';
  renamingPlaylist = false;
  renameValue = '';

  private trackChangeSub: Subscription | null = null;
  private recentSub: Subscription | null = null;
  private localPlaylistSub: Subscription | null = null;

  constructor(
    private playerService: PlayerService,
    private apiService: ApiService,
    private spotifyAuth: SpotifyAuthService,
    private favoritesService: FavoritesService,
    private recentlyPlayedService: RecentlyPlayedService,
    public playlistsService: PlaylistsService
  ) { }

  ngOnInit() {
    // Sync recently played from service (persisted in localStorage)
    this.recentSub = this.recentlyPlayedService.recentTracks$.subscribe(tracks => {
      this.recentTracks = tracks;
    });

    // Monitor Spotify login state
    this.spotifyAuth.isLoggedIn$.subscribe(loggedIn => {
      this.isSpotifyConnected = loggedIn;
    });

    // Sync favorites
    this.favoritesService.favorites$.subscribe(favs => {
      this.favoriteTracks = favs;
    });

    // Keep selectedLocalPlaylist in sync if its tracks are updated
    this.localPlaylistSub = this.playlistsService.playlists$.subscribe(all => {
      if (this.selectedLocalPlaylist) {
        const updated = all.find(p => p.id === this.selectedLocalPlaylist!.id);
        if (updated) this.selectedLocalPlaylist = updated;
      }
    });

    // Progressive track discovery: when track changes while a Spotify playlist is open,
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
    this.recentSub?.unsubscribe();
    this.localPlaylistSub?.unsubscribe();
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

  // â”€â”€â”€ My Playlists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  openLocalPlaylist(lp: LocalPlaylist) {
    this.selectedLocalPlaylist = lp;
  }

  deleteLocalPlaylist(event: Event, id: string) {
    event.stopPropagation();
    if (confirm('Delete this playlist?')) {
      this.playlistsService.deletePlaylist(id);
      if (this.selectedLocalPlaylist?.id === id) this.selectedLocalPlaylist = null;
    }
  }

  removeFromLocalPlaylist(track: UnifiedTrack) {
    if (!this.selectedLocalPlaylist) return;
    this.playlistsService.removeTrack(this.selectedLocalPlaylist.id, track.id, track.source);
  }

  playLocalPlaylist() {
    if (!this.selectedLocalPlaylist || this.selectedLocalPlaylist.tracks.length === 0) return;
    this.playerService.play(this.selectedLocalPlaylist.tracks[0], this.selectedLocalPlaylist.tracks);
    this.playerService.requestQueueOpen();
  }

  confirmCreate() {
    if (!this.newPlaylistName.trim()) return;
    this.playlistsService.createPlaylist(this.newPlaylistName);
    this.newPlaylistName = '';
    this.showCreateForm = false;
  }

  cancelCreate() {
    this.newPlaylistName = '';
    this.showCreateForm = false;
  }

  startRename() {
    if (!this.selectedLocalPlaylist) return;
    this.renameValue = this.selectedLocalPlaylist.name;
    this.renamingPlaylist = true;
  }

  confirmRename() {
    if (!this.selectedLocalPlaylist || !this.renameValue.trim()) return;
    this.playlistsService.renamePlaylist(this.selectedLocalPlaylist.id, this.renameValue);
    this.renamingPlaylist = false;
  }
}
