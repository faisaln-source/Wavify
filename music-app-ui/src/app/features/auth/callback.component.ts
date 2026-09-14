import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SpotifyAuthService } from '../../core/services/spotify-auth.service';

@Component({
  selector: 'app-spotify-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="callback-wrap">
      <div class="callback-card" *ngIf="!error; else errorTpl">
        <div class="spinner"></div>
        <p>Connecting to Spotify…</p>
      </div>
      <ng-template #errorTpl>
        <div class="callback-card error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <p>{{ error }}</p>
          <p *ngIf="debugInfo" class="debug">{{ debugInfo }}</p>
          <button (click)="router.navigate(['/'])">Go Home</button>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .callback-wrap { display:flex; align-items:center; justify-content:center; height:100vh; background:var(--bg-primary); }
    .callback-card { display:flex; flex-direction:column; align-items:center; gap:16px; padding:40px; background:var(--bg-card); border-radius:var(--radius-lg); border:1px solid var(--border-subtle); color:var(--text-secondary); font-size:15px; max-width:480px; text-align:center; }
    .callback-card.error { color:#f87171; }
    .callback-card svg { width:48px; height:48px; }
    .debug { font-size:11px; color:var(--text-tertiary); font-family:monospace; word-break:break-all; }
    .callback-card button { padding:10px 24px; border-radius:var(--radius-sm); background:var(--accent-gradient); color:white; font-weight:600; font-size:14px; cursor:pointer; margin-top:8px; }
    .spinner { width:40px; height:40px; border:3px solid rgba(167,139,250,0.2); border-top-color:var(--accent-primary); border-radius:50%; animation:spin 0.8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `]
})
export class SpotifyCallbackComponent implements OnInit {
  error: string | null = null;
  debugInfo: string | null = null;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private spotifyAuth: SpotifyAuthService
  ) {}

  async ngOnInit() {
    const allParams = this.route.snapshot.queryParams;
    const code = this.route.snapshot.queryParamMap.get('code');
    const errorParam = this.route.snapshot.queryParamMap.get('error');
    const errorDesc = this.route.snapshot.queryParamMap.get('error_description');

    console.log('Callback params:', allParams, 'URL:', window.location.href);

    if (errorParam) {
      this.error = `Spotify returned error: ${errorParam}`;
      this.debugInfo = errorDesc
        ? `Details: ${errorDesc}`
        : `Query string: ${window.location.search}`;
      return;
    }

    if (!code) {
      this.error = 'No authorization code received from Spotify.';
      this.debugInfo = `Params received: ${JSON.stringify(allParams)} | URL: ${window.location.href}`;
      return;
    }

    try {
      await this.spotifyAuth.handleCallback(code);
      this.router.navigate(['/']);
    } catch (e: any) {
      this.error = `Token exchange failed: ${e?.message ?? 'Unknown error'}`;
    }
  }
}
