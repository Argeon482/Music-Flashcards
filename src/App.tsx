import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, RotateCcw, Volume2, Star, Check, X, BookOpen, 
  HelpCircle, Keyboard, ArrowLeft, ArrowRight, Music, 
  AlertCircle, Headphones, Shuffle, Upload, Download, Film,
  Info, Sparkle, ExternalLink, CheckCircle2, Copy, Plus,
  Trash2, FolderHeart, Languages, Settings, Users, Cloud, CloudOff, CloudLightning
} from 'lucide-react';
import { SONG_DATA } from './data';
import { Phrase, PhraseBreakdown, VocabTerm, SongData } from './types';
import { db, collection, onSnapshot, setDoc, doc, deleteDoc, handleFirestoreError } from './firebase';


// PROMPT TEMPLATES dictionary for seamless external generation
const PROMPT_TEMPLATES = {
  flash: `Retrieve the FULL, complete lyrics, English translations, selective breakdowns, and timestamps for a song.

CRITICAL REQUIREMENT FOR GEMINI FLASH/LITE (TOKEN OPTIMIZATION):
To prevent hitting maximum output token limits and being cut off or truncated, you MUST follow these guidelines:
1. Do NOT skip or summarize any lyrics. You must include EVERY single sentence/phrase from the Intro to the Outro.
2. To save precious tokens so the complete song fits in a single turn, limit the 'breakdown' array within each phrase to ONLY the 1 or 2 most important/challenging words of that phrase, rather than breaking down every word.
3. Extract a comprehensive vocabulary list of at least 12-15 core words/idioms from the song and list them in the "vocab" array.
4. Output EXACTLY a single raw JSON object. Do NOT wrap it in markdown codeblocks (no \`\`\`json).

Here is the exact schema structure required:
{
  "title": "Song Name Here",
  "artist": "Artist Name Here",
  "youtubeId": "YouTube 11-char Video ID (e.g. kRt2sRyup6A)",
  "phrases": [
    {
      "id": 1,
      "spanish": "Full Spanish phrase/line",
      "english": "Natural English translation",
      "literal": "Literal word-for-word translation",
      "category": "Song section (e.g., Chorus, Verse 1, Intro)",
      "timestamp": 12,
      "timestampStr": "0:12",
      "breakdown": [
        { "word": "Only 1 or 2 key Spanish words", "meaning": "English translation" }
      ]
    }
  ],
  "vocab": [
    { "word": "Key vocab word", "definition": "English definition", "example": "Sentence from song showing usage" }
  ]
}

Please provide the complete structured data for this song: "[INSERT SONG NAME AND ARTIST HERE]"`,

  detailed: `Retrieve the FULL, complete lyrics, English translations, highly detailed word-by-word breakdowns, and timestamps for a song.

CRITICAL REQUIREMENTS (FOR HIGH-CAPACITY PRO MODELS):
1. You MUST include every single lyric line from start to finish. Do NOT summarize or omit anything.
2. In the "breakdown" array of each phrase, provide a comprehensive word-by-word or chunk-by-chunk translation of virtually all words in that phrase.
3. In the "vocab" array, include at least 15-20 key vocabulary words, slang, verbs, or grammar points found in the song with definitions and contextual examples.
4. Output EXACTLY a single raw JSON object. Do NOT wrap it in markdown codeblocks (no \`\`\`json).

Here is the exact schema structure required:
{
  "title": "Song Name Here",
  "artist": "Artist Name Here",
  "youtubeId": "YouTube 11-char Video ID (e.g. kRt2sRyup6A)",
  "phrases": [
    {
      "id": 1,
      "spanish": "Full Spanish phrase/line",
      "english": "Natural English translation",
      "literal": "Literal word-for-word translation",
      "category": "Song section (e.g., Chorus, Verse 1, Intro)",
      "timestamp": 12,
      "timestampStr": "0:12",
      "breakdown": [
        { "word": "Spanish word", "meaning": "English translation" }
      ]
    }
  ],
  "vocab": [
    { "word": "Key vocab word", "definition": "English definition", "example": "Sentence from song showing usage" }
  ]
}

Please provide the complete structured data for this song: "[INSERT SONG NAME AND ARTIST HERE]"`,

  parts: `Retrieve PART 1 (First half) of the complete lyrics, English translations, and timestamps for a song.

CRITICAL REQUIREMENTS FOR EXTRA LONG SONGS:
1. We will generate this long song in two separate halves so it is fully comprehensive and does not truncate.
2. Provide ONLY the first half of the song (e.g., Intro, Verse 1, Chorus, Verse 2). 
3. Include a comprehensive "vocab" array of 8-10 terms found in this first half.
4. Output EXACTLY a single raw JSON object. Do NOT wrap it in markdown codeblocks (no \`\`\`json).

Here is the exact schema structure required:
{
  "title": "Song Name Here (Part 1)",
  "artist": "Artist Name Here",
  "youtubeId": "YouTube 11-char Video ID (e.g. kRt2sRyup6A)",
  "phrases": [
    {
      "id": 1,
      "spanish": "Full Spanish phrase/line",
      "english": "Natural English translation",
      "literal": "Literal word-for-word translation",
      "category": "Song section",
      "timestamp": 12,
      "timestampStr": "0:12",
      "breakdown": [
        { "word": "Spanish word", "meaning": "English translation" }
      ]
    }
  ],
  "vocab": [
    { "word": "Key vocab word", "definition": "English definition", "example": "Sentence from song showing usage" }
  ]
}

Please provide the first half (Part 1) of structured data for this song: "[INSERT SONG NAME AND ARTIST HERE]"`
};

function validateSongData(data: any, isPartial = false): string | null {
  if (!data) return "JSON payload is empty or invalid.";
  if (typeof data !== 'object') return "JSON must be a valid object.";
  
  if (!isPartial) {
    if (!data.title || typeof data.title !== 'string') return "Missing or invalid 'title' string.";
    if (!data.artist || typeof data.artist !== 'string') return "Missing or invalid 'artist' string.";
    if (!data.youtubeId || typeof data.youtubeId !== 'string') return "Missing or invalid 'youtubeId' string.";
  }
  
  if (!Array.isArray(data.phrases)) return "'phrases' must be an array.";
  for (let i = 0; i < data.phrases.length; i++) {
    const p = data.phrases[i];
    if (typeof p !== 'object' || p === null) return `Phrase at index ${i} must be an object.`;
    if (typeof p.id !== 'number') return `Phrase at index ${i} is missing an 'id' number.`;
    if (typeof p.spanish !== 'string') return `Phrase at index ${i} is missing 'spanish' text.`;
    if (typeof p.english !== 'string') return `Phrase at index ${i} is missing 'english' text.`;
    if (typeof p.literal !== 'string') return `Phrase at index ${i} is missing 'literal' translation.`;
    if (typeof p.category !== 'string') return `Phrase at index ${i} is missing 'category'.`;
    if (typeof p.timestamp !== 'number') return `Phrase at index ${i} is missing 'timestamp' (seconds).`;
    if (typeof p.timestampStr !== 'string') return `Phrase at index ${i} is missing 'timestampStr' (e.g. '0:12').`;
    
    if (p.breakdown && !Array.isArray(p.breakdown)) {
      return `Phrase at index ${i} 'breakdown' must be an array.`;
    }
  }

  if (data.vocab && !Array.isArray(data.vocab)) return "'vocab' must be an array.";
  if (data.vocab) {
    for (let i = 0; i < data.vocab.length; i++) {
      const v = data.vocab[i];
      if (typeof v !== 'object' || v === null) return `Vocab term at index ${i} must be an object.`;
      if (typeof v.word !== 'string') return `Vocab term at index ${i} is missing 'word'.`;
      if (typeof v.definition !== 'string') return `Vocab term at index ${i} is missing 'definition'.`;
      if (typeof v.example !== 'string') return `Vocab term at index ${i} is missing 'example'.`;
    }
  }
  
  return null;
}

function extractAndCleanJSON(input: string): any {
  let cleaned = input.trim();
  
  // Strip out markdown block if present
  if (cleaned.includes('```')) {
    // Look for content between ```json and ``` or ``` and ```
    const regex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = regex.exec(cleaned);
    if (match && match[1]) {
      cleaned = match[1].trim();
    } else {
      cleaned = cleaned.replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '');
    }
  }
  
  // Strip any conversational preambles or trails by locating first { and last }
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }
  
  return JSON.parse(cleaned);
}

function sanitizeAndSortSongData(data: SongData, preserveExistingIds = false): SongData {
  if (!data) return data;
  
  const phrases = Array.isArray(data.phrases) ? data.phrases : [];
  const vocab = Array.isArray(data.vocab) ? data.vocab : [];

  // Helper to normalize Spanish text for duplicate detection
  const normalizeText = (text: string) => {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[¿?¡!,\.;:"'\-_()[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // 1. Deduplicate phrases (keep the first occurrence)
  const uniquePhrases: any[] = [];
  const seenPhrases = new Set<string>();
  
  for (const p of phrases) {
    const norm = normalizeText(p.spanish);
    if (!seenPhrases.has(norm)) {
      uniquePhrases.push(p);
      seenPhrases.add(norm);
    }
  }

  // 2. Sort phrases by timestamp ascending
  uniquePhrases.sort((a, b) => {
    const timeA = typeof a.timestamp === 'number' ? a.timestamp : 0;
    const timeB = typeof b.timestamp === 'number' ? b.timestamp : 0;
    return timeA - timeB;
  });

  // 3. Unique sequential ID indexing
  let finalizedPhrases = uniquePhrases;
  if (!preserveExistingIds) {
    finalizedPhrases = uniquePhrases.map((p, idx) => ({
      ...p,
      id: idx + 1
    }));
  } else {
    // If preserving IDs, let's still ensure all phrases have a unique id
    const usedIds = new Set<number>();
    finalizedPhrases = uniquePhrases.map((p) => {
      let phraseId = typeof p.id === 'number' ? p.id : 0;
      if (phraseId <= 0 || usedIds.has(phraseId)) {
        // Generate a new unique ID
        const maxCurrent = Math.max(0, ...Array.from(usedIds));
        phraseId = maxCurrent + 1;
      }
      usedIds.add(phraseId);
      return { ...p, id: phraseId };
    });
  }

  // 4. Deduplicate vocabulary terms (keep the first occurrence, case-insensitive)
  const uniqueVocab: any[] = [];
  const seenVocab = new Set<string>();
  
  for (const v of vocab) {
    if (!v || typeof v.word !== 'string') continue;
    const normWord = v.word.toLowerCase().trim();
    if (!seenVocab.has(normWord)) {
      uniqueVocab.push(v);
      seenVocab.add(normWord);
    }
  }

  return {
    ...data,
    phrases: finalizedPhrases,
    vocab: uniqueVocab
  };
}

const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    flashcards: 'Flashcards',
    quiz: 'Quiz Challenge',
    dictation: 'Spelling Arena',
    vocab: 'Song Vocab',
    lyrics: 'Full Lyrics',
    change_import: 'Change / Import Song',
    prev: 'Previous',
    next: 'Next',
    reveal_translation: 'Reveal Translation',
    play_from_timestamp: 'Play from timestamp',
    current_card_timestamp: 'Current Card Timestamp:',
    trim_time: 'Trim Time',
    reset_to_default: 'Reset to Default',
    load_demo_song: 'Load Demo Song',
    create_blank_song: 'Create New Blank Song',
    song_customizer_title: 'Song Customizer & Loader',
    song_library_title: 'Your Saved Song Library',
    lyrics_instruction: "Click any lyric's Play button to sync and jump both the YouTube player and local player directly to that line's precise timestamp.",
    back_card: 'Back Card',
    front_card: 'Front Card',
    check_answer: 'Check Answer',
    typed_input_placeholder: 'Type what you hear (accents/punctuation optional)...',
    submit_btn: 'Submit Answer',
    correct: 'Correct!',
    incorrect: 'Incorrect',
    show_hint: 'Show Hint',
    hide_hint: 'Hide Hint',
    try_again: 'Try Again',
    reveal_correct: 'Reveal Correct Answer',
    next_phrase: 'Next Phrase',
    settings: 'Settings',
    language: 'App Language',
    click_to_reveal: 'Click to reveal translation'
  },
  es: {
    flashcards: 'Tarjetas',
    quiz: 'Desafío de Quiz',
    dictation: 'Arena de Deletreo',
    vocab: 'Vocabulario',
    lyrics: 'Letras Completas',
    change_import: 'Cambiar / Importar Canción',
    prev: 'Anterior',
    next: 'Siguiente',
    reveal_translation: 'Revelar Traducción',
    play_from_timestamp: 'Reproducir desde tiempo',
    current_card_timestamp: 'Marca de tiempo:',
    trim_time: 'Ajustar Tiempo',
    reset_to_default: 'Restablecer',
    load_demo_song: 'Cargar Demostración',
    create_blank_song: 'Crear Canción Vacía',
    song_customizer_title: 'Personalizador de Canciones',
    song_library_title: 'Tu Biblioteca de Canciones',
    lyrics_instruction: 'Haz clic en el botón de reproducción de cualquier letra para sincronizar y saltar directamente al tiempo de esa línea.',
    back_card: 'Reverso',
    front_card: 'Frente',
    check_answer: 'Verificar Respuesta',
    typed_input_placeholder: 'Escribe lo que escuchas...',
    submit_btn: 'Enviar Respuesta',
    correct: '¡Correcto!',
    incorrect: 'Incorrecto',
    show_hint: 'Mostrar Pista',
    hide_hint: 'Ocultar Pista',
    try_again: 'Intentar de Nuevo',
    reveal_correct: 'Revelar Respuesta Correcta',
    next_phrase: 'Siguiente Frase',
    settings: 'Configuración',
    language: 'Idioma de la App',
    click_to_reveal: 'Haz clic para revelar traducción'
  },
  fr: {
    flashcards: 'Fiches',
    quiz: 'Défi Quiz',
    dictation: "Arène d'Épellation",
    vocab: 'Vocabulaire',
    lyrics: 'Paroles',
    change_import: 'Changer / Importer',
    prev: 'Précédent',
    next: 'Suivant',
    reveal_translation: 'Révéler la traduction',
    play_from_timestamp: "Jouer depuis l'horodatage",
    current_card_timestamp: 'Horodatage de la carte :',
    trim_time: 'Ajuster le temps',
    reset_to_default: 'Réinitialiser',
    load_demo_song: 'Charger la démo',
    create_blank_song: 'Créer une chanson vide',
    song_customizer_title: 'Personnalisation de chanson',
    song_library_title: 'Votre bibliothèque',
    lyrics_instruction: "Cliquez sur Play pour synchroniser l'horodatage de cette ligne.",
    back_card: 'Verso',
    front_card: 'Recto',
    check_answer: 'Vérifier la réponse',
    typed_input_placeholder: 'Écrivez ce que vous entendez...',
    submit_btn: 'Soumettre',
    correct: 'Correct !',
    incorrect: 'Incorrect',
    show_hint: "Afficher l'indice",
    hide_hint: "Masquer l'indice",
    try_again: 'Réessayer',
    reveal_correct: 'Afficher la bonne réponse',
    next_phrase: 'Phrase suivante',
    settings: 'Paramètres',
    language: 'Langue de l\'app',
    click_to_reveal: 'Cliquer pour révéler la traduction'
  },
  de: {
    flashcards: 'Karteikarten',
    quiz: 'Quiz-Herausforderung',
    dictation: 'Rechtschreib-Arena',
    vocab: 'Song-Vokabeln',
    lyrics: 'Songtext',
    change_import: 'Lied wechseln / importieren',
    prev: 'Zurück',
    next: 'Weiter',
    reveal_translation: 'Übersetzung anzeigen',
    play_from_timestamp: 'Ab Zeitstempel abspielen',
    current_card_timestamp: 'Zeitstempel der Karte:',
    trim_time: 'Zeit anpassen',
    reset_to_default: 'Zurücksetzen',
    load_demo_song: 'Demo-Lied laden',
    create_blank_song: 'Leeres Lied erstellen',
    song_customizer_title: 'Song-Customizer & Loader',
    song_library_title: 'Deine Liederbibliothek',
    lyrics_instruction: 'Klicke auf Abspielen, um mit dem genauen Zeitstempel dieser Zeile zu synchronisieren.',
    back_card: 'Rückseite',
    front_card: 'Vorderseite',
    check_answer: 'Antwort prüfen',
    typed_input_placeholder: 'Schreibe, was du hörst...',
    submit_btn: 'Antwort einsenden',
    correct: 'Richtig!',
    incorrect: 'Falsch',
    show_hint: 'Hinweis anzeigen',
    hide_hint: 'Hinweis ausblenden',
    try_again: 'Erneut versuchen',
    reveal_correct: 'Richtige Antwort anzeigen',
    next_phrase: 'Nächste Phrase',
    settings: 'Einstellungen',
    language: 'App-Sprache',
    click_to_reveal: 'Klicken für Übersetzung'
  },
  it: {
    flashcards: 'Carte',
    quiz: 'Sfida Quiz',
    dictation: 'Arena di Scrittura',
    vocab: 'Vocabolario',
    lyrics: 'Testo',
    change_import: 'Cambia / Importa Canzone',
    prev: 'Precedente',
    next: 'Successivo',
    reveal_translation: 'Rivela Traduzione',
    play_from_timestamp: 'Riproduci da timestamp',
    current_card_timestamp: 'Timestamp della carta:',
    trim_time: 'Regola Tempo',
    reset_to_default: 'Ripristina',
    load_demo_song: 'Carica Canzone Demo',
    create_blank_song: 'Crea Nuova Canzone Vuota',
    song_customizer_title: 'Personalizzatore Canzoni',
    song_library_title: 'La Tua Libreria Canzoni',
    lyrics_instruction: 'Clicca su Play per saltare al timestamp preciso di questa riga.',
    back_card: 'Retro',
    front_card: 'Fronte',
    check_answer: 'Verifica Risposta',
    typed_input_placeholder: 'Scrivi quello che senti...',
    submit_btn: 'Invia Risposta',
    correct: 'Corretto!',
    incorrect: 'Errato',
    show_hint: 'Mostra Suggerimento',
    hide_hint: 'Nascondi Suggerimento',
    try_again: 'Riprova',
    reveal_correct: 'Rivela Risposta Corretta',
    next_phrase: 'Prossima Frase',
    settings: 'Impostazioni',
    language: 'Lingua App',
    click_to_reveal: 'Clicca per rivelare la traduzione'
  },
  pt: {
    flashcards: 'Cartões',
    quiz: 'Desafio de Quiz',
    dictation: 'Arena de Ortografia',
    vocab: 'Vocabulário',
    lyrics: 'Letras',
    change_import: 'Alterar / Importar Música',
    prev: 'Anterior',
    next: 'Seguinte',
    reveal_translation: 'Revelar Tradução',
    play_from_timestamp: 'Reproduzir do timestamp',
    current_card_timestamp: 'Timestamp do cartão:',
    trim_time: 'Ajustar Tempo',
    reset_to_default: 'Restaurar Padrão',
    load_demo_song: 'Carregar Música Demo',
    create_blank_song: 'Criar Nova Música Vazia',
    song_customizer_title: 'Personalizador de Músicas',
    song_library_title: 'Sua Biblioteca de Músicas Salvas',
    lyrics_instruction: 'Clique no botão Play de qualquer letra para sincronizar e saltar para o timestamp dessa linha.',
    back_card: 'Reverso',
    front_card: 'Frente',
    check_answer: 'Verificar Resposta',
    typed_input_placeholder: 'Digite o que você ouve...',
    submit_btn: 'Enviar Resposta',
    correct: 'Correto!',
    incorrect: 'Incorreto',
    show_hint: 'Mostrar Dica',
    hide_hint: 'Ocultar Dica',
    try_again: 'Tentar Novamente',
    reveal_correct: 'Revelar Resposta Correta',
    next_phrase: 'Próxima Frase',
    settings: 'Configurações',
    language: 'Idioma do App',
    click_to_reveal: 'Clique para revelar tradução'
  }
};

export default function App() {
  // App view state
  const [uiLang, setUiLang] = useState<string>(() => localStorage.getItem('app_button_language') || 'en');
  
  useEffect(() => {
    localStorage.setItem('app_button_language', uiLang);
  }, [uiLang]);

  const t = (key: string) => UI_TRANSLATIONS[uiLang]?.[key] || UI_TRANSLATIONS['en']?.[key] || key;

  const [activeTab, setActiveTab] = useState<string>('flashcards'); // flashcards, quiz, dictation, vocab, lyrics
  const [currentDeck, setCurrentDeck] = useState<string>('All'); // All, Support, Struggle, Hope, Vulnerability, Starred
  const [starredIds, setStarredIds] = useState<number[]>([]);
  
  // Custom Song state loading
  const [songData, setSongData] = useState<SongData>(() => {
    try {
      const saved = localStorage.getItem('confieso_custom_song');
      if (saved) {
        return sanitizeAndSortSongData(JSON.parse(saved), true);
      }
    } catch (e) {
      console.error("Failed to parse custom song from localStorage", e);
    }
    return SONG_DATA;
  });

  const [savedSongs, setSavedSongs] = useState<SongData[]>(() => {
    try {
      const saved = localStorage.getItem('confieso_song_library');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to parse song library", e);
    }
    return [SONG_DATA];
  });

  // Cloud Sync state
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');

  // Cloud helper to save a song to Firestore
  const saveSongToCloud = async (song: SongData) => {
    const songId = `${song.title.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')}_${song.artist.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')}`;
    let payload: any = null;
    try {
      setCloudSyncStatus('syncing');
      const songDocRef = doc(db, 'songs', songId);
      
      // Sanitize fields to ensure Firestore-compatible payload matching SongData and Phrase structure
      const sanitizedPhrases = song.phrases.map(p => ({
        id: p.id,
        spanish: p.spanish || '',
        english: p.english || '',
        literal: p.literal || '',
        category: p.category || '',
        timestamp: p.timestamp || 0,
        timestampStr: p.timestampStr || '',
        breakdown: (p.breakdown || []).map(b => ({
          word: b.word || '',
          meaning: b.meaning || ''
        }))
      }));

      const sanitizedVocab = (song.vocab || []).map(v => ({
        word: v.word || '',
        definition: v.definition || '',
        example: v.example || ''
      }));

      payload = {
        title: song.title,
        artist: song.artist,
        youtubeId: song.youtubeId || '',
        phrases: sanitizedPhrases,
        vocab: sanitizedVocab,
        updatedAt: new Date().toISOString(),
        createdBy: studyRole === 'spanish-learner' ? 'Andrew' : 'Friend'
      };

      await setDoc(songDocRef, payload);
      setCloudSyncStatus('synced');
    } catch (e) {
      console.error("Failed to save song to Firestore:", e);
      setCloudSyncStatus('error');
      handleFirestoreError(e, 'songs', 'create', `songs/${songId}`, payload);
    }
  };

  // Cloud helper to save buddy study notes to Firestore
  const saveNoteToCloud = async (phraseId: number, partnerA?: string, partnerB?: string) => {
    const noteId = `note_${phraseId}`;
    const payload = {
      phraseId,
      partnerA: partnerA || '',
      partnerB: partnerB || '',
      updatedAt: new Date().toISOString()
    };
    try {
      setCloudSyncStatus('syncing');
      const noteDocRef = doc(db, 'study_notes', noteId);
      await setDoc(noteDocRef, payload);
      setCloudSyncStatus('synced');
    } catch (e) {
      console.error("Failed to save notes to Firestore:", e);
      setCloudSyncStatus('error');
      handleFirestoreError(e, 'study_notes', 'create', `study_notes/${noteId}`, payload);
    }
  };

  // Cloud listener for Real-time Sync
  useEffect(() => {
    setCloudSyncStatus('syncing');
    
    // Subscribe to shared songs collection
    const unsubSongs = onSnapshot(collection(db, 'songs'), (snapshot) => {
      const cloudSongs: SongData[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        cloudSongs.push({
          title: data.title || '',
          artist: data.artist || '',
          youtubeId: data.youtubeId || '',
          phrases: data.phrases || [],
          vocab: data.vocab || []
        });
      });

      if (cloudSongs.length > 0) {
        setSavedSongs((prev) => {
          const merged = [...prev];
          cloudSongs.forEach((cloudSong) => {
            const index = merged.findIndex(
              (s) => s.title.toLowerCase().trim() === cloudSong.title.toLowerCase().trim() &&
                     s.artist.toLowerCase().trim() === cloudSong.artist.toLowerCase().trim()
            );
            if (index !== -1) {
              // Only overwrite if different to avoid redundant loops
              if (JSON.stringify(merged[index]) !== JSON.stringify(cloudSong)) {
                merged[index] = cloudSong;
              }
            } else {
              merged.push(cloudSong);
            }
          });
          localStorage.setItem('confieso_song_library', JSON.stringify(merged));
          return merged;
        });
      }
      setCloudSyncStatus('synced');
    }, (error) => {
      console.error("Firestore songs sync error:", error);
      setCloudSyncStatus('error');
      handleFirestoreError(error, 'songs', 'list', 'songs');
    });

    // Subscribe to shared study notes collection
    const unsubNotes = onSnapshot(collection(db, 'study_notes'), (snapshot) => {
      const cloudNotes: Record<number, { partnerA?: string; partnerB?: string }> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.phraseId !== undefined) {
          cloudNotes[data.phraseId] = {
            partnerA: data.partnerA || '',
            partnerB: data.partnerB || ''
          };
        }
      });

      setBuddyNotes((prev) => {
        const merged = { ...prev, ...cloudNotes };
        localStorage.setItem('buddy_phrase_notes', JSON.stringify(merged));
        return merged;
      });
      setCloudSyncStatus('synced');
    }, (error) => {
      console.error("Firestore study_notes sync error:", error);
      setCloudSyncStatus('error');
      handleFirestoreError(error, 'study_notes', 'list', 'study_notes');
    });

    return () => {
      unsubSongs();
      unsubNotes();
    };
  }, []);

  // Auto-sync current active song into the savedSongs library & Firestore
  useEffect(() => {
    setSavedSongs((prevLibrary) => {
      const index = prevLibrary.findIndex(
        (s) => s.title.toLowerCase().trim() === songData.title.toLowerCase().trim() &&
               s.artist.toLowerCase().trim() === songData.artist.toLowerCase().trim()
      );
      if (index !== -1) {
        if (JSON.stringify(prevLibrary[index]) !== JSON.stringify(songData)) {
          const updated = [...prevLibrary];
          updated[index] = songData;
          localStorage.setItem('confieso_song_library', JSON.stringify(updated));
          saveSongToCloud(songData);
          return updated;
        }
      } else {
        const updated = [...prevLibrary, songData];
        localStorage.setItem('confieso_song_library', JSON.stringify(updated));
        saveSongToCloud(songData);
        return updated;
      }
      return prevLibrary;
    });
  }, [songData]);

  const [showSongManager, setShowSongManager] = useState<boolean>(false);
  
  // Buddy Language Swap and Cooperative Learning States
  const [studyRole, setStudyRole] = useState<'spanish-learner' | 'english-learner'>(() => {
    return (localStorage.getItem('buddy_study_role') as 'spanish-learner' | 'english-learner') || 'spanish-learner';
  });

  const [quizDuelMode, setQuizDuelMode] = useState<boolean>(() => {
    return localStorage.getItem('buddy_quiz_duel_mode') === 'true';
  });
  const [quizDuelTurn, setQuizDuelTurn] = useState<'partner-a' | 'partner-b'>('partner-a');
  const [quizDuelScoreA, setQuizDuelScoreA] = useState<number>(0);
  const [quizDuelScoreB, setQuizDuelScoreB] = useState<number>(0);

  const [buddyNotes, setBuddyNotes] = useState<Record<number, { partnerA?: string; partnerB?: string }>>(() => {
    try {
      const saved = localStorage.getItem('buddy_phrase_notes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const saveBuddyNote = (phraseId: number, role: 'partnerA' | 'partnerB', note: string) => {
    setBuddyNotes(prev => {
      const currentEntry = prev[phraseId] || {};
      const updatedNotes = {
        ...currentEntry,
        [role]: note
      };
      
      const updated = {
        ...prev,
        [phraseId]: updatedNotes
      };
      localStorage.setItem('buddy_phrase_notes', JSON.stringify(updated));
      saveNoteToCloud(phraseId, updatedNotes.partnerA, updatedNotes.partnerB);
      return updated;
    });
  };
  
  // Sticky header and scroll details state
  const [showHeaderDetails, setShowHeaderDetails] = useState<boolean>(true);
  
  // Trim controls visibility state
  const [showTrimControls, setShowTrimControls] = useState<boolean>(() => {
    const saved = localStorage.getItem('show_trim_controls');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleTrimControls = () => {
    setShowTrimControls(prev => {
      const newVal = !prev;
      localStorage.setItem('show_trim_controls', String(newVal));
      return newVal;
    });
  };

  useEffect(() => {
    let lastScrollY = window.scrollY;
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY <= 15) {
        // Always show details at the very top of the page
        setShowHeaderDetails(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // Scrolling down past 50px - hide details for more space
        setShowHeaderDetails(false);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling up - show details when scrolled back up near the top
        if (currentScrollY < 40) {
          setShowHeaderDetails(true);
        }
      }
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [songInputJson, setSongInputJson] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [selectedPromptType, setSelectedPromptType] = useState<'flash' | 'detailed' | 'parts' | 'resume' | 'transcript'>('flash');

  // Copilot custom fields
  const [promptSongName, setPromptSongName] = useState<string>('');
  const [promptYoutubeId, setPromptYoutubeId] = useState<string>('');
  const [promptTranscript, setPromptTranscript] = useState<string>('');
  const [promptTargetLangA, setPromptTargetLangA] = useState<string>('Spanish');
  const [promptNativeLangA, setPromptNativeLangA] = useState<string>('English');
  const [promptTargetLangB, setPromptTargetLangB] = useState<string>('English');
  const [promptNativeLangB, setPromptNativeLangB] = useState<string>('Spanish');

  // Incremental chunk options
  const [resumeChunkSize, setResumeChunkSize] = useState<number>(10);
  const [customResumeStart, setCustomResumeStart] = useState<string>('');

  const startPhraseNum = useMemo(() => {
    const parsed = parseInt(customResumeStart, 10);
    return isNaN(parsed) ? (songData.phrases.length + 1) : parsed;
  }, [customResumeStart, songData.phrases.length]);

  const endPhraseNum = useMemo(() => {
    return startPhraseNum + resumeChunkSize - 1;
  }, [startPhraseNum, resumeChunkSize]);

  // Dynamic next-pass/resume prompt for Gemini to continue translating incrementally
  const activePromptText = useMemo(() => {
    const targetSongName = promptSongName.trim() || `${songData.title} by ${songData.artist}`;
    
    // Extract youtube ID from URL if user pastes a full link
    let targetYoutubeId = promptYoutubeId.trim() || songData.youtubeId;
    if (targetYoutubeId.includes('youtube.com') || targetYoutubeId.includes('youtu.be')) {
      try {
        const urlObj = new URL(targetYoutubeId);
        if (targetYoutubeId.includes('youtu.be')) {
          targetYoutubeId = urlObj.pathname.substring(1);
        } else {
          targetYoutubeId = urlObj.searchParams.get('v') || targetYoutubeId;
        }
      } catch (e) {}
    }

    if (selectedPromptType === 'transcript') {
      return `You will be provided with a raw YouTube transcript of a song (with timestamps).
Your task is to convert this transcript into the complete bilingual study companion JSON dataset.

CRITICAL INSTRUCTIONS:
1. Use the provided transcript's timestamps, ${promptTargetLangA} spelling, and phrase order EXACTLY.
2. For EVERY line/phrase in the transcript, translate it and create a phrase card. Do NOT skip, summarize, or group lines unless necessary for natural translation.
3. For each phrase, provide:
   - "spanish": The original lyric line (from the transcript, in ${promptTargetLangA}). Note: we keep the JSON key as "spanish" for application compatibility.
   - "english": A natural, high-quality ${promptNativeLangA} translation. Note: we keep the JSON key as "english" for application compatibility.
   - "literal": A literal word-for-word translation.
   - "category": The song section (e.g., Verse, Chorus, Intro, Hook).
   - "timestamp": The start time in total seconds (parsed from the transcript timestamp, e.g., 1:24 = 84).
   - "timestampStr": The string timestamp format (e.g. "1:24" or "0:08").
   - "breakdown": Limit to 1-2 of the most important/challenging words in that phrase with their ${promptNativeLangA} meaning.
4. Extract a comprehensive vocabulary list of 12-15 core words/idioms from the song and list them in the "vocab" array.
5. Output EXACTLY a single raw JSON object. Do NOT wrap it in markdown codeblocks (no \`\`\`json).

Here is the exact schema structure required (do NOT change the keys "spanish" or "english"):
{
  "title": "${targetSongName.split(' by ')[0] || targetSongName}",
  "artist": "${targetSongName.split(' by ')[1] || 'Artist'}",
  "youtubeId": "${targetYoutubeId}",
  "phrases": [
    {
      "id": 1,
      "spanish": "original lyric in ${promptTargetLangA}",
      "english": "Natural ${promptNativeLangA} translation",
      "literal": "Literal translation",
      "category": "Chorus",
      "timestamp": 12,
      "timestampStr": "0:12",
      "breakdown": [
        { "word": "word", "meaning": "translation" }
      ]
    }
  ],
  "vocab": [
    { "word": "word", "definition": "definition", "example": "sentence from song" }
  ]
}

Here is the raw YouTube transcript to process:
${promptTranscript.trim() || "(Please paste your raw YouTube transcript in the input field above to automatically include it here!)"}`;
    }

    if (selectedPromptType === 'resume') {
      const lastPhrase = songData.phrases[songData.phrases.length - 1];
      const lastPhraseInfo = lastPhrase ? {
        id: lastPhrase.id,
        spanish: lastPhrase.spanish,
        english: lastPhrase.english,
        timestampStr: lastPhrase.timestampStr,
        timestamp: lastPhrase.timestamp,
        category: lastPhrase.category
      } : null;

      return `We are compiling structured bilingual learning companion data for the song "${songData.title}" by "${songData.artist}" (YouTube Video ID: "${targetYoutubeId}").
Because the song has many lyrics and to avoid token exhaustion or truncation, we are doing this incrementally in multiple rounds.

We have already completed ${songData.phrases.length} phrases. Here is the last translated phrase of our current save state:
${lastPhraseInfo ? JSON.stringify(lastPhraseInfo, null, 2) : "None yet. This is the start of the song."}

Please continue translating the song. Specifically, you MUST translate phrases ${startPhraseNum} to ${endPhraseNum} of the song.
Do NOT repeat any of the previously completed lyrics. Translate starting immediately after the previously translated lyric: "${lastPhrase ? lastPhrase.spanish : "(Start of the song)"}".

Provide timestamps, natural ${promptNativeLangA} translations, literal word-for-word translations, selective breakdowns (limiting breakdowns to only the 1 or 2 most challenging/interesting words of each phrase to save precious tokens), and any key vocabulary words (add to the "vocab" array).

Format the response EXACTLY as a single raw JSON object matching the schema below. Do NOT wrap it in markdown codeblocks (no \`\`\`json).
Make sure to continue the sequential phrase IDs starting from ${startPhraseNum}. Keep the JSON keys "spanish" and "english" for front-end compatibility:

{
  "phrases": [
    {
      "id": ${startPhraseNum},
      "spanish": "${promptTargetLangA} lyric for phrase ${startPhraseNum}",
      "english": "Natural ${promptNativeLangA} translation",
      "literal": "Literal word-for-word translation",
      "category": "Song section (e.g., Verse 2, Chorus, Outro)",
      "timestamp": ${lastPhrase ? lastPhrase.timestamp + 4 : 0},
      "timestampStr": "MM:SS",
      "breakdown": [
        { "word": "word", "meaning": "translation" }
      ]
    }
  ],
  "vocab": [
    { "word": "Key vocab word", "definition": "${promptNativeLangA} definition", "example": "Sentence from song showing usage" }
  ]
}`;
    }

    // Replace the placeholders in pre-configured prompts with dynamic values entered by the user
    const baseTemplate = PROMPT_TEMPLATES[selectedPromptType as 'flash' | 'detailed' | 'parts'];
    let customTemplate = baseTemplate.replace(/\[INSERT SONG NAME AND ARTIST HERE\]/g, targetSongName);
    
    // Also inject youtube ID if specified
    customTemplate = customTemplate.replace(/"youtubeId": "[^"]*"/, `"youtubeId": "${targetYoutubeId}"`);

    // Dynamically update languages in the template while preserving key names
    customTemplate = customTemplate
      .replace(/English translation/gi, `${promptNativeLangA} translation`)
      .replace(/English translations/gi, `${promptNativeLangA} translations`)
      .replace(/English definition/gi, `${promptNativeLangA} definition`)
      .replace(/Spanish phrase/gi, `${promptTargetLangA} phrase`)
      .replace(/Spanish spelling/gi, `${promptTargetLangA} spelling`)
      .replace(/Spanish word/gi, `${promptTargetLangA} word`)
      .replace(/Spanish words/gi, `${promptTargetLangA} words`)
      .replace(/Full Spanish/gi, `Full ${promptTargetLangA}`);

    // Add note on keys
    customTemplate += `\n\nCRITICAL CONSTRAINTS FOR COMPATIBILITY:
- Note that the target language (song lyrics) is: ${promptTargetLangA}
- Note that the native language (translation) is: ${promptNativeLangA}
- The JSON keys MUST remain EXACTLY "spanish" (for ${promptTargetLangA}) and "english" (for ${promptNativeLangA}) in the output object. Do NOT rename these keys to other language names.`;

    // If a transcript is pasted but we are using another template, append it optionally
    if (promptTranscript.trim() && selectedPromptType !== 'resume') {
      customTemplate += `\n\nReference YouTube Transcript:\n${promptTranscript.trim()}`;
    }

    return customTemplate;
  }, [selectedPromptType, songData, startPhraseNum, endPhraseNum, promptSongName, promptYoutubeId, promptTranscript, promptTargetLangA, promptNativeLangA, promptTargetLangB, promptNativeLangB]);

  // Flashcard states
  const [cardIndex, setCardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [knownRates, setKnownRates] = useState<Record<number, 'easy' | 'medium' | 'hard'>>({}); // cardId -> rating
  
  // Audio configuration states
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  // Media Player configuration (YouTube + Local File)
  const [localFileUrl, setLocalFileUrl] = useState<string>('');
  const [localFileName, setLocalFileName] = useState<string>('');
  const [mediaPlayerType, setMediaPlayerType] = useState<'youtube' | 'local'>('youtube');
  const [ytStart, setYtStart] = useState<number>(11);
  const [ytTrigger, setYtTrigger] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // Quiz Mode states
  const [quizScore, setQuizScore] = useState<number>(0);
  const [quizTotal, setQuizTotal] = useState<number>(0);
  const [quizQuestion, setQuizQuestion] = useState<Phrase | null>(null);
  const [quizOptions, setQuizOptions] = useState<Array<{ id: number; text: string }>>([]);
  const [quizAnswered, setQuizAnswered] = useState<boolean>(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  // Spelling dictation states
  const [typedInput, setTypedInput] = useState<string>('');
  const [dictationChecked, setDictationChecked] = useState<boolean>(false);
  const [dictationPassed, setDictationPassed] = useState<boolean>(false);
  const [showDictationHint, setShowDictationHint] = useState<boolean>(false);

  // Load Starred & Progress from localStorage on mount & when songData changes
  useEffect(() => {
    try {
      const songKey = songData.title.replace(/\s+/g, '_').toLowerCase();
      
      const savedStars = localStorage.getItem(`confieso_stars_${songKey}`);
      if (savedStars) {
        setStarredIds(JSON.parse(savedStars));
      } else {
        setStarredIds([]);
      }

      const savedRates = localStorage.getItem(`confieso_rates_${songKey}`);
      if (savedRates) {
        setKnownRates(JSON.parse(savedRates));
      } else {
        setKnownRates({});
      }

      setCardIndex(0);
      setIsFlipped(false);
      setCurrentDeck('All');
    } catch (e) {
      console.error("Error reading from localStorage", e);
    }
  }, [songData.title]);

  // Save Starred Progress to localStorage
  useEffect(() => {
    const songKey = songData.title.replace(/\s+/g, '_').toLowerCase();
    localStorage.setItem(`confieso_stars_${songKey}`, JSON.stringify(starredIds));
  }, [starredIds, songData.title]);

  // Save Progress to localStorage
  useEffect(() => {
    const songKey = songData.title.replace(/\s+/g, '_').toLowerCase();
    localStorage.setItem(`confieso_rates_${songKey}`, JSON.stringify(knownRates));
  }, [knownRates, songData.title]);

  // Filtered Cards based on active Category Deck
  const filteredPhrases = songData.phrases.filter(phrase => {
    if (currentDeck === 'All') return true;
    if (currentDeck === 'Starred') return starredIds.includes(phrase.id);
    return phrase.category.toLowerCase().includes(currentDeck.toLowerCase());
  });

  const activePhrase: Phrase | undefined = filteredPhrases[cardIndex];

  // Keep card index synced to active card ID if the underlying array changes or reorders
  const lastActiveIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (activePhrase) {
      lastActiveIdRef.current = activePhrase.id;
    }
  }, [activePhrase]);

  useEffect(() => {
    if (lastActiveIdRef.current !== null) {
      const newIndex = filteredPhrases.findIndex(p => p.id === lastActiveIdRef.current);
      if (newIndex !== -1 && newIndex !== cardIndex) {
        setCardIndex(newIndex);
      }
    }
  }, [filteredPhrases]);

  const quickJumpSections = useMemo(() => {
    const seenCategories = new Set<string>();
    const list: { label: string; sec: number }[] = [];
    songData.phrases.forEach((phrase) => {
      const cat = phrase.category || 'Verse';
      if (!seenCategories.has(cat.toLowerCase())) {
        seenCategories.add(cat.toLowerCase());
        list.push({
          label: `${cat} (${phrase.timestampStr})`,
          sec: phrase.timestamp,
        });
      }
    });
    // Fallback if no distinct categories or list is too small
    if (list.length < 3) {
      list.length = 0;
      songData.phrases.slice(0, 8).forEach((phrase) => {
        list.push({
          label: `${phrase.spanish.slice(0, 15)}... (${phrase.timestampStr})`,
          sec: phrase.timestamp,
        });
      });
    }
    return list;
  }, [songData.phrases]);

  // Clean index bounds when switching study decks
  useEffect(() => {
    setCardIndex(0);
    setIsFlipped(false);
  }, [currentDeck]);

  // Dual Player Jump to Timestamp Handler
  const playAtTimestamp = (seconds: number) => {
    if (mediaPlayerType === 'local' && videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = seconds;
      videoPlayerRef.current.play().catch(e => console.log("Auto-play blocked or seeking complete.", e));
    } else {
      // For YouTube, update the start query parameter of the iframe.
      // Must be a whole integer because YouTube's embed 'start' parameter only accepts integers!
      // If we pass a float (e.g. 18.1), YouTube will reject it and fall back to 0 (beginning of song).
      setYtStart(Math.floor(seconds));
      setYtTrigger(prev => prev + 1);
    }
  };

  // Trigger timestamp sync on phrase change if we are studying in flashcards or lyrics tab
  useEffect(() => {
    if (activePhrase && (activeTab === 'flashcards' || activeTab === 'lyrics')) {
      playAtTimestamp(activePhrase.timestamp);
    }
  }, [cardIndex, currentDeck, activeTab]);

  // Generate Quiz Question
  const generateQuiz = (overrideTurn?: 'partner-a' | 'partner-b') => {
    const activePool = filteredPhrases.length > 0 ? filteredPhrases : songData.phrases;
    if (activePool.length === 0) return;

    const questionCard = activePool[Math.floor(Math.random() * activePool.length)];
    setupQuizForCard(questionCard, quizDuelMode, overrideTurn || quizDuelTurn);
  };

  const setupQuizForCard = (card: Phrase, isDuel?: boolean, duelTurn?: 'partner-a' | 'partner-b') => {
    setQuizQuestion(card);
    setQuizAnswered(false);
    setSelectedOption(null);

    const distractors = songData.phrases
      .filter(p => p.id !== card.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
    
    // Determine if options should be Spanish originals or English translations
    const targetingEnglish = isDuel 
      ? (duelTurn || quizDuelTurn) === 'partner-a' 
      : studyRole === 'spanish-learner';

    const options = [card, ...distractors]
      .map(p => ({ 
        id: p.id, 
        text: targetingEnglish ? p.english : p.spanish 
      }))
      .sort(() => 0.5 - Math.random());
      
    setQuizOptions(options);
  };

  useEffect(() => {
    if (activeTab === 'quiz') {
      generateQuiz();
    }
  }, [activeTab, currentDeck]);

  // Audio Playback Handler (Text to Speech browser voice)
  const speakText = (text: string, lang: 'es' | 'en' = 'es') => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      
      const voices = window.speechSynthesis.getVoices();
      if (lang === 'en') {
        utterance.lang = 'en-US';
        const englishVoice = voices.find(v => v.lang.startsWith('en') || v.lang.includes('US'));
        if (englishVoice) utterance.voice = englishVoice;
      } else {
        utterance.lang = 'es-ES';
        const spanishVoice = voices.find(v => v.lang.startsWith('es') || v.lang.includes('ES'));
        if (spanishVoice) utterance.voice = spanishVoice;
      }
      
      utterance.rate = 0.82; // Slightly slowed down for better phonetic training
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setIsPlayingAudio(false);
      alert("Web Speech synthesis is not supported on this device.");
    }
  };

  // Local file upload drag/drop helper
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const url = URL.createObjectURL(file);
      setLocalFileUrl(url);
      setLocalFileName(file.name);
      setMediaPlayerType('local');
    }
  };

  const handleLocalFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setLocalFileUrl(url);
      setLocalFileName(file.name);
      setMediaPlayerType('local');
    }
  };

  // Star/Unstar toggle
  const toggleStar = (id: number) => {
    setStarredIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleCardFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNextCard = () => {
    if (filteredPhrases.length === 0) return;
    setIsFlipped(false);
    setTimeout(() => {
      setCardIndex((prev) => (prev + 1) % filteredPhrases.length);
    }, 150);
  };

  const handlePrevCard = () => {
    if (filteredPhrases.length === 0) return;
    setIsFlipped(false);
    setTimeout(() => {
      setCardIndex((prev) => (prev - 1 + filteredPhrases.length) % filteredPhrases.length);
    }, 150);
  };

  const handleRateCard = (id: number, rating: 'easy' | 'medium' | 'hard') => {
    setKnownRates(prev => ({ ...prev, [id]: rating }));
    handleNextCard();
  };

  const adjustActivePhraseTimestamp = (amount: number) => {
    if (!activePhrase) return;
    const currentId = activePhrase.id;
    
    const formatTime = (totalSecs: number) => {
      const minutes = Math.floor(totalSecs / 60);
      const seconds = Math.floor(totalSecs % 60);
      const msFraction = Math.round((totalSecs % 1) * 10);
      let str = `${minutes}:${String(seconds).padStart(2, '0')}`;
      if (msFraction > 0) {
        str += `.${msFraction}`;
      }
      return str;
    };

    setSongData((prev) => {
      const idx = prev.phrases.findIndex(p => p.id === currentId);
      if (idx === -1) return prev;

      const updatedPhrases = prev.phrases.map((p) => ({ ...p }));
      
      const target = updatedPhrases[idx];
      const targetNewSec = Math.max(0, parseFloat((target.timestamp + amount).toFixed(2)));
      target.timestamp = targetNewSec;
      target.timestampStr = formatTime(targetNewSec);

      // Cascade forward to prevent overlap
      for (let j = idx + 1; j < updatedPhrases.length; j++) {
        if (updatedPhrases[j].timestamp < updatedPhrases[j-1].timestamp + 0.1) {
          const nextNewSec = parseFloat((updatedPhrases[j-1].timestamp + 0.1).toFixed(2));
          updatedPhrases[j].timestamp = nextNewSec;
          updatedPhrases[j].timestampStr = formatTime(nextNewSec);
        }
      }

      // Cascade backward to prevent overlap
      for (let j = idx - 1; j >= 0; j--) {
        if (updatedPhrases[j].timestamp > updatedPhrases[j+1].timestamp - 0.1) {
          const prevNewSec = Math.max(0, parseFloat((updatedPhrases[j+1].timestamp - 0.1).toFixed(2)));
          updatedPhrases[j].timestamp = prevNewSec;
          updatedPhrases[j].timestampStr = formatTime(prevNewSec);
        }
      }

      const updatedSong = {
        ...prev,
        phrases: updatedPhrases,
      };

      localStorage.setItem('confieso_custom_song', JSON.stringify(updatedSong));
      return updatedSong;
    });

    // Directly seek the media player to the new timestamp of the active phrase for instant feedback
    const targetIdx = songData.phrases.findIndex(p => p.id === currentId);
    if (targetIdx !== -1) {
      const targetNewSec = Math.max(0, parseFloat((songData.phrases[targetIdx].timestamp + amount).toFixed(2)));
      playAtTimestamp(targetNewSec);
    }
  };

  const handleQuizAnswer = (optionId: number) => {
    if (quizAnswered || !quizQuestion) return;
    setSelectedOption(optionId);
    setQuizAnswered(true);

    const isCorrect = optionId === quizQuestion.id;

    if (quizDuelMode) {
      if (quizDuelTurn === 'partner-a') {
        if (isCorrect) setQuizDuelScoreA(prev => prev + 1);
      } else {
        if (isCorrect) setQuizDuelScoreB(prev => prev + 1);
      }
    } else {
      setQuizTotal(prev => prev + 1);
      if (isCorrect) {
        setQuizScore(prev => prev + 1);
      }
    }
  };

  const handleDictationCheck = (targetPhrase: string) => {
    setDictationChecked(true);
    const clean = (str: string) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡]/g,"").replace(/\s+/g, " ").trim();
    const passed = clean(typedInput) === clean(targetPhrase);
    setDictationPassed(passed);
  };

  const handleNextDictation = () => {
    setTypedInput('');
    setDictationChecked(false);
    setDictationPassed(false);
    setShowDictationHint(false);
    handleNextCard();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-slate-950">
      
      {/* HEADER SECTION */}
      <header className={`relative border-b border-slate-900 bg-[#020617]/85 px-4 sticky top-0 z-50 backdrop-blur-md transition-all duration-300 ${showHeaderDetails ? 'py-4' : 'py-2 sm:py-2.5'}`}>
        <div className={`max-w-7xl mx-auto flex flex-col ${showHeaderDetails ? 'gap-4' : 'gap-0'} transition-all duration-300`}>
          
          {/* TOP ROW: Title details & Navigation tabs */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 w-full">
            <AnimatePresence initial={false}>
              {showHeaderDetails && (
                <motion.div
                  initial={{ height: 'auto', opacity: 1, marginBottom: 0 }}
                  animate={{ height: 'auto', opacity: 1, marginBottom: 0 }}
                  exit={{ height: 0, opacity: 0, marginBottom: -12 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden w-full lg:w-auto"
                >
                  <div className="flex items-center gap-4 w-full lg:w-auto pb-1">
                    <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center border border-teal-500/30 flex-shrink-0">
                      <Music className="w-6 h-6 text-teal-400" />
                    </div>
                    <div>
                      <h1 id="app-title" className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                        {songData.title} <span className="text-slate-500 font-normal ml-2">• {songData.artist}</span>
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 mt-0.5">
                        <p className="text-xs text-teal-400/80 font-semibold tracking-wide uppercase">PHRASE STUDY COMPANION</p>
                        <span className="text-slate-800">•</span>
                        <button
                          id="song-manager-toggle-btn"
                          onClick={() => setShowSongManager(!showSongManager)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-bold underline decoration-dotted underline-offset-2 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Music className="w-3 h-3" />
                          <span>{t('change_import')}</span>
                        </button>
                        <span className="text-slate-800">•</span>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Languages className="w-3.5 h-3.5 text-teal-400" />
                          <select
                            id="ui-lang-select"
                            value={uiLang}
                            onChange={(e) => setUiLang(e.target.value)}
                            className="bg-slate-900 text-slate-300 text-[11px] font-bold border border-slate-800 rounded-lg px-2 py-0.5 cursor-pointer hover:border-slate-700 hover:text-white transition focus:outline-none focus:ring-1 focus:ring-teal-500/40"
                          >
                            <option value="en">English 🇬🇧</option>
                            <option value="es">Español 🇪🇸</option>
                            <option value="fr">Français 🇫🇷</option>
                            <option value="de">Deutsch 🇩🇪</option>
                            <option value="it">Italiano 🇮🇹</option>
                            <option value="pt">Português 🇵🇹</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* MAIN TABS NAVIGATION */}
            <nav className="flex gap-1 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 overflow-x-auto max-w-full">
              {[
                { id: 'flashcards', label: t('flashcards'), icon: BookOpen },
                { id: 'quiz', label: t('quiz'), icon: HelpCircle },
                { id: 'dictation', label: t('dictation'), icon: Keyboard },
                { id: 'vocab', label: t('vocab'), icon: Sparkle },
                { id: 'lyrics', label: t('lyrics'), icon: Headphones },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    id={`tab-btn-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-teal-500/20 text-white border border-teal-500/30 shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* BOTTOM ROW: Cooperative Language Swap Hub (Collapsible on scroll) */}
          <AnimatePresence initial={false}>
            {showHeaderDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginTop: -8 }}
                animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
                exit={{ height: 0, opacity: 0, marginTop: -8 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden w-full border-t border-slate-900 pt-3"
              >
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950/10 to-slate-900 border border-slate-800/60 p-3 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-teal-500/10 text-teal-400 rounded-lg border border-teal-500/20">
                      <Users className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 flex flex-wrap items-center gap-2">
                        <span>Cooperative Language Swap Hub</span>
                        <span className="text-[9px] text-teal-300 font-mono bg-teal-500/10 px-1 py-0.5 rounded border border-teal-500/20">2-PLAYER</span>
                        {cloudSyncStatus === 'synced' && (
                          <span className="text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                            <Cloud className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Cloud Synced</span>
                          </span>
                        )}
                        {cloudSyncStatus === 'syncing' && (
                          <span className="text-[9px] text-cyan-400 font-mono bg-cyan-500/10 px-1 py-0.5 rounded border border-cyan-500/20 flex items-center gap-1 animate-pulse">
                            <CloudLightning className="w-2.5 h-2.5 text-cyan-400 animate-bounce" />
                            <span>Syncing...</span>
                          </span>
                        )}
                        {cloudSyncStatus === 'error' && (
                          <span className="text-[9px] text-rose-400 font-mono bg-rose-500/10 px-1 py-0.5 rounded border border-rose-500/20 flex items-center gap-1">
                            <CloudOff className="w-2.5 h-2.5 text-rose-400" />
                            <span>Sync Offline</span>
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-400">Andrew is learning Spanish 🇪🇸 & Friend is learning English 🇺🇸. Tap roles to toggle active interfaces!</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-850/80">
                    <button
                      id="role-btn-spanish-learner"
                      onClick={() => {
                        setStudyRole('spanish-learner');
                        localStorage.setItem('buddy_study_role', 'spanish-learner');
                      }}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        studyRole === 'spanish-learner'
                          ? 'bg-teal-500 text-slate-950 font-black shadow-md shadow-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                      }`}
                    >
                      <span className="text-xs">🇺🇸</span>
                      <span>Andrew (Spanish Learner)</span>
                    </button>
                    
                    <button
                      id="role-btn-english-learner"
                      onClick={() => {
                        setStudyRole('english-learner');
                        localStorage.setItem('buddy_study_role', 'english-learner');
                      }}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        studyRole === 'english-learner'
                          ? 'bg-indigo-600 text-white font-black shadow-md shadow-indigo-600/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                      }`}
                    >
                      <span className="text-xs">🇪🇸</span>
                      <span>Friend (English Learner)</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* SONG MANAGER PANEL */}
      <AnimatePresence>
        {showSongManager && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[#0b1329] border-b border-slate-850 overflow-hidden"
          >
            <div className="max-w-7xl mx-auto p-5 space-y-6">
              {/* Panel Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 gap-3">
                <div>
                  <h3 className="text-base font-bold text-teal-300 flex items-center gap-2">
                    <Music className="w-5 h-5" /> {t('song_customizer_title')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Turn this application into an immersive study companion for any song in the world. Just fetch song metadata from Gemini and load it below!
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    id="reset-song-btn"
                    onClick={() => {
                      setSongData(SONG_DATA);
                      localStorage.removeItem('confieso_custom_song');
                      setValidationError(null);
                      setValidationSuccess(true);
                      setTimeout(() => setValidationSuccess(false), 3000);
                    }}
                    className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs px-3 py-2 rounded-xl transition font-semibold flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> {t('reset_to_default')}
                  </button>
                  <button
                    id="load-demo-song-btn"
                    onClick={() => {
                      setSongInputJson(JSON.stringify(SONG_DATA, null, 2));
                      setValidationError(null);
                    }}
                    className="bg-indigo-950/45 border border-indigo-900 text-indigo-300 text-xs px-3 py-2 rounded-xl hover:bg-indigo-950/80 transition font-semibold"
                  >
                    {t('load_demo_song')}
                  </button>
                </div>
              </div>

              {/* SECTION: YOUR SAVED SONG LIBRARY */}
              <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-850/80 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-teal-400 uppercase tracking-widest flex items-center gap-2">
                      <FolderHeart className="w-4.5 h-4.5 text-pink-500" /> {t('song_library_title')}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Toggle between different songs you have imported. Any changes or timestamp trims you make are saved automatically to your local browser storage.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSongInputJson(JSON.stringify({
                        title: "New Song Title",
                        artist: "Artist Name",
                        youtubeId: "YOUTUBE_VIDEO_ID",
                        phrases: [
                          {
                            id: 1,
                            spanish: "Spanish phrase here",
                            english: "English translation here",
                            literal: "Literal breakdown here",
                            category: "Intro / Verse 1 / Chorus",
                            timestamp: 10,
                            timestampStr: "0:10",
                            breakdown: [
                              { word: "SpanishWord", meaning: "EnglishMeaning" }
                            ]
                          }
                        ],
                        vocab: [
                          {
                            word: "SpanishWord",
                            definition: "EnglishMeaning",
                            example: "Spanish phrase here"
                          }
                        ]
                      }, null, 2));
                      setValidationError(null);
                    }}
                    className="bg-slate-900 hover:bg-slate-850 text-slate-350 font-bold text-[10px] sm:text-xs px-3 py-2 rounded-xl border border-slate-800 transition flex items-center gap-1.5 cursor-pointer self-stretch sm:self-auto justify-center"
                  >
                    <Plus className="w-3.5 h-3.5 text-teal-400" /> {t('create_blank_song')}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {savedSongs.map((song) => {
                    const isActive = song.title.toLowerCase().trim() === songData.title.toLowerCase().trim() &&
                                     song.artist.toLowerCase().trim() === songData.artist.toLowerCase().trim();
                    const isDefault = song.title === "Confieso" && song.artist === "Humbe";
                    return (
                      <div 
                        key={`${song.title}-${song.artist}`}
                        className={`p-4 rounded-xl border transition-all relative overflow-hidden flex flex-col justify-between h-32 ${
                          isActive 
                            ? 'bg-indigo-950/30 border-indigo-500/40 shadow-lg shadow-indigo-950/40' 
                            : 'bg-slate-900/40 border-slate-850 hover:border-slate-750 hover:bg-slate-900/70'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-slate-200 font-bold text-xs sm:text-sm truncate block" title={song.title}>
                              {song.title}
                            </span>
                            <span className="shrink-0 text-[10px] font-bold text-slate-400 font-mono bg-slate-950/60 px-1.5 py-0.5 rounded">
                              {song.phrases.length} phrases
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 block truncate">{song.artist}</span>
                        </div>

                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-850/60">
                          {isActive ? (
                            <span className="text-[11px] font-extrabold text-teal-400 uppercase tracking-wider flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" /> Current Song
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setSongData(song);
                                localStorage.setItem('confieso_custom_song', JSON.stringify(song));
                                setValidationError(null);
                              }}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] sm:text-[11px] px-3 py-1 rounded-lg transition active:scale-95 flex items-center gap-1 cursor-pointer"
                            >
                              Load Song
                            </button>
                          )}

                          {!isDefault && (
                            <button
                              onClick={() => {
                                const confirmed = window.confirm(`Are you sure you want to delete "${song.title}" from your library?`);
                                if (confirmed) {
                                  setSavedSongs((prev) => {
                                    const updated = prev.filter(
                                      (s) => !(s.title === song.title && s.artist === song.artist)
                                    );
                                    localStorage.setItem('confieso_song_library', JSON.stringify(updated));
                                    if (isActive) {
                                      setSongData(SONG_DATA);
                                      localStorage.setItem('confieso_custom_song', JSON.stringify(SONG_DATA));
                                    }
                                    return updated;
                                  });
                                }
                              }}
                              className="text-rose-400 hover:text-rose-350 p-1 rounded-lg hover:bg-rose-950/20 transition cursor-pointer"
                              title="Delete from library"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grid content */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Side: Copilot Prompter */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-850 space-y-3.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-indigo-300 tracking-wide uppercase flex items-center gap-1.5">
                        <Sparkle className="w-4 h-4 text-indigo-400 animate-pulse" /> Gemini AI Prompt Copilot
                      </span>
                      <button
                        id="copy-prompt-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(activePromptText);
                          setCopiedPrompt(true);
                          setTimeout(() => setCopiedPrompt(false), 2000);
                        }}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                          copiedPrompt 
                            ? 'bg-emerald-500 text-slate-950' 
                            : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                        }`}
                      >
                        {copiedPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPrompt ? 'Copied Prompt!' : 'Copy Prompt'}</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Choose a fine-tuned prompter model to prevent truncation on smaller models (like Gemini Flash/Lite), copy the prompt, and run it on Gemini.
                    </p>

                    {/* Prompt Selection Tabs */}
                    <div className="flex flex-wrap bg-slate-900/60 p-1 rounded-xl border border-slate-800 gap-1">
                      {[
                        { id: 'flash', label: 'Flash/Lite Optimized', desc: 'Truncation prevention' },
                        { id: 'detailed', label: 'Detailed (Pro)', desc: 'Max details' },
                        { id: 'transcript', label: 'Transcript-Guided (New)', desc: 'Use raw YouTube transcript with timestamps' },
                        { id: 'parts', label: 'Part 1 (Long Song)', desc: 'Generate first half' },
                        { id: 'resume', label: 'Incremental Pass (Resume)', desc: 'Generate next chunk based on last card' }
                      ].map(type => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setSelectedPromptType(type.id as any)}
                          title={type.desc}
                          className={`flex-1 min-w-[110px] text-[10px] sm:text-xs py-1.5 px-2 rounded-lg font-bold transition-all ${
                            selectedPromptType === type.id
                              ? 'bg-indigo-600 text-white shadow-md'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>

                    {/* Metadata & Transcript inputs */}
                    <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-850/60 space-y-3">
                      <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkle className="w-3.5 h-3.5" /> Prompt Customizer Inputs
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Song Name & Artist:</label>
                          <input
                            type="text"
                            placeholder="e.g. La Camisa Negra by Juanes"
                            value={promptSongName}
                            onChange={(e) => setPromptSongName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 focus:border-indigo-500 outline-none placeholder:text-slate-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">YouTube Link or ID:</label>
                          <input
                            type="text"
                            placeholder="e.g. kRt2sRyup6A"
                            value={promptYoutubeId}
                            onChange={(e) => setPromptYoutubeId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 focus:border-indigo-500 outline-none placeholder:text-slate-600"
                          />
                        </div>
                      </div>

                      {/* Learner Languages selection row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/50">
                        {/* Default Learner (Andrew) Languages */}
                        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-900 space-y-2">
                          <span className="text-[10px] font-bold text-teal-400 block uppercase tracking-wider">Default Learner (Andrew)</span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">Target (Learning):</label>
                              <input
                                type="text"
                                value={promptTargetLangA}
                                onChange={(e) => setPromptTargetLangA(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-teal-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">Native (Translation):</label>
                              <input
                                type="text"
                                value={promptNativeLangA}
                                onChange={(e) => setPromptNativeLangA(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-teal-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Cooperative Learner (Friend) Languages */}
                        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-900 space-y-2">
                          <span className="text-[10px] font-bold text-indigo-400 block uppercase tracking-wider">Cooperative Learner (Friend)</span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">Target (Learning):</label>
                              <input
                                type="text"
                                value={promptTargetLangB}
                                onChange={(e) => setPromptTargetLangB(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-indigo-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">Native (Translation):</label>
                              <input
                                type="text"
                                value={promptNativeLangB}
                                onChange={(e) => setPromptNativeLangB(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-indigo-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] text-slate-400 block">Paste YouTube Transcript (with Timestamps):</label>
                          {selectedPromptType === 'transcript' && (
                            <span className="text-[9px] text-teal-400 font-bold animate-pulse">Required for Transcript-Guided tab</span>
                          )}
                        </div>
                        <textarea
                          placeholder="e.g.&#10;0:01 [Music]&#10;0:12 Tengo la camisa negra&#10;0:16 Hoy mi amor está de luto"
                          value={promptTranscript}
                          onChange={(e) => setPromptTranscript(e.target.value)}
                          className="w-full h-20 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-300 focus:border-indigo-500 outline-none placeholder:text-slate-600 resize-none"
                        />
                      </div>
                    </div>

                    {selectedPromptType === 'resume' && (
                      <div className="bg-slate-900/45 border border-slate-800 p-3 rounded-xl space-y-2 text-xs">
                        <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Incremental Configuration:</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-slate-400 block mb-1">Start lyric index:</label>
                            <input
                              type="number"
                              min="1"
                              placeholder={`Auto (${songData.phrases.length + 1})`}
                              value={customResumeStart}
                              onChange={(e) => setCustomResumeStart(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                            />
                            <span className="text-[9px] text-slate-500 mt-1 block">Default: {songData.phrases.length + 1}</span>
                          </div>
                          <div>
                            <label className="text-slate-400 block mb-1">Phrase count per pass:</label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={resumeChunkSize}
                              onChange={(e) => setResumeChunkSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                            />
                            <span className="text-[9px] text-slate-500 mt-1 block">Request {resumeChunkSize} lyrics next</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-teal-400 font-medium">
                          Will request lyrics #{startPhraseNum} to #{endPhraseNum} sequentially.
                        </div>
                      </div>
                    )}

                    <div className="bg-black/40 p-3 rounded-xl border border-slate-900 font-mono text-[10px] text-slate-400 max-h-[160px] overflow-y-auto whitespace-pre-wrap select-all">
                      {activePromptText}
                    </div>
                  </div>

                  {/* Current Active Metadata summary card */}
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-850/60 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Song Metadata:</span>
                    <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                      <div>
                        <span className="text-slate-500 block">Song Title</span>
                        <strong className="text-slate-200">{songData.title}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Artist</span>
                        <strong className="text-slate-200">{songData.artist}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Study Phrases</span>
                        <strong className="text-teal-400">{songData.phrases.length} cards</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Vocab Count</span>
                        <strong className="text-indigo-400">{songData.vocab?.length || 0} terms</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Paste Zone */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-300">Paste Gemini's JSON Output:</label>
                    <span className="text-[10px] text-slate-500 font-mono">Format: JSON Object</span>
                  </div>

                  <textarea
                    id="song-json-textarea"
                    value={songInputJson}
                    onChange={(e) => {
                      setSongInputJson(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder={`{
  "title": "La Camisa Negra",
  "artist": "Juanes",
  ...
}`}
                    className="w-full h-[220px] bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                  />

                  {validationError && (
                    <div className="bg-rose-950/40 border border-rose-900/40 p-3 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{validationError}</span>
                    </div>
                  )}

                  {validationSuccess && (
                    <div className="bg-emerald-950/40 border border-emerald-900/40 p-3 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{successMessage || `Song Loaded Successfully! The app has rebuilt study decks for "${songData.title}".`}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t border-slate-900">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(songData, null, 2));
                            const downloadAnchor = document.createElement('a');
                            downloadAnchor.setAttribute("href", dataStr);
                            downloadAnchor.setAttribute("download", `${songData.title.toLowerCase().replace(/\s+/g, '_')}_companion.json`);
                            document.body.appendChild(downloadAnchor);
                            downloadAnchor.click();
                            downloadAnchor.remove();
                          } catch (e: any) {
                            setValidationError(`Failed to export song backup: ${e.message}`);
                          }
                        }}
                        className="bg-slate-900 hover:bg-slate-850 text-slate-300 font-semibold text-[10px] sm:text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer border border-slate-800"
                        title="Download a full backup of this custom song setup as a .json file"
                      >
                        <Download className="w-3.5 h-3.5 text-teal-400" /> Export JSON Backup
                      </button>

                      <label className="bg-slate-900 hover:bg-slate-850 text-slate-300 font-semibold text-[10px] sm:text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer border border-slate-800" title="Upload an exported .json song companion file">
                        <Upload className="w-3.5 h-3.5 text-indigo-400" /> Import JSON Backup
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => {
                            const fileReader = new FileReader();
                            if (e.target.files && e.target.files[0]) {
                              fileReader.readAsText(e.target.files[0], "UTF-8");
                              fileReader.onload = (event) => {
                                try {
                                  const parsed = JSON.parse(event.target?.result as string);
                                  const err = validateSongData(parsed);
                                  if (err) {
                                    setValidationError(`Import validation failed: ${err}`);
                                    return;
                                  }
                                  const cleanedParsed = sanitizeAndSortSongData(parsed, false);
                                  setSongData(cleanedParsed);
                                  localStorage.setItem('confieso_custom_song', JSON.stringify(cleanedParsed));
                                  setValidationError(null);
                                  setValidationSuccess(true);
                                  setTimeout(() => setValidationSuccess(false), 4000);
                                } catch (err: any) {
                                  setValidationError(`Import failed. Invalid JSON format: ${err.message}`);
                                }
                              };
                            }
                          }}
                        />
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <button
                        id="clear-json-btn"
                        onClick={() => {
                          setSongInputJson('');
                          setValidationError(null);
                        }}
                        className="bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 font-semibold text-xs px-3 py-2 rounded-lg transition cursor-pointer"
                      >
                        Clear Editor
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 flex-wrap pt-1">
                    <button
                      id="merge-song-phrases-btn"
                      onClick={() => {
                        try {
                          if (!songInputJson.trim()) {
                            setValidationError("Please paste the additional song JSON data first.");
                            return;
                          }
                          const parsed = extractAndCleanJSON(songInputJson);
                          const err = validateSongData(parsed, true);
                          if (err) {
                            setValidationError(err);
                            return;
                          }
                          
                          // Merge phrases & prevent duplicates
                          const currentPhrases = [...songData.phrases];
                          
                          // Normalize helper
                          const normalizeSpan = (text: string) => {
                            if (!text) return '';
                            return text
                              .toLowerCase()
                              .replace(/[¿?¡!,\.;:"'\-_()[\]]/g, '')
                              .replace(/\s+/g, ' ')
                              .trim();
                          };
                          
                          const existingNorms = new Set(currentPhrases.map(p => normalizeSpan(p.spanish)));
                          
                          let discardedPhraseCount = 0;
                          const filteredIncomingPhrases: any[] = [];
                          
                          if (Array.isArray(parsed.phrases)) {
                            for (const p of parsed.phrases) {
                              const norm = normalizeSpan(p.spanish);
                              if (existingNorms.has(norm)) {
                                discardedPhraseCount++;
                              } else {
                                filteredIncomingPhrases.push(p);
                                existingNorms.add(norm); // Keep track of duplicates within the new batch too
                              }
                            }
                          }
                          
                          const maxId = currentPhrases.reduce((max, p) => Math.max(max, p.id), 0);
                          
                          // Re-index new filtered phrases sequentially
                          const newPhrases = filteredIncomingPhrases.map((p: any, i: number) => ({
                            ...p,
                            id: maxId + 1 + i
                          }));
                          
                          // Merge vocabulary & prevent duplicates
                          const currentVocab = [...(songData.vocab || [])];
                          const existingVocabWords = new Set(currentVocab.map(v => v.word.toLowerCase().trim()));
                          
                          let discardedVocabCount = 0;
                          const filteredIncomingVocab: any[] = [];
                          
                          if (Array.isArray(parsed.vocab)) {
                            for (const v of parsed.vocab) {
                              const normWord = v.word.toLowerCase().trim();
                              if (existingVocabWords.has(normWord)) {
                                discardedVocabCount++;
                              } else {
                                filteredIncomingVocab.push(v);
                                existingVocabWords.add(normWord);
                              }
                            }
                          }
                          
                          const rawMerged = {
                            ...songData,
                            phrases: [...currentPhrases, ...newPhrases],
                            vocab: [...currentVocab, ...filteredIncomingVocab]
                          };
                          const mergedSongData = sanitizeAndSortSongData(rawMerged, true);
                          
                          setSongData(mergedSongData);
                          localStorage.setItem('confieso_custom_song', JSON.stringify(mergedSongData));
                          
                          // Prepare a detailed feedback message
                          let msg = "Merge Completed Successfully!";
                          const parts: string[] = [];
                          if (newPhrases.length > 0) {
                            parts.push(`Appended ${newPhrases.length} new phrases`);
                          }
                          if (discardedPhraseCount > 0) {
                            parts.push(`filtered out ${discardedPhraseCount} duplicate phrases`);
                          }
                          if (filteredIncomingVocab.length > 0) {
                            parts.push(`added ${filteredIncomingVocab.length} new vocab terms`);
                          }
                          if (discardedVocabCount > 0) {
                            parts.push(`skipped ${discardedVocabCount} duplicate vocab terms`);
                          }
                          
                          if (parts.length > 0) {
                            msg += " Details: " + parts.join(", ") + ".";
                          } else {
                            msg += " No new unique phrases or vocabulary words were detected in the input.";
                          }
                          
                          setSuccessMessage(msg);
                          setValidationError(null);
                          setValidationSuccess(true);
                          setTimeout(() => {
                            setValidationSuccess(false);
                            setSuccessMessage('');
                          }, 6000);
                        } catch (e: any) {
                          setValidationError(`Invalid JSON format: ${e.message}`);
                        }
                      }}
                      className="bg-indigo-950/80 border border-indigo-700/50 hover:bg-indigo-900 text-indigo-200 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Merge / Append Parts
                    </button>
                    <button
                      id="apply-custom-song-btn"
                      onClick={() => {
                        try {
                          if (!songInputJson.trim()) {
                            setValidationError("Please paste song JSON data before applying.");
                            return;
                          }
                          const parsed = extractAndCleanJSON(songInputJson);
                          const err = validateSongData(parsed);
                          if (err) {
                            setValidationError(err);
                            return;
                          }
                          
                          // Save custom song
                          const cleanedParsed = sanitizeAndSortSongData(parsed, false);
                          setSongData(cleanedParsed);
                          localStorage.setItem('confieso_custom_song', JSON.stringify(cleanedParsed));
                          setValidationError(null);
                          setValidationSuccess(true);
                          setTimeout(() => setValidationSuccess(false), 4000);
                        } catch (e: any) {
                          setValidationError(`Invalid JSON format: ${e.message}`);
                        }
                      }}
                      className="bg-teal-500 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-teal-400 transition shadow-lg shadow-teal-500/15 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" /> Apply Custom Song
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* CORE GRID CONTENT LAYOUT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COMPANION ARENA (Interactive Study activities) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* DECK SELECTOR TABS */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/40 p-1.5 rounded-2xl border border-slate-800">
            <span className="text-xs text-slate-500 font-bold px-2.5">Study Deck:</span>
            {(
              [
                { id: 'All', label: 'All Phrases' },
                ...Array.from(new Set(songData.phrases.map(p => p.category.trim()))).map(cat => ({
                  id: cat,
                  label: cat
                })),
                { id: 'Starred', label: `Stars (${starredIds.length})` },
              ] as Array<{ id: string; label: string }>
            ).map(deck => (
              <button
                key={deck.id}
                id={`deck-filter-${deck.id.replace(/\s+/g, '_')}`}
                onClick={() => setCurrentDeck(deck.id)}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                  currentDeck === deck.id
                    ? 'bg-slate-800 text-teal-300 border border-teal-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
                }`}
              >
                {deck.label}
              </button>
            ))}
          </div>

          {filteredPhrases.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800/80 p-12 rounded-3xl text-center space-y-4">
              <Star className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-lg font-bold text-slate-300">This study deck is empty</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                {currentDeck === 'Starred' 
                  ? "Mark key song phrases with the Star icon while studying flashcards to collect them in your personalized review deck!" 
                  : "No items match your active filters. Try resetting to access the full catalog."}
              </p>
              <button 
                id="reset-deck-btn"
                onClick={() => setCurrentDeck('All')}
                className="bg-teal-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-teal-400 transition shadow-lg shadow-teal-500/10"
              >
                Reset to All Phrases
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              
              {/* TAB: FLASHCARDS STUDY */}
              {activeTab === 'flashcards' && activePhrase && (
                <motion.div
                  key={`flashcard-${activePhrase.id}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-6"
                >
                  {/* Progress Metrics bar */}
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-teal-400">Phrase {cardIndex + 1} of {filteredPhrases.length}</span>
                      <span className="text-slate-700">•</span>
                      <span className="text-slate-300 font-medium">{activePhrase.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 
                        {Object.values(knownRates).filter(r => r === 'easy').length} Mastered
                      </span>
                    </div>
                  </div>

                  {/* 3D Flippable Study Card */}
                  <div 
                    id="flashcard-container"
                    onClick={handleCardFlip}
                    className="relative h-[22rem] sm:h-[25rem] w-full cursor-pointer group"
                    style={{ perspective: '1000px' }}
                  >
                    <div 
                      className="relative w-full h-full duration-500 transition-transform"
                      style={{ 
                        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                        transformStyle: 'preserve-3d',
                      }}
                    >
                      
                      {/* FRONT CARD (DYNAMIC PROMPT BASED ON ROLE) */}
                      <div 
                        className="absolute inset-0 gradient-border glass-card p-6 sm:p-10 flex flex-col justify-between shadow-2xl overflow-hidden transition-all duration-300"
                        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] uppercase tracking-widest font-black text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/30 flex items-center gap-1">
                            <Sparkle className="w-3 h-3 text-teal-300" /> 
                            {studyRole === 'spanish-learner' ? 'Spanish Phrase' : 'English Prompt (For Friend)'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              id="star-card-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStar(activePhrase.id);
                              }}
                              className={`p-2 rounded-full transition-all ${
                                starredIds.includes(activePhrase.id) 
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <Star className="w-5 h-5 fill-current" />
                            </button>
                            <button
                              id="audio-card-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                speakText(
                                  studyRole === 'spanish-learner' ? activePhrase.spanish : activePhrase.english,
                                  studyRole === 'spanish-learner' ? 'es' : 'en'
                                );
                              }}
                              className={`p-2 rounded-full border transition-all ${
                                isPlayingAudio 
                                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 animate-pulse' 
                                  : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:text-teal-400 hover:border-teal-500/30'
                              }`}
                              title="Listen Pronunciation"
                            >
                              <Volume2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        <div className="text-center py-4 flex-1 flex flex-col justify-center">
                          <h2 className={`serif-display font-medium text-white mb-6 leading-relaxed italic px-2 transition-all ${
                            (studyRole === 'spanish-learner' ? activePhrase.spanish : activePhrase.english).length > 80 
                              ? 'text-lg sm:text-2xl' 
                              : (studyRole === 'spanish-learner' ? activePhrase.spanish : activePhrase.english).length > 50 
                                ? 'text-xl sm:text-3xl' 
                                : 'text-2xl sm:text-4xl'
                          }`}>
                            "{studyRole === 'spanish-learner' ? activePhrase.spanish : activePhrase.english}"
                          </h2>
                          <div>
                            <span className="inline-block text-slate-500 text-[11px] uppercase tracking-widest font-semibold bg-slate-950/60 px-3 py-1 rounded-full border border-slate-900">
                              {t('click_to_reveal')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-800/60 pt-4 text-xs text-slate-400">
                          <button 
                            id="jump-time-btn"
                            className="flex items-center gap-2 hover:text-teal-300 transition text-slate-300 text-xs bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-teal-500/30" 
                            onClick={(e) => {
                              e.stopPropagation();
                              playAtTimestamp(activePhrase.timestamp);
                            }}
                          >
                            <Music className="w-3.5 h-3.5 text-teal-400" />
                            <span>{t('play_from_timestamp')} <strong>{activePhrase.timestampStr}</strong></span>
                          </button>
                          <span className="text-[10px] uppercase font-bold text-slate-600">{t('front_card')}</span>
                        </div>
                      </div>

                      {/* BACK CARD (ROLE SWAPPED EXPLANATION & SPEECH) */}
                      <div 
                        className="absolute inset-0 gradient-border glass-card p-6 sm:p-10 flex flex-col justify-between shadow-2xl overflow-hidden transition-all duration-300"
                        style={{ 
                          backfaceVisibility: 'hidden', 
                          WebkitBackfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)'
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/30">
                            {studyRole === 'spanish-learner' ? 'English Equivalent' : 'Spanish Original (For Andrew)'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              id="star-back-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStar(activePhrase.id);
                              }}
                              className={`p-2 rounded-full transition-all ${
                                starredIds.includes(activePhrase.id) 
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                }`}
                            >
                              <Star className="w-5 h-5 fill-current" />
                            </button>
                            <button
                              id="audio-back-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                speakText(
                                  studyRole === 'spanish-learner' ? activePhrase.english : activePhrase.spanish,
                                  studyRole === 'spanish-learner' ? 'en' : 'es'
                                );
                              }}
                              className={`p-2 rounded-full border transition-all ${
                                isPlayingAudio 
                                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 animate-pulse' 
                                  : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:text-teal-400 hover:border-teal-500/30'
                              }`}
                              title="Listen Translation"
                            >
                              <Volume2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        <div className="text-center py-2 space-y-4 flex-1 flex flex-col justify-center">
                          <p className={`text-teal-300 font-semibold uppercase tracking-tight leading-snug transition-all ${
                            (studyRole === 'spanish-learner' ? activePhrase.english : activePhrase.spanish).length > 80 
                              ? 'text-xs sm:text-sm' 
                              : (studyRole === 'spanish-learner' ? activePhrase.english : activePhrase.spanish).length > 50 
                                ? 'text-sm sm:text-lg' 
                                : 'text-lg sm:text-xl'
                          }`}>
                            "{studyRole === 'spanish-learner' ? activePhrase.english : activePhrase.spanish}"
                          </p>
                          <div className="bg-slate-950/80 px-4 py-2.5 rounded-xl text-slate-400 italic max-w-md w-full mx-auto border border-slate-850 text-left">
                            <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-widest mb-0.5">Literal Word-for-Word Equivalent</span>
                            <span className={`text-slate-300 block leading-relaxed ${
                              activePhrase.literal.length > 80 ? 'text-[11px]' : 'text-xs'
                            }`}>"{activePhrase.literal}"</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center border-t border-slate-800/60 pt-4 text-xs text-slate-500">
                          <span className="font-semibold text-slate-400">Song Section: {activePhrase.timestampStr}</span>
                          <span className="text-[10px] uppercase font-bold text-slate-600">{t('back_card')}</span>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* SPACED REPETITION CONFIDENCE TRACKER */}
                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <p className="text-xs text-slate-400 text-center font-bold mb-3 uppercase tracking-wider">Self-Assess your confidence for this phrase:</p>
                    <div className="grid grid-cols-3 gap-3">
                      <button 
                        id="grade-hard-btn"
                        onClick={() => handleRateCard(activePhrase.id, 'hard')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 border ${
                          knownRates[activePhrase.id] === 'hard'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-rose-400 hover:border-rose-500/30'
                        }`}
                      >
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                        <span>Hard / Again</span>
                      </button>
                      <button 
                        id="grade-medium-btn"
                        onClick={() => handleRateCard(activePhrase.id, 'medium')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 border ${
                          knownRates[activePhrase.id] === 'medium'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-amber-400 hover:border-amber-500/30'
                        }`}
                      >
                        <HelpCircle className="w-4 h-4 text-amber-400" />
                        <span>Medium</span>
                      </button>
                      <button 
                        id="grade-easy-btn"
                        onClick={() => handleRateCard(activePhrase.id, 'easy')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 border ${
                          knownRates[activePhrase.id] === 'easy'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-emerald-400 hover:border-emerald-500/30'
                        }`}
                      >
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Easy / Mastered</span>
                      </button>
                    </div>
                  </div>

                  {/* CARDS ACTION CONTROLS */}
                  <div className="flex items-center justify-between gap-3">
                    <button
                      id="card-prev-btn"
                      onClick={handlePrevCard}
                      className="flex-1 bg-slate-900 border border-slate-800 py-3 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-800 transition flex items-center justify-center gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" /> {t('prev')}
                    </button>
                    <button
                      id="card-shuffle-btn"
                      onClick={() => {
                        const randomIndex = Math.floor(Math.random() * filteredPhrases.length);
                        setCardIndex(randomIndex);
                        setIsFlipped(false);
                      }}
                      className="bg-slate-900 border border-slate-800 p-3 rounded-xl hover:bg-slate-800 transition text-slate-400 hover:text-slate-200"
                      title="Shuffle Card Deck"
                    >
                      <Shuffle className="w-4 h-4" />
                    </button>
                    <button
                      id="card-next-btn"
                      onClick={handleNextCard}
                      className="flex-1 bg-gradient-to-r from-teal-500 to-indigo-600 py-3 rounded-xl text-sm font-bold text-white hover:opacity-95 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10"
                    >
                      {t('next_phrase')} <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* GRANULAR SENTENCE BREAKDOWN */}
                  <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 space-y-4">
                    <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
                      <BookOpen className="w-4 h-4 text-teal-400" />
                      Linguistic Sentence Breakdown
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activePhrase.breakdown.map((item, idx) => (
                        <div key={idx} className="bg-slate-950/70 p-3 rounded-xl border border-slate-850 flex flex-col justify-between">
                          <span className="font-bold text-teal-300 text-sm font-mono">
                            {studyRole === 'spanish-learner' ? item.word : item.meaning}
                          </span>
                          <p className="text-xs text-slate-300 leading-snug mt-1.5 border-t border-slate-900 pt-1.5">
                            {studyRole === 'spanish-learner' ? item.meaning : item.word}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                </motion.div>
              )}

              {/* TAB: QUIZ CHALLENGE */}
              {activeTab === 'quiz' && quizQuestion && (
                <motion.div
                  key="quiz-mode"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {/* Score dashboard */}
                  <div className="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                        {uiLang === 'es' ? 'Puntuación de Rendimiento' : uiLang === 'fr' ? 'Score de performance' : uiLang === 'de' ? 'Leistungsbewertung' : uiLang === 'it' ? 'Punteggio Performance' : uiLang === 'pt' ? 'Pontuação de Desempenho' : 'Performance Score'}
                      </span>
                      <p className="text-lg font-bold text-teal-300 font-mono">
                        {quizScore} / {quizTotal} {uiLang === 'es' ? 'Correctas' : uiLang === 'fr' ? 'Correctes' : uiLang === 'de' ? 'Richtig' : uiLang === 'it' ? 'Corrette' : uiLang === 'pt' ? 'Corretas' : 'Correct'}
                      </p>
                    </div>
                    <button
                      id="reset-quiz-score"
                      onClick={() => {
                        setQuizScore(0);
                        setQuizTotal(0);
                        generateQuiz();
                      }}
                      className="text-xs bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg transition border border-slate-800 flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> {uiLang === 'es' ? 'Restablecer Estadísticas' : uiLang === 'fr' ? 'Réinitialiser les stats' : uiLang === 'de' ? 'Statistiken zurücksetzen' : uiLang === 'it' ? 'Ripristina Statistiche' : uiLang === 'pt' ? 'Redefinir Estatísticas' : 'Reset Stats'}
                    </button>
                  </div>

                  {/* Quiz panel */}
                  <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] bg-indigo-950 border border-indigo-900 px-3 py-1 rounded-full text-indigo-300 font-bold uppercase tracking-wider">
                        {uiLang === 'es' ? 'Traduce esta letra' : uiLang === 'fr' ? 'Traduisez cette parole' : uiLang === 'de' ? 'Übersetze diesen Songtext' : uiLang === 'it' ? 'Traduci questo testo' : uiLang === 'pt' ? 'Traduzir esta letra' : 'Translate this lyric'}
                      </span>
                      <button
                        id="quiz-listen-btn"
                        onClick={() => speakText(quizQuestion.spanish)}
                        className={`p-2.5 rounded-full border transition-all ${
                          isPlayingAudio 
                            ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 animate-pulse' 
                            : 'bg-slate-950/80 text-slate-200 border-slate-800 hover:text-teal-400'
                        }`}
                      >
                        <Volume2 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="text-center py-2">
                      <h3 className="text-xl sm:text-2xl font-bold text-white leading-relaxed font-sans">
                        "{quizQuestion.spanish}"
                      </h3>
                      <p className="text-xs text-slate-400 mt-2">
                        {uiLang === 'es' ? 'Identifica el equivalente en inglés correcto abajo:' : uiLang === 'fr' ? 'Identifiez l\'équivalent anglais correct ci-dessous :' : uiLang === 'de' ? 'Identifiziere unten die richtige englische Entsprechung:' : uiLang === 'it' ? 'Identifica l\'equivalente inglese corretto sotto:' : uiLang === 'pt' ? 'Identifique o equivalente em inglês correto abaixo:' : 'Identify the correct English equivalent below:'}
                      </p>
                    </div>

                    {/* Multiple-choice options */}
                    <div className="grid grid-cols-1 gap-3">
                      {quizOptions.map((option, idx) => {
                        const isCorrect = option.id === quizQuestion.id;
                        const isSelected = selectedOption === option.id;
                        
                        let btnStyle = 'bg-slate-950 border-slate-850 hover:bg-slate-900/80 hover:border-slate-700 text-slate-300';
                        if (quizAnswered) {
                          if (isCorrect) {
                            btnStyle = 'bg-emerald-950/70 border-emerald-500 text-emerald-300 font-bold';
                          } else if (isSelected) {
                            btnStyle = 'bg-rose-950/70 border-rose-500 text-rose-300';
                          } else {
                            btnStyle = 'bg-slate-950/40 border-slate-900 text-slate-600 cursor-not-allowed';
                          }
                        }

                        return (
                          <button
                            key={idx}
                            id={`quiz-option-${idx}`}
                            onClick={() => handleQuizAnswer(option.id)}
                            disabled={quizAnswered}
                            className={`w-full text-left p-4 rounded-xl text-xs sm:text-sm border transition-all flex items-center justify-between ${btnStyle}`}
                          >
                            <span className="leading-snug">{option.text}</span>
                            {quizAnswered && isCorrect && <Check className="w-4 h-4 text-emerald-400" />}
                            {quizAnswered && isSelected && !isCorrect && <X className="w-4 h-4 text-rose-400" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Explanatory notes after submission */}
                    {quizAnswered && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center gap-1 text-teal-400 font-bold uppercase tracking-wider text-[10px]">
                          <Info className="w-3.5 h-3.5" /> {uiLang === 'es' ? 'Información lingüística:' : uiLang === 'fr' ? 'Aperçus linguistiques :' : uiLang === 'de' ? 'Linguistische Einblicke:' : uiLang === 'it' ? 'Approfondimenti linguistici:' : uiLang === 'pt' ? 'Informações linguísticas:' : 'Linguistic insights:'}
                        </div>
                        <p className="text-slate-300 leading-relaxed">
                          {uiLang === 'es' ? 'El equivalente literal de' : uiLang === 'fr' ? 'L\'équivalent littéral de' : uiLang === 'de' ? 'Die wörtliche Entsprechung von' : uiLang === 'it' ? 'L\'equivalente letterale di' : uiLang === 'pt' ? 'O equivalente literal de' : 'The literal equivalent of'} <strong className="text-teal-300">"{quizQuestion.spanish}"</strong> {uiLang === 'es' ? 'es:' : uiLang === 'fr' ? 'est :' : uiLang === 'de' ? 'ist:' : uiLang === 'it' ? 'è:' : uiLang === 'pt' ? 'é:' : 'is:'} <br />
                          <span className="italic text-indigo-300">"{quizQuestion.literal}"</span>.
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-900 mt-2">
                          <button
                            id="quiz-listen-again"
                            onClick={() => speakText(quizQuestion.spanish)}
                            className="text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
                          >
                            <Volume2 className="w-3.5 h-3.5" /> {t('pronounce')}
                          </button>
                          <button
                            id="quiz-next-btn"
                            onClick={generateQuiz}
                            className="bg-teal-500 text-slate-950 font-bold px-4 py-1.5 rounded-lg hover:bg-teal-400 transition"
                          >
                            {uiLang === 'es' ? 'Siguiente Desafío' : uiLang === 'fr' ? 'Défi suivant' : uiLang === 'de' ? 'Nächste Herausforderung' : uiLang === 'it' ? 'Prossima Sfida' : uiLang === 'pt' ? 'Próximo Desafio' : 'Next Challenge'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* TAB: SPELLING DICTATION ARENA */}
              {activeTab === 'dictation' && activePhrase && (
                <motion.div
                  key={`dictation-${activePhrase.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-semibold">
                      {uiLang === 'es' ? 'Arena de Deletreo: Dictado' : uiLang === 'fr' ? 'Arène d\'Épellation : Dictée' : uiLang === 'de' ? 'Rechtschreib-Arena: Diktat' : uiLang === 'it' ? 'Arena di Scrittura: Dettato' : uiLang === 'pt' ? 'Arena de Ortografia: Ditado' : 'Spelling Arena: Dictation'}
                    </span>
                    <span className="text-indigo-400 font-bold">
                      {uiLang === 'es' ? 'Categoría:' : uiLang === 'fr' ? 'Catégorie :' : uiLang === 'de' ? 'Kategorie:' : uiLang === 'it' ? 'Categoria:' : uiLang === 'pt' ? 'Categoria:' : 'Category:'} {activePhrase.category}
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-3xl space-y-6">
                    <div className="text-center space-y-4 py-3">
                      <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">
                        {uiLang === 'es' ? 'Presiona reproducir para escuchar la frase, luego escríbela correctamente' : uiLang === 'fr' ? 'Appuyez sur lecture pour écouter la phrase, puis écrivez-la correctement' : uiLang === 'de' ? 'Drücke Wiedergabe, um die Phrase anzuhören, und schreibe sie dann richtig auf' : uiLang === 'it' ? 'Premi play per ascoltare la frase, quindi scrivila correttamente' : uiLang === 'pt' ? 'Pressione reproduzir para ouvir a frase, depois escreva-a corretamente' : 'Press play to listen to the phrase, then write it out correctly'}
                      </p>
                      <button
                        id="dictation-play-audio"
                        onClick={() => speakText(activePhrase.spanish)}
                        className={`mx-auto p-5 rounded-full border flex items-center justify-center transition-all ${
                          isPlayingAudio 
                            ? 'bg-teal-500/20 border-teal-500 text-teal-300 animate-pulse scale-105' 
                            : 'bg-slate-950 text-slate-200 border-slate-800 hover:text-teal-400 hover:border-teal-500/30 hover:scale-105'
                        }`}
                        title="Listen to phrase"
                      >
                        <Volume2 className="w-8 h-8" />
                      </button>
                      <p className="text-xs text-slate-500 italic">
                        {uiLang === 'es' ? '"Escucha atentamente las inflexiones de voz, acentos y letras mudas"' : uiLang === 'fr' ? '"Écoutez attentivement les inflexions vocales, les accents et les lettres muettes"' : uiLang === 'de' ? '"Achte genau auf Stimmbeugungen, Akzente und stumme Buchstaben"' : uiLang === 'it' ? '"Ascolta attentamente le flessioni vocali, gli accenti e le lettere mute"' : uiLang === 'pt' ? '"Ouça com atenção as inflexões de voz, acentos e letras mudas"' : '"Listen closely to vocal inflections, accents, and silent letters"'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                        {uiLang === 'es' ? 'Escribe tu respuesta de ortografía:' : uiLang === 'fr' ? 'Tapez votre réponse d\'orthographe :' : uiLang === 'de' ? 'Gib deine Rechtschreibantwort ein:' : uiLang === 'it' ? 'Digita la tua risposta di ortografia:' : uiLang === 'pt' ? 'Digite sua resposta de ortografia:' : 'Type your spelling answer:'}
                      </label>
                      <input
                        id="dictation-input"
                        type="text"
                        placeholder={uiLang === 'es' ? 'Escribe la frase aquí...' : uiLang === 'fr' ? 'Écrivez la phrase ici...' : uiLang === 'de' ? 'Schreibe den Satz hier...' : uiLang === 'it' ? 'Scrivi la frase qui...' : uiLang === 'pt' ? 'Escreva a frase aqui...' : 'Type the phrase here...'}
                        value={typedInput}
                        onChange={(e) => setTypedInput(e.target.value)}
                        disabled={dictationChecked}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !dictationChecked && typedInput.trim()) {
                            handleDictationCheck(activePhrase.spanish);
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-white font-medium text-sm sm:text-base tracking-wide"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        id="dictation-hint-btn"
                        onClick={() => setShowDictationHint(true)}
                        className="bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold transition"
                      >
                        {uiLang === 'es' ? 'Obtener Pista de Letra' : uiLang === 'fr' ? 'Obtenir un indice' : uiLang === 'de' ? 'Buchstaben-Hinweis' : uiLang === 'it' ? 'Ottieni Suggerimento Lettere' : uiLang === 'pt' ? 'Obter Dica de Letra' : 'Get Letter Hint'}
                      </button>
                      
                      {!dictationChecked ? (
                        <button
                          id="dictation-check-btn"
                          disabled={!typedInput.trim()}
                          onClick={() => handleDictationCheck(activePhrase.spanish)}
                          className="flex-1 bg-gradient-to-r from-teal-500 to-indigo-600 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white hover:opacity-95 transition flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {uiLang === 'es' ? 'Comprobar Ortografía' : uiLang === 'fr' ? 'Vérifier l\'orthographe' : uiLang === 'de' ? 'Rechtschreibung prüfen' : uiLang === 'it' ? 'Controlla Ortografia' : uiLang === 'pt' ? 'Verificar Ortografia' : 'Check Spelling'}
                        </button>
                      ) : (
                        <button
                          id="dictation-next-btn"
                          onClick={handleNextDictation}
                          className="flex-1 bg-teal-500 text-slate-950 py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-teal-400 transition"
                        >
                          {uiLang === 'es' ? 'Siguiente Frase de Dictado' : uiLang === 'fr' ? 'Phrase de dictée suivante' : uiLang === 'de' ? 'Nächste Diktatphrase' : uiLang === 'it' ? 'Prossima Frase di Dettato' : uiLang === 'pt' ? 'Próxima Frase de Ditado' : 'Next Dictation Phrase'}
                        </button>
                      )}
                    </div>

                    {/* Hints & Answers */}
                    {showDictationHint && (
                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 text-xs text-slate-400 flex items-center gap-2">
                        <Info className="w-4 h-4 text-indigo-400" />
                        <span>
                          {uiLang === 'es' ? 'Pista de letras iniciales:' : uiLang === 'fr' ? 'Indice des premières lettres :' : uiLang === 'de' ? 'Anfangsbuchstaben-Hinweis:' : uiLang === 'it' ? 'Suggerimento lettere iniziali:' : uiLang === 'pt' ? 'Dica de letras iniciais:' : 'Starting letters hint:'} <strong className="text-slate-200 font-mono">
                            {activePhrase.spanish.split(' ').map(word => word[0] + '_'.repeat(word.length - 1)).join(' ')}
                          </strong>
                        </span>
                      </div>
                    )}

                    {dictationChecked && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 rounded-xl border text-xs sm:text-sm space-y-2 ${
                          dictationPassed 
                            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' 
                            : 'bg-rose-950/40 border-rose-800 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[10px]">
                          {dictationPassed ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>{uiLang === 'es' ? '¡Ortografía Perfecta!' : uiLang === 'fr' ? 'Orthographe Parfaite !' : uiLang === 'de' ? 'Perfekte Rechtschreibung!' : uiLang === 'it' ? 'Ortografia Perfetta!' : uiLang === 'pt' ? 'Ortografia Perfeita!' : 'Perfect Spelling!'}</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4 text-rose-400" />
                              <span>{uiLang === 'es' ? 'Se Requiere Corrección Ortográfica' : uiLang === 'fr' ? 'Correction d\'orthographe requise' : uiLang === 'de' ? 'Rechtschreibkorrektur erforderlich' : uiLang === 'it' ? 'Correzione Ortografica Necessaria' : uiLang === 'pt' ? 'Correção Ortográfica Necessária' : 'Spelling Correction Needed'}</span>
                            </>
                          )}
                        </div>
                        <p className="leading-relaxed">
                          {uiLang === 'es' ? 'Tu escritura:' : uiLang === 'fr' ? 'Votre texte :' : uiLang === 'de' ? 'Deine Eingabe:' : uiLang === 'it' ? 'La tua scrittura:' : uiLang === 'pt' ? 'Sua digitação:' : 'Your typing:'} <span className="font-mono bg-black/30 px-2 py-0.5 rounded text-slate-200">"{typedInput}"</span>
                        </p>
                        <p className="leading-relaxed">
                          {uiLang === 'es' ? 'Correcto:' : uiLang === 'fr' ? 'Correct :' : uiLang === 'de' ? 'Richtig:' : uiLang === 'it' ? 'Corretto:' : uiLang === 'pt' ? 'Correto:' : 'Correct:'} <span className="font-mono bg-black/30 px-2 py-0.5 rounded text-teal-200">"{activePhrase.spanish}"</span>
                        </p>
                        <div className="pt-2 border-t border-slate-900 text-xs text-slate-400">
                          {uiLang === 'es' ? 'Traducción al Inglés:' : uiLang === 'fr' ? 'Traduction en anglais :' : uiLang === 'de' ? 'Englische Übersetzung:' : uiLang === 'it' ? 'Traduzione Inglese:' : uiLang === 'pt' ? 'Tradução em Inglês:' : 'English Translation:'} <strong className="text-indigo-300">"{activePhrase.english}"</strong>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* NAV CONTROLS IN DICTATION MODE */}
                  <div className="flex items-center justify-between gap-4">
                    <button
                      id="dictation-skip-prev"
                      onClick={() => {
                        setTypedInput('');
                        setDictationChecked(false);
                        setDictationPassed(false);
                        setShowDictationHint(false);
                        handlePrevCard();
                      }}
                      className="flex-1 bg-slate-900 border border-slate-800 py-3 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-800 transition"
                    >
                      {uiLang === 'es' ? 'Omitir Atrás' : uiLang === 'fr' ? 'Sauter en arrière' : uiLang === 'de' ? 'Zurückspringen' : uiLang === 'it' ? 'Salta Indietro' : uiLang === 'pt' ? 'Pular para trás' : 'Skip Back'}
                    </button>
                    <button
                      id="dictation-skip-next"
                      onClick={() => {
                        setTypedInput('');
                        setDictationChecked(false);
                        setDictationPassed(false);
                        setShowDictationHint(false);
                        handleNextCard();
                      }}
                      className="flex-1 bg-slate-900 border border-slate-800 py-3 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-800 transition"
                    >
                      {uiLang === 'es' ? 'Omitir Adelante' : uiLang === 'fr' ? 'Sauter en avant' : uiLang === 'de' ? 'Vorspringen' : uiLang === 'it' ? 'Salta Avanti' : uiLang === 'pt' ? 'Pular para frente' : 'Skip Forward'}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* TAB: SONG VOCABULARY */}
              {activeTab === 'vocab' && (
                <motion.div
                  key="song-vocab"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">{(songData.vocab || []).length} Core Song Vocab Terms</span>
                    <span className="text-teal-400">Mastered by listening & analyzing examples</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(songData.vocab || []).map((term, idx) => (
                      <div 
                        key={idx}
                        className="bg-slate-900 border border-slate-850 p-4 rounded-2xl hover:border-slate-700 hover:shadow-lg transition-all flex flex-col justify-between"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] bg-indigo-950 border border-indigo-900 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                              Vocab #{idx + 1}
                            </span>
                            <h4 className="text-base font-extrabold text-teal-300 font-sans mt-2">
                              {studyRole === 'spanish-learner' ? term.word : term.definition}
                            </h4>
                          </div>
                          <button
                            id={`vocab-pronounce-${idx}`}
                            onClick={() => speakText(
                              studyRole === 'spanish-learner' ? term.word : term.definition,
                              studyRole === 'spanish-learner' ? 'es' : 'en'
                            )}
                            className="p-1.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-teal-400 hover:border-teal-500/30 rounded-lg transition"
                            title="Listen Pronunciation"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mt-3 text-xs">
                          <p className="text-slate-400 font-medium">Definition: <span className="text-slate-200">{studyRole === 'spanish-learner' ? term.definition : term.word}</span></p>
                          <div className="mt-3 bg-slate-950/70 p-2.5 rounded-lg border border-slate-850">
                            <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider">Used in song:</span>
                            <p className="text-slate-300 italic font-medium leading-relaxed">"{term.example}"</p>
                            <button
                              id={`vocab-pronounce-ex-${idx}`}
                              onClick={() => speakText(term.example)}
                              className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-1.5 mt-2 font-semibold"
                            >
                              <Volume2 className="w-3 h-3" /> Hear song sentence
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* TAB: FULL SONG LYRICS VIEW */}
              {activeTab === 'lyrics' && (
                <motion.div
                  key="full-lyrics"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 leading-relaxed">
                    Click any lyric's <strong className="text-teal-400">Play button</strong> to sync and jump both the YouTube player and local player directly to that line's precise timestamp.
                  </div>

                  <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                    {songData.phrases.map((phrase, idx) => {
                      const isPracticing = activePhrase?.id === phrase.id;
                      return (
                        <div
                          key={phrase.id}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                            isPracticing 
                              ? 'bg-gradient-to-r from-slate-900 to-indigo-950 border-teal-500/50 shadow-md' 
                              : 'bg-slate-900/60 border-slate-850 hover:bg-slate-900 hover:border-slate-800'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-bold bg-slate-950 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
                                {phrase.timestampStr}
                              </span>
                              {isPracticing && (
                                <span className="text-[9px] bg-teal-500/10 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                                  <Sparkle className="w-2.5 h-2.5" /> Studying Now
                                </span>
                              )}
                              <span className="text-[10px] text-indigo-400 font-semibold">{phrase.category}</span>
                            </div>
                            <p className="text-sm sm:text-base font-bold text-white">
                              {phrase.spanish}
                            </p>
                            <p className="text-xs text-slate-400 font-medium">
                              {phrase.english}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button
                              id={`lyrics-speak-${idx}`}
                              onClick={() => speakText(phrase.spanish)}
                              className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-800 transition"
                              title="Listen Pronunciation"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                            <button
                              id={`lyrics-jump-${idx}`}
                              onClick={() => {
                                playAtTimestamp(phrase.timestamp);
                                // Set this card as active index if found in filter list
                                const filteredIdx = filteredPhrases.findIndex(p => p.id === phrase.id);
                                if (filteredIdx !== -1) {
                                  setCardIndex(filteredIdx);
                                } else {
                                  // Revert filter to All so they can practice this card
                                  setCurrentDeck('All');
                                  const allIdx = songData.phrases.findIndex(p => p.id === phrase.id);
                                  if (allIdx !== -1) {
                                    setCardIndex(allIdx);
                                  }
                                }
                              }}
                              className="bg-teal-500 text-slate-950 font-bold text-xs px-3 py-2 rounded-lg hover:bg-teal-400 transition flex items-center gap-1"
                            >
                              <Play className="w-3 h-3 fill-current" /> Play Line
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          )}

        </section>

        {/* RIGHT MEDIA STREAM HUB (YouTube sync + local practice) */}
        <section className="lg:col-span-5 space-y-6">

          {activePhrase && (
            <div className="space-y-4">
              {/* TIMESTAMP ADJUSTER / TRIMMER */}
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs transition-all duration-300">
                <div className="flex items-center justify-between w-full sm:w-auto gap-2">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-indigo-400" />
                    <span className="text-slate-300 font-medium">
                      {t('current_card_timestamp')} <strong className="text-indigo-300 font-mono text-sm">{activePhrase.timestampStr}</strong>
                    </span>
                  </div>
                  
                  {/* Mobile-only toggle button */}
                  <button
                    id="toggle-trim-controls-btn-mobile"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTrimControls();
                    }}
                    className="sm:hidden bg-slate-950 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-slate-300 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className={`w-3 h-3 text-teal-400 transition-transform duration-300 ${showTrimControls ? 'rotate-45' : ''}`} />
                    <span>{showTrimControls ? (uiLang === 'es' ? 'Ocultar' : uiLang === 'fr' ? 'Masquer' : uiLang === 'de' ? 'Ausblenden' : uiLang === 'it' ? 'Nascondi' : uiLang === 'pt' ? 'Ocultar' : 'Hide') : (uiLang === 'es' ? 'Ajustar' : uiLang === 'fr' ? 'Ajuster' : uiLang === 'de' ? 'Anpassen' : uiLang === 'it' ? 'Regola' : uiLang === 'pt' ? 'Ajustar' : 'Trim')}</span>
                  </button>
                </div>

                {/* Desktop toggle button */}
                <div className="hidden sm:flex items-center gap-3">
                  <button
                    id="toggle-trim-controls-btn-desktop"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTrimControls();
                    }}
                    className="bg-slate-950 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-slate-300 px-3 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Settings className={`w-3.5 h-3.5 text-teal-400 transition-transform duration-300 ${showTrimControls ? 'rotate-45' : ''}`} />
                    <span>{showTrimControls ? (uiLang === 'es' ? 'Ocultar Ajustes' : uiLang === 'fr' ? 'Masquer l\'ajusteur' : uiLang === 'de' ? 'Ajuster ausblenden' : uiLang === 'it' ? 'Nascondi Sincro' : uiLang === 'pt' ? 'Ocultar Ajustes' : 'Hide Trim Tool') : (uiLang === 'es' ? 'Ajustar Sincronización' : uiLang === 'fr' ? 'Ajuster Synchronisation' : uiLang === 'de' ? 'Sync anpassen' : uiLang === 'it' ? 'Regola Sincro' : uiLang === 'pt' ? 'Ajustar Sincro' : 'Adjust Sync Trim')}</span>
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {showTrimControls && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, scale: 0.95 }}
                      animate={{ opacity: 1, height: 'auto', scale: 1 }}
                      exit={{ opacity: 0, height: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2 w-full sm:w-auto justify-end sm:ml-auto border-t sm:border-t-0 border-slate-800/40 pt-2 sm:pt-0 overflow-hidden"
                    >
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{t('trim_time')}:</span>
                      <button
                        id="trim-minus-btn-fc"
                        onClick={(e) => {
                          e.stopPropagation();
                          adjustActivePhraseTimestamp(-0.5);
                        }}
                        className="flex-1 sm:flex-initial bg-slate-900 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-900/60 text-rose-300 font-bold px-3 py-1.5 rounded-xl transition active:scale-95 flex items-center justify-center gap-1 text-xs"
                        title="Adjust sync -0.5s (earlier)"
                      >
                        -0.5s
                      </button>
                      <button
                        id="trim-plus-btn-fc"
                        onClick={(e) => {
                          e.stopPropagation();
                          adjustActivePhraseTimestamp(0.5);
                        }}
                        className="flex-1 sm:flex-initial bg-slate-900 hover:bg-emerald-950/30 border border-slate-800 hover:border-emerald-900/60 text-emerald-300 font-bold px-3 py-1.5 rounded-xl transition active:scale-95 flex items-center justify-center gap-1 text-xs"
                        title="Adjust sync +0.5s (later)"
                      >
                        +0.5s
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* COOPERATIVE BUDDY STUDY NOTES */}
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
                  <Users className="w-4 h-4 text-teal-400" />
                  <span>Cooperative Buddy Study Notes</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Andrew's Notes Area */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                      <span>🇺🇸 Andrew's Notes</span>
                      {studyRole === 'spanish-learner' && <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-ping" />}
                    </label>
                    <textarea
                      id="partner-a-notes"
                      rows={3}
                      value={buddyNotes[activePhrase.id]?.partnerA || ''}
                      onChange={(e) => saveBuddyNote(activePhrase.id, 'partnerA', e.target.value)}
                      placeholder="Andrew's notes on pronunciation, vocal inflections, or slang translation..."
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none leading-relaxed resize-none"
                    />
                  </div>

                  {/* Friend's Notes Area */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <span>🇪🇸 Friend's Notes</span>
                      {studyRole === 'english-learner' && <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />}
                    </label>
                    <textarea
                      id="partner-b-notes"
                      rows={3}
                      value={buddyNotes[activePhrase.id]?.partnerB || ''}
                      onChange={(e) => saveBuddyNote(activePhrase.id, 'partnerB', e.target.value)}
                      placeholder="Friend's notes on English spelling, syntax, or vocabulary comparisons..."
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none leading-relaxed resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="glass-card rounded-3xl p-6 shadow-2xl space-y-4">
            
            {/* Player controls head */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-200">
                <Film className="w-4.5 h-4.5 text-teal-400" />
                <h3 className="font-bold text-sm">Media Hub</h3>
              </div>

              {/* Media Stream Switch tabs */}
              <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-850">
                <button
                  id="media-youtube-tab"
                  onClick={() => setMediaPlayerType('youtube')}
                  className={`text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider transition-all ${
                    mediaPlayerType === 'youtube'
                      ? 'bg-slate-800 text-teal-300'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  YouTube Video
                </button>
                <button
                  id="media-local-tab"
                  onClick={() => setMediaPlayerType('local')}
                  className={`text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider transition-all ${
                    mediaPlayerType === 'local'
                      ? 'bg-slate-800 text-teal-300'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Local File
                </button>
              </div>
            </div>

            {/* IFRAME YOUTUBE COMPONENT */}
            {mediaPlayerType === 'youtube' && (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-slate-950 shadow-inner">
                  <iframe
                    id="youtube-player-frame"
                    key={`yt-player-${ytStart}-${ytTrigger}`}
                    src={`https://www.youtube.com/embed/${songData.youtubeId}?start=${ytStart}&autoplay=1&rel=0`}
                    title={`${songData.title} YouTube Video`}
                    className="absolute inset-0 w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300 flex items-center gap-1">
                      <Music className="w-3.5 h-3.5 text-teal-400" /> Song: "{songData.title}"
                    </span>
                    <a 
                      href={`https://www.youtube.com/watch?v=${songData.youtubeId}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-teal-400 hover:text-teal-300 flex items-center gap-1 text-[10px] uppercase font-bold"
                    >
                      Original Video <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Practicing timestamps will automatically seek the video stream. You can also manually pause/play standard Youtube controls.
                  </p>
                </div>
              </div>
            )}

            {/* LOCAL FILE UPLOADER & OFFLINE PRACTICE */}
            {mediaPlayerType === 'local' && (
              <div className="space-y-4">
                
                {localFileUrl ? (
                  <div className="space-y-3">
                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-slate-950 flex items-center justify-center">
                      <video
                        id="local-media-player"
                        ref={videoPlayerRef}
                        src={localFileUrl}
                        controls
                        className="w-full h-full"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs bg-slate-950 p-2 rounded-lg border border-slate-850">
                      <span className="text-slate-400 truncate max-w-[200px] font-mono font-medium">File: {localFileName}</span>
                      <button
                        id="change-local-file"
                        onClick={() => {
                          setLocalFileUrl('');
                          setLocalFileName('');
                        }}
                        className="text-[10px] font-bold text-rose-400 hover:text-rose-300 uppercase tracking-wider"
                      >
                        Remove file
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    id="dropzone-area"
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                      dragActive 
                        ? 'border-teal-500 bg-teal-500/5' 
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/80'
                    }`}
                  >
                    <Upload className="w-8 h-8 text-slate-500" />
                    <div>
                      <p className="text-xs font-bold text-slate-350">Drag & Drop {songData.artist}'s video/audio file here</p>
                      <p className="text-[10px] text-slate-500 mt-1">or browse your system files</p>
                    </div>
                    <label className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition">
                      Browse Files
                      <input
                        id="local-file-selector"
                        type="file"
                        accept="video/*,audio/*"
                        onChange={handleLocalFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 font-bold text-slate-300">
                    <Info className="w-4 h-4 text-indigo-400" />
                    <span>How offline local mode works:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    By downloading {songData.artist}'s song video/audio locally and uploading it here, you get lag-free exact seek accuracy. Your browser handles this completely locally; nothing uploaded leaves your machine.
                  </p>
                </div>

              </div>
            )}

            {/* SECTIONS / TIMESTAMPS JUMP CONTROLS */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Quick Jump Sections:</span>
              <div className="grid grid-cols-2 gap-1.5">
                {quickJumpSections.map((sec, i) => (
                  <button
                    key={i}
                    id={`quick-jump-sec-${i}`}
                    onClick={() => playAtTimestamp(sec.sec)}
                    className="text-[10px] text-left p-2 bg-slate-950 hover:bg-slate-850 rounded-lg text-slate-300 border border-slate-850 hover:border-slate-700 truncate font-semibold"
                  >
                    ⏱️ {sec.label}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* ACTIVE CARD DIALOG EXPLANATION CARD (HELPFUL SIDE PANEL) */}
          {activePhrase && activeTab === 'flashcards' && (
            <div className="glass-card p-6 rounded-3xl space-y-3 shadow-xl">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400">
                <Info className="w-4 h-4" />
                <span>ACTIVE LYRIC STUDY TIP:</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                Observe how the singer states <strong className="text-teal-300">"{activePhrase.spanish}"</strong> (Phrase #{activePhrase.id}). 
                This translates to <strong className="text-indigo-300">"{activePhrase.english}"</strong>.
                {activePhrase.breakdown && activePhrase.breakdown.length > 0 && (
                  <span className="block mt-1">
                    Key word breakdown: {activePhrase.breakdown.slice(0, 3).map((b, i) => (
                      <span key={i}>
                        <strong className="text-pink-400">"{studyRole === 'spanish-learner' ? b.word : b.meaning}"</strong> ({studyRole === 'spanish-learner' ? b.meaning : b.word}){i < Math.min(2, activePhrase.breakdown.length - 1) ? ', ' : ''}
                      </span>
                    ))}.
                  </span>
                )} Practice vocalizing this in sync with the song rhythm!
              </p>
            </div>
          )}

        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 Confieso Study Suite. Built natively with React & Tailwind CSS.</p>
          <div className="flex gap-4">
            <span className="hover:text-slate-400 cursor-help" title="Study app designed for language learning through immersive music connection.">About App</span>
            <span className="text-slate-800">|</span>
            <span className="hover:text-slate-400 cursor-help" title="Web Speech synthesis with speed-adjusted phonetic training.">TTS Audio Engine</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
