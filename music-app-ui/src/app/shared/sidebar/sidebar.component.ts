import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, AsyncPipe } from '@angular/common';
import { SpotifyAuthService } from '../../core/services/spotify-auth.service';
import { PlayerService } from '../../core/services/player.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule, AsyncPipe],
  template: `
    <aside class="sidebar">
      <div class="logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        <span class="logo-text gradient-text">Wavify</span>
      </div>

      <nav class="nav-main">
        <span class="nav-label">Menu</span>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="nav-item" id="nav-home">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-2 0h2"/></svg>
          <span>Home</span>
        </a>
        <a routerLink="/search" routerLinkActive="active" class="nav-item" id="nav-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <span>Search</span>
        </a>
        <a routerLink="/library" routerLinkActive="active" class="nav-item" id="nav-library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          <span>Library</span>
        </a>
      </nav>

      <nav class="nav-services">
        <span class="nav-label">Services</span>

        <!-- Spotify card: shows login status and connect button -->
        <div class="service-card" [class.clickable]="!(spotifyAuth.isLoggedIn$ | async)" (click)="connectSpotify()">
          <div class="service-icon spotify">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          </div>
          <div class="service-info">
            <span class="service-name">Spotify</span>
            <ng-container *ngIf="spotifyAuth.isLoggedIn$ | async; else notConnected">
              <span class="service-status connected">
                <span class="status-dot" [class.sdk-active]="playerService.spotifyReady$ | async"></span>
                {{ (playerService.spotifyReady$ | async) ? 'Playing In-App ✓' : 'Logged In' }}
              </span>
              <button class="disconnect-btn" (click)="$event.stopPropagation(); disconnectSpotify()">Disconnect</button>
            </ng-container>
            <ng-template #notConnected>
              <span class="service-status">
                <span class="status-dot offline"></span>Not Connected
              </span>
              <span class="connect-hint">Click to connect →</span>
            </ng-template>
          </div>
        </div>

        <div class="service-card">
          <div class="service-icon youtube">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          </div>
          <div class="service-info">
            <span class="service-name">YouTube</span>
            <span class="service-status connected"><span class="status-dot yt" style="background:#f87171;animation:none"></span>Ready</span>
          </div>
        </div>
      </nav>

      <!-- Queue shortcut — only shown when a playlist is loaded -->
      <div class="queue-shortcut"
           *ngIf="(playerService.queue$ | async)?.length"
           (click)="openQueue()"
           id="sidebar-queue-btn">
        <div class="queue-shortcut-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 6h16M4 10h16M4 14h10M4 18h10"/>
            <circle cx="18" cy="16" r="3"/>
            <path d="M21 16v-5l-3 1.5"/>
          </svg>
        </div>
        <div class="queue-shortcut-info">
          <span class="queue-shortcut-label">Queue</span>
          <span class="queue-shortcut-count">{{ (playerService.queue$ | async)?.length }} tracks</span>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar { width: var(--sidebar-width); height: 100%; background: var(--bg-secondary); border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; padding: 20px 16px; gap: 28px; overflow-y: auto; }
    .logo { display: flex; align-items: center; gap: 10px; padding: 4px 8px; }
    .logo-icon { width: 32px; height: 32px; background: var(--accent-gradient); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; }
    .logo-icon svg { width: 18px; height: 18px; }
    .logo-text { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .nav-label { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 1.5px; padding: 0 12px; margin-bottom: 4px; display: block; }
    .nav-main, .nav-services { display: flex; flex-direction: column; gap: 4px; }
    .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--radius-sm); color: var(--text-secondary); font-size: 14px; font-weight: 500; transition: all var(--transition-fast); }
    .nav-item:hover { background: var(--bg-card-hover); color: var(--text-primary); transform: translateX(4px); }
    .nav-item.active { background: rgba(167, 139, 250, 0.1); color: var(--accent-primary); position: relative; }
    .nav-item.active::before { content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 20px; background: var(--accent-gradient); border-radius: 0 4px 4px 0; }
    .nav-item svg { width: 20px; height: 20px; flex-shrink: 0; }
    .service-card { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-subtle); transition: all var(--transition-fast); }
    .service-card:hover { background: var(--bg-card-hover); border-color: var(--border-medium); }
    .service-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .service-icon svg { width: 20px; height: 20px; }
    .service-icon.spotify { background: rgba(29, 185, 84, 0.15); color: var(--accent-spotify); }
    .service-icon.youtube { background: rgba(255, 0, 0, 0.15); color: var(--accent-youtube); }
    .service-info { display: flex; flex-direction: column; gap: 4px; }
    .service-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .service-status { font-size: 11px; color: var(--text-tertiary); display: flex; align-items: center; gap: 5px; }
    .service-status.connected { color: #4ade80; }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ade80; animation: pulse-dot 2s ease-in-out infinite; }
    .status-dot.sdk-active { background: #a78bfa; }
    .status-dot.offline { background: #6b7280; animation: none; }
    .clickable { cursor: pointer; }
    .clickable:hover { border-color: rgba(29,185,84,0.4) !important; background: rgba(29,185,84,0.06) !important; }
    .connect-hint { font-size: 10px; color: #1db954; font-weight: 600; margin-top: 1px; }
    .disconnect-btn { margin-top: 4px; font-size: 10px; color: var(--text-tertiary); background: none; border: none; cursor: pointer; padding: 0; text-decoration: underline; }
    .disconnect-btn:hover { color: #f87171; }
    @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    /* Queue shortcut */
    .queue-shortcut { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-subtle); cursor: pointer; transition: all var(--transition-fast); margin-top: auto; }
    .queue-shortcut:hover { background: var(--bg-card-hover); border-color: rgba(167,139,250,0.3); }
    .queue-shortcut-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(167,139,250,0.15); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .queue-shortcut-icon svg { width: 20px; height: 20px; }
    .queue-shortcut-info { display: flex; flex-direction: column; gap: 3px; }
    .queue-shortcut-label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .queue-shortcut-count { font-size: 11px; color: var(--accent-primary); font-weight: 500; }
  `]
})
export class SidebarComponent {
  constructor(
    public spotifyAuth: SpotifyAuthService,
    public playerService: PlayerService
  ) {}

  connectSpotify() {
    if (!this.spotifyAuth.isLoggedIn()) this.spotifyAuth.login();
  }

  disconnectSpotify() {
    this.spotifyAuth.logout();
  }

  openQueue() {
    this.playerService.requestQueueOpen();
  }
}
