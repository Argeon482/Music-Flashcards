import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, RotateCcw, Volume2, Star, Check, X, BookOpen, 
  HelpCircle, Keyboard, ArrowLeft, ArrowRight, Music, 
  AlertCircle, Headphones, Shuffle, Upload, Download, Film,
  Info, Sparkle, ExternalLink, CheckCircle2, Copy, Plus,
  Trash2, FolderHeart, Languages, Settings, Users, Cloud, CloudOff, CloudLightning,
  Layers, Maximize2, Minimize2, ChevronDown, Sparkles
} from 'lucide-react';
import { SONG_DATA } from './data';
import { Phrase, PhraseBreakdown, VocabTerm, SongData } from './types';
import { db, collection, onSnapshot, setDoc, doc, deleteDoc, handleFirestoreError } from './firebase';


// PROMPT TEMPLATES dictionary for seamless external generation
const PROMPT_TEMPLATES = {
  flash: `Retrieve the FULL, complete lyrics, English translations, selective breakdowns, and timestamps for a song.

CRITICAL REQUIREMENTS FOR SYSTEMATIC LEARNING:
1. Do NOT skip or summarize any lyrics. Include EVERY single phrase/sentence from the Intro to the Outro.
2. For each phrase, provide BOTH the start and end timestamps (use exact transcript times if available, or estimate them; the end time should be when that phrase finishes, usually 2-5 seconds after the start time or right before the next phrase starts).
3. In the "breakdown" array of EACH phrase, you MUST provide a complete, exhaustive translation of every key word, verb, and phrase block in that specific phrase, rather than just 1 or 2 words. Break down virtually every word in the phrase so the learner has absolute clarity on how the phrase is built.
4. In the "vocab" array, provide an exhaustive, complete vocabulary list capturing all unique verbs, nouns, slang, and idiomatic expressions across the entire song. Every key word of the lyrics should be represented so that by the end of training, the learner has fully mastered the vocabulary of the entire song.
5. Output EXACTLY a single raw JSON object. Do NOT wrap it in markdown codeblocks (no \`\`\`json).

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
      "timestampEnd": 15.5,
      "timestampEndStr": "0:15.5",
      "breakdown": [
        { "word": "Spanish word/chunk", "meaning": "English translation" }
      ]
    }
  ],
  "vocab": [
    { "word": "Key vocab word", "definition": "English definition", "example": "Sentence from song showing usage" }
  ]
}

Please provide the complete structured data for this song: "[INSERT SONG NAME AND ARTIST HERE]"`,

  detailed: `Retrieve the FULL, complete lyrics, English translations, highly detailed word-by-word breakdowns, and timestamps for a song.

CRITICAL REQUIREMENTS:
1. You MUST include every single lyric line from start to finish. Do NOT summarize or omit anything.
2. For each phrase, provide BOTH the start and end timestamps (use exact transcript times if available, or estimate them; the end time should be when that phrase finishes, usually 2-5 seconds after the start time or right before the next phrase starts).
3. In the "breakdown" array of EACH phrase, provide a comprehensive, complete word-by-word or chunk-by-chunk translation of virtually all words in that specific phrase so no word is left unexplained.
4. In the "vocab" array, include an exhaustive list of all vocabulary words, verbs (with base forms), slang, and grammar points found in the song, complete with clear definitions and contextual examples from the song. By training on this deck, the learner should master every word in the entire song.
5. Output EXACTLY a single raw JSON object. Do NOT wrap it in markdown codeblocks (no \`\`\`json).

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
      "timestampEnd": 15.5,
      "timestampEndStr": "0:15.5",
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
2. Provide ONLY the first half of the song (e.g., Intro, Verse 1, Chorus, Verse 2) without skipping any lines.
3. For each phrase, provide BOTH the start and end timestamps (use exact transcript times if available, or estimate them; the end time should be when that phrase finishes, usually 2-5 seconds after the start time or right before the next phrase starts).
4. In the "breakdown" array of each phrase, provide a complete, exhaustive translation of virtually all words and key chunks in that phrase.
5. In the "vocab" array, include a highly detailed list of all unique vocabulary words, verbs, and expressions found in this half of the song so that the learner gets complete coverage.
6. Output EXACTLY a single raw JSON object. Do NOT wrap it in markdown codeblocks (no \`\`\`json).

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
      "timestampEnd": 15.5,
      "timestampEndStr": "0:15.5",
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
}const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    flashcards: 'Flashcards',
    quiz: 'Quiz Challenge',
    dictation: 'Spelling Arena',
    vocab: 'Lesson Vocab',
    lyrics: 'Video Lines',
    change_import: 'Change / Import Lesson',
    prev: 'Previous',
    next: 'Next',
    reveal_translation: 'Reveal Translation',
    play_from_timestamp: 'Play from timestamp',
    current_card_timestamp: 'Current Card Timestamp:',
    trim_time: 'Trim Time',
    reset_to_default: 'Reset to Default',
    load_demo_song: 'Load Demo Lesson',
    create_blank_song: 'Create New Blank Lesson',
    song_customizer_title: 'Lesson Customizer & Loader',
    song_library_title: 'Your Saved Lesson Library',
    lyrics_instruction: "Click any line's Play button to sync and jump both the video player and local player directly to that line's precise timestamp.",
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
    click_to_reveal: 'Click to reveal translation',
    self_assess: 'Self-Assess your confidence for this phrase:',
    hard: 'Hard / Again',
    medium: 'Medium',
    easy: 'Easy / Mastered',
    card_traversal_mode: 'Card Traversal Mode',
    random_label: 'Random:',
    spaced_rep_label: 'Spaced Rep:',
    on: 'On',
    off: 'Off',
    spaced_rep_tip: '🎓 Prioritizes cards rated Hard & unrated cards over Easy cards based on your historical answers.',
    phrase: 'Phrase',
    of: 'of',
    mastered: 'Mastered',
    video_section: 'Video Section:',
    status_spaced_rep: 'Active: Spaced Rep',
    status_random: 'Active: Random Shuffle',
    status_sequential: 'Active: Sequential',
    study_tip_title: 'ACTIVE LESSON STUDY TIP:',
    study_tip_observe: 'Observe how the speaker states',
    study_tip_translates: 'This translates to',
    study_tip_breakdown: 'Key word breakdown:',
    study_tip_practice: 'Practice vocalizing this in sync with the video speech!',
    linguistic_breakdown: 'Linguistic Sentence Breakdown',
    start_trim: 'Start Trim',
    start_time: 'Start Time:',
    end_trim: 'End Trim (Auto-Stop Target)',
    end_time: 'End Time:',
    estimated: '(Estimated)',
    stop_video_after: 'Stop video after saying phrase:',
    enabled: 'Enabled',
    disabled: 'Disabled',
    card_study_notes: 'Card Study Notes',
    my_study_notes: 'My Study Notes (Appears on Back of Card)',
    add_notes_placeholder: 'Add your notes on pronunciation, inflections, slang, grammar explanations, or reminders here...',
    media_hub: 'Media Hub',
    youtube_video: 'YouTube Video',
    local_file: 'Local File',
    video_playback_mode: 'Video Playback Mode:',
    stop_after_phrase: 'Stop after phrase',
    continuous_play: 'Continuous play',
    lesson_title_prefix: 'Lesson:',
    original_video: 'Original Video',
    practicing_timestamps_info: 'Practicing timestamps will automatically seek the video stream. You can also manually pause/play standard Youtube controls.',
    file_label: 'File:',
    remove_file: 'Remove file',
    drag_drop_prefix: 'Drag & Drop',
    drag_drop_suffix: "'s media file here",
    or_browse: 'or browse your system files',
    browse_files: 'Browse Files',
    how_offline_works: 'How offline local mode works:',
    how_offline_desc_prefix: 'By downloading',
    how_offline_desc_suffix: "'s lesson video/audio locally and uploading it here, you get lag-free exact seek accuracy. Your browser handles this completely locally; nothing uploaded leaves your machine.",
    quick_jump: 'Quick Jump Sections:',
    delete_lesson_title: 'Permanently Delete Lesson?',
    delete_lesson_desc: 'You are about to permanently delete',
    delete_lesson_warning: "Warning: This will delete this lesson's phrases, flashcards, vocabulary terms, and sync files from both Firestore Cloud and your local storage. This action is final and cannot be undone.",
    delete_lesson_confirm_prompt: 'Type DELETE below to confirm:',
    delete_word_target: 'DELETE',
    delete_word_placeholder: 'Type DELETE...',
    cancel: 'Cancel',
    delete_action: 'Permanently Delete',
  },
  es: {
    flashcards: 'Tarjetas',
    quiz: 'Desafío de Quiz',
    dictation: 'Arena de Deletreo',
    vocab: 'Vocabulario',
    lyrics: 'Líneas del Video',
    change_import: 'Cambiar / Importar Lección',
    prev: 'Anterior',
    next: 'Siguiente',
    reveal_translation: 'Revelar Traducción',
    play_from_timestamp: 'Reproducir desde tiempo',
    current_card_timestamp: 'Marca de tiempo:',
    trim_time: 'Ajustar Tiempo',
    reset_to_default: 'Restablecer',
    load_demo_song: 'Cargar Demostración',
    create_blank_song: 'Crear Lección Vacía',
    song_customizer_title: 'Personalizador de Lecciones',
    song_library_title: 'Tu Biblioteca de Lecciones',
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
    click_to_reveal: 'Haz clic para revelar traducción',
    self_assess: 'Evalúa tu nivel de confianza para esta frase:',
    hard: 'Difícil / Repetir',
    medium: 'Medio',
    easy: 'Fácil / Dominado',
    card_traversal_mode: 'Modo de Recorrido de Tarjetas',
    random_label: 'Aleatorio:',
    spaced_rep_label: 'Rep. Espaciada:',
    on: 'Sí',
    off: 'No',
    spaced_rep_tip: '🎓 Prioriza las tarjetas marcadas como Difícil y las no calificadas sobre las de nivel Fácil basadas en tu historial.',
    phrase: 'Frase',
    of: 'de',
    mastered: 'Dominadas',
    video_section: 'Sección del Video:',
    status_spaced_rep: 'Activo: Rep. Espaciada',
    status_random: 'Activo: Orden Aleatorio',
    status_sequential: 'Activo: Secuencial',
    study_tip_title: 'CONSEJO DE ESTUDIO ACTIVO:',
    study_tip_observe: 'Observa cómo el hablante pronuncia',
    study_tip_translates: 'Esto se traduce como',
    study_tip_breakdown: 'Desglose de palabras clave:',
    study_tip_practice: '¡Practica vocalizando esto sincronizado con el video!',
    linguistic_breakdown: 'Linguistic Sentence Breakdown',
    start_trim: 'Ajustar Inicio',
    start_time: 'Tiempo de inicio:',
    end_trim: 'Ajustar Fin (Auto-Stop)',
    end_time: 'Tiempo de fin:',
    estimated: '(Estimado)',
    stop_video_after: 'Detener video tras frase:',
    enabled: 'Habilitado',
    disabled: 'Deshabilitado',
    card_study_notes: 'Notas de la Tarjeta',
    my_study_notes: 'Mis Notas (Reverso de Tarjeta)',
    add_notes_placeholder: 'Añade tus notas sobre pronunciación, inflexiones, jerga, gramática o recordatorios aquí...',
    media_hub: 'Centro de Medios',
    youtube_video: 'Video de YouTube',
    local_file: 'Archivo Local',
    video_playback_mode: 'Modo de Reproducción:',
    stop_after_phrase: 'Detener tras frase',
    continuous_play: 'Reproducción continua',
    lesson_title_prefix: 'Lección:',
    original_video: 'Video Original',
    practicing_timestamps_info: 'Practicar marcas de tiempo buscará automáticamente el flujo del video. También puedes pausar/reproducir manualmente con los controles de Youtube.',
    file_label: 'Archivo:',
    remove_file: 'Eliminar archivo',
    drag_drop_prefix: 'Arrastra y suelta',
    drag_drop_suffix: ' el archivo multimedia aquí',
    or_browse: 'o navega por tus archivos de sistema',
    browse_files: 'Buscar Archivos',
    how_offline_works: 'Cómo funciona el modo offline:',
    how_offline_desc_prefix: 'Al descargar',
    how_offline_desc_suffix: ' el video/audio de la lección de manera local y cargarlo aquí, tendrás precisión sin retrasos. Tu navegador procesa todo localmente; nada sale de tu dispositivo.',
    quick_jump: 'Secciones de Salto Rápido:',
    delete_lesson_title: '¿Eliminar lección permanentemente?',
    delete_lesson_desc: 'Estás a punto de eliminar permanentemente',
    delete_lesson_warning: 'Advertencia: Esto eliminará las frases, tarjetas, términos de vocabulario y archivos de sincronización de esta lección tanto de la nube de Firestore como de tu almacenamiento local. Esta acción es definitiva y no se puede deshacer.',
    delete_lesson_confirm_prompt: 'Escribe ELIMINAR a continuación para confirmar:',
    delete_word_target: 'ELIMINAR',
    delete_word_placeholder: 'Escribe ELIMINAR...',
    cancel: 'Cancelar',
    delete_action: 'Eliminar permanentemente',
  },
  fr: {
    flashcards: 'Fiches',
    quiz: 'Défi Quiz',
    dictation: "Arène d'Épellation",
    vocab: 'Vocabulaire de leçon',
    lyrics: 'Lignes de vidéo',
    change_import: 'Changer / Importer une leçon',
    prev: 'Précédent',
    next: 'Suivant',
    reveal_translation: 'Révéler la traduction',
    play_from_timestamp: "Jouer depuis l'horodatage",
    current_card_timestamp: 'Horodatage de la carte :',
    trim_time: 'Ajuster le temps',
    reset_to_default: 'Réinitialiser',
    load_demo_song: 'Charger la leçon démo',
    create_blank_song: 'Créer une leçon vide',
    song_customizer_title: 'Personnalisation de leçon',
    song_library_title: 'Votre bibliothèque de leçons',
    lyrics_instruction: "Cliquez sur le bouton de lecture d'une ligne pour synchroniser le lecteur vidéo et le lecteur local avec l'horodatage précis.",
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
    click_to_reveal: 'Cliquer pour révéler la traduction',
    self_assess: 'Évaluez votre confiance pour cette phrase :',
    hard: 'Difficile / Revoir',
    medium: 'Moyen',
    easy: 'Facile / Maîtrisé',
    card_traversal_mode: 'Mode de défilement des fiches',
    random_label: 'Aléatoire :',
    spaced_rep_label: 'Rép. espacée :',
    on: 'Actif',
    off: 'Inactif',
    spaced_rep_tip: '🎓 Donne la priorité aux cartes marquées Difficile et non notées sur les cartes Facile selon votre historique.',
    phrase: 'Phrase',
    of: 'sur',
    mastered: 'Maîtrisées',
    video_section: 'Section vidéo :',
    status_spaced_rep: 'Actif : Rép. espacée',
    status_random: 'Actif : Mélange aléatoire',
    status_sequential: 'Actif : Séquentiel',
    study_tip_title: 'CONSEIL D\'ÉTUDE DE LA LEÇON :',
    study_tip_observe: 'Observez comment l\'interlocuteur énonce',
    study_tip_translates: 'Cela se traduit par',
    study_tip_breakdown: 'Analyse des mots clés :',
    study_tip_practice: 'Entraînez-vous à prononcer cela en synchronisation avec la vidéo !',
    linguistic_breakdown: 'Analyse linguistique de la phrase',
    start_trim: 'Début de l\'ajustement',
    start_time: 'Heure de début :',
    end_trim: 'Fin de l\'ajustement (Cible d\'arrêt auto)',
    end_time: 'Heure de fin :',
    estimated: '(Estimé)',
    stop_video_after: 'Arrêter la vidéo après la phrase :',
    enabled: 'Activé',
    disabled: 'Désactivé',
    card_study_notes: 'Notes d\'étude de la fiche',
    my_study_notes: 'Mes notes d\'étude (Affiche au verso)',
    add_notes_placeholder: 'Ajoutez vos notes sur la prononciation, les inflexions, l\'argot, la grammaire ou des rappels ici...',
    media_hub: 'Centre multimédia',
    youtube_video: 'Vidéo YouTube',
    local_file: 'Fichier local',
    video_playback_mode: 'Mode de lecture vidéo :',
    stop_after_phrase: 'Arrêter après la phrase',
    continuous_play: 'Lecture continue',
    lesson_title_prefix: 'Leçon :',
    original_video: 'Vidéo originale',
    practicing_timestamps_info: 'S\'entraîner avec les horodatages positionnera automatiquement la vidéo. Vous pouvez également utiliser manuellement les commandes YouTube standard.',
    file_label: 'Fichier :',
    remove_file: 'Supprimer le fichier',
    drag_drop_prefix: 'Glisser-déposer',
    drag_drop_suffix: ' le fichier multimédia ici',
    or_browse: 'ou parcourez vos fichiers système',
    browse_files: 'Parcourir les fichiers',
    how_offline_works: 'Fonctionnement du mode local hors ligne :',
    how_offline_desc_prefix: 'En téléchargeant',
    how_offline_desc_suffix: ' la vidéo/l\'audio de la leçon localement et en l\'important ici, vous obtenez une précision sans décalage. Votre navigateur gère cela localement ; rien ne quitte votre machine.',
    quick_jump: 'Sections de saut rapide :',
    delete_lesson_title: 'Supprimer définitivement la leçon ?',
    delete_lesson_desc: 'Vous êtes sur le point de supprimer définitivement',
    delete_lesson_warning: "Attention : Cela supprimera les phrases, fiches, termes de vocabulaire et fichiers de synchronisation de cette leçon à la fois du cloud Firestore et de votre stockage local. Cette action est définitive et ne peut pas être annulée.",
    delete_lesson_confirm_prompt: 'Saisissez SUPPRIMER ci-dessous pour confirmer :',
    delete_word_target: 'SUPPRIMER',
    delete_word_placeholder: 'Saisir SUPPRIMER...',
    cancel: 'Annuler',
    delete_action: 'Supprimer définitivement',
  },
  de: {
    flashcards: 'Karteikarten',
    quiz: 'Quiz-Herausforderung',
    dictation: 'Rechtschreib-Arena',
    vocab: 'Lektionsvokabeln',
    lyrics: 'Video-Zeilen',
    change_import: 'Lektion wechseln / importieren',
    prev: 'Zurück',
    next: 'Weiter',
    reveal_translation: 'Übersetzung anzeigen',
    play_from_timestamp: 'Ab Zeitstempel abspielen',
    current_card_timestamp: 'Zeitstempel der Karte:',
    trim_time: 'Zeit anpassen',
    reset_to_default: 'Zurücksetzen',
    load_demo_song: 'Demo-Lektion laden',
    create_blank_song: 'Leere Lektion erstellen',
    song_customizer_title: 'Lektions-Customizer & Loader',
    song_library_title: 'Deine Lektionsbibliothek',
    lyrics_instruction: 'Klicke auf die Abspieltaste einer Zeile, um den Videoplayer und den lokalen Player direkt mit dem genauen Zeitstempel dieser Zeile zu synchronisieren.',
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
    click_to_reveal: 'Klicken für Übersetzung',
    self_assess: 'Schätze dein Vertrauen in diese Phrase selbst ein:',
    hard: 'Schwer / Noch einmal',
    medium: 'Mittel',
    easy: 'Einfach / Gelernt',
    card_traversal_mode: 'Kartendurchlauf-Modus',
    random_label: 'Zufall:',
    spaced_rep_label: 'Spaced Rep:',
    on: 'An',
    off: 'Aus',
    spaced_rep_tip: '🎓 Bevorzugt Karten, die als Schwer markiert oder noch nicht bewertet sind, gegenüber Einfachen Karten.',
    phrase: 'Phrase',
    of: 'von',
    mastered: 'Gelernt',
    video_section: 'Videoabschnitt:',
    status_spaced_rep: 'Aktiv: Spaced Rep',
    status_random: 'Aktiv: Zufallsmischung',
    status_sequential: 'Aktiv: Sequentiell',
    study_tip_title: 'AKTIVER LEKTIONS-STUDIENTIPP:',
    study_tip_observe: 'Beobachte, wie der Sprecher',
    study_tip_translates: 'Dies bedeutet',
    study_tip_breakdown: 'Schlüsselwörter-Aufschlüsselung:',
    study_tip_practice: 'Übe, dies synchron mit dem Video zu sprechen!',
    linguistic_breakdown: 'Linguistische Satzanalyse',
    start_trim: 'Start anpassen',
    start_time: 'Startzeit:',
    end_trim: 'Ende anpassen (Ziel für Auto-Stopp)',
    end_time: 'Endzeit:',
    estimated: '(Geschätzt)',
    stop_video_after: 'Video nach dem Sprechen stoppen:',
    enabled: 'Aktiviert',
    disabled: 'Deaktiviert',
    card_study_notes: 'Karteikarten-Studiennotizen',
    my_study_notes: 'Meine Studiennotizen (Erscheint auf der Rückseite)',
    add_notes_placeholder: 'Füge hier deine Notizen zu Aussprache, Betonung, Umgangssprache, Grammatik oder Erinnerungen hinzu...',
    media_hub: 'Medienzentrum',
    youtube_video: 'YouTube-Video',
    local_file: 'Lokale Datei',
    video_playback_mode: 'Video-Wiedergabemodus:',
    stop_after_phrase: 'Nach Phrase stoppen',
    continuous_play: 'Kontinuierliche Wiedergabe',
    lesson_title_prefix: 'Lektion:',
    original_video: 'Originalvideo',
    practicing_timestamps_info: 'Das Üben von Zeitstempeln sucht automatisch den Videostream. Du kannst die Standard-Youtube-Steuerelemente auch manuell pausieren/abspielen.',
    file_label: 'Datei:',
    remove_file: 'Datei entfernen',
    drag_drop_prefix: 'Zieh & lass',
    drag_drop_suffix: 's Mediendatei hierher',
    or_browse: 'oder durchsuche deine Systemdateien',
    browse_files: 'Dateien durchsuchen',
    how_offline_works: 'So funktioniert der Offline-Lokalmodus:',
    how_offline_desc_prefix: 'Indem du',
    how_offline_desc_suffix: 's Lektions-Video/Audio lokal herunterlädst und hier hochlädst, erhältst du eine verzögerungsfreie, exakte Suchgenauigkeit. Dein Browser verarbeitet dies vollständig lokal; nichts von dem, was hochgeladen wurde, verlässt deinen Rechner.',
    quick_jump: 'Schnellsprung-Abschnitte:',
    delete_lesson_title: 'Lektion dauerhaft löschen?',
    delete_lesson_desc: 'Du bist im Begriff, Folgendes dauerhaft zu löschen:',
    delete_lesson_warning: 'Warnung: Dies löscht die Sätze, Karteikarten, Vokabeln und Synchronisierungsdateien dieser Lektion sowohl aus der Firestore Cloud als auch aus deinem lokalen Speicher. Diese Aktion ist endgültig und kann nicht rückgängig gemacht werden.',
    delete_lesson_confirm_prompt: 'Gib LOESCHEN unten ein, um zu bestätigen:',
    delete_word_target: 'LOESCHEN',
    delete_word_placeholder: 'Gib LOESCHEN ein...',
    cancel: 'Abbrechen',
    delete_action: 'Dauerhaft löschen',
  },
  it: {
    flashcards: 'Carte',
    quiz: 'Sfida Quiz',
    dictation: 'Arena di Scrittura',
    vocab: 'Vocabolario Lezione',
    lyrics: 'Linee del Video',
    change_import: 'Cambia / Importa Lezione',
    prev: 'Precedente',
    next: 'Successivo',
    reveal_translation: 'Rivela Traduzione',
    play_from_timestamp: 'Riproduci da timestamp',
    current_card_timestamp: 'Timestamp della carta:',
    trim_time: 'Regola Tempo',
    reset_to_default: 'Ripristina',
    load_demo_song: 'Carica Lezione Demo',
    create_blank_song: 'Crea Nuova Lezione Vuota',
    song_customizer_title: 'Personalizzatore Lezioni',
    song_library_title: 'La Tua Libreria Lezioni',
    lyrics_instruction: 'Clicca sul pulsante Play di qualsiasi riga per sincronizzare e saltare al timestamp preciso di quella linea.',
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
    click_to_reveal: 'Clicca per rivelare la traduzione',
    self_assess: 'Valuta il tuo livello di sicurezza per questa frase:',
    hard: 'Difficile / Ripeti',
    medium: 'Medio',
    easy: 'Facile / Appreso',
    card_traversal_mode: 'Modalità di Scorrimento Carte',
    random_label: 'Casuale:',
    spaced_rep_label: 'Rip. Spaziata:',
    on: 'Attivo',
    off: 'Disattivato',
    spaced_rep_tip: '🎓 Dà la priorità alle carte contrassegnate come Difficile e non valutate rispetto a quelle Facile in base alla tua cronologia.',
    phrase: 'Frase',
    of: 'di',
    mastered: 'Imparate',
    video_section: 'Sezione Video:',
    status_spaced_rep: 'Attivo: Rip. Spaziata',
    status_random: 'Attivo: Casuale',
    status_sequential: 'Attivo: Sequenziale',
    study_tip_title: 'CONSIGLIO DI STUDIO ATTIVO:',
    study_tip_observe: 'Osserva come il parlante pronuncia',
    study_tip_translates: 'Questo si traduce in',
    study_tip_breakdown: 'Analisi delle parole chiave:',
    study_tip_practice: 'Esercitati a vocalizzare in sincronia con il video!',
    linguistic_breakdown: 'Analisi Linguistica della Frase',
    start_trim: 'Regola Inizio',
    start_time: 'Tempo di inizio:',
    end_trim: 'Regola Fine (Target Stop Auto)',
    end_time: 'Tempo di fine:',
    estimated: '(Stimato)',
    stop_video_after: 'Interrompi video dopo la frase:',
    enabled: 'Abilitato',
    disabled: 'Disattivato',
    card_study_notes: 'Note di Studio della Carta',
    my_study_notes: 'Le Mie Note (Retro della Carta)',
    add_notes_placeholder: 'Aggiungi qui le tue note su pronuncia, inflessioni, slang, spiegazioni grammaticali o promemoria...',
    media_hub: 'Centro Media',
    youtube_video: 'Video YouTube',
    local_file: 'File Locale',
    video_playback_mode: 'Modalità Riproduzione Video:',
    stop_after_phrase: 'Interrompi dopo frase',
    continuous_play: 'Riproduzione continua',
    lesson_title_prefix: 'Lezione:',
    original_video: 'Video Originale',
    practicing_timestamps_info: 'Esercitarsi con i timestamp sposterà automaticamente il video. Puoi anche gestire manualmente i controlli standard di YouTube.',
    file_label: 'File:',
    remove_file: 'Rimuovi file',
    drag_drop_prefix: 'Trascina e rilascia',
    drag_drop_suffix: ' il file multimediale qui',
    or_browse: 'o sfoglia i file di sistema',
    browse_files: 'Sfoglia File',
    how_offline_works: 'Come funziona la modalità locale offline:',
    how_offline_desc_prefix: 'Scaricando',
    how_offline_desc_suffix: ' il video/audio della lezione localmente e caricandolo qui, otterrai una precisione millimetrica senza ritardi. Il tuo browser gestisce tutto localmente; nessun file lascia il tuo computer.',
    quick_jump: 'Sezioni Salto Rapido:',
    delete_lesson_title: 'Eliminare permanentemente la lezione?',
    delete_lesson_desc: 'Stai per eliminare permanentemente',
    delete_lesson_warning: 'Attenzione: Questo eliminerà le frasi, le carte, i termini di vocabolario e i file di sincronizzazione di questa lezione sia da Firestore Cloud che dalla memoria locale. Questa azione è definitiva e non può essere annullata.',
    delete_lesson_confirm_prompt: 'Digita ELIMINA qui sotto per confermare:',
    delete_word_target: 'ELIMINA',
    delete_word_placeholder: 'Digita ELIMINA...',
    cancel: 'Annulla',
    delete_action: 'Elimina permanentemente',
  },
  pt: {
    flashcards: 'Cartões',
    quiz: 'Desafio de Quiz',
    dictation: 'Arena de Ortografia',
    vocab: 'Vocabulário da Lição',
    lyrics: 'Linhas do Vídeo',
    change_import: 'Alterar / Importar Lição',
    prev: 'Anterior',
    next: 'Seguinte',
    reveal_translation: 'Revelar Tradução',
    play_from_timestamp: 'Reproduzir do timestamp',
    current_card_timestamp: 'Timestamp do cartão:',
    trim_time: 'Ajustar Tempo',
    reset_to_default: 'Restaurar Padrão',
    load_demo_song: 'Carregar Lição Demo',
    create_blank_song: 'Criar Nova Lição Vazia',
    song_customizer_title: 'Personalizador de Lições',
    song_library_title: 'Sua Biblioteca de Lições Salvas',
    lyrics_instruction: 'Clique no botão Play de qualquer linha para sincronizar e saltar para o timestamp dessa linha.',
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
    click_to_reveal: 'Clique para revelar tradução',
    self_assess: 'Avalie sua confiança para esta frase:',
    hard: 'Difícil / Repetir',
    medium: 'Médio',
    easy: 'Fácil / Dominado',
    card_traversal_mode: 'Modo de Navegação de Cartões',
    random_label: 'Aleatório:',
    spaced_rep_label: 'Rep. Espaçada:',
    on: 'Ativo',
    off: 'Inativo',
    spaced_rep_tip: '🎓 Prioriza cartões classificados como Difícil e não classificados em relação aos cartões Fácil.',
    phrase: 'Frase',
    of: 'de',
    mastered: 'Dominados',
    video_section: 'Seção do Vídeo:',
    status_spaced_rep: 'Ativo: Rep. Espaçada',
    status_random: 'Ativo: Embaralhar',
    status_sequential: 'Ativo: Sequencial',
    study_tip_title: 'DICA DE ESTUDO ATIVO DA LIÇÃO:',
    study_tip_observe: 'Observe como o falante pronuncia',
    study_tip_translates: 'Isso se traduz em',
    study_tip_breakdown: 'Análise de palavras-chave:',
    study_tip_practice: 'Pratique a vocalização em sincronia com o vídeo!',
    linguistic_breakdown: 'Análise Linguística da Frase',
    start_trim: 'Ajustar Início',
    start_time: 'Tempo de início:',
    end_trim: 'Ajustar Fim (Alvo de Parada Automática)',
    end_time: 'Tempo de fim:',
    estimated: '(Estimado)',
    stop_video_after: 'Parar o vídeo após dizer a frase:',
    enabled: 'Ativado',
    disabled: 'Desativado',
    card_study_notes: 'Notas de Estudo do Cartão',
    my_study_notes: 'Minhas Notas (Verso do Cartão)',
    add_notes_placeholder: 'Adicione suas notas sobre pronúncia, inflexões, gírias, gramática ou lembretes aqui...',
    media_hub: 'Central de Mídia',
    youtube_video: 'Vídeo do YouTube',
    local_file: 'Arquivo Local',
    video_playback_mode: 'Modo de Reprodução de Vídeo:',
    stop_after_phrase: 'Parar após frase',
    continuous_play: 'Reprodução contínua',
    lesson_title_prefix: 'Lição:',
    original_video: 'Vídeo Original',
    practicing_timestamps_info: 'Praticar marcações de tempo buscará automaticamente o fluxo do vídeo. Você também pode pausar/reprodurir manualmente os controles padrão do YouTube.',
    file_label: 'Arquivo:',
    remove_file: 'Remover arquivo',
    drag_drop_prefix: 'Arraste e solte',
    drag_drop_suffix: ' o arquivo de mídia aqui',
    or_browse: 'ou navegue pelos seus arquivos do sistema',
    browse_files: 'Procurar Arquivos',
    how_offline_works: 'Como funciona o modo local offline:',
    how_offline_desc_prefix: 'Ao baixar',
    how_offline_desc_suffix: ' o vídeo/áudio da lição localmente e enviando-o aqui, você terá uma precisão de busca exata e sem atrasos. Seu navegador lida com isso de forma totalmente local; nada enviado sai de sua máquina.',
    quick_jump: 'Seções de Salto Rápido:',
    delete_lesson_title: 'Excluir lição permanentemente?',
    delete_lesson_desc: 'Você está prestes a excluir permanentemente',
    delete_lesson_warning: 'Aviso: Isso excluirá as frases, cartões, termos de vocabulário e arquivos de sincronização desta lição tanto da nuvem Firestore quanto do seu armazenamento local. Esta ação é definitiva e não pode ser desfeita.',
    delete_lesson_confirm_prompt: 'Digite EXCLUIR abaixo para confirmar:',
    delete_word_target: 'EXCLUIR',
    delete_word_placeholder: 'Digite EXCLUIR...',
    cancel: 'Cancelar',
    delete_action: 'Excluir permanentemente',
  }
};

export default function App() {
  // App view state
  const [uiLang, setUiLang] = useState<string>(() => localStorage.getItem('app_button_language') || 'en');
  
  useEffect(() => {
    localStorage.setItem('app_button_language', uiLang);
  }, [uiLang]);

  const t = (key: string) => UI_TRANSLATIONS[uiLang]?.[key] || UI_TRANSLATIONS['en']?.[key] || key;

  const formatTimeSeconds = (totalSecs: number) => {
    const minutes = Math.floor(totalSecs / 60);
    const seconds = Math.floor(totalSecs % 60);
    const msFraction = Math.round((totalSecs % 1) * 10);
    let str = `${minutes}:${String(seconds).padStart(2, '0')}`;
    if (msFraction > 0) {
      str += `.${msFraction}`;
    }
    return str;
  };

  const [activeTab, setActiveTab] = useState<string>('flashcards'); // flashcards, quiz, dictation, vocab, lyrics
  const [selectedDecks, setSelectedDecks] = useState<string[]>(['All']);
  const [starredIds, setStarredIds] = useState<number[]>([]);

  const getDeckKey = (decks: string[]) => {
    return [...decks].sort().join('_').toLowerCase();
  };

  const toggleDeck = (deckId: string) => {
    setSelectedDecks(prev => {
      if (deckId === 'All') {
        return ['All'];
      }
      if (deckId === 'Starred') {
        return ['Starred'];
      }
      
      let next = prev.filter(d => d !== 'All' && d !== 'Starred');
      if (next.includes(deckId)) {
        next = next.filter(d => d !== deckId);
      } else {
        next = [...next, deckId];
      }
      
      if (next.length === 0) {
        return ['All'];
      }
      return next;
    });
  };
  
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
        createdBy: 'Andrew'
      };

      await setDoc(songDocRef, payload);
      setCloudSyncStatus('synced');
    } catch (e) {
      console.error("Failed to save song to Firestore:", e);
      setCloudSyncStatus('error');
      handleFirestoreError(e, 'songs', 'create', `songs/${songId}`, payload);
    }
  };

  // Cloud helper to delete a song from Firestore
  const deleteSongFromCloud = async (song: SongData) => {
    const songId = `${song.title.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')}_${song.artist.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')}`;
    try {
      setCloudSyncStatus('syncing');
      const songDocRef = doc(db, 'songs', songId);
      await deleteDoc(songDocRef);
      setCloudSyncStatus('synced');
    } catch (e) {
      console.error("Failed to delete song from Firestore:", e);
      setCloudSyncStatus('error');
      handleFirestoreError(e, 'songs', 'delete', `songs/${songId}`);
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

      // Reconstruct the saved songs list: always start with default SONG_DATA, then add all others from cloud
      const updatedList = [SONG_DATA];
      cloudSongs.forEach((cloudSong) => {
        const isDefault = cloudSong.title.toLowerCase().trim() === SONG_DATA.title.toLowerCase().trim() &&
                          cloudSong.artist.toLowerCase().trim() === SONG_DATA.artist.toLowerCase().trim();
        if (!isDefault) {
          updatedList.push(cloudSong);
        }
      });
      setSavedSongs(updatedList);
      localStorage.setItem('confieso_song_library', JSON.stringify(updatedList));
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
  const [songToDelete, setSongToDelete] = useState<SongData | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  
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
    let touchStartAtTop = false;
    let touchStartY = 0;
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // Scrolling down past 50px - hide details for more space
        setShowHeaderDetails(false);
      }
      lastScrollY = currentScrollY;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
        // Check if we are already at the top when the touch begins
        touchStartAtTop = window.scrollY <= 5;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0 && touchStartAtTop) {
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - touchStartY;
        // If they swipe down (finger moving down, deltaY > 0) by a reasonable threshold
        if (deltaY > 40 && window.scrollY <= 5) {
          setShowHeaderDetails(true);
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // If we are at the top of the page and scrolling up (deltaY < 0)
      if (window.scrollY <= 5 && e.deltaY < -5) {
        setShowHeaderDetails(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('wheel', handleWheel);
    };
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

  // Helper to parse transcripts from HTML, text or SRT formats
  const parseTranscriptText = (text: string): { timestamp: number, timestampStr: string, text: string }[] => {
    if (!text) return [];

    const lines = text.split(/\r?\n/);
    const results: { timestamp: number, timestampStr: string, text: string }[] = [];
    
    let currentTimestamp: number | null = null;
    let currentTimestampStr = '';
    
    // Regex for matching VTT/SRT timing line start timestamps, e.g., "00:01:20.123" or "01:20.000" or "12:34"
    const timeRegex = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d{3})|,\d{3})?/;
    // Regex for matching inline timestamps at the beginning of a line, e.g., "[0:12] Hola" or "(1:23:45) Hello"
    const inlineTimestampRegex = /^\s*(?:\[|\()?(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\]|\))?\s*/;

    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Skip WebVTT metadata headers, style rules, and regions
      const isHeaderOrStyle = 
        trimmed.startsWith('WEBVTT') || 
        trimmed.startsWith('NOTE') || 
        trimmed.startsWith('Style:') || 
        trimmed.startsWith('Region:') || 
        trimmed.startsWith('Kind:') || 
        trimmed.startsWith('Language:') || 
        trimmed.startsWith('X-TIMESTAMP-MAP') ||
        trimmed.startsWith('::cue') ||
        trimmed.includes('{') ||
        trimmed.includes('}') ||
        trimmed.includes('color:') ||
        trimmed.startsWith('FILE') ||
        trimmed.startsWith('TITLE') ||
        trimmed.startsWith('AUTHOR');

      if (isHeaderOrStyle) {
        continue;
      }
      
      // Skip SRT integer cue index numbers (lines containing ONLY digits)
      if (/^\d+$/.test(trimmed)) {
        continue;
      }

      // Check if it's a timing line containing "-->" (WebVTT or SRT)
      if (trimmed.includes('-->')) {
        const parts = trimmed.split('-->');
        const startPart = parts[0].trim();
        const match = timeRegex.exec(startPart);
        if (match) {
          const hours = match[1] ? parseInt(match[1], 10) : 0;
          const minutes = parseInt(match[2], 10);
          const seconds = parseInt(match[3], 10);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          
          let formattedStr = '';
          if (hours > 0) {
            formattedStr = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          } else {
            formattedStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          }
          
          currentTimestamp = totalSeconds;
          currentTimestampStr = formattedStr;
        }
        continue; // Skip the timing line itself
      }

      // If it's a regular text line, clean XML/HTML tags and styling (e.g. <v Speaker>, <c.yellow>, <i>)
      let cleanLine = trimmed
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanLine) continue;

      // Skip common non-speech subtitle cues (like [Music], (Laughter), [Applause])
      const lower = cleanLine.toLowerCase();
      if (lower === '[music]' || lower === '(music)' || lower === '[applause]' || lower === '(applause)' || lower === '[laughter]' || lower === '(laughter)') {
        continue;
      }

      // Check if we have an active timestamp from a preceding "-->" timing line
      if (currentTimestamp !== null) {
        const existing = results.find(r => r.timestamp === currentTimestamp);
        if (existing) {
          // Merge multi-line captions for the same cue
          existing.text = `${existing.text} ${cleanLine}`.trim();
        } else {
          results.push({
            timestamp: currentTimestamp,
            timestampStr: currentTimestampStr,
            text: cleanLine
          });
        }
      } else {
        // If there was no timing line, check if the line starts with an inline timestamp (e.g., "[0:12] Hola")
        const inlineMatch = inlineTimestampRegex.exec(trimmed);
        if (inlineMatch) {
          const hours = inlineMatch[1] ? parseInt(inlineMatch[1].replace(':', ''), 10) : 0;
          const minutes = parseInt(inlineMatch[2], 10);
          const seconds = parseInt(inlineMatch[3], 10);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          
          let formattedStr = '';
          if (hours > 0) {
            formattedStr = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          } else {
            formattedStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          }

          let textWithoutTimestamp = trimmed.replace(inlineMatch[0], '').trim();
          textWithoutTimestamp = textWithoutTimestamp.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

          if (textWithoutTimestamp) {
            results.push({
              timestamp: totalSeconds,
              timestampStr: formattedStr,
              text: textWithoutTimestamp
            });
          }
        } else {
          // Fallback if no timestamp can be found: append to the previous line if possible
          if (results.length > 0) {
            results[results.length - 1].text = `${results[results.length - 1].text} ${cleanLine}`.trim();
          } else {
            results.push({
              timestamp: 0,
              timestampStr: "0:00",
              text: cleanLine
            });
          }
        }
      }
    }

    // Post-processing: Filter out duplicate sequential sentences (often found in auto-generated captions)
    const finalResults: { timestamp: number, timestampStr: string, text: string }[] = [];
    for (const res of results) {
      if (finalResults.length > 0) {
        const last = finalResults[finalResults.length - 1];
        if (last.text === res.text) {
          continue;
        }
      }
      finalResults.push(res);
    }

    return finalResults;
  };

  const cleanTranscriptHTMLAndGetText = (htmlString: string): string => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      
      const unwantedTags = ['script', 'style', 'head', 'svg', 'noscript', 'iframe'];
      unwantedTags.forEach(tag => {
        const elements = doc.querySelectorAll(tag);
        elements.forEach(el => el.remove());
      });
      
      return doc.body?.innerText || doc.body?.textContent || htmlString;
    } catch (e) {
      console.error("DOMParser failed, falling back to raw text", e);
      return htmlString;
    }
  };

  const cleanTranscriptTextOfJunk = (rawText: string): string => {
    if (!rawText.trim()) return rawText;

    const lines = rawText.split(/\r?\n/);
    const totalLines = lines.length;
    if (totalLines < 4) return rawText;

    const isPromoOrJunkLine = (text: string): boolean => {
      const lower = text.toLowerCase().trim();
      if (!lower) return false;

      // 1. Raw URL check
      const hasUrl = /https?:\/\/\S+|www\.\S+|\b\S+\.(?:com|net|org|co|tv|ly|me|us)\/\S*/i.test(text);
      if (hasUrl) return true;

      // 2. Specific domain/social check
      const hasSocialDomain = /\b(?:patreon|instagram|facebook|twitter|tiktok|discord|paypal|spotify|apple|twitch|github|youtube|bit\.ly|youtu\.be)\b/i.test(text);
      if (hasSocialDomain) return true;

      // 3. Trailing junk keywords/phrases
      const promoPhrases = [
        'subscribe to',
        'support my channel',
        'support the channel',
        'link in the description',
        'links in the description',
        'link down below',
        'links down below',
        'follow me on',
        'my social media',
        'check out my',
        'buy my',
        'merch store',
        'get 10% off',
        'discount code',
        'promo code',
        'use code',
        'patreon',
        'newsletter',
        'all rights reserved',
        'copyright'
      ];
      
      for (const phrase of promoPhrases) {
        if (lower.includes(phrase)) {
          return true;
        }
      }
      
      return false;
    };

    let cutoffIndex = totalLines;
    let cleanStreak = 0;
    const midPoint = Math.floor(totalLines / 2);

    for (let i = totalLines - 1; i >= 0; i--) {
      if (i < midPoint) {
        break;
      }

      if (isPromoOrJunkLine(lines[i])) {
        cleanStreak = 0;
        cutoffIndex = i;
      } else {
        cleanStreak++;
        if (cleanStreak >= 3) {
          break;
        }
      }
    }

    const trimmedLines = lines.slice(0, cutoffIndex);
    const finalLines = trimmedLines.filter(line => {
      const lower = line.toLowerCase().trim();
      const isPureUrl = /^(https?:\/\/\S+|www\.\S+|\S+\.(?:com|org|net|co|ly)\S*)$/i.test(lower);
      if (isPureUrl) return false;
      return true;
    });

    return finalLines.join('\n');
  };

  const handleTranscriptFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        let plainText = content;
        
        const lowercaseName = file.name.toLowerCase();
        const looksLikeHtml = lowercaseName.endsWith('.html') || 
                            lowercaseName.endsWith('.htm') || 
                            lowercaseName.endsWith('.bin') ||
                            content.trim().startsWith('<') || 
                            content.includes('<!DOCTYPE') || 
                            content.includes('<html');
        if (looksLikeHtml) {
          plainText = cleanTranscriptHTMLAndGetText(content);
        }
        
        // Clean trailing junk from plain text transcript before parsing
        plainText = cleanTranscriptTextOfJunk(plainText);
        
        const segments = parseTranscriptText(plainText);
        if (segments.length === 0) {
          // Fall back to split-by-line parsing if no timestamps are matched
          const lines = plainText
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('<'));
            
          if (lines.length > 0) {
            const fallbackSegments = lines.map((line, idx) => {
              const estimateSeconds = idx * 5;
              const mins = Math.floor(estimateSeconds / 60);
              const secs = estimateSeconds % 60;
              const timestampStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
              return {
                timestamp: estimateSeconds,
                timestampStr,
                text: line
              };
            });
            
            const formatted = fallbackSegments.map(seg => `${seg.timestampStr} ${seg.text}`).join('\n');
            setPromptTranscript(formatted);
            
            const cleanName = file.name
              .replace(/\.[^/.]+$/, "") // strip extension
              .replace(/[-_]/g, " ") // replace dashes/underscores with spaces
              .replace(/\b\w/g, c => c.toUpperCase()); // title case
            setPromptSongName(cleanName + " by Speaker");

            setValidationError(null);
            setSuccessMessage(`Successfully uploaded and parsed ${fallbackSegments.length} text lines from transcript file: "${file.name}".`);
            setValidationSuccess(true);
            setTimeout(() => setValidationSuccess(false), 5000);
            return;
          }
          
          setValidationError("Could not extract any transcript segments or lines from the file.");
          return;
        }
        
        const formatted = segments.map(seg => `${seg.timestampStr} ${seg.text}`).join('\n');
        setPromptTranscript(formatted);
        
        // Populate the metadata title based on the filename
        const cleanName = file.name
          .replace(/\.[^/.]+$/, "") // strip extension
          .replace(/[-_]/g, " ") // replace dashes/underscores with spaces
          .replace(/\b\w/g, c => c.toUpperCase()); // title case
          
        setPromptSongName(cleanName + " by Speaker");
        
        setValidationError(null);
        setSuccessMessage(`Successfully uploaded and parsed ${segments.length} timestamped lines from transcript file: "${file.name}".`);
        setValidationSuccess(true);
        setTimeout(() => setValidationSuccess(false), 5000);
      } catch (err: any) {
        setValidationError(`Failed to parse transcript file: ${err.message}`);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleGeminiJsonUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawContent = event.target?.result as string;
        const parsed = extractAndCleanJSON(rawContent);
        const err = validateSongData(parsed);
        if (err) {
          setValidationError(`JSON file validation failed: ${err}`);
          return;
        }
        const cleanedParsed = sanitizeAndSortSongData(parsed, false);
        setSongData(cleanedParsed);
        localStorage.setItem('confieso_custom_song', JSON.stringify(cleanedParsed));
        setValidationError(null);
        setSuccessMessage(`Success! Loaded customized lesson companion: "${cleanedParsed.title}" with ${cleanedParsed.phrases.length} phrases.`);
        setValidationSuccess(true);
        setTimeout(() => setValidationSuccess(false), 5000);
      } catch (err: any) {
        setValidationError(`Failed to load JSON file: ${err.message}`);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

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
    let targetYoutubeId = promptYoutubeId.trim() || songData.youtubeId || 'YOUTUBE_ID';
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

    const cleanTitle = (promptSongName || songData.title || "Custom Lesson").split(' by ')[0] || "Custom Lesson";
    const cleanSpeaker = (promptSongName || songData.artist || "Speaker").split(' by ')[1] || "Speaker";

    return `You are an expert language curriculum designer and professional learning content engineer. Your task is to process the raw video transcript of a lesson, dialogue, conversation, or speech below and compile a high-fidelity bilingual study companion dataset in JSON format.

CRITICAL CURRICULUM & INSTRUCTIONAL RULES:
1. FOCUS ON EDUCATIONAL PHRASES, NOT VERBATIM CHIT-CHAT or FILLER:
   - Identify the actual key target-language sentences, expressions, vocabulary, or idioms being actively taught, explained, or practiced in the video.
   - Do NOT create cards for teacher-oriented meta-talk, administrative filler, or conversational padding (e.g., "Welcome back to the channel", "Make sure to subscribe", "In today's video, I'm going to explain..."). Ignore or skip these entirely.
   - For teacher explanations, extract the focus sentence/word they are teaching as the card's target-language content. For example, if the teacher says: "To say 'I'm on my way' in Spanish, we say: Para decir voy en camino. I'm on my way, guys, I'm on my way.", the core target phrase should be extracted cleanly as "Voy en camino" (or "Para decir voy en camino") and translated cleanly as "To say 'I'm on my way'". Do NOT bundle repeated, rambling spoken English and Spanish words like "I'M ON MY WAY. I'M ON MY WAY. PERO VAMOS..." into the study phrases!
   - Ensure target-language fields contain clean target-language text (${promptTargetLangA} only, in its correct spelling), and native fields contain clean translations (${promptNativeLangA}).

2. ELIMINATE REPETITION & CONSOLIDATE REPEATED CUES:
   - If a word or phrase is repeated multiple times back-to-back for pronunciation or practice drills, merge or consolidate them into a single, high-quality, representative study phrase. Do NOT create multiple duplicate or near-identical sequential cards.

3. PREVENT TRUNCATION (BE TOKEN-EFFICIENT WITH BREAKDOWNS):
   - To ensure you can complete the entire transcript and provide comprehensive lesson-wide coverage without hitting Gemini output token limit thresholds (which causes truncated or half-finished responses):
   - Keep the "breakdown" arrays highly selective! Only include breakdown translations for novel, difficult, idiom-based, or non-obvious words and grammar chunks in that sentence.
   - Do NOT build massive breakdown arrays translating every single obvious word (like "I", "to", "the", etc.) in every sentence, as this creates bloated JSON and causes cutoffs.

4. DELIVER THE COMPLETE LESSON COVERAGE:
   - Provide a highly paced, comprehensive dataset that spans from the absolute beginning to the absolute end of the raw transcript.
   - Do NOT stop halfway or omit later sections. The entire lesson curriculum must be captured.

5. EXACT TIMESTAMP MAPPING & DURATION LOOPS:
   - Estimate and map start and end timestamps extremely carefully:
     - "id": a sequential integer starting from 1.
     - "timestamp": The exact start time of the phrase in total seconds (e.g., 1:15 becomes 75).
     - "timestampStr": The string timestamp (e.g. "1:15" or "0:45").
     - "timestampEnd": Estimate the end timestamp of the phrase in total seconds. Look ahead to the subsequent segment's start timestamp. The current phrase's end time should finish right before the next phrase begins (usually 0.2 to 0.5 seconds before it, or when the spoken sentence naturally concludes), ensuring loops function seamlessly in the companion application.
     - "timestampEndStr": The string timestamp for the calculated end of the phrase (e.g. "1:18" or "0:48").

6. MANDATORY SINGLE CODE BLOCK FORMAT (FOR INSTANT DOWNLOAD BUTTON):
   - You MUST wrap your entire output in a single markdown code block (using \`\`\`json and \`\`\`). This is crucial because it triggers the Google Gemini interface to render a direct, one-click "Download" or "Copy" button so the user can save the code as a local file.
   - Do NOT include any conversational preamble, introduction, or post-match explanations. The ONLY text in your entire response must be the markdown block containing the valid, complete JSON object.
   - Do NOT use placeholder ellipses (like "... [rest of phrases] ...") or truncate the JSON, as this makes the file completely unparseable for the user's application.

JSON Schema structure:
{
  "title": "${cleanTitle}",
  "artist": "${cleanSpeaker}",
  "youtubeId": "${targetYoutubeId}",
  "phrases": [
    {
      "id": 1,
      "spanish": "original target language text line",
      "english": "natural translation",
      "literal": "literal translation",
      "category": "Topic Section Name",
      "timestamp": 12,
      "timestampStr": "0:12",
      "timestampEnd": 15,
      "timestampEndStr": "0:15",
      "breakdown": [
        { "word": "word", "meaning": "translation" }
      ]
    }
  ],
  "vocab": [
    { "word": "vocab word", "definition": "clear definition", "example": "example sentence" }
  ]
}

---
VIDEO METADATA INFORMATION:
- Lesson Title: ${cleanTitle}
- Speaker/Artist: ${cleanSpeaker}
- YouTube Video ID: ${targetYoutubeId}
- Target Language (spelling): ${promptTargetLangA}
- Native/Translation Language: ${promptNativeLangA}

---
RAW VIDEO TRANSCRIPT TO PROCESS:
${promptTranscript.trim() || "(Please upload a transcript file above or type/paste your transcript here to include it in the download prompt!)"}`;
  }, [promptSongName, songData, promptYoutubeId, promptTargetLangA, promptNativeLangA, promptTranscript]);

  // Flashcard states
  const [cardIndex, setCardIndex] = useState<number>(() => {
    try {
      let initialTitle = SONG_DATA.title;
      const savedSong = localStorage.getItem('confieso_custom_song');
      if (savedSong) {
        const parsed = JSON.parse(savedSong);
        if (parsed && parsed.title) {
          initialTitle = parsed.title;
        }
      }
      const songKey = initialTitle.replace(/\s+/g, '_').toLowerCase();
      const saved = localStorage.getItem(`confieso_card_index_${songKey}_all`);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch (e) {
      console.error("Failed to load initial card index", e);
    }
    return 0;
  });
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [knownRates, setKnownRates] = useState<Record<number, 'easy' | 'medium' | 'hard'>>({}); // cardId -> rating

  const [autoPlayOnCardChange, setAutoPlayOnCardChange] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('confieso_auto_play_on_card_change');
      return saved !== 'false';
    } catch (e) {
      return true;
    }
  });

  const [isRandomCardOn, setIsRandomCardOn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('confieso_random_card_on');
      return saved === 'true';
    } catch (e) {
      return false;
    }
  });

  const [isSpacedRepOn, setIsSpacedRepOn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('confieso_spaced_rep_on');
      return saved === 'true';
    } catch (e) {
      return false;
    }
  });

  const [cardHistory, setCardHistory] = useState<number[]>([]);

  useEffect(() => {
    localStorage.setItem('confieso_auto_play_on_card_change', autoPlayOnCardChange.toString());
  }, [autoPlayOnCardChange]);

  useEffect(() => {
    localStorage.setItem('confieso_random_card_on', isRandomCardOn.toString());
  }, [isRandomCardOn]);

  useEffect(() => {
    localStorage.setItem('confieso_spaced_rep_on', isSpacedRepOn.toString());
  }, [isSpacedRepOn]);

  useEffect(() => {
    setCardHistory([]);
  }, [selectedDecks]);
  
  // Audio configuration states
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [autoStopAfterPhrase, setAutoStopAfterPhrase] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('confieso_auto_stop_after_phrase');
      return saved === 'true';
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('confieso_auto_stop_after_phrase', autoStopAfterPhrase.toString());
  }, [autoStopAfterPhrase]);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('confieso_fullscreen');
      return saved !== 'false';
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    localStorage.setItem('confieso_fullscreen', isFullscreen.toString());
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      // Keep state in sync with real browser fullscreen state if the user entered it nativeside
      if (document.fullscreenElement) {
        setIsFullscreen(true);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        const docEl = document.documentElement as any;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
        setIsFullscreen(true);
      } catch (err) {
        console.log("Browser fullscreen blocked or failed, toggling virtual widescreen mode:", err);
        setIsFullscreen(prev => !prev);
      }
    } else {
      try {
        const docWithExit = document as any;
        if (docWithExit.exitFullscreen) {
          await docWithExit.exitFullscreen();
        } else if (docWithExit.webkitExitFullscreen) {
          await docWithExit.webkitExitFullscreen();
        } else if (docWithExit.mozCancelFullScreen) {
          await docWithExit.mozCancelFullScreen();
        } else if (docWithExit.msExitFullscreen) {
          await docWithExit.msExitFullscreen();
        }
        setIsFullscreen(false);
      } catch (err) {
        console.log("Failed to exit native fullscreen:", err);
        setIsFullscreen(prev => !prev);
      }
    }
  };

  // Media Player configuration (YouTube + Local File)
  const [localFileUrl, setLocalFileUrl] = useState<string>('');
  const [localFileName, setLocalFileName] = useState<string>('');
  const [mediaPlayerType, setMediaPlayerType] = useState<'youtube' | 'local'>('youtube');
  const [ytStart, setYtStart] = useState<number>(11);
  const [ytTrigger, setYtTrigger] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const ytPlayerInstanceRef = useRef<any>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const preventAutoPlayOnceRef = useRef<boolean>(false);

  // Load YouTube script on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }, []);

  // Initialize YT Player when api ready and video changes
  useEffect(() => {
    let player: any = null;
    
    const initPlayer = () => {
      if (!songData.youtubeId || typeof window === 'undefined' || !(window as any).YT || !(window as any).YT.Player) return;
      
      const container = document.getElementById('yt-player-container');
      if (!container) return; // Wait for element to mount
      
      if (ytPlayerInstanceRef.current) {
        try {
          ytPlayerInstanceRef.current.destroy();
        } catch (e) {
          console.error("Error destroying YT player", e);
        }
        ytPlayerInstanceRef.current = null;
      }

      // Create a div inside the container
      container.innerHTML = '<div id="yt-player-placeholder"></div>';
      
      try {
        player = new (window as any).YT.Player('yt-player-placeholder', {
          videoId: songData.youtubeId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            start: ytStart,
            rel: 0,
            controls: 1,
            modestbranding: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (event: any) => {
              ytPlayerInstanceRef.current = event.target;
              if (pendingSeekRef.current !== null) {
                event.target.seekTo(pendingSeekRef.current, true);
                event.target.playVideo();
                pendingSeekRef.current = null;
              }
            }
          }
        });
      } catch (e) {
        console.error("Failed to construct YT player", e);
      }
    };

    if (mediaPlayerType === 'youtube') {
      if ((window as any).YT && (window as any).YT.Player) {
        const t = setTimeout(initPlayer, 100);
        return () => clearTimeout(t);
      } else {
        const prevCallback = (window as any).onYouTubeIframeAPIReady;
        (window as any).onYouTubeIframeAPIReady = () => {
          if (prevCallback) prevCallback();
          initPlayer();
        };
      }
    }

    return () => {
      if (player) {
        try {
          player.destroy();
        } catch (e) {}
        ytPlayerInstanceRef.current = null;
      }
    };
  }, [songData.youtubeId, mediaPlayerType]);

  // Filtered Cards based on active Category Deck
  const filteredPhrases = songData.phrases.filter(phrase => {
    if (selectedDecks.includes('All')) return true;
    if (selectedDecks.includes('Starred')) return starredIds.includes(phrase.id);
    return selectedDecks.some(deck => phrase.category.toLowerCase() === deck.toLowerCase());
  });

  const activePhrase: Phrase | undefined = filteredPhrases[cardIndex];

  // Handle active phrase auto stop
  useEffect(() => {
    if (!autoStopAfterPhrase || !activePhrase) return;
    
    const endTime = getPhraseEndTime(activePhrase);
    
    const interval = setInterval(() => {
      // 1. Check local video player
      if (mediaPlayerType === 'local' && videoPlayerRef.current) {
        const curr = videoPlayerRef.current.currentTime;
        if (curr >= endTime && curr < endTime + 2 && !videoPlayerRef.current.paused) {
          videoPlayerRef.current.pause();
        }
      } 
      // 2. Check YouTube player
      else if (mediaPlayerType === 'youtube' && ytPlayerInstanceRef.current && typeof ytPlayerInstanceRef.current.getCurrentTime === 'function') {
        try {
          const state = ytPlayerInstanceRef.current.getPlayerState();
          if (state === 1) { // 1 is playing
            const curr = ytPlayerInstanceRef.current.getCurrentTime();
            if (curr >= endTime && curr < endTime + 2) {
              ytPlayerInstanceRef.current.pauseVideo();
            }
          }
        } catch (e) {}
      }
    }, 100);

    return () => clearInterval(interval);
  }, [autoStopAfterPhrase, activePhrase, mediaPlayerType, songData.phrases]);

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

      // Reset to All deck first
      setSelectedDecks(['All']);

      // Load saved index for 'all' deck
      const savedCardIndex = localStorage.getItem(`confieso_card_index_${songKey}_all`);
      if (savedCardIndex) {
        const parsedIdx = parseInt(savedCardIndex, 10);
        setCardIndex(parsedIdx >= 0 ? parsedIdx : 0);
      } else {
        setCardIndex(0);
      }
      setIsFlipped(false);
    } catch (e) {
      console.error("Error reading from localStorage", e);
    }
  }, [songData.title]);

  // Save active cardIndex to localStorage
  useEffect(() => {
    if (cardIndex >= 0) {
      const songKey = songData.title.replace(/\s+/g, '_').toLowerCase();
      const deckKey = getDeckKey(selectedDecks);
      localStorage.setItem(`confieso_card_index_${songKey}_${deckKey}`, cardIndex.toString());
    }
  }, [cardIndex, songData.title, selectedDecks]);

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

  // Load or clean index bounds when switching study decks
  useEffect(() => {
    try {
      const songKey = songData.title.replace(/\s+/g, '_').toLowerCase();
      const deckKey = getDeckKey(selectedDecks);
      const savedCardIndex = localStorage.getItem(`confieso_card_index_${songKey}_${deckKey}`);
      if (savedCardIndex) {
        const parsedIdx = parseInt(savedCardIndex, 10);
        if (!isNaN(parsedIdx) && parsedIdx >= 0) {
          setCardIndex(parsedIdx);
        } else {
          setCardIndex(0);
        }
      } else {
        setCardIndex(0);
      }
      setIsFlipped(false);
    } catch (e) {
      console.error("Error restoring deck card index", e);
    }
  }, [selectedDecks]);

  // Bounds safety guard to make sure cardIndex doesn't exceed filteredPhrases length
  useEffect(() => {
    if (filteredPhrases.length > 0 && cardIndex >= filteredPhrases.length) {
      setCardIndex(0);
    }
  }, [cardIndex, filteredPhrases.length]);

  const pauseMedia = () => {
    if (mediaPlayerType === 'local' && videoPlayerRef.current) {
      videoPlayerRef.current.pause();
    } else if (mediaPlayerType === 'youtube' && ytPlayerInstanceRef.current && typeof ytPlayerInstanceRef.current.pauseVideo === 'function') {
      try {
        ytPlayerInstanceRef.current.pauseVideo();
      } catch (e) {}
    }
  };

  // Dual Player Jump to Timestamp Handler
  const playAtTimestamp = (seconds: number, shouldPlay: boolean = true) => {
    if (mediaPlayerType === 'local' && videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = seconds;
      if (shouldPlay) {
        videoPlayerRef.current.play().catch(e => console.log("Auto-play blocked or seeking complete.", e));
      } else {
        videoPlayerRef.current.pause();
      }
    } else {
      if (ytPlayerInstanceRef.current && typeof ytPlayerInstanceRef.current.seekTo === 'function') {
        ytPlayerInstanceRef.current.seekTo(seconds, true);
        if (shouldPlay) {
          ytPlayerInstanceRef.current.playVideo();
        } else {
          try {
            ytPlayerInstanceRef.current.pauseVideo();
          } catch (e) {}
        }
      } else {
        pendingSeekRef.current = seconds;
        // For YouTube, update the start query parameter of the iframe.
        // Must be a whole integer because YouTube's embed 'start' parameter only accepts integers!
        // If we pass a float (e.g. 18.1), YouTube will reject it and fall back to 0 (beginning of song).
        setYtStart(Math.floor(seconds));
        setYtTrigger(prev => prev + 1);
      }
    }
  };

  const lastPlayedIdRef = useRef<number | null>(null);
  const isAutoProgressionRef = useRef<boolean>(false);

  // Sync card index to current video playback time as the video progresses when auto-play is on
  useEffect(() => {
    if (!autoPlayOnCardChange || filteredPhrases.length === 0 || !(activeTab === 'flashcards' || activeTab === 'lyrics')) return;

    const interval = setInterval(() => {
      let curr = -1;
      let isPlaying = false;
      
      if (mediaPlayerType === 'local' && videoPlayerRef.current) {
        curr = videoPlayerRef.current.currentTime;
        isPlaying = !videoPlayerRef.current.paused;
      } else if (mediaPlayerType === 'youtube' && ytPlayerInstanceRef.current && typeof ytPlayerInstanceRef.current.getCurrentTime === 'function') {
        try {
          curr = ytPlayerInstanceRef.current.getCurrentTime();
          isPlaying = ytPlayerInstanceRef.current.getPlayerState() === 1; // 1 = playing
        } catch (e) {}
      }

      if (isPlaying && curr >= 0) {
        // Find the index in filteredPhrases that matches current time
        let matchingIdx = -1;
        for (let i = 0; i < filteredPhrases.length; i++) {
          const start = filteredPhrases[i].timestamp;
          const end = i < filteredPhrases.length - 1 ? filteredPhrases[i + 1].timestamp : Infinity;
          if (curr >= start && curr < end) {
            matchingIdx = i;
            break;
          }
        }
        
        if (matchingIdx !== -1 && matchingIdx !== cardIndex) {
          isAutoProgressionRef.current = true;
          setCardIndex(matchingIdx);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [autoPlayOnCardChange, filteredPhrases, cardIndex, activeTab, mediaPlayerType]);

  // Trigger timestamp sync on phrase change if we are studying in flashcards or lyrics tab
  useEffect(() => {
    if (activePhrase && (activeTab === 'flashcards' || activeTab === 'lyrics')) {
      if (lastPlayedIdRef.current !== activePhrase.id) {
        lastPlayedIdRef.current = activePhrase.id;
        if (preventAutoPlayOnceRef.current) {
          preventAutoPlayOnceRef.current = false;
          // Seek to the new card but stay paused
          playAtTimestamp(activePhrase.timestamp, false);
        } else if (autoPlayOnCardChange) {
          if (isAutoProgressionRef.current) {
            // Reached naturally by playhead progression, consume flag without seeking
            isAutoProgressionRef.current = false;
          } else {
            playAtTimestamp(activePhrase.timestamp, true);
          }
        }
      }
    }
  }, [activePhrase?.id, activeTab, autoPlayOnCardChange]);

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
  }, [activeTab, selectedDecks]);

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
      setCardIndex((prev) => {
        // Save current index in history
        setCardHistory(h => [...h, prev]);
        
        if (filteredPhrases.length <= 1) return 0;
        
        if (isSpacedRepOn) {
          // Weighted random selection based on SRS (Spaced Repetition System)
          // weights: hard = 10, unrated = 7, medium = 4, easy = 1
          const weights = filteredPhrases.map((p, idx) => {
            if (idx === prev) return 0;
            const rate = knownRates[p.id];
            if (rate === 'hard') return 10;
            if (rate === 'medium') return 4;
            if (rate === 'easy') return 1;
            return 7; // unrated
          });
          
          const totalWeight = weights.reduce((a, b) => a + b, 0);
          if (totalWeight === 0) {
            return (prev + 1) % filteredPhrases.length;
          }
          
          let randomNum = Math.random() * totalWeight;
          for (let i = 0; i < filteredPhrases.length; i++) {
            randomNum -= weights[i];
            if (randomNum <= 0) {
              return i;
            }
          }
          return (prev + 1) % filteredPhrases.length;
        } else if (isRandomCardOn) {
          const indices = Array.from({ length: filteredPhrases.length }, (_, i) => i).filter(i => i !== prev);
          if (indices.length === 0) return 0;
          return indices[Math.floor(Math.random() * indices.length)];
        } else {
          return (prev + 1) % filteredPhrases.length;
        }
      });
    }, 150);
  };

  const handlePrevCard = () => {
    if (filteredPhrases.length === 0) return;
    setIsFlipped(false);
    setTimeout(() => {
      setCardHistory((h) => {
        if (h.length > 0) {
          const newHistory = [...h];
          const lastIdx = newHistory.pop()!;
          setCardIndex(lastIdx);
          return newHistory;
        } else {
          setCardIndex((prev) => (prev - 1 + filteredPhrases.length) % filteredPhrases.length);
          return h;
        }
      });
    }, 150);
  };

  const handleRateCard = (id: number, rating: 'easy' | 'medium' | 'hard') => {
    pauseMedia();
    preventAutoPlayOnceRef.current = true;
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

  const getPhraseEndTime = (phrase: Phrase) => {
    if (phrase.timestampEnd !== undefined) {
      return phrase.timestampEnd;
    }
    // Estimate based on next phrase
    const idx = songData.phrases.findIndex(p => p.id === phrase.id);
    if (idx !== -1 && idx < songData.phrases.length - 1) {
      const nextPhrase = songData.phrases[idx + 1];
      const diff = nextPhrase.timestamp - phrase.timestamp;
      if (diff > 0 && diff < 8) {
        return nextPhrase.timestamp - 0.2;
      }
    }
    return phrase.timestamp + 3;
  };

  const adjustActivePhraseEndTimestamp = (amount: number) => {
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
      
      const currentEnd = typeof target.timestampEnd === 'number' ? target.timestampEnd : getPhraseEndTime(target);
      const targetNewEndSec = Math.max(target.timestamp + 0.2, parseFloat((currentEnd + amount).toFixed(2)));
      
      target.timestampEnd = targetNewEndSec;
      target.timestampEndStr = formatTime(targetNewEndSec);

      const updatedSong = {
        ...prev,
        phrases: updatedPhrases,
      };

      localStorage.setItem('confieso_custom_song', JSON.stringify(updatedSong));
      return updatedSong;
    });

    // Directly seek the media player to play the ending segment for instant feedback
    const targetIdx = songData.phrases.findIndex(p => p.id === currentId);
    if (targetIdx !== -1) {
      const targetPhrase = songData.phrases[targetIdx];
      const currentEnd = typeof targetPhrase.timestampEnd === 'number' ? targetPhrase.timestampEnd : getPhraseEndTime(targetPhrase);
      const targetNewEndSec = Math.max(targetPhrase.timestamp + 0.2, parseFloat((currentEnd + amount).toFixed(2)));
      
      // Seek to 1.5s before the new end timestamp, or start of the phrase, whichever is later
      const playStart = Math.max(targetPhrase.timestamp, targetNewEndSec - 1.5);
      playAtTimestamp(playStart);
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
        <div className={`${isFullscreen ? 'max-w-full px-4 lg:px-8' : 'max-w-7xl'} mx-auto flex flex-col ${showHeaderDetails ? 'gap-4' : 'gap-0'} transition-all duration-300`}>
          
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
                      <Film className="w-6 h-6 text-teal-400" />
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
                          <Film className="w-3 h-3" />
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

            {/* MAIN TABS NAVIGATION WITH FULLSCREEN TOGGLE */}
            <div className="flex items-center gap-2.5 w-full lg:w-auto max-w-full justify-between sm:justify-end">
              <nav className="flex gap-1 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 overflow-x-auto max-w-full">
                {[
                  { id: 'flashcards', label: t('flashcards'), icon: BookOpen },
                  { id: 'quiz', label: t('quiz'), icon: HelpCircle },
                  { id: 'dictation', label: t('dictation'), icon: Keyboard },
                  { id: 'vocab', label: t('vocab'), icon: Sparkle },
                  { id: 'lyrics', label: t('lyrics'), icon: Film },
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

              <button
                id="fullscreen-toggle-btn"
                onClick={toggleFullscreen}
                className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-teal-500/30 p-2 rounded-xl text-slate-400 hover:text-teal-300 transition-all duration-200 cursor-pointer flex items-center justify-center h-[46px] w-[46px] flex-shrink-0"
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4 text-teal-400" /> : <Maximize2 className="w-4 h-4 text-teal-400" />}
              </button>
            </div>
          </div>

          {/* BOTTOM ROW: Active Recall Testing Mode Selector */}
          <AnimatePresence initial={false}>
            {showHeaderDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginTop: -8 }}
                animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
                exit={{ height: 0, opacity: 0, marginTop: -8 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden w-full border-t border-slate-900 pt-3"
              >
                <div className="bg-gradient-to-r from-slate-900 via-teal-950/10 to-slate-900 border border-slate-800/60 p-3 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-teal-500/10 text-teal-400 rounded-lg border border-teal-500/20">
                      <Languages className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 flex flex-wrap items-center gap-2">
                        <span>Active Recall Testing Mode</span>
                        <span className="text-[9px] text-teal-300 font-mono bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">SOLO</span>
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
                      <p className="text-[11px] text-slate-400">Test your recall! Select whether the card front shows the target phrase or its English translation.</p>
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
                      <span>Spanish 🇪🇸 → English 🇺🇸</span>
                    </button>
                    
                    <button
                      id="role-btn-english-learner"
                      onClick={() => {
                        setStudyRole('english-learner');
                        localStorage.setItem('buddy_study_role', 'english-learner');
                      }}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        studyRole === 'english-learner'
                          ? 'bg-teal-500 text-slate-950 font-black shadow-md shadow-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                      }`}
                    >
                      <span>English 🇺🇸 → Spanish 🇪🇸</span>
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
            <div className={`${isFullscreen ? 'max-w-full px-5 lg:px-8' : 'max-w-7xl'} mx-auto p-5 space-y-6 relative`}>
              {/* Close Button */}
              <button
                onClick={() => setShowSongManager(false)}
                className="absolute top-5 right-5 p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-md z-10"
                title="Close Customizer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Panel Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 gap-3">
                <div>
                  <h3 className="text-base font-bold text-teal-300 flex items-center gap-2">
                    <Film className="w-5 h-5" /> {t('song_customizer_title')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Turn this application into an immersive study companion for any video lesson in the world. Just fetch lesson metadata from Gemini and load it below!
                  </p>
                </div>
                <div className="flex gap-2 sm:pr-12">
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
                      Toggle between different lessons you have imported. Any changes or timestamp trims you make are saved automatically to your local browser storage.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      let uniqueTitle = "New Song Title";
                      let count = 1;
                      while (savedSongs.some(s => s.title.toLowerCase().trim() === uniqueTitle.toLowerCase().trim() && s.artist.toLowerCase().trim() === "artist name")) {
                        count++;
                        uniqueTitle = `New Song Title ${count}`;
                      }

                      const blankSong = {
                        title: uniqueTitle,
                        artist: "Artist Name",
                        youtubeId: "YOUTUBE_VIDEO_ID",
                        phrases: [
                          {
                            id: 1,
                            spanish: "Spanish phrase here",
                            english: "English translation here",
                            literal: "Literal breakdown here",
                            category: "Intro",
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
                      };

                      setSongData(blankSong);
                      setSongInputJson(JSON.stringify(blankSong, null, 2));
                      setValidationError(null);
                      setValidationSuccess(true);
                      setTimeout(() => setValidationSuccess(false), 4000);
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
                              <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" /> Current Lesson
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
                              Load Lesson
                            </button>
                          )}

                          {!isDefault && (
                            <button
                              onClick={() => {
                                setSongToDelete(song);
                                setDeleteConfirmText('');
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Column 1: Step 1 & Step 2 (Inputs & Transcript) */}
                <div className="space-y-6">
                  
                  {/* Step 1: Set Lesson & Language Details */}
                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-850 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-xs text-indigo-400">1</div>
                      <h3 className="text-sm font-bold text-slate-200">Set Lesson & Language Details</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Target Language:</label>
                        <input
                          type="text"
                          placeholder="e.g. Spanish"
                          value={promptTargetLangA}
                          onChange={(e) => setPromptTargetLangA(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Native Language:</label>
                        <input
                          type="text"
                          placeholder="e.g. English"
                          value={promptNativeLangA}
                          onChange={(e) => setPromptNativeLangA(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">YouTube Link or Video ID:</label>
                      <input
                        type="text"
                        placeholder="e.g. https://www.youtube.com/watch?v=kRt2sRyup6A"
                        value={promptYoutubeId}
                        onChange={(e) => setPromptYoutubeId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none placeholder:text-slate-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Lesson Title (Optional):</label>
                        <input
                          type="text"
                          placeholder="e.g. La Camisa Negra"
                          value={promptSongName.split(' by ')[0] || ''}
                          onChange={(e) => {
                            const speaker = promptSongName.split(' by ')[1] || 'Speaker';
                            setPromptSongName(e.target.value + ' by ' + speaker);
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none placeholder:text-slate-600"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Speaker / Artist (Optional):</label>
                        <input
                          type="text"
                          placeholder="e.g. Juanes"
                          value={promptSongName.split(' by ')[1] || ''}
                          onChange={(e) => {
                            const title = promptSongName.split(' by ')[0] || 'Custom Lesson';
                            setPromptSongName(title + ' by ' + e.target.value);
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none placeholder:text-slate-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Upload Transcript File */}
                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-850 space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-xs text-indigo-400">2</div>
                        <h3 className="text-sm font-bold text-slate-200">Provide Raw Video Transcript</h3>
                      </div>
                      <span className="text-[10px] font-mono text-teal-400/80 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">Supports Timestamps</span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Upload your transcript file. If your file contains raw timestamps (e.g. 0:12, [0:15]), they will be automatically extracted to keep the interactive seeking features intact.
                    </p>

                    {/* Drag & Drop File Area */}
                    <label 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleTranscriptFileUpload(e.dataTransfer.files[0]);
                        }
                      }}
                      className="group flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-indigo-500 bg-slate-950/40 hover:bg-slate-900/10 p-5 rounded-2xl transition cursor-pointer text-center"
                    >
                      <Upload className="w-6 h-6 text-slate-500 group-hover:text-indigo-400 transition mb-2" />
                      <p className="text-xs font-bold text-slate-300 group-hover:text-slate-200">Drag & Drop Transcript File Here</p>
                      <p className="text-[10px] text-slate-500 mt-1">Accepts .html, .txt, .srt, .bin</p>
                      <span className="text-[9px] text-indigo-400/80 underline decoration-dotted mt-2 group-hover:text-indigo-300">or browse computer files</span>
                      <input
                        type="file"
                        accept=".html,.htm,.txt,.srt,.bin"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleTranscriptFileUpload(e.target.files[0]);
                          }
                        }}
                      />
                    </label>

                    {/* Collapsible Textarea for manual copy paste */}
                    <details className="group border border-slate-850 rounded-xl overflow-hidden bg-slate-900/20">
                      <summary className="flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-300 cursor-pointer select-none transition">
                        <span>Or Paste Transcript Manually</span>
                        <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="p-3 border-t border-slate-850 space-y-2.5">
                        <textarea
                          placeholder="e.g.&#10;0:12 Hola amigos&#10;0:15 Bienvenidos a la lección de hoy..."
                          value={promptTranscript}
                          onChange={(e) => setPromptTranscript(e.target.value)}
                          className="w-full h-32 bg-slate-950 border border-slate-850 rounded-lg p-2.5 font-mono text-[11px] text-slate-300 focus:border-indigo-500 outline-none resize-none"
                        />
                        {promptTranscript.trim() && (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                const cleanedOfJunk = cleanTranscriptTextOfJunk(promptTranscript);
                                const parsedSegments = parseTranscriptText(cleanedOfJunk);
                                let finalFormatted = cleanedOfJunk;
                                let formatChanged = false;
                                if (parsedSegments.length > 0) {
                                  finalFormatted = parsedSegments.map(seg => `${seg.timestampStr} ${seg.text}`).join('\n');
                                  formatChanged = true;
                                }
                                const originalLinesCount = promptTranscript.split('\n').length;
                                const newLinesCount = finalFormatted.split('\n').length;
                                setPromptTranscript(finalFormatted);
                                if (originalLinesCount > newLinesCount) {
                                  const diff = originalLinesCount - newLinesCount;
                                  setSuccessMessage(`Success! Removed ${diff} lines of junk, ads, and timecode noise. Transcript is now pristine!`);
                                  setValidationSuccess(true);
                                  setTimeout(() => setValidationSuccess(false), 5000);
                                  setValidationError(null);
                                } else if (formatChanged) {
                                  setSuccessMessage("Success! Structured and cleaned all subtitle/timecode formatting noise.");
                                  setValidationSuccess(true);
                                  setTimeout(() => setValidationSuccess(false), 4000);
                                  setValidationError(null);
                                } else {
                                  setSuccessMessage("Checked transcript! Already clean and well-formatted.");
                                  setValidationSuccess(true);
                                  setTimeout(() => setValidationSuccess(false), 3000);
                                  setValidationError(null);
                                }
                              }}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/40 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                              title="Strip trailing description sections, social links, merchandise, and Patreon promos"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              <span>Trim Trailing Ads & Links</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </details>

                    {promptTranscript.trim() && (
                      <div className="bg-teal-950/20 border border-teal-900/40 p-2.5 rounded-xl text-[11px] text-teal-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                        <span>Transcript Loaded! Ready to generate prompt file. ({promptTranscript.split('\n').length} lines)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Step 3 & Step 4 (Prompt download & Gemini upload) */}
                <div className="space-y-6">
                  
                  {/* Step 3: Get Gemini Prompt File */}
                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-850 space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-xs text-indigo-400">3</div>
                        <h3 className="text-sm font-bold text-slate-200">Download Gemini Prompt File</h3>
                      </div>
                      <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Download this custom structured prompt file. It is configured to direct Gemini to translate and process your transcript line-by-line, generate vocabulary lists, and return a clean, fully-formed JSON file.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <button
                        onClick={() => {
                          const element = document.createElement("a");
                          const file = new Blob([activePromptText], {type: 'text/plain;charset=utf-8'});
                          element.href = URL.createObjectURL(file);
                          const cleanName = (promptSongName || songData.title || "lesson").toLowerCase().replace(/[^a-z0-9]+/g, '_');
                          element.download = `${cleanName}_gemini_prompt.txt`;
                          document.body.appendChild(element);
                          element.click();
                          document.body.removeChild(element);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/15 cursor-pointer"
                        title="Download prompter file"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Prompt File</span>
                      </button>

                      <button
                        id="copy-prompt-btn"
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(activePromptText).catch(() => {});
                          } catch (e) {}
                          setCopiedPrompt(true);
                          setTimeout(() => setCopiedPrompt(false), 2000);
                        }}
                        className={`font-bold text-xs px-4 py-3 rounded-xl transition flex items-center justify-center gap-2 border cursor-pointer ${
                          copiedPrompt 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800'
                        }`}
                      >
                        {copiedPrompt ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedPrompt ? 'Copied!' : 'Copy to Clipboard'}</span>
                      </button>
                    </div>

                    {/* Preview Generated Prompt */}
                    <details className="group border border-slate-850 rounded-xl overflow-hidden bg-slate-900/20">
                      <summary className="flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-300 cursor-pointer select-none transition">
                        <span>Preview Prompt Content</span>
                        <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="p-3 border-t border-slate-850 bg-black/40 font-mono text-[10px] text-slate-400 max-h-[140px] overflow-y-auto whitespace-pre-wrap select-all">
                        {activePromptText}
                      </div>
                    </details>
                  </div>

                  {/* Step 4: Run Gemini & Upload JSON */}
                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-850 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-xs text-indigo-400">4</div>
                      <h3 className="text-sm font-bold text-slate-200">Run in Gemini & Upload Companion</h3>
                    </div>

                    <div className="bg-slate-900/40 p-3.5 rounded-xl border border-slate-850/60 space-y-2.5 text-xs text-slate-300 leading-relaxed">
                      <p className="font-semibold text-slate-200">To create the companion study cards:</p>
                      <ol className="list-decimal pl-4.5 space-y-1.5 text-slate-400">
                        <li>
                          Open <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 font-bold inline-flex items-center gap-0.5 underline decoration-dotted">Google Gemini ↗</a>
                        </li>
                        <li>Upload your downloaded prompt file (or paste the prompt) into Gemini.</li>
                        <li>Wait for Gemini to output the study dataset, then save it as a <strong className="text-slate-200">.json</strong> file (or copy the JSON response).</li>
                      </ol>
                    </div>

                    {/* Drag & Drop JSON Dropzone */}
                    <label 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleGeminiJsonUpload(e.dataTransfer.files[0]);
                        }
                      }}
                      className="group flex flex-col items-center justify-center border-2 border-dashed border-teal-500/20 hover:border-teal-400/80 bg-teal-950/5 hover:bg-teal-950/15 p-6 rounded-2xl transition-all cursor-pointer text-center"
                    >
                      <div className="w-10 h-10 bg-teal-500/10 rounded-xl flex items-center justify-center border border-teal-500/20 mb-2.5 group-hover:scale-105 transition-transform">
                        <Upload className="w-5 h-5 text-teal-400" />
                      </div>
                      <p className="text-xs font-bold text-slate-200">Drag & Drop Gemini's JSON File Here</p>
                      <p className="text-[10px] text-slate-500 mt-1">or click to browse files</p>
                      <span className="text-[9px] font-mono text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 mt-2">Only .json files</span>
                      <input
                        id="gemini-json-uploader"
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleGeminiJsonUpload(e.target.files[0]);
                          }
                        }}
                      />
                    </label>

                    {/* Advanced Collapsible Manual Paste JSON Textarea */}
                    <details className="group border border-slate-850 rounded-xl overflow-hidden bg-slate-900/20">
                      <summary className="flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-300 cursor-pointer select-none transition">
                        <span>Advanced: Paste JSON Text Directly</span>
                        <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="p-3 border-t border-slate-850 space-y-3">
                        <textarea
                          id="song-json-textarea"
                          value={songInputJson}
                          onChange={(e) => {
                            setSongInputJson(e.target.value);
                            setValidationError(null);
                          }}
                          placeholder={`{\n  "title": "La Camisa Negra",\n  "artist": "Juanes",\n  "youtubeId": "...",\n  "phrases": [...],\n  "vocab": [...]\n}`}
                          className="w-full h-44 bg-slate-950 border border-slate-850 rounded-lg p-2.5 font-mono text-[11px] text-slate-300 focus:border-indigo-500 outline-none resize-none"
                        />
                        
                        <div className="flex flex-wrap justify-between gap-2 pt-1">
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
                            className="bg-slate-900 hover:bg-slate-850 text-slate-350 font-bold text-[10px] px-2.5 py-1.5 rounded-lg border border-slate-800 transition flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3 text-teal-400" /> Export Backup
                          </button>

                          <div className="flex gap-1.5">
                            <button
                              onClick={() => {
                                setSongInputJson('');
                                setValidationError(null);
                              }}
                              className="bg-slate-900 hover:bg-slate-850 text-slate-450 hover:text-slate-300 font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition border border-slate-800 cursor-pointer"
                            >
                              Clear
                            </button>
                            <button
                              id="merge-song-phrases-btn"
                              onClick={() => {
                                try {
                                  if (!songInputJson.trim()) {
                                    setValidationError("Please paste additional song JSON data first.");
                                    return;
                                  }
                                  const parsed = extractAndCleanJSON(songInputJson);
                                  const err = validateSongData(parsed, true);
                                  if (err) {
                                    setValidationError(err);
                                    return;
                                  }
                                  
                                  const currentPhrases = [...songData.phrases];
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
                                        existingNorms.add(norm);
                                      }
                                    }
                                  }
                                  
                                  const maxId = currentPhrases.reduce((max, p) => Math.max(max, p.id), 0);
                                  const newPhrases = filteredIncomingPhrases.map((p: any, i: number) => ({
                                    ...p,
                                    id: maxId + 1 + i
                                  }));
                                  
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
                                  
                                  let msg = "Merge Completed Successfully!";
                                  const parts: string[] = [];
                                  if (newPhrases.length > 0) parts.push(`Appended ${newPhrases.length} phrases`);
                                  if (discardedPhraseCount > 0) parts.push(`filtered ${discardedPhraseCount} duplicates`);
                                  if (filteredIncomingVocab.length > 0) parts.push(`added ${filteredIncomingVocab.length} vocab terms`);
                                  
                                  setSuccessMessage(msg + (parts.length > 0 ? " " + parts.join(", ") + "." : ""));
                                  setValidationError(null);
                                  setValidationSuccess(true);
                                  setTimeout(() => setValidationSuccess(false), 5000);
                                } catch (e: any) {
                                  setValidationError(`Invalid JSON format: ${e.message}`);
                                }
                              }}
                              className="bg-indigo-950/85 hover:bg-indigo-900 border border-indigo-850 text-indigo-300 font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                            >
                              Merge / Append
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
                              className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[10px] px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer shadow"
                            >
                              Apply JSON
                            </button>
                          </div>
                        </div>
                      </div>
                    </details>

                    {validationError && (
                      <div className="bg-rose-950/40 border border-rose-900/40 p-3 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{validationError}</span>
                      </div>
                    )}

                    {validationSuccess && (
                      <div className="bg-emerald-950/40 border border-emerald-900/40 p-3 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{successMessage || `Song Loaded Successfully!`}</span>
                      </div>
                    )}
                  </div>

                  {/* Current Active Metadata summary card */}
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-850/60 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Lesson Metadata:</span>
                    <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Lesson Title</span>
                        <strong className="text-slate-200">{songData.title}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Speaker / Instructor</span>
                        <strong className="text-slate-200">{songData.artist}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Study Phrases</span>
                        <strong className="text-teal-400">{songData.phrases.length} cards</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Vocab Count</span>
                        <strong className="text-indigo-400">{songData.vocab?.length || 0} terms</strong>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* CORE GRID CONTENT LAYOUT */}
      <main className={`flex-1 ${isFullscreen ? 'max-w-full px-4 lg:px-8' : 'max-w-7xl'} w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6`}>
        
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
            ).map(deck => {
              const isSelected = selectedDecks.includes(deck.id);
              return (
                <button
                  key={deck.id}
                  id={`deck-filter-${deck.id.replace(/\s+/g, '_')}`}
                  onClick={() => toggleDeck(deck.id)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 text-teal-300 border border-teal-500/30 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
                  }`}
                  title={deck.id === 'All' ? "Show all phrases" : deck.id === 'Starred' ? "Show starred phrases only" : `Toggle ${deck.label} section`}
                >
                  {deck.label}
                </button>
              );
            })}
          </div>

          {filteredPhrases.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800/80 p-12 rounded-3xl text-center space-y-4">
              <Star className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-lg font-bold text-slate-300">This study deck is empty</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                {selectedDecks.includes('Starred') 
                  ? "Mark key lesson phrases with the Star icon while studying flashcards to collect them in your personalized review deck!" 
                  : "No items match your active filters. Try resetting to access the full catalog."}
              </p>
              <button 
                id="reset-deck-btn"
                onClick={() => setSelectedDecks(['All'])}
                className="bg-teal-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-teal-400 transition shadow-lg shadow-teal-500/10 cursor-pointer"
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
                      <span className="font-semibold text-teal-400">{t('phrase')} {cardIndex + 1} {t('of')} {filteredPhrases.length}</span>
                      <span className="text-slate-700">•</span>
                      <span className="text-slate-300 font-medium">{activePhrase.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 
                        {Object.values(knownRates).filter(r => r === 'easy').length} {t('mastered')}
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
                        className={`absolute inset-0 gradient-border glass-card active-phrase ${isPlayingAudio ? 'is-playing' : ''} p-6 sm:p-10 flex flex-col justify-between shadow-2xl overflow-hidden transition-all duration-300`}
                        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] uppercase tracking-widest font-black text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/30 flex items-center gap-1">
                            <Sparkle className="w-3 h-3 text-teal-300" /> 
                            {studyRole === 'spanish-learner' ? 'Spanish Phrase' : 'English Prompt'}
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <button 
                              id="jump-time-btn"
                              className="flex items-center gap-2 hover:text-teal-300 transition text-slate-300 text-xs bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-teal-500/30 cursor-pointer" 
                              onClick={(e) => {
                                e.stopPropagation();
                                playAtTimestamp(activePhrase.timestamp);
                              }}
                            >
                              <Music className="w-3.5 h-3.5 text-teal-400" />
                              <span>{t('play_from_timestamp')} <strong>{activePhrase.timestampStr}</strong></span>
                            </button>

                            <button
                              id="autoplay-toggle-btn-front"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAutoPlayOnCardChange(p => !p);
                              }}
                              className={`px-2.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 border text-[10px] uppercase tracking-wider cursor-pointer ${
                                autoPlayOnCardChange
                                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-900/50 hover:bg-emerald-900/20'
                                  : 'bg-slate-950/80 text-slate-400 border-slate-850 hover:border-slate-800 hover:text-slate-300'
                              }`}
                              title={autoPlayOnCardChange ? "Autoplay is Enabled when changing cards" : "Autoplay is Disabled when changing cards"}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full ${autoPlayOnCardChange ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                              <span>Auto-play: {autoPlayOnCardChange ? 'On' : 'Off'}</span>
                            </button>
                          </div>
                          <span className="text-[10px] uppercase font-bold text-slate-600">{t('front_card')}</span>
                        </div>
                      </div>

                      {/* BACK CARD (ROLE SWAPPED EXPLANATION & SPEECH) */}
                      <div 
                        className={`absolute inset-0 gradient-border glass-card active-phrase ${isPlayingAudio ? 'is-playing' : ''} p-6 sm:p-10 flex flex-col justify-between shadow-2xl overflow-hidden transition-all duration-300`}
                        style={{ 
                          backfaceVisibility: 'hidden', 
                          WebkitBackfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)'
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/30">
                            {studyRole === 'spanish-learner' ? 'English Equivalent' : 'Spanish Original'}
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
                          {buddyNotes[activePhrase.id]?.partnerA && (
                            <div className="bg-slate-950/50 px-4 py-2 rounded-xl text-slate-300 max-w-md w-full mx-auto border border-teal-500/10 text-left">
                              <span className="block text-[9px] uppercase font-bold text-teal-400 tracking-widest mb-0.5">My Study Notes</span>
                              <span className="text-slate-200 block text-xs leading-relaxed font-sans">{buddyNotes[activePhrase.id].partnerA}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center border-t border-slate-800/60 pt-4 text-xs text-slate-500">
                          <span className="font-semibold text-slate-400">{t('video_section')} {activePhrase.timestampStr}</span>
                          <span className="text-[10px] uppercase font-bold text-slate-600">{t('back_card')}</span>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* SPACED REPETITION CONFIDENCE TRACKER */}
                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <p className="text-xs text-slate-400 text-center font-bold mb-3 uppercase tracking-wider">{t('self_assess')}</p>
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
                        <span>{t('hard')}</span>
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
                        <span>{t('medium')}</span>
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
                        <span>{t('easy')}</span>
                      </button>
                    </div>
                  </div>

                  {/* STUDY MODES / SRS / RANDOM CONFIG */}
                  <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">{t('card_traversal_mode')}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">
                        {isSpacedRepOn ? t('status_spaced_rep') : isRandomCardOn ? t('status_random') : t('status_sequential')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Random Card Toggle */}
                      <button
                        id="random-card-toggle"
                        onClick={() => {
                          setIsRandomCardOn(p => !p);
                          if (!isRandomCardOn) {
                            setIsSpacedRepOn(false);
                          }
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                          isRandomCardOn
                            ? 'bg-indigo-950/40 text-indigo-300 border-indigo-500/40 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-indigo-400 hover:border-slate-800'
                        }`}
                        title="When enabled, cards will appear in a random order"
                      >
                        <Shuffle className={`w-3.5 h-3.5 ${isRandomCardOn ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`} />
                        <span>{t('random_label')} {isRandomCardOn ? t('on') : t('off')}</span>
                      </button>

                      {/* Spaced Repetition Toggle */}
                      <button
                        id="spaced-rep-toggle"
                        onClick={() => {
                          setIsSpacedRepOn(p => !p);
                          if (!isSpacedRepOn) {
                            setIsRandomCardOn(false);
                          }
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                          isSpacedRepOn
                            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-emerald-400 hover:border-slate-800'
                        }`}
                        title="Intelligent spaced repetition system that schedules difficult and unrated phrases more frequently"
                      >
                        <Layers className={`w-3.5 h-3.5 ${isSpacedRepOn ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                        <span>{t('spaced_rep_label')} {isSpacedRepOn ? t('on') : t('off')}</span>
                      </button>
                    </div>
                    {isSpacedRepOn && (
                      <p className="text-[10px] text-slate-400 text-center leading-normal italic">
                        {t('spaced_rep_tip')}
                      </p>
                    )}
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
                      {t('linguistic_breakdown')}
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
                    <span className="text-slate-400 font-bold uppercase tracking-wider">{(songData.vocab || []).length} Core Lesson Vocab Terms</span>
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
                            <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider">Used in lesson:</span>
                            <p className="text-slate-300 italic font-medium leading-relaxed">"{term.example}"</p>
                            <button
                              id={`vocab-pronounce-ex-${idx}`}
                              onClick={() => speakText(term.example)}
                              className="text-[10px] text-teal-400 hover:text-teal-350 flex items-center gap-1.5 mt-2 font-semibold"
                            >
                              <Volume2 className="w-3 h-3" /> Hear lesson sentence
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
                    Click any line's <strong className="text-teal-400">Play button</strong> to sync and jump both the video player and local player directly to that line's precise timestamp.
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
                                  setSelectedDecks(['All']);
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
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="w-full border-t border-slate-800/60 pt-3 mt-3 space-y-3"
                    >
                      {/* Start Time Trim Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 w-full">
                        <div className="text-left">
                          <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider">{t('start_trim')}</span>
                          <div className="text-slate-300 font-semibold font-mono text-xs mt-0.5">
                            {t('start_time')} {activePhrase.timestampStr}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            id="trim-start-minus-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              adjustActivePhraseTimestamp(-0.5);
                            }}
                            className="bg-slate-900 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-900/40 text-rose-350 font-bold px-3 py-1.5 rounded-lg transition text-xs cursor-pointer flex-1 sm:flex-initial text-center"
                            title="Start time -0.5s"
                          >
                            -0.5s
                          </button>
                          <button
                            id="trim-start-plus-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              adjustActivePhraseTimestamp(0.5);
                            }}
                            className="bg-slate-900 hover:bg-emerald-950/30 border border-slate-800 hover:border-emerald-900/40 text-emerald-350 font-bold px-3 py-1.5 rounded-lg transition text-xs cursor-pointer flex-1 sm:flex-initial text-center"
                            title="Start time +0.5s"
                          >
                            +0.5s
                          </button>
                        </div>
                      </div>

                      {/* End Time Trim Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 w-full">
                        <div className="text-left">
                          <span className="text-[10px] text-teal-400 uppercase font-bold tracking-wider">{t('end_trim')}</span>
                          <div className="text-slate-300 font-semibold font-mono text-xs mt-0.5">
                            {t('end_time')} {activePhrase.timestampEndStr || formatTimeSeconds(getPhraseEndTime(activePhrase))} {activePhrase.timestampEnd === undefined && <span className="text-[10px] text-slate-500 font-normal italic">{t('estimated')}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            id="trim-end-minus-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              adjustActivePhraseEndTimestamp(-0.5);
                            }}
                            className="bg-slate-900 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-900/40 text-rose-350 font-bold px-3 py-1.5 rounded-lg transition text-xs cursor-pointer flex-1 sm:flex-initial text-center"
                            title="End time -0.5s"
                          >
                            -0.5s
                          </button>
                          <button
                            id="trim-end-plus-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              adjustActivePhraseEndTimestamp(0.5);
                            }}
                            className="bg-slate-900 hover:bg-emerald-950/30 border border-slate-800 hover:border-emerald-900/40 text-emerald-350 font-bold px-3 py-1.5 rounded-lg transition text-xs cursor-pointer flex-1 sm:flex-initial text-center"
                            title="End time +0.5s"
                          >
                            +0.5s
                          </button>
                        </div>
                      </div>

                      {/* Playback mode setting in drawer */}
                      <div className="flex items-center justify-between gap-2 bg-slate-950/20 p-2 rounded-xl border border-slate-850/30 w-full">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('stop_video_after')}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAutoStopAfterPhrase(p => !p);
                          }}
                          className={`px-3 py-1 rounded-lg font-bold transition text-[10px] uppercase tracking-wider border cursor-pointer ${
                            autoStopAfterPhrase
                              ? 'bg-rose-950/35 text-rose-300 border-rose-900/50'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {autoStopAfterPhrase ? t('enabled') : t('disabled')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* PERSONAL STUDY & RECALL NOTES */}
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
                  <BookOpen className="w-4 h-4 text-teal-400" />
                  <span>{t('card_study_notes')}</span>
                </div>
                
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-teal-400">
                    {t('my_study_notes')}
                  </label>
                  <textarea
                    id="phrase-study-notes"
                    rows={3}
                    value={buddyNotes[activePhrase.id]?.partnerA || ''}
                    onChange={(e) => saveBuddyNote(activePhrase.id, 'partnerA', e.target.value)}
                    placeholder={t('add_notes_placeholder')}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none leading-relaxed resize-none"
                  />
                </div>
              </div>
            </div>
          )}
          
          <div className="glass-card rounded-3xl p-6 shadow-2xl space-y-4">
            
            {/* Player controls head */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-200">
                <Film className="w-4.5 h-4.5 text-teal-400" />
                <h3 className="font-bold text-sm">{t('media_hub')}</h3>
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
                  {t('youtube_video')}
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
                  {t('local_file')}
                </button>
              </div>
            </div>

            {/* Playback mode settings */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-2xl border border-slate-850 text-xs">
              <span className="text-slate-400 font-medium">{t('video_playback_mode')}</span>
              <button
                onClick={() => setAutoStopAfterPhrase(prev => !prev)}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 border text-[11px] cursor-pointer ${
                  autoStopAfterPhrase
                    ? 'bg-rose-950/30 text-rose-300 border-rose-900/50'
                    : 'bg-emerald-950/30 text-emerald-300 border-emerald-900/50'
                }`}
              >
                {autoStopAfterPhrase ? (
                  <>
                    <X className="w-3.5 h-3.5 text-rose-400" /> {t('stop_after_phrase')}
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-400" /> {t('continuous_play')}
                  </>
                )}
              </button>
            </div>

            {/* IFRAME YOUTUBE COMPONENT */}
            {mediaPlayerType === 'youtube' && (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-slate-950 shadow-inner">
                  <div
                    id="yt-player-container"
                    className="absolute inset-0 w-full h-full"
                  />
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300 flex items-center gap-1">
                      <Film className="w-3.5 h-3.5 text-teal-400" /> {t('lesson_title_prefix')} "{songData.title}"
                    </span>
                    <a 
                      href={`https://www.youtube.com/watch?v=${songData.youtubeId}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-teal-400 hover:text-teal-300 flex items-center gap-1 text-[10px] uppercase font-bold"
                    >
                      {t('original_video')} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {t('practicing_timestamps_info')}
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
                      <span className="text-slate-400 truncate max-w-[200px] font-mono font-medium">{t('file_label')} {localFileName}</span>
                      <button
                        id="change-local-file"
                        onClick={() => {
                          setLocalFileUrl('');
                          setLocalFileName('');
                        }}
                        className="text-[10px] font-bold text-rose-400 hover:text-rose-300 uppercase tracking-wider"
                      >
                        {t('remove_file')}
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
                      <p className="text-xs font-bold text-slate-350">{t('drag_drop_prefix')} {songData.artist}{t('drag_drop_suffix')}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{t('or_browse')}</p>
                    </div>
                    <label className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition">
                      {t('browse_files')}
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
                    <span>{t('how_offline_works')}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {t('how_offline_desc_prefix')} {songData.artist}{t('how_offline_desc_suffix')}
                  </p>
                </div>

              </div>
            )}

            {/* SECTIONS / TIMESTAMPS JUMP CONTROLS */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">{t('quick_jump')}</span>
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
            <div className={`glass-card active-phrase ${isPlayingAudio ? 'is-playing' : ''} p-6 rounded-3xl space-y-3 shadow-xl transition-all duration-300`}>
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400">
                <Info className="w-4 h-4" />
                <span>{t('study_tip_title')}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                {t('study_tip_observe')} <strong className="text-teal-300">"{activePhrase.spanish}"</strong> ({t('phrase')} #{activePhrase.id}). 
                {t('study_tip_translates')} <strong className="text-indigo-300">"{activePhrase.english}"</strong>.
                {activePhrase.breakdown && activePhrase.breakdown.length > 0 && (
                  <span className="block mt-1">
                    {t('study_tip_breakdown')} {activePhrase.breakdown.slice(0, 3).map((b, i) => (
                      <span key={i}>
                        <strong className="text-pink-400">"{studyRole === 'spanish-learner' ? b.word : b.meaning}"</strong> ({studyRole === 'spanish-learner' ? b.meaning : b.word}){i < Math.min(2, activePhrase.breakdown.length - 1) ? ', ' : ''}
                      </span>
                    ))}.
                  </span>
                )} {t('study_tip_practice')}
              </p>
            </div>
          )}

        </section>

      </main>

      {/* SECONDARY VERIFICATION MODAL FOR LESSON DELETION */}
      <AnimatePresence>
        {songToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden text-left"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
              
              <div className="flex items-center gap-3 text-rose-400 mb-4">
                <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black tracking-tight text-slate-100">{t('delete_lesson_title')}</h3>
              </div>

              <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed mb-6">
                <p>
                  {t('delete_lesson_desc')} <strong className="text-slate-100 font-extrabold">"{songToDelete.title}"</strong> from your library.
                </p>
                <p className="bg-rose-950/20 border border-rose-500/10 p-3 rounded-xl text-rose-300">
                  {t('delete_lesson_warning')}
                </p>
                <div className="space-y-1.5 pt-2">
                  <label htmlFor="confirm-delete-input" className="block text-[10px] uppercase font-black text-slate-400 tracking-wider">
                    {t('delete_lesson_confirm_prompt')} <span className="text-rose-400 font-mono font-black">{t('delete_word_target')}</span>
                  </label>
                  <input
                    id="confirm-delete-input"
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={t('delete_word_placeholder')}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none font-mono"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  onClick={() => {
                    setSongToDelete(null);
                    setDeleteConfirmText('');
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-slate-150 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={async () => {
                    if (deleteConfirmText.toUpperCase() === t('delete_word_target').toUpperCase() || deleteConfirmText.toUpperCase() === 'DELETE') {
                      const target = songToDelete;
                      setSongToDelete(null);
                      setDeleteConfirmText('');
                      
                      await deleteSongFromCloud(target);
                      
                      setSavedSongs((prev) => {
                        const updated = prev.filter(
                          (s) => !(s.title === target.title && s.artist === target.artist)
                        );
                        localStorage.setItem('confieso_song_library', JSON.stringify(updated));
                        
                        const isActive = target.title.toLowerCase().trim() === songData.title.toLowerCase().trim() &&
                                         target.artist.toLowerCase().trim() === songData.artist.toLowerCase().trim();
                        if (isActive) {
                          setSongData(SONG_DATA);
                          localStorage.setItem('confieso_custom_song', JSON.stringify(SONG_DATA));
                        }
                        return updated;
                      });
                    }
                  }}
                  disabled={deleteConfirmText.toUpperCase() !== t('delete_word_target').toUpperCase() && deleteConfirmText.toUpperCase() !== 'DELETE'}
                  className={`px-4 py-2 font-bold rounded-xl text-xs transition flex items-center gap-1.5 ${
                    (deleteConfirmText.toUpperCase() === t('delete_word_target').toUpperCase() || deleteConfirmText.toUpperCase() === 'DELETE')
                      ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer'
                      : 'bg-slate-800/40 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t('delete_action')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500 bg-slate-950">
        <div className={`${isFullscreen ? 'max-w-full px-4 lg:px-8' : 'max-w-7xl'} mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3`}>
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
