import { Component, HostListener, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SidebarComponent } from './shared/sidebar/sidebar.component';
import { PlayerBarComponent } from './shared/player-bar/player-bar.component';
import { QueuePanelComponent } from './shared/queue-panel/queue-panel.component';
import { ChatPanelComponent } from './shared/chat-panel/chat-panel.component';
import { NowPlayingModalComponent } from './shared/now-playing-modal/now-playing-modal.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, PlayerBarComponent, QueuePanelComponent, ChatPanelComponent, NowPlayingModalComponent, CommonModule, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell" [class.sidebar-open]="sidebarOpen()">
      <!-- Aurora ambient background orbs -->
      <div class="aurora" aria-hidden="true">
        <div class="orb orb-a"></div>
        <div class="orb orb-b"></div>
        <div class="orb orb-c"></div>
      </div>

      <!-- Mobile: top header bar -->
      <header class="mobile-header">
        <button class="hamburger" (click)="toggleSidebar()" id="btn-hamburger" aria-label="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span class="mobile-logo gradient-text">Wavify</span>
        <div class="mobile-logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
      </header>

      <!-- Sidebar overlay (mobile) -->
      <div class="sidebar-overlay" *ngIf="sidebarOpen()" (click)="closeSidebar()"></div>

      <!-- Sidebar -->
      <app-sidebar (closeRequest)="closeSidebar()"></app-sidebar>

      <!-- Main content -->
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>

      <app-queue-panel></app-queue-panel>
      <app-player-bar class="player-wrapper"></app-player-bar>
      <app-chat-panel></app-chat-panel>
      <app-now-playing-modal></app-now-playing-modal>

      <!-- Mobile bottom nav -->
      <nav class="mobile-bottom-nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}" class="mob-nav-item" id="mob-nav-home">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-2 0h2"/></svg>
          <span>Home</span>
        </a>
        <a routerLink="/search" routerLinkActive="active" class="mob-nav-item" id="mob-nav-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <span>Search</span>
        </a>
        <a routerLink="/library" routerLinkActive="active" class="mob-nav-item" id="mob-nav-library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          <span>Library</span>
        </a>
      </nav>
    </div>
  `,
  styles: [`
    /* Aurora orb background */
    .aurora {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    .orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(90px);
      opacity: 0.12;
    }
    .orb-a {
      width: 700px; height: 700px;
      top: -200px; left: -150px;
      background: radial-gradient(circle, #b06ef3, #7c6af8, transparent 70%);
      animation: orb-float-a 20s ease-in-out infinite;
    }
    .orb-b {
      width: 600px; height: 600px;
      top: 30%; right: -200px;
      background: radial-gradient(circle, #f472b6, #c084fc, transparent 70%);
      animation: orb-float-b 25s ease-in-out infinite;
    }
    .orb-c {
      width: 500px; height: 500px;
      bottom: 80px; left: 30%;
      background: radial-gradient(circle, #22d3ee, #818cf8, transparent 70%);
      animation: orb-float-c 18s ease-in-out infinite;
      opacity: 0.07;
    }

    /* App Shell Grid */
    .app-shell {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      grid-template-rows: 1fr var(--player-height);
      height: 100vh;
      overflow: hidden;
      position: relative;
    }

    .main-content {
      grid-column: 2;
      grid-row: 1;
      overflow: hidden;
      background: transparent;
      position: relative;
      z-index: 1;
    }

    .player-wrapper {
      grid-column: 1 / -1;
      grid-row: 2;
      position: relative;
      z-index: 10;
    }

    app-sidebar {
      grid-column: 1;
      grid-row: 1;
      position: relative;
      z-index: 5;
    }

    app-queue-panel { position: fixed; z-index: 100; }

    /* ── Hidden on desktop ── */
    .mobile-header    { display: none; }
    .mobile-bottom-nav { display: none; }
    .sidebar-overlay  { display: none; }

    /* ── Mobile (≤ 768px) ── */
    @media (max-width: 768px) {
      .app-shell {
        grid-template-columns: 1fr;
        grid-template-rows: 52px 1fr 70px 56px;
      }

      .mobile-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        background: rgba(9,9,15,0.95);
        backdrop-filter: blur(20px);
        border-bottom: 1px solid var(--border-subtle);
        grid-column: 1;
        grid-row: 1;
        z-index: 50;
      }

      .hamburger {
        width: 36px; height: 36px;
        display: flex; align-items: center; justify-content: center;
        background: transparent; border: none; cursor: pointer;
        color: var(--text-primary); border-radius: 8px;
        transition: background 0.15s;
      }
      .hamburger:hover { background: rgba(255,255,255,0.06); }
      .hamburger svg { width: 20px; height: 20px; }

      .mobile-logo { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }

      .mobile-logo-icon {
        width: 32px; height: 32px;
        background: var(--accent-gradient);
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        color: white;
        box-shadow: 0 4px 12px rgba(176,110,243,0.4);
      }
      .mobile-logo-icon svg { width: 16px; height: 16px; }

      app-sidebar {
        position: fixed;
        top: 0; left: -100%;
        width: 260px; height: 100%;
        z-index: 200;
        transition: left 0.28s cubic-bezier(0.4,0,0.2,1);
        box-shadow: 6px 0 40px rgba(0,0,0,0.6);
      }
      .sidebar-open app-sidebar { left: 0; }

      .sidebar-overlay {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        z-index: 199;
        backdrop-filter: blur(3px);
      }

      .main-content {
        grid-column: 1;
        grid-row: 2;
        overflow-x: hidden;
      }

      .player-wrapper { grid-column: 1; grid-row: 3; }

      .mobile-bottom-nav {
        display: flex;
        align-items: center;
        justify-content: space-around;
        grid-column: 1;
        grid-row: 4;
        background: rgba(9,9,15,0.95);
        backdrop-filter: blur(20px);
        border-top: 1px solid var(--border-subtle);
        padding: 6px 0;
        padding-bottom: max(6px, env(safe-area-inset-bottom));
      }

      .mob-nav-item {
        display: flex; flex-direction: column; align-items: center; gap: 2px;
        flex: 1; padding: 4px;
        color: var(--text-tertiary);
        font-size: 10px; font-weight: 600;
        text-decoration: none;
        transition: color 0.15s;
        border-radius: 8px;
      }
      .mob-nav-item svg { width: 22px; height: 22px; }
      .mob-nav-item.active { color: var(--accent-primary); }
      .mob-nav-item:hover  { color: var(--text-secondary); }
    }
  `]
})
export class AppComponent {
  sidebarOpen = signal(false);

  toggleSidebar() { this.sidebarOpen.update(v => !v); }
  closeSidebar() { this.sidebarOpen.set(false); }

  @HostListener('window:keydown.escape')
  onEscape() { this.closeSidebar(); }
}
