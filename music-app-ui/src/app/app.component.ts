import { Component, HostListener, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SidebarComponent } from './shared/sidebar/sidebar.component';
import { PlayerBarComponent } from './shared/player-bar/player-bar.component';
import { QueuePanelComponent } from './shared/queue-panel/queue-panel.component';
import { ChatPanelComponent } from './shared/chat-panel/chat-panel.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, PlayerBarComponent, QueuePanelComponent, ChatPanelComponent, CommonModule, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell" [class.sidebar-open]="sidebarOpen()">
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
    .app-shell {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      grid-template-rows: 1fr var(--player-height);
      height: 100vh;
      overflow: hidden;
    }

    .main-content {
      grid-column: 2;
      grid-row: 1;
      overflow: hidden;
      background: var(--bg-primary);
      position: relative;
    }

    .player-wrapper {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    app-sidebar {
      grid-column: 1;
      grid-row: 1;
    }

    app-queue-panel {
      position: fixed;
      z-index: 10;
    }

    /* ── Elements hidden on desktop ── */
    .mobile-header { display: none; }
    .mobile-bottom-nav { display: none; }
    .sidebar-overlay { display: none; }

    /* ── Mobile (<= 768px) ── */
    @media (max-width: 768px) {
      .app-shell {
        grid-template-columns: 1fr;
        grid-template-rows: 52px 1fr auto 56px;
      }

      /* Mobile top header */
      .mobile-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        background: var(--bg-secondary);
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
      .hamburger:hover { background: rgba(255,255,255,0.05); }
      .hamburger svg { width: 20px; height: 20px; }

      .mobile-logo {
        font-size: 18px; font-weight: 800; letter-spacing: -0.5px;
      }

      .mobile-logo-icon {
        width: 32px; height: 32px;
        background: var(--accent-gradient);
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        color: white;
      }
      .mobile-logo-icon svg { width: 16px; height: 16px; }

      /* Sidebar: fullscreen drawer on mobile */
      app-sidebar {
        position: fixed;
        top: 0; left: -100%;
        width: 260px; height: 100%;
        z-index: 200;
        transition: left 0.25s ease;
        box-shadow: 4px 0 24px rgba(0,0,0,0.4);
      }

      .sidebar-open app-sidebar {
        left: 0;
      }

      /* Overlay */
      .sidebar-overlay {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 199;
        backdrop-filter: blur(2px);
      }

      .main-content {
        grid-column: 1;
        grid-row: 2;
      }

      .player-wrapper {
        grid-column: 1;
        grid-row: 3;
      }

      /* Bottom nav */
      .mobile-bottom-nav {
        display: flex;
        align-items: center;
        justify-content: space-around;
        grid-column: 1;
        grid-row: 4;
        background: var(--bg-secondary);
        border-top: 1px solid var(--border-subtle);
        padding: 6px 0 4px;
        padding-bottom: max(4px, env(safe-area-inset-bottom));
      }

      .mob-nav-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        flex: 1;
        padding: 4px;
        color: var(--text-tertiary);
        font-size: 10px;
        font-weight: 600;
        text-decoration: none;
        transition: color 0.15s;
        border-radius: 8px;
      }
      .mob-nav-item svg { width: 22px; height: 22px; }
      .mob-nav-item.active { color: var(--accent-primary); }
      .mob-nav-item:hover { color: var(--text-secondary); }
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
