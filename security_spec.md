# Security Specification & Test-Driven Design (TDD)
This specification outlines the data invariants, malicious "Dirty Dozen" attack payloads, and security rules testing logic for the **Remix: Confieso Study Companion** database.

## 1. Data Invariants
- **Songs collection (`/songs/{songId}`)**:
  1. A song must contain a valid, non-empty, and limited size `title` (<= 150 chars) and `artist` (<= 150 chars).
  2. The `youtubeId` must be a valid 11-character string containing only alphanumeric characters, underscores, or hyphens.
  3. The `createdBy` field must be either "Andrew" or "Friend".
  4. The `phrases` array must contain at least 1 phrase, and each phrase must have an `id` (integer), `spanish` (string <= 500 chars), `english` (string <= 500 chars), `literal` (string <= 500 chars), `category` (string <= 50 chars), `timestamp` (positive number), and `timestampStr` (string <= 12 chars).
  5. The `vocab` array must contain valid words and definitions of appropriate lengths (<= 100 chars for words, <= 500 chars for definitions).
  6. The `updatedAt` field must be a valid timestamp synchronized with the server's request time.

- **Study Notes collection (`/study_notes/{noteId}`)**:
  1. A study note must attach to a specific valid `phraseId` (positive integer).
  2. The `partnerA` and `partnerB` note text fields must have restricted character sizes (<= 1000 characters each) to prevent Denial of Wallet storage exhaustion.
  3. The `updatedAt` field must match the server request time.

---

## 2. The "Dirty Dozen" Attack Payloads
Below are 12 specific payloads designed to breach Identity, Integrity, and State boundaries. The firestore security rules must reject each of these payloads.

### Payload 1: Missing Required Keys (Song Creation)
*Goal: Bypass schema enforcement on song addition.*
```json
{
  "title": "La Camisa Negra"
}
```

### Payload 2: ID Poisoning (Resource Abuse)
*Goal: Inject massive garbage characters into the Document ID to exploit storage or route lookups.*
- Path: `/songs/malicious_long_id_$$$_garbage_chars_pasted_12345_etc_garbage_chars_pasted_12345_etc_garbage_chars_pasted_12345_etc_garbage_chars_pasted_12345_etc_garbage_chars_pasted_12345_etc`
```json
{
  "title": "Valid Title",
  "artist": "Valid Artist",
  "youtubeId": "kRt2sRyup6A",
  "phrases": [],
  "vocab": [],
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

### Payload 3: Invalid Field Types (Non-String Title)
*Goal: Inject malicious script blocks or boolean bypasses into string fields.*
```json
{
  "title": true,
  "artist": "Juanes",
  "youtubeId": "kRt2sRyup6A",
  "phrases": [],
  "vocab": [],
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

### Payload 4: Invalid YouTube ID (Malicious Redirects/Scripts)
*Goal: Inject longer URLs or scripting vectors into the youtubeId field.*
```json
{
  "title": "Valid Title",
  "artist": "Valid Artist",
  "youtubeId": "https://malicious-site.com/exploit.js",
  "phrases": [],
  "vocab": [],
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

### Payload 5: Spoofed Creator Role
*Goal: Claim to be an arbitrary system administrator or external entity.*
```json
{
  "title": "Valid Title",
  "artist": "Valid Artist",
  "youtubeId": "kRt2sRyup6A",
  "phrases": [],
  "vocab": [],
  "createdBy": "SuperAdminSecureHack",
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

### Payload 6: Denial of Wallet - Oversized Text
*Goal: Inject a 1MB string into the notes field to exhaust database storage and egress quotas.*
- Collection: `/study_notes/note_1`
```json
{
  "phraseId": 1,
  "partnerA": "[100,000 characters of garbage data...]",
  "partnerB": "",
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

### Payload 7: Timestamp Manipulation (Impersonating server time)
*Goal: Spoof the updatedAt timestamp to a historical or future value.*
```json
{
  "title": "Valid Title",
  "artist": "Valid Artist",
  "youtubeId": "kRt2sRyup6A",
  "phrases": [],
  "vocab": [],
  "updatedAt": "2020-01-01T00:00:00Z"
}
```

### Payload 8: Corrupted Phrases Structure (Array element is string)
*Goal: Exploit client-side array mapping by saving an invalid type inside phrases.*
```json
{
  "title": "Valid Title",
  "artist": "Valid Artist",
  "youtubeId": "kRt2sRyup6A",
  "phrases": ["This is not an object, it is a string!"],
  "vocab": [],
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

### Payload 9: Empty/Malicious Study Note Phrase ID
*Goal: Attach study notes to negative or invalid phrase IDs.*
- Collection: `/study_notes/note_negative`
```json
{
  "phraseId": -100,
  "partnerA": "Hello",
  "partnerB": "Hi",
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

### Payload 10: Unauthorized Blanket Listing Query
*Goal: Execute a blanket read of all records without constraints.*
- Attempt to list `/study_notes` or `/songs` anonymously when restricted access boundaries apply.

### Payload 11: Modifying Immutable Creator
*Goal: Take over ownership or modify authorship on updates.*
```json
{
  "title": "Valid Title",
  "artist": "Valid Artist",
  "youtubeId": "kRt2sRyup6A",
  "phrases": [],
  "vocab": [],
  "createdBy": "Friend", 
  "updatedAt": "2026-06-27T12:00:00Z"
}
```
*(When original was "Andrew")*

### Payload 12: Extra "Ghost Fields" (Shadow Update Attack)
*Goal: Exploit lack of key length checks to save hidden configurations.*
```json
{
  "title": "Valid Title",
  "artist": "Valid Artist",
  "youtubeId": "kRt2sRyup6A",
  "phrases": [],
  "vocab": [],
  "updatedAt": "2026-06-27T12:00:00Z",
  "isApprovedByAdmin": true
}
```

---

## 3. The Security Test Suite
The following standard Firestore rules test block acts as our automated TDD test blueprint verifying that all malicious payloads return `PERMISSION_DENIED`.

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

describe("Firestore Security Rules Tests", () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "gen-lang-client-0801081298",
      firestore: {
        rules: require("fs").readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it("should block Payload 1: Missing required keys on creation", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const songDoc = db.collection("songs").doc("test_song");
    await assertFails(songDoc.set({ title: "La Camisa Negra" }));
  });

  it("should block Payload 2: Malicious ID Poisoning", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const maliciousId = "malicious_long_id_".repeat(10);
    const songDoc = db.collection("songs").doc(maliciousId);
    await assertFails(songDoc.set({
      title: "Valid Title",
      artist: "Valid Artist",
      youtubeId: "kRt2sRyup6A",
      phrases: [],
      vocab: [],
      updatedAt: new Date().toISOString()
    }));
  });

  it("should block Payload 3: Invalid type injection on title", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const songDoc = db.collection("songs").doc("test_song");
    await assertFails(songDoc.set({
      title: true,
      artist: "Juanes",
      youtubeId: "kRt2sRyup6A",
      phrases: [],
      vocab: [],
      updatedAt: new Date().toISOString()
    }));
  });

  it("should block Payload 6: Denial of Wallet oversized notes text", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const noteDoc = db.collection("study_notes").doc("note_1");
    await assertFails(noteDoc.set({
      phraseId: 1,
      partnerA: "A".repeat(10001),
      partnerB: "",
      updatedAt: new Date().toISOString()
    }));
  });
});
```
