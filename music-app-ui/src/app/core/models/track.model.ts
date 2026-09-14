export interface UnifiedTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  thumbnailUrl: string;
  durationMs: number;
  source: 'spotify' | 'youtube';
  sourceUri: string;
  previewUrl: string;
}

export interface SearchResponse {
  query: string;
  spotifyResults: UnifiedTrack[];
  youTubeResults: UnifiedTrack[];
}

export interface PlaylistInfo {
  playlistId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  description: string;
  trackCount: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string;
  trackCount: number;
  owner: string;
}

/** User-created local playlist stored in localStorage */
export interface LocalPlaylist {
  id: string;
  name: string;
  createdAt: number;
  tracks: UnifiedTrack[];
}
