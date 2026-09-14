import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ChatAction {
  type: string;   // 'play'
  query: string;  // search query
  source: string; // 'youtube' | 'spotify'
}

export interface ChatResponse {
  reply: string;
  action?: ChatAction | null;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly apiUrl = '/api/chat';

  history = signal<ChatMessage[]>([]);

  constructor(private http: HttpClient) {}

  sendMessage(message: string, currentTrackTitle?: string, currentArtist?: string): Observable<ChatResponse> {
    const body = {
      message,
      history: this.history(),
      currentTrackTitle: currentTrackTitle ?? null,
      currentArtist: currentArtist ?? null
    };
    return this.http.post<ChatResponse>(this.apiUrl, body);
  }

  addToHistory(msg: ChatMessage) {
    this.history.update(h => [...h, msg]);
  }

  clearHistory() {
    this.history.set([]);
  }
}
