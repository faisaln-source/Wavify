import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { UnifiedTrack } from '../models/track.model';
import { SpotifyAuthService } from './spotify-auth.service';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private currentTrackSubject = new BehaviorSubject<UnifiedTrack | null>(null);
  private isPlayingSubject = new BehaviorSubject<boolean>(false);
  private queueSubject = new BehaviorSubject<UnifiedTrack[]>([]);
  private progressSubject = new BehaviorSubject<number>(0);
  private volumeSubject = new BehaviorSubject<number>(80);
  private shuffleSubject = new BehaviorSubject<boolean>(false);
  private repeatSubject = new BehaviorSubject<'off' | 'all' | 'one'>('off');
  private spotifyReadySubject = new BehaviorSubject<boolean>(false);

  currentTrack$ = this.currentTrackSubject.asObservable();
  isPlaying$ = this.isPlayingSubject.asObservable();
  queue$ = this.queueSubject.asObservable();
  progress$ = this.progressSubject.asObservable();
  volume$ = this.volumeSubject.asObservable();
  shuffle$ = this.shuffleSubject.asObservable();
  repeat$ = this.repeatSubject.asObservable();
  spotifyReady$ = this.spotifyReadySubject.asObservable();

  /** Emits whenever a playlist Play button is clicked — QueuePanelComponent subscribes to auto-open */
  private queueOpenSubject = new Subject<void>();
  queueOpenRequest$ = this.queueOpenSubject.asObservable();
  requestQueueOpen() { this.queueOpenSubject.next(); }

  private audioElement: HTMLAudioElement | null = null;
  private youtubePlayer: any = null;
  private spotifySdkPlayer: any = null;
  private spotifyDeviceId: string | null = null;
  private progressInterval: any = null;
  private isContextPlaying = false; // true when playing via context_uri (playlist/album)

  constructor(private spotifyAuth: SpotifyAuthService) {
    this.audioElement = new Audio();
    this.audioElement.addEventListener('ended', () => this.playNext());
    this.audioElement.addEventListener('timeupdate', () => {
      if (this.audioElement && this.audioElement.duration) {
        this.progressSubject.next((this.audioElement.currentTime / this.audioElement.duration) * 100);
      }
    });
    this.initYouTubePlayer();
    this.initSpotifySDKPlayer();
    // Register callback so the SDK player is created/recreated after OAuth login
    this.spotifyAuth.registerOnLoginCallback(() => this.reinitializeSpotifyPlayer());
  }

  // ─── Spotify Web Playback SDK ──────────────────────────────────────────────

  private initSpotifySDKPlayer() {
    // The SDK script calls window.onSpotifyWebPlaybackSDKReady when loaded
    (window as any).onSpotifyWebPlaybackSDKReady = () => {
      this.createSpotifyPlayer();
    };

    // If the SDK already loaded before Angular bootstrapped, fire immediately
    if ((window as any).Spotify) {
      this.createSpotifyPlayer();
    }
  }

  private async createSpotifyPlayer() {
    const token = await this.spotifyAuth.getAccessToken();
    if (!token) return; // User not logged in yet
    if (!(window as any).Spotify) return; // SDK not loaded yet — will be called by onSpotifyWebPlaybackSDKReady

    this.spotifySdkPlayer = new (window as any).Spotify.Player({
      name: 'Wavify Player',
      volume: this.volumeSubject.value / 100,
      getOAuthToken: async (cb: (token: string) => void) => {
        const t = await this.spotifyAuth.getAccessToken();
        if (t) cb(t);
      }
    });

    // Device is ready — save device ID so we can transfer playback to it
    this.spotifySdkPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
      console.log('Spotify SDK ready, device ID:', device_id);
      this.spotifyDeviceId = device_id;
      this.spotifyReadySubject.next(true);
    });

    this.spotifySdkPlayer.addListener('not_ready', () => {
      console.warn('Spotify SDK device went offline');
      this.spotifyReadySubject.next(false);
    });

    // Sync player state from SDK → our subjects
    this.spotifySdkPlayer.addListener('player_state_changed', (state: any) => {
      if (!state) return;
      this.isPlayingSubject.next(!state.paused);
      const pos = state.position;
      const dur = state.duration;
      if (dur > 0) this.progressSubject.next((pos / dur) * 100);

      // Sync currently playing track name/artist from context playback
      const t = state.track_window?.current_track;
      if (t) {
        const currentTrack = this.currentTrackSubject.value;
        // Only override if we're not already tracking this track via our play() method
        // (i.e., this came from context_uri play — mismatch or no track set)
        const sdkUri = t.uri;
        if (!currentTrack || currentTrack.sourceUri !== sdkUri) {
          const artistName = t.artists?.map((a: any) => a.name).join(', ') ?? '';
          const imageUrl = t.album?.images?.[0]?.url ?? '';
          this.currentTrackSubject.next({
            id: t.id ?? '',
            title: t.name ?? '',
            artist: artistName,
            album: t.album?.name ?? '',
            thumbnailUrl: imageUrl,
            durationMs: dur,
            source: 'spotify',
            sourceUri: sdkUri,
            previewUrl: ''
          });
        }
      }
    });

    this.spotifySdkPlayer.addListener('authentication_error', (e: any) =>
      console.error('Spotify auth error:', e)
    );

    this.spotifySdkPlayer.connect();
  }

  /** Call this after OAuth login completes so the SDK player gets created */
  async reinitializeSpotifyPlayer() {
    if (this.spotifySdkPlayer) {
      this.spotifySdkPlayer.disconnect();
      this.spotifySdkPlayer = null;
      this.spotifyDeviceId = null;
    }
    if ((window as any).Spotify) {
      // SDK already loaded — create immediately
      await this.createSpotifyPlayer();
    } else {
      // SDK not loaded yet — set up callback so it creates when SDK loads
      (window as any).onSpotifyWebPlaybackSDKReady = () => {
        this.createSpotifyPlayer();
      };
    }
  }

  private async playSpotifyTrack(track: UnifiedTrack) {
    const token = await this.spotifyAuth.getAccessToken();

    // ── Fallback: no token or SDK not ready → try preview URL ──────────────
    if (!token || !this.spotifyDeviceId) {
      if (track.previewUrl) {
        this.playPreviewAudio(track);
      } else {
        // Still no way to play — prompt login
        this.isPlayingSubject.next(false);
        console.warn('Spotify: not logged in and no preview available. Please connect Spotify.');
      }
      return;
    }

    // ── Full SDK playback ────────────────────────────────────────────────────
    try {
      // Transfer playback to this device first
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ device_ids: [this.spotifyDeviceId], play: false })
      });

      // Play the specific track
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [track.sourceUri] })
      });

      this.isPlayingSubject.next(true);
      this.startSpotifyProgressPolling(token);
    } catch (err) {
      console.error('Spotify play error:', err);
      // Fallback to preview
      if (track.previewUrl) this.playPreviewAudio(track);
    }
  }

  /** Play a Spotify context (playlist/album/artist) by URI via the SDK */
  async playContext(contextUri: string) {
    const token = await this.spotifyAuth.getAccessToken();
    if (!token || !this.spotifyDeviceId) {
      console.warn('Spotify: cannot play context — not logged in or SDK not ready');
      return;
    }
    try {
      // Transfer playback to our device
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [this.spotifyDeviceId], play: false })
      });
      // Play the context
      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.spotifyDeviceId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_uri: contextUri })
      });
      if (res.ok || res.status === 204) {
        this.isContextPlaying = true;
        this.queueSubject.next([]); // clear local queue — SDK manages order
        this.isPlayingSubject.next(true);
        this.startSpotifyProgressPolling(token);
      } else {
        console.error('Spotify context play failed:', res.status, await res.text());
      }
    } catch (err) {
      console.error('Spotify context play error:', err);
    }
  }

  private playPreviewAudio(track: UnifiedTrack) {
    if (this.audioElement) {
      this.audioElement.src = track.previewUrl;
      this.audioElement.volume = this.volumeSubject.value / 100;
      this.audioElement.play().catch(() => {});
      this.isPlayingSubject.next(true);
    }
  }

  /** Poll Spotify /me/player to keep the progress bar in sync */
  private startSpotifyProgressPolling(token: string) {
    this.clearProgressInterval();
    this.progressInterval = setInterval(async () => {
      const track = this.currentTrackSubject.value;
      if (!track || track.source !== 'spotify' || !this.spotifyDeviceId) {
        this.clearProgressInterval();
        return;
      }
      try {
        const res = await fetch('https://api.spotify.com/v1/me/player', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 204 || !res.ok) return;
        const data = await res.json();
        if (data?.progress_ms != null && data?.item?.duration_ms > 0) {
          this.progressSubject.next((data.progress_ms / data.item.duration_ms) * 100);
          // Detect track end
          if (data.progress_ms >= data.item.duration_ms - 500) {
            this.clearProgressInterval();
            this.playNext();
          }
        }
      } catch { /* ignore polling errors */ }
    }, 1000);
  }

  // ─── YouTube Player ────────────────────────────────────────────────────────

  private initYouTubePlayer() {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }

    (window as any).onYouTubeIframeAPIReady = () => {
      const playerDiv = document.createElement('div');
      playerDiv.id = 'hidden-youtube-player';
      playerDiv.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;';
      document.body.appendChild(playerDiv);

      this.youtubePlayer = new (window as any).YT.Player('hidden-youtube-player', {
        height: '1', width: '1', videoId: '',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            this.setVolume(this.volumeSubject.value);
            const current = this.currentTrackSubject.value;
            if (current && current.source === 'youtube') this.playYouTube(current.sourceUri);
          },
          onStateChange: (event: any) => {
            const YT = (window as any).YT.PlayerState;
            if (event.data === YT.PLAYING) this.isPlayingSubject.next(true);
            else if (event.data === YT.PAUSED) this.isPlayingSubject.next(false);
            else if (event.data === YT.ENDED) this.playNext();
          }
        }
      });
    };
  }

  // ─── Public Playback API ───────────────────────────────────────────────────

  play(track: UnifiedTrack, playlist?: UnifiedTrack[]) {
    if (playlist) this.queueSubject.next(playlist);
    this.currentTrackSubject.next(track);
    this.progressSubject.next(0);

    if (track.source === 'spotify') {
      this.stopYouTube();
      this.stopPreviewAudio();
      this.clearProgressInterval();
      this.playSpotifyTrack(track);
    } else if (track.source === 'youtube') {
      this.stopPreviewAudio();
      this.stopSpotifyPlayback();
      this.clearProgressInterval();
      this.isPlayingSubject.next(true);
      this.playYouTube(track.sourceUri);
    }
  }

  async togglePlayPause() {
    const isPlaying = this.isPlayingSubject.value;
    const track = this.currentTrackSubject.value;
    if (!track) return;

    if (track.source === 'spotify') {
      if (this.spotifySdkPlayer && this.spotifyDeviceId) {
        // Use SDK toggle
        await this.spotifySdkPlayer.togglePlay();
      } else if (this.audioElement) {
        // Preview audio fallback
        if (isPlaying) this.audioElement.pause();
        else this.audioElement.play().catch(() => {});
        this.isPlayingSubject.next(!isPlaying);
      }
    } else if (track.source === 'youtube' && this.youtubePlayer) {
      if (isPlaying) this.youtubePlayer.pauseVideo();
      else this.youtubePlayer.playVideo();
      this.isPlayingSubject.next(!isPlaying);
    }
  }

  playNext() {
    const queue = this.queueSubject.value;
    const current = this.currentTrackSubject.value;

    // If playing in Spotify context mode (playlist/album), use Spotify's skip API
    if (this.isContextPlaying || (current?.source === 'spotify' && queue.length === 0)) {
      this.spotifySkipNext();
      return;
    }

    if (!current || queue.length === 0) return;
    const idx = queue.findIndex(t => t.id === current.id && t.source === current.source);
    let nextIdx: number;
    if (this.shuffleSubject.value) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = idx + 1;
      if (nextIdx >= queue.length) {
        if (this.repeatSubject.value === 'all') nextIdx = 0;
        else return;
      }
    }
    if (this.repeatSubject.value === 'one') this.play(current);
    else this.play(queue[nextIdx]);
  }

  playPrevious() {
    const queue = this.queueSubject.value;
    const current = this.currentTrackSubject.value;

    // If playing in Spotify context mode, use Spotify's previous API
    if (this.isContextPlaying || (current?.source === 'spotify' && queue.length === 0)) {
      this.spotifySkipPrevious();
      return;
    }

    if (!current || queue.length === 0) return;
    const idx = queue.findIndex(t => t.id === current.id && t.source === current.source);
    const prevIdx = idx <= 0 ? queue.length - 1 : idx - 1;
    this.play(queue[prevIdx]);
  }

  private async spotifySkipNext() {
    const token = await this.spotifyAuth.getAccessToken();
    if (!token || !this.spotifyDeviceId) return;
    try {
      await fetch(`https://api.spotify.com/v1/me/player/next?device_id=${this.spotifyDeviceId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) { console.error('Spotify skip next error:', err); }
  }

  private async spotifySkipPrevious() {
    const token = await this.spotifyAuth.getAccessToken();
    if (!token || !this.spotifyDeviceId) return;
    try {
      await fetch(`https://api.spotify.com/v1/me/player/previous?device_id=${this.spotifyDeviceId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) { console.error('Spotify skip previous error:', err); }
  }

  setVolume(vol: number) {
    this.volumeSubject.next(vol);
    if (this.audioElement) this.audioElement.volume = vol / 100;
    if (this.youtubePlayer) this.youtubePlayer.setVolume(vol);
    if (this.spotifySdkPlayer) this.spotifySdkPlayer.setVolume(vol / 100);
  }

  async seekTo(percent: number) {
    const track = this.currentTrackSubject.value;
    if (!track) return;
    this.progressSubject.next(percent);

    if (track.source === 'spotify') {
      if (this.spotifySdkPlayer && this.spotifyDeviceId) {
        const posMs = (percent / 100) * track.durationMs;
        await this.spotifySdkPlayer.seek(Math.floor(posMs));
      } else if (this.audioElement && this.audioElement.duration) {
        this.audioElement.currentTime = (percent / 100) * this.audioElement.duration;
      }
    } else if (track.source === 'youtube' && this.youtubePlayer) {
      const duration = this.youtubePlayer.getDuration();
      this.youtubePlayer.seekTo((percent / 100) * duration, true);
    }
  }

  toggleShuffle() { this.shuffleSubject.next(!this.shuffleSubject.value); }

  toggleRepeat() {
    const current = this.repeatSubject.value;
    this.repeatSubject.next(current === 'off' ? 'all' : current === 'all' ? 'one' : 'off');
  }

  setYouTubePlayer(player: any) { this.youtubePlayer = player; }

  get isSpotifyReady(): boolean { return this.spotifyReadySubject.value; }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private playYouTube(videoId: string) {
    if (this.youtubePlayer && this.youtubePlayer.loadVideoById) {
      this.youtubePlayer.loadVideoById(videoId);
      this.startYouTubeProgress();
    }
  }

  private startYouTubeProgress() {
    this.clearProgressInterval();
    this.progressInterval = setInterval(() => {
      if (this.youtubePlayer && this.youtubePlayer.getDuration) {
        const duration = this.youtubePlayer.getDuration();
        const current = this.youtubePlayer.getCurrentTime();
        if (duration > 0) this.progressSubject.next((current / duration) * 100);
      }
    }, 500);
  }

  private clearProgressInterval() {
    if (this.progressInterval) { clearInterval(this.progressInterval); this.progressInterval = null; }
  }

  private stopPreviewAudio() {
    if (this.audioElement) { this.audioElement.pause(); this.audioElement.src = ''; }
  }

  private stopYouTube() {
    this.clearProgressInterval();
    if (this.youtubePlayer && this.youtubePlayer.stopVideo) this.youtubePlayer.stopVideo();
  }

  private async stopSpotifyPlayback() {
    if (!this.spotifySdkPlayer) return;
    try { await this.spotifySdkPlayer.pause(); } catch { /* ignore */ }
  }

  formatDuration(ms: number): string {
    if (ms <= 0) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
