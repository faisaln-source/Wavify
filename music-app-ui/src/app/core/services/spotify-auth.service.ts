import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface SpotifyTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // UTC ms timestamp
}

@Injectable({ providedIn: 'root' })
export class SpotifyAuthService {
  private readonly STORAGE_KEY = 'wavify_spotify_auth';
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  isLoggedIn$ = this.isLoggedInSubject.asObservable();

  /** Late-bound callback to avoid circular DI: PlayerService → SpotifyAuthService → PlayerService */
  private onLoginCallback: (() => Promise<void>) | null = null;

  constructor(private http: HttpClient) {
    const stored = this.loadFromStorage();
    this.isLoggedInSubject.next(!!stored);
  }

  /** Register a callback to run after a successful login (used by PlayerService) */
  registerOnLoginCallback(fn: () => Promise<void>) {
    this.onLoginCallback = fn;
  }

  /** Redirects the browser to Spotify OAuth login */
  async login(): Promise<void> {
    const res: any = await firstValueFrom(
      this.http.get(`${environment.apiUrl}/spotify/auth-url`)
    );
    window.location.href = res.url;
  }

  /** Call this from the callback page with the `code` query param */
  async handleCallback(code: string): Promise<void> {
    const res: any = await firstValueFrom(
      this.http.post(`${environment.apiUrl}/spotify/callback?code=${encodeURIComponent(code)}`, {})
    );
    this.saveToStorage({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      expiresAt: Date.now() + (res.expiresIn - 60) * 1000
    });
    this.isLoggedInSubject.next(true);
    // Reinitialize the Spotify SDK player — errors here must not fail the whole callback
    if (this.onLoginCallback) {
      try { await this.onLoginCallback(); } catch (e) { console.warn('SDK init after login:', e); }
    }
  }

  /** Returns a valid access token, refreshing if expired */
  async getAccessToken(): Promise<string | null> {
    let data = this.loadFromStorage();
    if (!data) return null;

    if (Date.now() >= data.expiresAt) {
      try {
        const res: any = await firstValueFrom(
          this.http.post(
            `${environment.apiUrl}/spotify/refresh?refreshToken=${encodeURIComponent(data.refreshToken)}`,
            {}
          )
        );
        data = {
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          expiresAt: Date.now() + (res.expiresIn - 60) * 1000
        };
        this.saveToStorage(data);
      } catch {
        this.logout();
        return null;
      }
    }

    return data.accessToken;
  }

  isLoggedIn(): boolean {
    return !!this.loadFromStorage();
  }

  logout(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.isLoggedInSubject.next(false);
  }

  private saveToStorage(data: SpotifyTokenData): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  private loadFromStorage(): SpotifyTokenData | null {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
