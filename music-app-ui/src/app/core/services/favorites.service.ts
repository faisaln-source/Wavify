import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UnifiedTrack } from '../models/track.model';

const STORAGE_KEY = 'wavify_favorites';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private favoritesSubject = new BehaviorSubject<UnifiedTrack[]>(this.loadFromStorage());
  favorites$ = this.favoritesSubject.asObservable();

  isFavorite(track: UnifiedTrack): boolean {
    return this.favoritesSubject.value.some(t => t.id === track.id && t.source === track.source);
  }

  toggle(track: UnifiedTrack): void {
    const current = this.favoritesSubject.value;
    const exists = this.isFavorite(track);
    const next = exists
      ? current.filter(t => !(t.id === track.id && t.source === track.source))
      : [track, ...current];
    this.favoritesSubject.next(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  getAll(): UnifiedTrack[] {
    return this.favoritesSubject.value;
  }

  private loadFromStorage(): UnifiedTrack[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
}
