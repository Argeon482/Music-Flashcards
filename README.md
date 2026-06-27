# 🎵 LiricLang - Immersive Song Study & Language Companion

LiricLang is a polished, interactive, full-stack single-page web application that transforms your favorite songs into a personalized, high-performance language learning experience. Built with **React 18**, **TypeScript**, **Tailwind CSS**, and **Framer Motion (motion/react)**, LiricLang makes language study addictive, musical, and incredibly effective.

---

## 🚀 Key Features

### 🎧 Dynamic Audio & Lyric Synchronization
- **Instant Timing Sync**: Interactive audio controls linked directly to lyrics. Jump to any line's exact timestamp in the song with a single click.
- **Accurate Trim Adjusters**: Fine-tune card timestamps with built-in `-0.5s` and `+0.5s` sync buttons on the fly to match the exact vocal timings.

### 🎴 Dual-Sided Flashcard Study Deck
- **Interactive Flipping Engine**: Clean, elegant visual flip transition showing the target lyrics on the front, and the native/literal translation breakdown on the back.
- **Word-by-Word breakdowns**: Expand any phrase to see exact linguistic definitions of individual words in context.
- **Favorites & Starred Deck**: Save challenging phrases to focus on with custom filtered review sessions.

### 🧠 Cognitive Study Arenas
- **Quiz Challenge Mode**: Multiple-choice listening/translation practice that measures performance scores and builds real-time retention. Includes detailed linguistic explanations.
- **Spelling Dictation Arena**: A dedicated audio dictation test. Play the line's audio, type out the correct spelling, get letter hints, and receive instant character-by-character correction feedback.

### 🌐 Multi-Language UI Setting
- Choose the native language of the application's UI on-demand via a flag dropdown in the header:
  - 🇺🇸 English
  - 🇪🇸 Spanish (Español)
  - 🇫🇷 French (Français)
  - 🇩🇪 German (Deutsch)
  - 🇮🇹 Italian (Italiano)
  - 🇵🇹 Portuguese (Português)
- Learn any language while navigating the app in your primary tongue.

### 🛠️ Interactive Song Customizer & Loader
- **Bring Your Own Song**: Create a custom blank song template or load the demo catalog.
- **JSON Metadata Import**: Paste structured metadata including phrases, individual word breakdowns, and YouTube video IDs to convert *any* YouTube track into an interactive learning suite instantly!
- **Auto-Persistence**: All customized songs, updated sync timings, starred decks, and user preferences are automatically persisted across sessions using browser `localStorage`.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS (Utility-first layout, custom gradients, eye-safe dark theme, fully responsive)
- **Animation**: Framer Motion (`motion/react`) for fluid transitions, smooth card-flip simulation, and feedback alerts
- **Icons**: Lucide React
- **Audio Engine**: Web Audio / Speech Synthesis API for pronounciation practice

---

## 📖 How It Works & How To Use It

### 1. Navigating the Interface
The application features a single-screen layout with an elegant tab bar at the top:
- **Flashcards**: The default study mode. View phrases, flip to reveal meanings, adjust audio trims, and mark terms as mastered.
- **Quiz Challenge**: Test your memory of phrase meanings with multi-choice options and get instant corrective analytics.
- **Spelling Arena**: Train your ear and spelling correctness. Write what you hear, use starting-letter hints, and learn silent/accented letters.
- **Song Vocabulary**: Browse compiled high-frequency vocabulary from the song.
- **Full Lyrics**: Read through the entire synced lyrics side-by-side.

### 2. Customizing Song Metadata (JSON Format)
Click on the **"Change / Import Song"** button in the header to open the customizer. You can edit the song data live in JSON format:
```json
{
  "title": "Your Song Title",
  "artist": "Artist Name",
  "youtubeId": "YouTube_Video_ID",
  "phrases": [
    {
      "id": 1,
      "spanish": "Foreign lyrics here",
      "english": "English equivalent",
      "literal": "Word-for-word translation",
      "category": "Song section (e.g. Verse 1)",
      "timestamp": 12.5,
      "timestampStr": "0:12",
      "breakdown": [
        { "word": "ForeignWord", "meaning": "EnglishMeaning" }
      ]
    }
  ],
  "vocab": [
    {
      "word": "ForeignWord",
      "definition": "Definition",
      "example": "Context sentence"
    }
  ]
}
```
*Tip: You can use LLMs like Google Gemini to generate these JSON payloads for any song in seconds, then paste them directly into the loader!*

---

## 💻 Local Development Setup

To run this project locally:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```

3. **Build Production Assets**:
   ```bash
   npm run build
   ```

---

*LiricLang - Turn music into fluency.*
