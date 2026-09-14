import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UnifiedTrack, LocalPlaylist } from '../models/track.model';

const STORAGE_KEY = 'wavify_playlists';

@Injectable({ providedIn: 'root' })
export class PlaylistsService {
  private subject = new BehaviorSubject<LocalPlaylist[]>(this.loadFromStorage());
  playlists$ = this.subject.asObservable();

  // ─── CRUD ────────────────────────────────────────────────────────────────

  createPlaylist(name: string): LocalPlaylist {
    const playlist: LocalPlaylist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || 'Untitled Playlist',
      createdAt: Date.now(),
      tracks: []
    };
    const next = [playlist, ...this.subject.value];
    this.save(next);
    return playlist;
  }

  deletePlaylist(id: string): void {
    this.save(this.subject.value.filter(p => p.id !== id));
  }

  renamePlaylist(id: string, name: string): void {
    const next = this.subject.value.map(p =>
      p.id === id ? { ...p, name: name.trim() || p.name } : p
    );
    this.save(next);
  }

  // ─── Track Management ────────────────────────────────────────────────────

  addTrack(playlistId: string, track: UnifiedTrack): void {
    const next = this.subject.value.map(p => {
      if (p.id !== playlistId) return p;
      // Deduplicate
      const already = p.tracks.some(t => t.id === track.id && t.source === track.source);
      if (already) return p;
      return { ...p, tracks: [...p.tracks, track] };
    });
    this.save(next);
  }

  removeTrack(playlistId: string, trackId: string, source: string): void {
    const next = this.subject.value.map(p => {
      if (p.id !== playlistId) return p;
      return { ...p, tracks: p.tracks.filter(t => !(t.id === trackId && t.source === source)) };
    });
    this.save(next);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  isTrackInPlaylist(playlistId: string, track: UnifiedTrack): boolean {
    const pl = this.subject.value.find(p => p.id === playlistId);
    return pl ? pl.tracks.some(t => t.id === track.id && t.source === track.source) : false;
  }

  getAll(): LocalPlaylist[] {
    return this.subject.value;
  }

  getById(id: string): LocalPlaylist | undefined {
    return this.subject.value.find(p => p.id === id);
  }

  // ─── Storage ─────────────────────────────────────────────────────────────

  private save(playlists: LocalPlaylist[]): void {
    this.subject.next(playlists);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
    } catch { /* storage full — ignore */ }
  }

  private loadFromStorage(): LocalPlaylist[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
}
