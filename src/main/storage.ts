// Deck storage - reads and writes deck JSON files to the data directory

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { createDefaultReview } from "./sm2.js";

// Types duplicated here to avoid import issues with renderer types
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

let dataDir: string;

export function initStorage(appDataPath: string): void {
  dataDir = path.join(appDataPath, "flashcard-app", "decks");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function deckPath(id: string): string {
  return path.join(dataDir, `${id}.json`);
}

// ── Deck CRUD ──

export function getAllDecks(): Deck[] {
  if (!fs.existsSync(dataDir)) return [];
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));
  const decks: Deck[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dataDir, file), "utf-8");
      decks.push(JSON.parse(raw) as Deck);
    } catch {
      // skip corrupted files
    }
  }
  return decks.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getDeck(id: string): Deck | null {
  const fp = deckPath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as Deck;
  } catch {
    return null;
  }
}

export function saveDeck(deck: Deck): void {
  fs.writeFileSync(deckPath(deck.id), JSON.stringify(deck, null, 2));
}

export function createDeck(name: string, description = ""): Deck {
  const deck: Deck = {
    id: uuidv4(),
    name,
    description,
    createdAt: new Date().toISOString(),
    notes: [],
  };
  saveDeck(deck);
  return deck;
}

export function deleteDeck(id: string): void {
  const fp = deckPath(id);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
  }
}

export function renameDeck(id: string, name: string): Deck | null {
  const deck = getDeck(id);
  if (!deck) return null;
  deck.name = name;
  saveDeck(deck);
  return deck;
}

/**
 * Move a deck to a new path. Also renames all descendant decks.
 * E.g., moveDeck("Languages::Japanese", "Study::Japanese") also renames
 * "Languages::Japanese::Vocab" -> "Study::Japanese::Vocab"
 */
export function moveDeck(id: string, newPath: string): Deck | null {
  const deck = getDeck(id);
  if (!deck) return null;

  const oldPath = deck.name;
  deck.name = newPath;
  saveDeck(deck);

  // Rename all child decks whose name starts with oldPath + "::"
  const prefix = oldPath + "::";
  const allDecks = getAllDecks();
  for (const d of allDecks) {
    if (d.name.startsWith(prefix)) {
      d.name = newPath + "::" + d.name.slice(prefix.length);
      saveDeck(d);
    }
  }

  return deck;
}

/**
 * Delete all decks matching a path prefix (the deck itself + all descendants).
 */
export function deleteByPath(pathPrefix: string): void {
  const allDecks = getAllDecks();
  for (const deck of allDecks) {
    if (
      deck.name === pathPrefix ||
      deck.name.startsWith(pathPrefix + "::")
    ) {
      deleteDeck(deck.id);
    }
  }
}

/**
 * Get all decks whose name matches or is a descendant of the given path.
 */
export function getDecksByPath(pathPrefix: string): Deck[] {
  const allDecks = getAllDecks();
  return allDecks.filter(
    (d) => d.name === pathPrefix || d.name.startsWith(pathPrefix + "::")
  );
}

// ── Note CRUD ──

export function addNote(
  deckId: string,
  front: string,
  back: string,
  tags: string[] = []
): Note | null {
  const deck = getDeck(deckId);
  if (!deck) return null;

  const f = front.trim();
  const b = back.trim();
  if (!f || !b) return null; // Reject empty front or back

  const note: Note = {
    id: uuidv4(),
    front: f,
    back: b,
    tags,
    review: createDefaultReview(),
  };

  deck.notes.push(note);
  saveDeck(deck);
  return note;
}

export function updateNote(
  deckId: string,
  noteId: string,
  front: string,
  back: string,
  tags: string[] = []
): Note | null {
  const deck = getDeck(deckId);
  if (!deck) return null;

  const note = deck.notes.find((n) => n.id === noteId);
  if (!note) return null;

  const f = front.trim();
  const b = back.trim();
  if (!f || !b) return null; // Reject empty front or back

  note.front = f;
  note.back = b;
  note.tags = tags;
  saveDeck(deck);
  return note;
}

export function deleteNote(deckId: string, noteId: string): boolean {
  const deck = getDeck(deckId);
  if (!deck) return false;

  const idx = deck.notes.findIndex((n) => n.id === noteId);
  if (idx === -1) return false;

  deck.notes.splice(idx, 1);
  saveDeck(deck);
  return true;
}

export function updateNoteReview(
  deckId: string,
  noteId: string,
  reviewData: ReviewData
): Note | null {
  const deck = getDeck(deckId);
  if (!deck) return null;

  const note = deck.notes.find((n) => n.id === noteId);
  if (!note) return null;

  note.review = reviewData;
  saveDeck(deck);
  return note;
}
