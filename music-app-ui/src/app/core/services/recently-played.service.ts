import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UnifiedTrack } from '../models/track.model';

const STORAGE_KEY = 'wavify_recently_played';
const MAX_RECENT = 50;

@Injectable({ providedIn: 'root' })
export class RecentlyPlayedService {
  private subject = new BehaviorSubject<UnifiedTrack[]>(this.loadFromStorage());
  recentTracks$ = this.subject.asObservable();

  addTrack(track: UnifiedTrack): void {
    const current = this.subject.value;
    const deduped = current.filter(t => !(t.id === track.id && t.source === track.source));
    const next = [track, ...deduped].slice(0, MAX_RECENT);
    this.subject.next(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* storage full — ignore */ }
  }

  getAll(): UnifiedTrack[] {
    return this.subject.value;
  }

  clear(): void {
    this.subject.next([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  private loadFromStorage(): UnifiedTrack[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
}
