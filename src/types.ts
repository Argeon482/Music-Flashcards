export interface PhraseBreakdown {
  word: string;
  meaning: string;
}

export interface Phrase {
  id: number;
  spanish: string;
  english: string;
  literal: string;
  category: string;
  timestamp: number;
  timestampStr: string;
  breakdown: PhraseBreakdown[];
}

export interface VocabTerm {
  word: string;
  definition: string;
  example: string;
}

export interface SongData {
  title: string;
  artist: string;
  youtubeId: string;
  phrases: Phrase[];
  vocab: VocabTerm[];
}
