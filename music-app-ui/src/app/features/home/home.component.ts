import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TrackCardComponent } from '../../shared/track-card/track-card.component';
import { ApiService } from '../../core/services/api.service';
import { PlayerService } from '../../core/services/player.service';
import { SpotifyAuthService } from '../../core/services/spotify-auth.service';
import { UnifiedTrack, SearchResponse, PlaylistInfo } from '../../core/models/track.model';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, forkJoin } from 'rxjs';

interface MoodChip {
  label: string;
  emoji: string;
  query: string;
  gradient: string;
}

interface TrendingRegion {
  code: string;
  label: string;
  flag: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, TrackCardComponent],
  template: `
    <div class="home-page">
      <header class="page-header">
        <div class="greeting">
          <h1 class="gradient-text">{{ greeting() }}</h1>
          <p>Discover music from Spotify and YouTube in one place.</p>
        </div>

        <!-- Inline search bar -->
        <div class="home-search-bar" id="home-search-bar">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            class="search-input"
            placeholder="Search songs, artists, playlists..."
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchInput($event)"
            id="home-search-input"
          />
          <div class="search-spinner" *ngIf="searchLoading">
            <div class="spin"></div>
          </div>
          <button class="search-clear" *ngIf="searchQuery && !searchLoading" (click)="clearSearch()" id="btn-home-clear-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Search filter tabs -->
        <div class="search-tabs" *ngIf="searchQuery && hasSearchResults()">
          <button class="stab" [class.active]="searchTab==='all'"     (click)="searchTab='all'"     id="stab-all">All</button>
          <button class="stab" [class.active]="searchTab==='spotify'" (click)="searchTab='spotify'" id="stab-spotify">
            <span class="stab-dot spotify"></span>Spotify
          </button>
          <button class="stab" [class.active]="searchTab==='youtube'" (click)="searchTab='youtube'" id="stab-youtube">
            <span class="stab-dot youtube"></span>YouTube
          </button>
        </div>
      </header>

      <!-- ── SEARCH RESULTS (shown when query is active) ── -->
      <ng-container *ngIf="searchQuery">
        <div class="search-results-panel" *ngIf="hasSearchResults(); else noResults">
          <!-- Spotify results -->
          <section *ngIf="(searchTab==='all' || searchTab==='spotify') && searchResults.spotifyResults.length">
            <div class="results-label" *ngIf="searchTab==='all'">
              <span class="badge badge-spotify">♫ Spotify</span>
              <span class="results-count">{{ searchResults.spotifyResults.length }}</span>
            </div>
            <div class="panel-tracks">
              <app-track-card
                *ngFor="let t of searchResults.spotifyResults; let i = index"
                [track]="t" [index]="i" [playlist]="searchResults.spotifyResults">
              </app-track-card>
            </div>
          </section>

          <!-- YouTube results -->
          <section *ngIf="(searchTab==='all' || searchTab==='youtube') && searchResults.youTubeResults.length">
            <div class="results-label" *ngIf="searchTab==='all'">
              <span class="badge badge-youtube">▶ YouTube</span>
              <span class="results-count">{{ searchResults.youTubeResults.length }}</span>
            </div>
            <div class="panel-tracks">
              <app-track-card
                *ngFor="let t of searchResults.youTubeResults; let i = index"
                [track]="t" [index]="i" [playlist]="searchResults.youTubeResults">
              </app-track-card>
            </div>
          </section>
        </div>

        <ng-template #noResults>
          <div class="search-empty" *ngIf="!searchLoading">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <p>No results for <strong>"{{ searchQuery }}"</strong></p>
          </div>
        </ng-template>
      </ng-container>

      <!-- Normal home content — hidden while searching -->
      <ng-container *ngIf="!searchQuery">

      <!-- Mood/Genre Chips -->
      <section class="mood-section">
        <h2 class="section-title">🎵 Browse by Mood</h2>
        <div class="mood-chips">
          <button
            *ngFor="let mood of moods"
            class="mood-chip"
            [class.active]="activeMood?.label === mood.label"
            [style.--chip-gradient]="mood.gradient"
            (click)="selectMood(mood)"
            [id]="'btn-mood-' + mood.label.toLowerCase()">
            <span class="mood-emoji">{{ mood.emoji }}</span>
            <span class="mood-label">{{ mood.label }}</span>
          </button>
        </div>
      </section>

      <!-- Mood Results -->
      <section class="mood-results" *ngIf="activeMood">
        <div class="section-header">
          <h2 class="section-title">
            {{ activeMood.emoji }} {{ activeMood.label }}
            <span class="badge badge-spotify" *ngIf="moodSource !== 'youtube'">Spotify</span>
            <span class="badge badge-youtube" *ngIf="moodSource !== 'spotify'">YouTube</span>
          </h2>
          <div class="source-toggle">
            <button class="src-btn" [class.active]="moodSource==='all'"     (click)="setMoodSource('all')">All</button>
            <button class="src-btn spotify" [class.active]="moodSource==='spotify'"  (click)="setMoodSource('spotify')">♫ Spotify</button>
            <button class="src-btn youtube" [class.active]="moodSource==='youtube'"  (click)="setMoodSource('youtube')">▶ YouTube</button>
            <button class="clear-mood-btn" (click)="clearMood()">✕</button>
          </div>
        </div>
        <div class="loading-inline" *ngIf="loadingMood">
          <div class="spinner-sm"></div>
          <span>Finding {{ activeMood.label.toLowerCase() }} tracks…</span>
        </div>
        <div class="panel-tracks" *ngIf="!loadingMood && filteredMoodTracks.length > 0">
          <app-track-card
            *ngFor="let track of filteredMoodTracks; let i = index"
            [track]="track" [index]="i" [playlist]="filteredMoodTracks">
          </app-track-card>
        </div>
        <div class="empty-state" *ngIf="!loadingMood && filteredMoodTracks.length === 0">
          <p>No tracks found for this mood &amp; source.</p>
        </div>
      </section>

      <!-- Hero Cards (shown when no mood is active) -->
      <section class="hero-section animate-slide-up" *ngIf="!activeMood"
               [class.hero-single]="!spotifyReleases.length">
        <div class="hero-card glass" *ngIf="spotifyReleases.length > 0" (click)="playAll(spotifyReleases)">
          <div class="hero-bg spotify-bg"></div>
          <div class="hero-content">
            <span class="badge badge-spotify">♫ Spotify</span>
            <h2>Your Music</h2>
            <p>Your top &amp; liked tracks on Spotify</p>
            <button class="hero-play-btn" id="btn-play-releases">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Play All
            </button>
          </div>
        </div>
        <div class="hero-card glass" *ngIf="youtubeTrending.length > 0" (click)="playAll(youtubeTrending)">
          <div class="hero-bg youtube-bg"></div>
          <div class="hero-content">
            <span class="badge badge-youtube">▶ YouTube</span>
            <h2>Trending Music</h2>
            <p>Most popular music videos right now</p>
            <button class="hero-play-btn" id="btn-play-trending">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Play All
            </button>
          </div>
        </div>
      </section>

      <!-- Spotify CTA banner (shown inline, not as a grid column) -->
      <div class="spotify-cta-banner" *ngIf="!activeMood && !loading && !spotifyReleases.length && !spotifyAuth.isLoggedIn()">
        <div class="cta-icon">♫</div>
        <div class="cta-text">
          <strong>Connect Spotify</strong>
          <span>Sign in to see your personalized music alongside YouTube trending</span>
        </div>
        <button class="connect-btn" id="btn-connect-spotify" (click)="connectSpotify()">Connect Spotify</button>
      </div>

      <!-- Retry banner when logged in but failed -->
      <div class="spotify-cta-banner warn" *ngIf="!activeMood && !loading && !spotifyReleases.length && spotifyAuth.isLoggedIn()">
        <div class="cta-icon" style="color:#f87171">⚠</div>
        <div class="cta-text">
          <strong>Couldn't load Spotify tracks</strong>
          <span>The Spotify API returned an error.</span>
        </div>
        <button class="connect-btn retry-btn" id="btn-retry-spotify" (click)="retrySpotify()">Retry</button>
      </div>

      <!-- Two-Column Track Lists (shown when no mood is active) -->
      <section class="dual-panel" *ngIf="!activeMood"
               [class.single-panel]="!spotifyReleases.length">
        <!-- Spotify Column -->
        <div class="panel" *ngIf="spotifyReleases.length">
          <div class="panel-header">
            <h2>Your Music <span class="badge badge-spotify">Spotify</span></h2>
            <button class="show-more-btn" *ngIf="spotifyReleases.length > 10"
                    (click)="showAllSpotify = !showAllSpotify">
              {{ showAllSpotify ? 'Show Less' : 'Show All (' + spotifyReleases.length + ')' }}
            </button>
          </div>
          <div class="panel-tracks">
            <app-track-card
              *ngFor="let track of (showAllSpotify ? spotifyReleases : spotifyReleases.slice(0, 20)); let i = index"
              [track]="track" [index]="i" [playlist]="spotifyReleases">
            </app-track-card>
          </div>
        </div>

        <!-- YouTube Column -->
        <div class="panel" *ngIf="youtubeTrending.length">
          <div class="panel-header" style="flex-direction: column; align-items: flex-start; gap: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
              <h2>
                Trending Music
                <span class="badge badge-youtube">YouTube</span>
                <span class="lang-badge" *ngIf="activeLanguage">{{ activeLanguage.label }}</span>
              </h2>
              <button class="show-more-btn" *ngIf="youtubeTrending.length > 10"
                      (click)="showAllYouTube = !showAllYouTube">
                {{ showAllYouTube ? 'Show Less' : 'Show All (' + youtubeTrending.length + ')' }}
              </button>
            </div>

            <!-- Region tabs -->
            <div class="region-selector">
              <button *ngFor="let r of trendingRegions"
                      class="region-btn"
                      [class.active]="activeRegion.code === r.code"
                      (click)="setRegion(r)">
                <span class="region-flag">{{ r.flag }}</span> {{ r.label }}
              </button>
            </div>

            <!-- India: language sub-tabs (shown only when India is selected) -->
            <div class="lang-selector" *ngIf="activeRegion.code === 'IN'">
              <button class="lang-btn"
                      [class.active]="!activeLanguage"
                      (click)="clearLanguage()"
                      id="lang-all">🇮🇳 All</button>
              <button *ngFor="let lang of indianLanguages"
                      class="lang-btn"
                      [class.active]="activeLanguage?.code === lang.code"
                      (click)="setLanguage(lang)"
                      [id]="'lang-' + lang.code">
                {{ lang.flag }} {{ lang.label }}
              </button>
            </div>

            <!-- Loading indicator for language fetch -->
            <div class="loading-inline" *ngIf="loadingLanguage">
              <div class="spinner-sm"></div>
              <span>Loading {{ activeLanguage?.label }} music…</span>
            </div>
          </div>
          <div class="panel-tracks" *ngIf="!loadingLanguage">
            <app-track-card
              *ngFor="let track of (showAllYouTube ? youtubeTrending : youtubeTrending.slice(0, 20)); let i = index"
              [track]="track" [index]="i" [playlist]="youtubeTrending">
            </app-track-card>
          </div>
        </div>
      </section>

      <div class="loading" *ngIf="loading">
        <div class="spinner"></div>
        <span>Loading your music...</span>
      </div>

      </ng-container><!-- /!searchQuery -->
    </div>
  `,
  styles: [`
    .home-page {
      padding: 24px 28px;
      padding-bottom: 120px;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .page-header { margin-bottom: 20px; }

    /* ── Inline Search Bar ── */
    .home-search-bar {
      display: flex; align-items: center; gap: 10px;
      background: var(--bg-card); border: 1px solid var(--border-subtle);
      border-radius: 14px; padding: 0 14px; height: 48px;
      margin-top: 16px;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }
    .home-search-bar:focus-within {
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 3px rgba(167,139,250,0.15);
    }
    .home-search-bar .search-icon { width: 18px; height: 18px; color: var(--text-tertiary); flex-shrink: 0; }
    .home-search-bar .search-input {
      flex: 1; background: none; border: none; outline: none;
      color: var(--text-primary); font-size: 14px; font-family: inherit;
      min-width: 0;
    }
    .home-search-bar .search-input::placeholder { color: var(--text-tertiary); }
    .home-search-bar .search-clear {
      width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      color: var(--text-tertiary); transition: all var(--transition-fast); flex-shrink: 0;
    }
    .home-search-bar .search-clear:hover { background: var(--bg-card-hover); color: var(--text-primary); }
    .home-search-bar .search-clear svg { width: 14px; height: 14px; }
    .home-search-bar .search-spinner { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .home-search-bar .spin {
      width: 18px; height: 18px; border: 2px solid var(--border-medium);
      border-top-color: var(--accent-primary); border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Filter tabs */
    .search-tabs {
      display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;
    }
    .stab {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 100px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--border-subtle); color: var(--text-secondary);
      background: var(--bg-card); transition: all var(--transition-fast); cursor: pointer;
    }
    .stab.active { background: var(--accent-primary); color: white; border-color: var(--accent-primary); }
    .stab-dot { width: 8px; height: 8px; border-radius: 50%; }
    .stab-dot.spotify { background: #1db954; }
    .stab-dot.youtube { background: #ff0000; }

    /* Search results panel */
    .search-results-panel { margin-top: 20px; }
    .results-label {
      display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 0 4px;
    }
    .results-count {
      font-size: 12px; color: var(--text-tertiary); font-weight: 600;
      background: var(--bg-card); border: 1px solid var(--border-subtle);
      padding: 2px 8px; border-radius: 100px;
    }
    .search-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 60px 20px; text-align: center; color: var(--text-tertiary);
    }
    .search-empty svg { width: 48px; height: 48px; margin-bottom: 14px; opacity: 0.4; }
    .search-empty p { font-size: 14px; }
    .search-empty strong { color: var(--text-primary); }

    .greeting h1 {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -1px;
      margin-bottom: 4px;
    }
    .greeting p { color: var(--text-secondary); font-size: 14px; }

    /* ── Mood Section ── */
    .mood-section { margin-bottom: 24px; }

    .section-title {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 14px;
      letter-spacing: -0.3px;
    }

    .mood-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .mood-chip {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 10px 18px;
      border-radius: 100px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }

    .mood-chip::before {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--chip-gradient, linear-gradient(135deg,#8b5cf6,#7c3aed));
      opacity: 0;
      transition: opacity 0.2s;
    }

    .mood-chip:hover::before, .mood-chip.active::before { opacity: 0.12; }

    .mood-chip.active {
      border-color: transparent;
      color: var(--text-primary);
      box-shadow: 0 0 0 2px rgba(139,92,246,0.4);
    }

    .mood-chip:hover {
      transform: translateY(-2px);
      border-color: rgba(139,92,246,0.3);
      color: var(--text-primary);
    }

    .mood-emoji { font-size: 18px; position: relative; }
    .mood-label { position: relative; }

    /* ── Mood Results ── */
    .mood-results { margin-bottom: 28px; }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .clear-mood-btn {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-tertiary);
      padding: 4px 12px;
      border-radius: 100px;
      border: 1px solid var(--border-subtle);
      background: transparent;
      cursor: pointer;
      transition: all 0.15s;
    }
    .clear-mood-btn:hover { color: var(--text-secondary); background: var(--bg-card); }

    .loading-inline {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 0;
      color: var(--text-secondary);
      font-size: 14px;
    }

    .spinner-sm {
      width: 18px; height: 18px;
      border: 2px solid rgba(167,139,250,0.2);
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    /* ── India language selector ── */
    .lang-selector {
      display: flex; gap: 6px;
      overflow-x: auto; -webkit-overflow-scrolling: touch;
      padding-bottom: 4px; width: 100%;
    }
    .lang-selector::-webkit-scrollbar { display: none; }
    .lang-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 5px 12px; border-radius: 100px; white-space: nowrap;
      font-size: 12px; font-weight: 600; flex-shrink: 0;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card); color: var(--text-secondary);
      cursor: pointer; transition: all 0.15s;
    }
    .lang-btn:hover { color: var(--text-primary); border-color: rgba(251,146,60,0.5); }
    .lang-btn.active {
      background: rgba(251,146,60,0.15);
      border-color: rgba(251,146,60,0.6);
      color: #fb923c;
    }
    .lang-badge {
      font-size: 11px; font-weight: 700; padding: 2px 8px;
      border-radius: 100px; background: rgba(251,146,60,0.15);
      border: 1px solid rgba(251,146,60,0.4); color: #fb923c;
      margin-left: 4px; vertical-align: middle;
    }

    /* Source Toggle */
    .source-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .src-btn {
      font-size: 11px; font-weight: 600;
      padding: 4px 13px; border-radius: 100px;
      border: 1px solid var(--border-subtle);
      background: transparent; color: var(--text-secondary);
      cursor: pointer; transition: all 0.15s;
    }
    .src-btn:hover { color: var(--text-primary); border-color: rgba(167,139,250,0.4); }
    .src-btn.active { color: white; border-color: transparent; background: rgba(167,139,250,0.25); }
    .src-btn.spotify.active { background: rgba(29,185,84,0.25); color: #1db954; border-color: rgba(29,185,84,0.4); }
    .src-btn.youtube.active { background: rgba(255,0,0,0.2); color: #ff4444; border-color: rgba(255,68,68,0.4); }

    /* Hero Cards */
    .hero-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 24px;
    }
    .hero-section.hero-single {
      grid-template-columns: 1fr;
    }

    .hero-card {
      position: relative;
      border-radius: var(--radius-lg);
      padding: 22px;
      overflow: hidden;
      cursor: pointer;
      transition: all var(--transition-base);
      min-height: 140px;
      display: flex;
      align-items: flex-end;
    }
    .hero-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); }

    .hero-bg {
      position: absolute;
      inset: 0;
      opacity: 0.15;
    }
    .spotify-bg { background: linear-gradient(135deg, #1db954 0%, #1ed760 100%); }
    .youtube-bg { background: linear-gradient(135deg, #ff0000 0%, #ff4444 100%); }

    .hero-content { position: relative; z-index: 1; }
    .hero-content h2 { font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
    .hero-content p { font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; }

    .hero-play-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 20px; background: var(--accent-gradient);
      border-radius: 100px; font-size: 12px; font-weight: 600;
      color: white; transition: all var(--transition-fast);
      box-shadow: 0 2px 12px rgba(167,139,250,0.3);
    }
    .hero-play-btn:hover { transform: scale(1.05); box-shadow: 0 4px 20px rgba(167,139,250,0.5); }
    .hero-play-btn svg { width: 14px; height: 14px; }

    /* ── Spotify CTA Banner ── */
    .spotify-cta-banner {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 20px;
      margin-bottom: 20px;
      background: rgba(29,185,84,0.08);
      border: 1px solid rgba(29,185,84,0.2);
      border-radius: var(--radius-lg);
      animation: fadeIn 0.4s ease;
    }
    .spotify-cta-banner.warn {
      background: rgba(248,113,113,0.07);
      border-color: rgba(248,113,113,0.2);
    }
    .cta-icon { font-size: 28px; flex-shrink: 0; color: #1db954; }
    .spotify-cta-banner.warn .cta-icon { color: #f87171; }
    .cta-text { flex: 1; min-width: 0; }
    .cta-text strong { display: block; font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
    .cta-text span { font-size: 12px; color: var(--text-secondary); }
    .connect-btn {
      flex-shrink: 0;
      padding: 9px 22px;
      background: #1db954;
      color: white;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      white-space: nowrap;
    }
    .connect-btn:hover { background: #1ed760; transform: scale(1.04); }
    .retry-btn { background: #7c3aed; }
    .retry-btn:hover { background: #6d28d9; }

    /* Two-Column Panel */
    .dual-panel {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .dual-panel.single-panel {
      grid-template-columns: 1fr;
    }

    .panel {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      animation: fadeIn 0.5s ease forwards;
      overflow: hidden;
      min-width: 0;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px 8px;
    }
    .panel-header h2 { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }

    .show-more-btn {
      font-size: 11px; font-weight: 600; color: var(--accent-primary);
      padding: 4px 12px; border-radius: 100px;
      border: 1px solid rgba(167,139,250,0.2);
      background: rgba(167,139,250,0.06); transition: all var(--transition-fast); cursor: pointer;
    }
    .show-more-btn:hover { background: rgba(167,139,250,0.15); border-color: rgba(167,139,250,0.4); }

    .region-selector { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; width: 100%; -webkit-overflow-scrolling: touch; }
    .region-selector::-webkit-scrollbar { display: none; }
    .region-btn {
      font-size: 11px; font-weight: 600; color: var(--text-secondary);
      padding: 4px 10px; border-radius: 100px; border: 1px solid var(--border-subtle);
      background: transparent; cursor: pointer; transition: all 0.2s; white-space: nowrap;
    }
    .region-btn:hover { color: var(--text-primary); border-color: rgba(255,0,0,0.3); }
    .region-btn.active { background: rgba(255,0,0,0.1); color: #ff4444; border-color: rgba(255,68,68,0.4); }
    .region-flag { margin-right: 2px; }

    .panel-tracks { padding: 4px 6px 10px; overflow: hidden; }

    .empty-state { padding: 40px; text-align: center; color: var(--text-tertiary); font-size: 14px; }

    .loading {
      display: flex; align-items: center; justify-content: center;
      gap: 12px; padding: 40px; color: var(--text-tertiary);
    }
    .spinner {
      width: 24px; height: 24px; border: 2px solid var(--border-medium);
      border-top-color: var(--accent-primary); border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

      /* ── Mobile ── */
      @media (max-width: 768px) {
        .home-page { padding: 14px 14px; padding-bottom: 32px; overflow-x: hidden; }

        .hero-section { grid-template-columns: 1fr; gap: 10px; margin-bottom: 18px; }
        .hero-card { min-height: 110px; }

        .mood-chips { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
        .mood-chips::-webkit-scrollbar { display: none; }
        .mood-chip svg, .mood-chip span:first-child { margin-top: 2px; }

        .dual-panel, .dual-panel.single-panel { grid-template-columns: 1fr; gap: 16px; }

        .spotify-cta-banner { flex-direction: column; align-items: stretch; gap: 12px; text-align: center; }
        .spotify-cta-banner .cta-icon { margin: 0 auto; }

        .section-header { flex-direction: column; align-items: flex-start; gap: 8px; }
        .source-toggle { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      }
    `]
})
export class HomeComponent implements OnInit, OnDestroy {
  spotifyReleases: UnifiedTrack[] = [];
  youtubeTrending: UnifiedTrack[] = [];
  loading = true;
  showAllSpotify = false;
  showAllYouTube = false;

  trendingRegions: TrendingRegion[] = [
    { code: 'US', label: 'Global', flag: '🌍' },
    { code: 'ES', label: 'Latin', flag: '🇪🇸' },
    { code: 'KR', label: 'K-Pop', flag: '🇰🇷' },
    { code: 'IN', label: 'Indian', flag: '🇮🇳' },
  ];
  /** AI context strings per region — fed to Groq to identify what's trending */
  private readonly regionAIContexts: Record<string, string> = {
    'US': 'global pop English trending',
    'ES': 'Latin Spanish trending pop reggaeton',
    'KR': 'K-Pop Korean trending',
    'IN': 'Indian Bollywood Hindi trending',
  };
  activeRegion: TrendingRegion = this.trendingRegions[0];

  // ── India language filter ──
  indianLanguages = [
    { code: 'hindi',     label: 'Hindi',     flag: '🎵', query: 'Hindi song' },
    { code: 'tamil',     label: 'Tamil',     flag: '🎶', query: 'Tamil song kollywood' },
    { code: 'telugu',    label: 'Telugu',    flag: '🎼', query: 'Telugu song tollywood' },
    { code: 'kannada',   label: 'Kannada',   flag: '🎹', query: 'Kannada song sandalwood' },
    { code: 'punjabi',   label: 'Punjabi',   flag: '🥁', query: 'Punjabi song' },
    { code: 'malayalam', label: 'Malayalam', flag: '🪗', query: 'Malayalam song mollywood' },
    { code: 'bengali',   label: 'Bengali',   flag: '🎷', query: 'Bengali song' },
    { code: 'bhojpuri',  label: 'Bhojpuri',  flag: '🎺', query: 'Bhojpuri song' },
  ];
  activeLanguage: typeof this.indianLanguages[0] | null = null;
  loadingLanguage = false;

  private readonly SONG_JUNK_KEYWORDS = [
    'jukebox', 'nonstop', 'non stop', 'full album',
    'audio jukebox', 'video jukebox', 'back to back', 'back2back',
  ];

  /** Filter clear compilations — only pipe when 3+ segments (true jukeboxes have many artists listed) */
  private filterSongs(tracks: UnifiedTrack[]): UnifiedTrack[] {
    return tracks
      .filter(t => (t.title?.split('|').length ?? 0) <= 3) // 4+ pipe segments = compilation
      .filter(t => {
        const title = (t.title || '').toLowerCase();
        return !this.SONG_JUNK_KEYWORDS.some(kw => title.includes(kw));
      })
      .filter(t => !t.durationMs || t.durationMs < 900_000); // skip >15 min
  }

  greeting = signal(this.computeGreeting());
  private greetingTimer: any;

  // ── Inline search state ──
  searchQuery = '';
  searchResults: SearchResponse = { query: '', spotifyResults: [], youTubeResults: [] };
  searchTab: 'all' | 'spotify' | 'youtube' = 'all';
  searchLoading = false;
  private searchSubject = new Subject<string>();
  private searchSub: any;

  // Mood state
  activeMood: MoodChip | null = null;
  moodTracks: UnifiedTrack[] = [];  // all tracks (spotify + youtube)
  moodSource: 'all' | 'spotify' | 'youtube' = 'all';
  loadingMood = false;

  get filteredMoodTracks(): UnifiedTrack[] {
    if (this.moodSource === 'all') return this.moodTracks;
    return this.moodTracks.filter(t => t.source === this.moodSource);
  }

  moods: MoodChip[] = [
    { label: 'Happy',   emoji: '😊', query: 'happy upbeat pop',        gradient: 'linear-gradient(135deg,#f59e0b,#fbbf24)' },
    { label: 'Chill',   emoji: '😌', query: 'chill lofi relaxing',     gradient: 'linear-gradient(135deg,#06b6d4,#0ea5e9)' },
    { label: 'Focus',   emoji: '🧠', query: 'focus instrumental study', gradient: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' },
    { label: 'Party',   emoji: '🎉', query: 'party dance EDM hits',     gradient: 'linear-gradient(135deg,#ec4899,#be185d)' },
    { label: 'Romance', emoji: '❤️',  query: 'romantic love songs',      gradient: 'linear-gradient(135deg,#ef4444,#dc2626)' },
    { label: 'Sad',     emoji: '😢', query: 'sad emotional ballad',     gradient: 'linear-gradient(135deg,#6366f1,#4338ca)' },
    { label: 'Workout', emoji: '💪', query: 'workout gym motivation',   gradient: 'linear-gradient(135deg,#f97316,#ea580c)' },
    { label: 'Classic', emoji: '🎻', query: 'classical orchestral',     gradient: 'linear-gradient(135deg,#84cc16,#65a30d)' },
    { label: 'Hip-Hop', emoji: '🎤', query: 'hip hop rap beats',        gradient: 'linear-gradient(135deg,#14b8a6,#0d9488)' },
    { label: 'Sleep',   emoji: '🌙', query: 'sleep relaxing ambient',   gradient: 'linear-gradient(135deg,#312e81,#1e1b4b)' },
  ];

  constructor(
    private apiService: ApiService,
    public playerService: PlayerService,
    public spotifyAuth: SpotifyAuthService
  ) {
    this.searchSub = this.searchSubject.pipe(
      debounceTime(380),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q.trim()) {
          this.searchResults = { query: '', spotifyResults: [], youTubeResults: [] };
          this.searchLoading = false;
          return of(null);
        }
        this.searchLoading = true;
        return forkJoin({
          tracks: this.apiService.search(q)
        });
      })
    ).subscribe({
      next: (res) => {
        if (res) this.searchResults = res.tracks;
        this.searchLoading = false;
      },
      error: () => { this.searchLoading = false; }
    });
  }

  ngOnInit() {
    this.loadContent();
    // Refresh greeting every 60s so it stays accurate if the app is left open
    this.greetingTimer = setInterval(() => this.greeting.set(this.computeGreeting()), 60_000);
  }

  ngOnDestroy() {
    clearInterval(this.greetingTimer);
    this.searchSub?.unsubscribe();
  }

  async loadContent() {
    this.loading = true;
    this.pendingRequests = 2;

    // Get a fresh, auto-refreshed Spotify token before fetching new releases
    const spotifyToken = await this.spotifyAuth.getAccessToken().catch(() => null);

    this.apiService.getSpotifyNewReleases(spotifyToken ?? undefined).subscribe({
      next: (tracks) => { this.spotifyReleases = tracks; this.checkLoading(); },
      error: () => this.checkLoading()
    });

    const aiContext = this.regionAIContexts[this.activeRegion.code] ?? 'global trending pop';
    this.apiService.getYouTubeAITrending(aiContext, this.activeRegion.label + ' trending songs').subscribe({
      next: (tracks) => { this.youtubeTrending = tracks; this.checkLoading(); },
      error: () => {
        // Fallback to YouTube chart API
        this.apiService.getYouTubeTrending(this.activeRegion.code).subscribe({
          next: (tracks) => { this.youtubeTrending = tracks; this.checkLoading(); },
          error: () => this.checkLoading()
        });
      }
    });
  }

  setRegion(region: TrendingRegion) {
    if (this.activeRegion.code === region.code) return;
    this.activeRegion = region;
    this.activeLanguage = null;

    this.loading = true;
    this.pendingRequests = 1;
    const aiContext = this.regionAIContexts[region.code] ?? region.label + ' trending';
    this.apiService.getYouTubeAITrending(aiContext, region.label + ' trending songs').subscribe({
      next: (tracks) => { this.youtubeTrending = tracks; this.checkLoading(); },
      error: () => {
        this.apiService.getYouTubeTrending(region.code).subscribe({
          next: (tracks) => { this.youtubeTrending = tracks; this.checkLoading(); },
          error: () => this.checkLoading()
        });
      }
    });
  }

  setLanguage(lang: typeof this.indianLanguages[0]) {
    if (this.activeLanguage?.code === lang.code) return;
    this.activeLanguage = lang;
    this.loadingLanguage = true;
    // AI identifies trending songs → fetched from YouTube individually for accurate results
    this.apiService.getYouTubeAITrendingLanguage(lang.label).subscribe({
      next: (tracks) => {
        this.youtubeTrending = this.filterSongs(tracks);
        this.loadingLanguage = false;
      },
      error: () => {
        // Fallback: regular trending search if AI endpoint fails
        this.apiService.getYouTubeTrendingLanguage(lang.query, 18).subscribe({
          next: (tracks) => { this.youtubeTrending = this.filterSongs(tracks); this.loadingLanguage = false; },
          error: () => { this.loadingLanguage = false; }
        });
      }
    });
  }

  clearLanguage() {
    if (!this.activeLanguage) return;
    this.activeLanguage = null;
    this.loadingLanguage = true;
    this.pendingRequests = 1;
    this.apiService.getYouTubeTrending('IN').subscribe({
      next: (tracks) => { this.youtubeTrending = tracks; this.loadingLanguage = false; },
      error: () => { this.loadingLanguage = false; }
    });
  }

  private pendingRequests = 2;
  private checkLoading() {
    this.pendingRequests--;
    // Turn off loading once both requests have settled (success or error)
    if (this.pendingRequests <= 0) {
      this.loading = false;
    }
  }

  async selectMood(mood: MoodChip) {
    this.activeMood = mood;
    this.moodTracks = [];
    this.moodSource = 'all';
    this.loadingMood = true;

    try {
      const token = await this.spotifyAuth.getAccessToken();
      // Fetch Spotify and YouTube in parallel; Spotify gracefully returns [] if restricted
      const [spotifyTracks, youtubeTracks] = await Promise.all([
        token
          ? this.apiService.searchSpotifyByMood(mood.query, token).catch(() => [] as UnifiedTrack[])
          : Promise.resolve([] as UnifiedTrack[]),
        new Promise<UnifiedTrack[]>(resolve =>
          this.apiService.search(mood.query, 'youtube').subscribe({
            next: r => resolve(r.youTubeResults ?? []),
            error: () => resolve([])
          })
        )
      ]);
      this.moodTracks = [...spotifyTracks, ...youtubeTracks];
      this.moodSource = 'all';
    } catch (e) {
      console.error('Mood search failed:', e);
      this.moodTracks = [];
    } finally {
      this.loadingMood = false;
    }
  }

  setMoodSource(src: 'all' | 'spotify' | 'youtube') {
    this.moodSource = src;
  }

  clearMood() {
    this.activeMood = null;
    this.moodTracks = [];
  }

  playAll(tracks: UnifiedTrack[]) {
    if (tracks.length > 0) this.playerService.play(tracks[0], tracks);
  }

  // ── Search methods ──
  onSearchInput(q: string) {
    this.searchSubject.next(q);
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults = { query: '', spotifyResults: [], youTubeResults: [] };
    this.searchTab = 'all';
    this.searchLoading = false;
  }

  hasSearchResults(): boolean {
    return this.searchResults.spotifyResults.length > 0 ||
           this.searchResults.youTubeResults.length > 0;
  }

  connectSpotify() {
    this.spotifyAuth.login();
  }

  retrySpotify() {
    this.spotifyReleases = [];
    this.loading = true;
    this.loadContent();
  }

  private computeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning 🌅';
    if (hour < 18) return 'Good Afternoon ☀️';
    return 'Good Evening 🌙';
  }
}
