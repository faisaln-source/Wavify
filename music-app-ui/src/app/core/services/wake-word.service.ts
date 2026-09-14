import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WakeWordService {
  isActive = signal(false);
  isSupported = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;

  private recognition: any = null;
  private onWake$ = new Subject<void>();
  wakeDetected$ = this.onWake$.asObservable();

  // Accepted wake phrases (fuzzy-friendly)
  private readonly wakeWords = ['hey wavify', 'wavify', 'ok wavify', 'hi wavify', 'hay wavify'];

  toggle() {
    if (this.isActive()) this.stop();
    else this.start();
  }

  private start() {
    if (!this.isSupported) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event: any) => {
      // Check all alternatives from the latest result
      const latest = event.results[event.results.length - 1];
      for (let i = 0; i < latest.length; i++) {
        const text = latest[i].transcript.toLowerCase().trim();
        if (this.wakeWords.some(w => text.includes(w))) {
          this.onWake$.next();
          break;
        }
      }
    };

    this.recognition.onend = () => {
      // Auto-restart while active
      if (this.isActive()) {
        setTimeout(() => {
          try { this.recognition?.start(); } catch { }
        }, 200);
      }
    };

    this.recognition.onerror = (e: any) => {
      // Ignore no-speech errors (normal silence), restart on others
      if (e.error === 'aborted') return;
      if (e.error !== 'no-speech') {
        console.warn('Wake word error:', e.error);
        this.isActive.set(false);
      }
    };

    this.recognition.start();
    this.isActive.set(true);
  }

  stop() {
    this.isActive.set(false);
    try { this.recognition?.abort(); } catch { }
    this.recognition = null;
  }
}
