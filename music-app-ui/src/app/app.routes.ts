import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { SearchComponent } from './features/search/search.component';
import { LibraryComponent } from './features/library/library.component';
import { SpotifyCallbackComponent } from './features/auth/callback.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'search', component: SearchComponent },
  { path: 'library', component: LibraryComponent },
  { path: 'auth/callback', component: SpotifyCallbackComponent },
  { path: '**', redirectTo: '' }
];


