
export interface WikiArticle {
  pageid: number;
  title: string;
  dist: number;
  lat: number;
  lon: number;
  snippet?: string;
  vector: [number, number]; // 2D projection for visualization
  links: Set<string>;        // Outgoing Wikipedia links for semantic mapping
}

export interface Gap {
  id: string;
  from: WikiArticle;
  to: WikiArticle;
  center: [number, number];
  distance: number;
  semanticSimilarity: number;
  sharedLinks: string[];     // The "semantic overlap" between the two concepts
}

export type VoiceRole = 'bass' | 'harmony' | 'melody';

export interface GeneratedVoice {
  role: VoiceRole;
  audioBuffer: AudioBuffer | null;
  text: string;
  voiceName: string;
}

export interface SongSession {
  gap: Gap;
  voices: GeneratedVoice[];
  isGenerating: boolean;
  isPlaying: boolean;
}
