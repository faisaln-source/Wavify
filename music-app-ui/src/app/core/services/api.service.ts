import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UnifiedTrack, SearchResponse, PlaylistInfo, SpotifyPlaylist } from '../models/track.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders();
    try {
      const raw = localStorage.getItem('wavify_spotify_auth');
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.accessToken) {
          headers = headers.set('X-Spotify-Token', data.accessToken);
        }
      }
    } catch {}
    return headers;
  }

  search(query: string, source?: string): Observable<SearchResponse> {
    let url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
    if (source) url += `&source=${source}`;
    return this.http.get<SearchResponse>(url, { headers: this.getHeaders() });
  }

  getSpotifyNewReleases(token?: string): Observable<UnifiedTrack[]> {
    let headers = token
      ? new HttpHeaders({ 'X-Spotify-Token': token })
      : this.getHeaders();
    return this.http.get<UnifiedTrack[]>(`${this.baseUrl}/spotify/new-releases`, { headers });
  }

  getYouTubeTrending(): Observable<UnifiedTrack[]> {
    return this.http.get<UnifiedTrack[]>(`${this.baseUrl}/youtube/trending`);
  }

  /** Search Spotify tracks by mood/genre query string */
  async searchSpotifyByMood(query: string, token?: string): Promise<UnifiedTrack[]> {
    let headers = new HttpHeaders();
    const storedToken = token ?? localStorage.getItem('spotify_token');
    if (storedToken) headers = headers.set('X-Spotify-Token', storedToken);
    const url = `${this.baseUrl}/spotify/search?q=${encodeURIComponent(query)}`;
    return new Promise<UnifiedTrack[]>((resolve, reject) => {
      this.http.get<UnifiedTrack[]>(url, { headers }).subscribe({
        next: resolve,
        error: reject
      });
    });
  }

  searchPlaylists(query: string): Observable<PlaylistInfo[]> {
    return this.http.get<PlaylistInfo[]>(`${this.baseUrl}/youtube/playlists?q=${encodeURIComponent(query)}`);
  }

  getPlaylistItems(playlistId: string): Observable<UnifiedTrack[]> {
    return this.http.get<UnifiedTrack[]>(`${this.baseUrl}/youtube/playlist/${encodeURIComponent(playlistId)}/items`);
  }

  spotifyLogin(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.baseUrl}/auth/spotify/login`);
  }

  spotifyCallback(code: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/auth/spotify/callback?code=${code}`);
  }

  getSpotifyPlaylists(token: string): Observable<SpotifyPlaylist[]> {
    const headers = new HttpHeaders({ 'X-Spotify-Token': token });
    return this.http.get<SpotifyPlaylist[]>(`${this.baseUrl}/spotify/playlists`, { headers });
  }

  getSpotifyPlaylistTracks(playlistId: string, token: string): Observable<UnifiedTrack[]> {
    const headers = new HttpHeaders({ 'X-Spotify-Token': token });
    return this.http.get<UnifiedTrack[]>(`${this.baseUrl}/spotify/playlists/${encodeURIComponent(playlistId)}/tracks`, { headers });
  }

  /** Fetch playlist tracks directly from Spotify API (browser → Spotify, no backend) */
  async getSpotifyPlaylistTracksDirect(playlistId: string, token: string): Promise<UnifiedTrack[]> {
    const tracks: UnifiedTrack[] = [];
    let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(id,name,uri,duration_ms,preview_url,artists(name),album(name,images)))`;

    while (url) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) break; // 403 dev mode restriction — return whatever we have
      const data: any = await res.json();
      for (const item of (data.items || [])) {
        if (!item.track || !item.track.id) continue;
        const t = item.track;
        tracks.push({
          id: t.id,
          title: t.name,
          artist: t.artists?.map((a: any) => a.name).join(', ') ?? '',
          album: t.album?.name ?? '',
          thumbnailUrl: t.album?.images?.[0]?.url ?? '',
          durationMs: t.duration_ms ?? 0,
          source: 'spotify' as const,
          sourceUri: t.uri,
          previewUrl: t.preview_url ?? ''
        });
      }
      url = data.next ?? null;
    }
    return tracks;
  }

  getLikedTracks(token: string): Observable<UnifiedTrack[]> {
    const headers = new HttpHeaders({ 'X-Spotify-Token': token });
    return this.http.get<UnifiedTrack[]>(`${this.baseUrl}/spotify/liked-tracks`, { headers });
  }

  /** Fetch the Spotify playback queue — not blocked in dev mode */
  async getPlaybackQueue(token: string): Promise<UnifiedTrack[]> {
    const res: Response = await fetch('https://api.spotify.com/v1/me/player/queue', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const data: any = await res.json();

    const tracks: UnifiedTrack[] = [];
    // Include currently playing + queue items
    const allItems = [data.currently_playing, ...(data.queue || [])].filter(Boolean);
    for (const t of allItems) {
      if (!t?.id) continue;
      tracks.push({
        id: t.id,
        title: t.name,
        artist: t.artists?.map((a: any) => a.name).join(', ') ?? '',
        album: t.album?.name ?? '',
        thumbnailUrl: t.album?.images?.[0]?.url ?? '',
        durationMs: t.duration_ms ?? 0,
        source: 'spotify' as const,
        sourceUri: t.uri,
        previewUrl: t.preview_url ?? ''
      });
    }
    return tracks;
  }
}
