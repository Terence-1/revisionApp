// Import logic for JSON flashcard files and Anki .apkg packages
// Supports: all Anki note types (basic, reversed, cloze, multi-field)
//           and smart auto-detection of any JSON flashcard format

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { createDefaultReview } from "./sm2.js";
import { saveDeck } from "./storage.js";

interface ReviewData {
  interval: number;
  easeFactor: number;
  repetitions: number;
  dueDate: string;
  lastReview: string | null;
}

interface Note {
  id: string;
  front: string;
  back: string;
  tags: string[];
  review: ReviewData;
}

interface Deck {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  notes: Note[];
}

// ── Import result types (mirrored from renderer types) ──

interface ImportSkipReason {
  reason: string;
  count: number;
}

interface ImportStats {
  totalProcessed: number;
  imported: number;
  skipped: number;
  skipReasons: ImportSkipReason[];
}

interface ImportResult {
  decks: Deck[];
  stats: ImportStats;
  error?: string;
}

/**
 * Mutable skip tracker used during an import session.
 */
class SkipTracker {
  totalProcessed = 0;
  imported = 0;
  private reasons = new Map<string, number>();

  skip(reason: string) {
    this.totalProcessed++;
    this.reasons.set(reason, (this.reasons.get(reason) || 0) + 1);
  }

  accept() {
    this.totalProcessed++;
    this.imported++;
  }

  toStats(): ImportStats {
    const skipReasons: ImportSkipReason[] = [];
    for (const [reason, count] of this.reasons) {
      skipReasons.push({ reason, count });
    }
    // Sort by count descending
    skipReasons.sort((a, b) => b.count - a.count);
    return {
      totalProcessed: this.totalProcessed,
      imported: this.imported,
      skipped: this.totalProcessed - this.imported,
      skipReasons,
    };
  }
}

function emptyResult(error?: string): ImportResult {
  return {
    decks: [],
    stats: { totalProcessed: 0, imported: 0, skipped: 0, skipReasons: [] },
    error,
  };
}

// ════════════════════════════════════════════════════════════
// Shared helpers
// ════════════════════════════════════════════════════════════

// Patterns that indicate media content was present before stripping
const SOUND_RE = /\[sound:[^\]]+\]/;
const IMG_RE = /<img[^>]*>/i;
const AUDIO_VIDEO_RE = /<(?:audio|video)[^>]*>[\s\S]*?<\/(?:audio|video)>/i;

/**
 * Check if a raw HTML field contained media references that would be lost
 * after stripping. Returns true if the field had media that was removed.
 */
function hadMediaContent(rawField: string): boolean {
  return SOUND_RE.test(rawField) || IMG_RE.test(rawField) || AUDIO_VIDEO_RE.test(rawField);
}

/**
 * Create a Note if both front and back are non-empty after trimming.
 * Tracks the result in the SkipTracker.
 * If rawFront/rawBack are provided, uses them to detect media-stripped fields.
 */
function makeNote(
  front: string,
  back: string,
  tags: string[] = [],
  tracker?: SkipTracker,
  rawFront?: string,
  rawBack?: string,
): Note | null {
  const f = front.trim();
  const b = back.trim();

  if (!f && !b) {
    tracker?.skip("Both front and back are empty");
    return null;
  }

  if (!f) {
    // Check if front was media-only
    if (rawFront && hadMediaContent(rawFront)) {
      tracker?.skip("Front is empty (contained only images/audio that were removed)");
    } else {
      tracker?.skip("Front is empty");
    }
    return null;
  }

  if (!b) {
    // Check if back was media-only
    if (rawBack && hadMediaContent(rawBack)) {
      tracker?.skip("Back is empty (contained only images/audio that were removed)");
    } else {
      tracker?.skip("Back is empty");
    }
    return null;
  }

  tracker?.accept();
  return {
    id: uuidv4(),
    front: f,
    back: b,
    tags,
    review: createDefaultReview() as ReviewData,
  };
}

function makeDeck(name: string, description: string, notes: Note[]): Deck | null {
  if (notes.length === 0) return null;
  const deck: Deck = {
    id: uuidv4(),
    name,
    description,
    createdAt: new Date().toISOString(),
    notes,
  };
  saveDeck(deck);
  return deck;
}

/**
 * Strip HTML tags from Anki card fields, converting <br> to newlines
 * and decoding common HTML entities. Also strips [sound:...] references.
 */
function stripHtml(html: string): string {
  return html
    .replace(SOUND_RE, "") // Remove [sound:filename] references
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)))
    .trim();
}

// ════════════════════════════════════════════════════════════
// Cloze deletion parser
// ════════════════════════════════════════════════════════════

// Matches {{c1::answer}} or {{c1::answer::hint}}
const CLOZE_RE = /\{\{c(\d+)::([^}]*?)(?:::([^}]*?))?\}\}/g;

interface ClozeMatch {
  num: number;
  answer: string;
  hint: string | undefined;
  fullMatch: string;
}

function parseClozeMatches(text: string): ClozeMatch[] {
  const matches: ClozeMatch[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(CLOZE_RE.source, CLOZE_RE.flags);
  while ((m = re.exec(text)) !== null) {
    matches.push({
      num: parseInt(m[1]!, 10),
      answer: m[2]!,
      hint: m[3],
      fullMatch: m[0],
    });
  }
  return matches;
}

/**
 * Given raw cloze text, generate one card per unique cloze number.
 * For cloze N: blank out all {{cN::...}} markers, leave other cloze numbers revealed.
 * Returns array of {front, back} pairs.
 */
function expandCloze(rawText: string): { front: string; back: string }[] {
  const matches = parseClozeMatches(rawText);
  if (matches.length === 0) return [];

  // Get unique cloze numbers
  const clozeNums = [...new Set(matches.map((m) => m.num))].sort((a, b) => a - b);

  return clozeNums.map((targetNum) => {
    // Build the front: blank out targetNum, reveal others
    let front = rawText;
    // We need to replace all cloze markers. Process from end to start to keep indices valid.
    const allMatches: { start: number; end: number; num: number; answer: string; hint?: string }[] = [];
    const re = new RegExp(CLOZE_RE.source, CLOZE_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      allMatches.push({
        start: m.index,
        end: m.index + m[0].length,
        num: parseInt(m[1]!, 10),
        answer: m[2]!,
        hint: m[3],
      });
    }

    // Process replacements from end to start
    const sorted = [...allMatches].sort((a, b) => b.start - a.start);
    for (const match of sorted) {
      const replacement =
        match.num === targetNum
          ? match.hint
            ? `[${match.hint}]`
            : "[...]"
          : match.answer;
      front = front.slice(0, match.start) + replacement + front.slice(match.end);
    }

    // Build the back: all cloze markers revealed, with the target answer highlighted
    let back = rawText;
    const sortedForBack = [...allMatches].sort((a, b) => b.start - a.start);
    for (const match of sortedForBack) {
      back = back.slice(0, match.start) + match.answer + back.slice(match.end);
    }

    return { front: stripHtml(front).trim(), back: stripHtml(back).trim() };
  });
}

// ════════════════════════════════════════════════════════════
// Anki .apkg Import
// ════════════════════════════════════════════════════════════

interface AnkiModel {
  name: string;
  type: number; // 0 = standard, 1 = cloze
  flds: { name: string; ord: number }[];
  tmpls: { name: string; qfmt: string; afmt: string; ord: number }[];
}

interface AnkiNoteRow {
  id: number;
  mid: number;
  flds: string;
  tags: string;
}

interface AnkiCardRow {
  nid: number;
  did: number;
  ord: number;
}

interface AnkiDeckInfo {
  name: string;
}

/**
 * Import an Anki .apkg file with full note type support.
 * Handles: Basic, Basic (and reversed), Cloze, and multi-field note types.
 * Handles: Sub-decks via cards table deck mapping.
 * Returns an ImportResult with all created decks and import statistics.
 */
export function importFromApkg(filePath: string): ImportResult {
  let tempDir: string | null = null;
  const tracker = new SkipTracker();

  try {
    const os = require("os");
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anki-import-"));

    // Extract the zip
    const zip = new AdmZip(filePath);
    zip.extractAllTo(tempDir, true);

    // Find the SQLite database
    const dbNames = ["collection.anki21", "collection.anki2"];
    let dbPath: string | null = null;
    for (const name of dbNames) {
      const candidate = path.join(tempDir, name);
      if (fs.existsSync(candidate)) {
        dbPath = candidate;
        break;
      }
    }

    // Check for .anki21b protobuf format (not supported)
    if (!dbPath) {
      const protoPath = path.join(tempDir, "collection.anki21b");
      if (fs.existsSync(protoPath)) {
        return emptyResult(
          "This .apkg uses the newer protobuf format (collection.anki21b) which is not yet supported. " +
            'Please export from Anki using "Anki Deck Package (.apkg)" format with compatibility mode.'
        );
      }
      return emptyResult("No Anki database found in .apkg file.");
    }

    const db = new Database(dbPath, { readonly: true });

    // ── Read models (note types) from col table ──
    const models: Record<string, AnkiModel> = {};
    try {
      const colRow = db.prepare("SELECT models FROM col").get() as
        | { models: string }
        | undefined;
      if (colRow) {
        const rawModels = JSON.parse(colRow.models) as Record<string, any>;
        for (const [mid, model] of Object.entries(rawModels)) {
          models[mid] = {
            name: model.name || "Unknown",
            type: model.type ?? 0,
            flds: (model.flds || []).map((f: any) => ({
              name: f.name || "",
              ord: f.ord ?? 0,
            })),
            tmpls: (model.tmpls || []).map((t: any) => ({
              name: t.name || "",
              qfmt: t.qfmt || "",
              afmt: t.afmt || "",
              ord: t.ord ?? 0,
            })),
          };
        }
      }
    } catch (e) {
      console.warn("Could not read Anki models, falling back to basic import:", e);
    }

    // ── Read deck names from col table ──
    const ankiDecks: Record<string, AnkiDeckInfo> = {};
    try {
      const colRow = db.prepare("SELECT decks FROM col").get() as
        | { decks: string }
        | undefined;
      if (colRow) {
        const rawDecks = JSON.parse(colRow.decks) as Record<string, any>;
        for (const [did, deck] of Object.entries(rawDecks)) {
          ankiDecks[did] = { name: deck.name || "Default" };
        }
      }
    } catch {
      // Will fall back to filename-based naming
    }

    // ── Read all notes ──
    const noteRows = db
      .prepare("SELECT id, mid, flds, tags FROM notes")
      .all() as AnkiNoteRow[];

    // ── Read cards table to map notes → decks ──
    let cardRows: AnkiCardRow[] = [];
    try {
      cardRows = db
        .prepare("SELECT nid, did, ord FROM cards")
        .all() as AnkiCardRow[];
    } catch {
      // If cards table doesn't exist, we'll put everything in one deck
    }

    db.close();

    // Build a map: noteId → Set of deckIds
    const noteToDeckIds = new Map<number, Set<number>>();
    for (const card of cardRows) {
      if (!noteToDeckIds.has(card.nid)) {
        noteToDeckIds.set(card.nid, new Set());
      }
      noteToDeckIds.get(card.nid)!.add(card.did);
    }

    // ── Process notes by their model type ──
    // Group generated cards by deck ID
    const deckNotes = new Map<number, Note[]>();

    // Helper to determine the primary deck for a note
    function getDeckIdForNote(noteId: number): number {
      const dids = noteToDeckIds.get(noteId);
      if (dids && dids.size > 0) {
        // Return the first (most common case: note belongs to one deck)
        return dids.values().next().value!;
      }
      // Default deck ID in Anki is 1
      return 1;
    }

    function addToDeck(deckId: number, note: Note) {
      if (!deckNotes.has(deckId)) {
        deckNotes.set(deckId, []);
      }
      deckNotes.get(deckId)!.push(note);
    }

    for (const row of noteRows) {
      const fields = row.flds.split("\x1f");
      const tags = row.tags
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0);
      const deckId = getDeckIdForNote(row.id);

      const model = models[String(row.mid)];

      if (model && model.type === 1) {
        // ── Cloze note type ──
        // The first field typically contains the cloze text
        const rawClozeText = fields[0] || "";
        const clozeCards = expandCloze(rawClozeText);

        if (clozeCards.length > 0) {
          for (const card of clozeCards) {
            const note = makeNote(card.front, card.back, [...tags, "_cloze"], tracker, rawClozeText, rawClozeText);
            if (note) addToDeck(deckId, note);
          }
        } else {
          // Cloze model but no cloze markers found — treat as basic
          const rawFront = fields[0] || "";
          const rawBack = fields[1] || "";
          const front = stripHtml(rawFront).trim();
          const back = stripHtml(rawBack).trim();
          const note = makeNote(front, back, tags, tracker, rawFront, rawBack);
          if (note) addToDeck(deckId, note);
        }
      } else if (model && model.tmpls.length >= 2) {
        // ── Basic (and reversed) or multi-template note type ──
        const rawFront = fields[0] || "";
        const rawBack = fields[1] || "";
        const front = stripHtml(rawFront).trim();
        const back = stripHtml(rawBack).trim();

        // Generate forward card
        const forwardNote = makeNote(front, back, tags, tracker, rawFront, rawBack);
        if (forwardNote) addToDeck(deckId, forwardNote);

        // Generate reversed card (back → front)
        const reversedNote = makeNote(back, front, [...tags, "_reversed"], tracker, rawBack, rawFront);
        if (reversedNote) addToDeck(deckId, reversedNote);

        // If there are additional fields beyond the first two, include them
        // as extra context on the back of the forward card
        if (fields.length > 2 && forwardNote) {
          const extraFields = fields
            .slice(2)
            .map((f) => stripHtml(f).trim())
            .filter(Boolean);
          if (extraFields.length > 0) {
            forwardNote.back = back + "\n\n" + extraFields.join("\n");
          }
        }
      } else if (model && fields.length > 2) {
        // ── Multi-field note type (single template) ──
        const rawFront = fields[0] || "";
        const front = stripHtml(rawFront).trim();
        const backParts = fields
          .slice(1)
          .map((f) => stripHtml(f).trim())
          .filter(Boolean);
        const back = backParts.join("\n\n");
        const rawBack = fields.slice(1).join("\x1f");
        const note = makeNote(front, back, tags, tracker, rawFront, rawBack);
        if (note) addToDeck(deckId, note);
      } else {
        // ── Basic note type (or unknown model) ──
        const rawFront = fields[0] || "";
        const rawBack = fields[1] || "";
        const front = stripHtml(rawFront).trim();
        const back = stripHtml(rawBack).trim();
        const note = makeNote(front, back, tags, tracker, rawFront, rawBack);
        if (note) addToDeck(deckId, note);
      }
    }

    // ── Create app decks from grouped notes ──
    const createdDecks: Deck[] = [];
    const fileBaseName = path.basename(filePath, ".apkg");

    for (const [did, notes] of deckNotes.entries()) {
      if (notes.length === 0) continue;

      // Resolve deck name
      let deckName: string;
      const ankiDeck = ankiDecks[String(did)];
      if (ankiDeck && ankiDeck.name !== "Default") {
        deckName = ankiDeck.name;
      } else if (Object.keys(ankiDecks).length <= 2) {
        // Only Default + one other deck, or just Default — use filename
        const nonDefault = Object.values(ankiDecks).find((d) => d.name !== "Default");
        deckName = nonDefault ? nonDefault.name : fileBaseName;
      } else {
        deckName = fileBaseName;
      }

      const deck = makeDeck(
        deckName,
        `Imported from ${path.basename(filePath)}`,
        notes
      );
      if (deck) createdDecks.push(deck);
    }

    return {
      decks: createdDecks,
      stats: tracker.toStats(),
    };
  } catch (err) {
    console.error("APKG import error:", err);
    return emptyResult(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

// ════════════════════════════════════════════════════════════
// Smart JSON Import
// ════════════════════════════════════════════════════════════

// Field name mappings for auto-detection (lowercase)
const FRONT_KEYS = new Set([
  "front",
  "question",
  "q",
  "term",
  "prompt",
  "word",
  "kanji",
  "expression",
  "vocabulary",
  "clue",
  "stimulus",
]);

const BACK_KEYS = new Set([
  "back",
  "answer",
  "a",
  "definition",
  "response",
  "meaning",
  "reading",
  "translation",
  "explanation",
  "solution",
]);

const TAG_KEYS = new Set(["tags", "labels", "categories", "tag", "label", "category"]);

const CARD_ARRAY_KEYS = new Set([
  "notes",
  "cards",
  "flashcards",
  "items",
  "data",
  "entries",
  "words",
  "vocabulary",
  "questions",
]);

/**
 * Try to extract front/back/tags from an object using known key patterns.
 * Returns null if no recognizable front field is found.
 */
function extractCardFromObject(obj: Record<string, any>): {
  front: string;
  back: string;
  tags: string[];
} | null {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;

  const keys = Object.keys(obj);
  const lowerKeyMap = new Map<string, string>(); // lowercase → original key
  for (const k of keys) {
    lowerKeyMap.set(k.toLowerCase(), k);
  }

  let front = "";
  let back = "";
  let tags: string[] = [];

  // Try known front keys
  for (const fk of FRONT_KEYS) {
    const originalKey = lowerKeyMap.get(fk);
    if (originalKey && typeof obj[originalKey] === "string") {
      front = obj[originalKey];
      break;
    }
  }

  // Try known back keys
  for (const bk of BACK_KEYS) {
    const originalKey = lowerKeyMap.get(bk);
    if (originalKey && typeof obj[originalKey] === "string") {
      back = obj[originalKey];
      break;
    }
  }

  // Try known tag keys
  for (const tk of TAG_KEYS) {
    const originalKey = lowerKeyMap.get(tk);
    if (originalKey) {
      const val = obj[originalKey];
      if (Array.isArray(val)) {
        tags = val.filter((t): t is string => typeof t === "string");
      } else if (typeof val === "string") {
        tags = val
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean);
      }
      break;
    }
  }

  // If we found at least a front key via known patterns, return
  if (front) return { front, back, tags };

  // ── Fallback: Anki JSON export format with "fields" array ──
  if (Array.isArray(obj["fields"])) {
    const fields = obj["fields"];
    if (fields.length >= 2) {
      const f0 = typeof fields[0] === "string" ? fields[0] : fields[0]?.value;
      const f1 = typeof fields[1] === "string" ? fields[1] : fields[1]?.value;
      if (typeof f0 === "string" && typeof f1 === "string") {
        return { front: f0, back: f1, tags };
      }
    }
  }

  // ── Fallback: object with exactly 2 string-valued keys → first=front, second=back ──
  const stringKeys = keys.filter((k) => typeof obj[k] === "string");
  if (stringKeys.length === 2) {
    return {
      front: obj[stringKeys[0]!] as string,
      back: obj[stringKeys[1]!] as string,
      tags,
    };
  }

  // ── Fallback: object with 3 string keys (one might be tags) → pick best front/back ──
  if (stringKeys.length >= 2) {
    // Exclude known tag keys
    const nonTagKeys = stringKeys.filter(
      (k) => !TAG_KEYS.has(k.toLowerCase())
    );
    if (nonTagKeys.length >= 2) {
      return {
        front: obj[nonTagKeys[0]!] as string,
        back: obj[nonTagKeys[1]!] as string,
        tags,
      };
    }
  }

  return null;
}

// Known keys for deck name (checked in order)
const NAME_KEYS = ["name", "deck_name", "deckName", "title", "deck", "subject", "topic"];
const DESC_KEYS = ["description", "desc", "subtitle", "info"];

/**
 * Extract deck name from an object by trying known key names.
 */
function extractDeckName(obj: Record<string, any>): string {
  for (const key of NAME_KEYS) {
    if (typeof obj[key] === "string" && obj[key]) return obj[key];
  }
  return "";
}

/**
 * Extract deck description from an object by trying known key names.
 */
function extractDeckDescription(obj: Record<string, any>): string {
  for (const key of DESC_KEYS) {
    if (typeof obj[key] === "string") return obj[key];
  }
  return "";
}

/**
 * Find the card array within a JSON structure.
 * Looks for known array keys, or returns the data itself if it's an array.
 */
function findCardArray(data: any): { name: string; description: string; cards: any[] } | null {
  // Direct array
  if (Array.isArray(data)) {
    return { name: "", description: "", cards: data };
  }

  if (typeof data !== "object" || data === null) return null;

  const obj = data as Record<string, any>;
  const name = extractDeckName(obj);
  const description = extractDeckDescription(obj);

  // Check for known card array keys
  for (const key of CARD_ARRAY_KEYS) {
    if (Array.isArray(obj[key])) {
      return { name, description, cards: obj[key] };
    }
  }

  // Check for a "decks" array (multi-deck format)
  // Handled separately by the caller

  // Check if any key holds an array of objects (heuristic)
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null) {
      return { name, description, cards: val };
    }
  }

  return null;
}

/**
 * Import a JSON file containing flashcards.
 * Uses smart auto-detection to support virtually any JSON flashcard format.
 * Returns an ImportResult with all created decks and import statistics.
 */
export function importFromJSON(filePath: string): ImportResult {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const fileName = path.basename(filePath, path.extname(filePath));

    // ── Multi-deck format: { decks: [...] } ──
    if (
      !Array.isArray(data) &&
      typeof data === "object" &&
      data !== null &&
      Array.isArray(data.decks)
    ) {
      return importMultiDeck(data.decks, fileName, filePath);
    }

    // ── Single deck import ──
    return importSingleDeck(data, fileName);
  } catch (err) {
    console.error("JSON import error:", err);
    return emptyResult(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function importMultiDeck(decksArray: any[], fallbackName: string, _filePath: string): ImportResult {
  const createdDecks: Deck[] = [];
  const tracker = new SkipTracker();

  for (let i = 0; i < decksArray.length; i++) {
    const deckData = decksArray[i];
    if (typeof deckData !== "object" || deckData === null) continue;

    const deckName =
      typeof deckData.name === "string" && deckData.name
        ? deckData.name
        : `${fallbackName} - Deck ${i + 1}`;

    const result = importSingleDeckTracked(deckData, deckName, tracker);
    if (result) createdDecks.push(result);
  }

  return {
    decks: createdDecks,
    stats: tracker.toStats(),
  };
}

function importSingleDeck(data: any, fallbackName: string): ImportResult {
  const tracker = new SkipTracker();
  const deck = importSingleDeckTracked(data, fallbackName, tracker);
  return {
    decks: deck ? [deck] : [],
    stats: tracker.toStats(),
  };
}

function importSingleDeckTracked(data: any, fallbackName: string, tracker: SkipTracker): Deck | null {
  const found = findCardArray(data);
  if (!found) return null;

  const deckName = found.name || fallbackName;
  const description = found.description;
  const rawCards = found.cards;

  const notes: Note[] = [];

  for (const item of rawCards) {
    // ── Array of arrays: [["front", "back"], ...] ──
    if (Array.isArray(item)) {
      if (item.length >= 2 && typeof item[0] === "string" && typeof item[1] === "string") {
        const tags: string[] =
          item.length >= 3 && typeof item[2] === "string"
            ? item[2]
                .split(/[,;]/)
                .map((t: string) => t.trim())
                .filter(Boolean)
            : [];
        const note = makeNote(item[0], item[1], tags, tracker);
        if (note) notes.push(note);
      } else {
        tracker.skip("Unrecognized array item format");
      }
      continue;
    }

    // ── String item (skip) ──
    if (typeof item !== "object" || item === null) {
      tracker.skip("Unrecognized item (not an object)");
      continue;
    }

    // ── Object item: extract card using field detection ──
    const extracted = extractCardFromObject(item);
    if (extracted) {
      const note = makeNote(extracted.front, extracted.back, extracted.tags, tracker);
      if (note) notes.push(note);
    } else {
      tracker.skip("Could not detect front/back fields");
    }
  }

  if (notes.length === 0) return null;

  return makeDeck(deckName, description, notes);
}
