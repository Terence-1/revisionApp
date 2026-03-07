// Export logic for JSON and Anki .apkg files
// Converts app decks into portable formats for backup or use in other tools.

import fs from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { getDeck, getDecksByPath } from "./storage.js";

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

// ── JSON export ───────────────────────────────────────────────────────────────

/**
 * Export a deck (or path of decks) to a JSON file.
 * Returns the written file path, or null if cancelled / empty.
 */
export function exportToJSON(filePath: string, deckId: string): string | null {
  const deck = getDeck(deckId);
  if (!deck || deck.notes.length === 0) return null;

  const output = {
    name: deck.name,
    description: deck.description,
    exportedAt: new Date().toISOString(),
    cards: deck.notes.map((n) => ({
      front: n.front,
      back: n.back,
      tags: n.tags,
    })),
  };

  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), "utf-8");
  return filePath;
}

/**
 * Export multiple decks under a path prefix to a single JSON file.
 */
export function exportPathToJSON(filePath: string, pathPrefix: string): string | null {
  const decks = getDecksByPath(pathPrefix);
  if (decks.length === 0) return null;

  const output = {
    exportedAt: new Date().toISOString(),
    decks: decks.map((deck) => ({
      name: deck.name,
      description: deck.description,
      cards: deck.notes.map((n) => ({
        front: n.front,
        back: n.back,
        tags: n.tags,
      })),
    })),
  };

  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), "utf-8");
  return filePath;
}

// ── Anki .apkg export ─────────────────────────────────────────────────────────

// Anki uses millisecond timestamps for IDs and second timestamps for dates.
// Model ID and deck ID are arbitrary large integers.

/**
 * Export a single deck to an Anki .apkg file.
 * Creates a valid collection.anki2 SQLite database inside a ZIP.
 */
export function exportToApkg(filePath: string, deckId: string): string | null {
  const deck = getDeck(deckId);
  if (!deck || deck.notes.length === 0) return null;
  return writeApkg(filePath, [deck]);
}

/**
 * Export multiple decks under a path prefix to a single .apkg file.
 */
export function exportPathToApkg(filePath: string, pathPrefix: string): string | null {
  const decks = getDecksByPath(pathPrefix);
  if (decks.length === 0) return null;
  return writeApkg(filePath, decks);
}

function writeApkg(filePath: string, decks: Deck[]): string | null {
  let tempDir: string | null = null;

  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anki-export-"));
    const dbPath = path.join(tempDir, "collection.anki2");

    const db = new Database(dbPath);

    // Enable WAL for performance, then switch back for portability
    db.pragma("journal_mode = DELETE");

    // ── Create Anki schema ──
    db.exec(`
      CREATE TABLE col (
        id   INTEGER PRIMARY KEY,
        crt  INTEGER NOT NULL,
        mod  INTEGER NOT NULL,
        scm  INTEGER NOT NULL,
        ver  INTEGER NOT NULL,
        dty  INTEGER NOT NULL,
        usn  INTEGER NOT NULL,
        ls   INTEGER NOT NULL,
        conf TEXT NOT NULL,
        models TEXT NOT NULL,
        decks TEXT NOT NULL,
        dconf TEXT NOT NULL,
        tags TEXT NOT NULL
      );

      CREATE TABLE notes (
        id    INTEGER PRIMARY KEY,
        guid  TEXT NOT NULL,
        mid   INTEGER NOT NULL,
        mod   INTEGER NOT NULL,
        usn   INTEGER NOT NULL,
        tags  TEXT NOT NULL,
        flds  TEXT NOT NULL,
        sfld  TEXT NOT NULL,
        csum  INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data  TEXT NOT NULL
      );

      CREATE TABLE cards (
        id    INTEGER PRIMARY KEY,
        nid   INTEGER NOT NULL,
        did   INTEGER NOT NULL,
        ord   INTEGER NOT NULL,
        mod   INTEGER NOT NULL,
        usn   INTEGER NOT NULL,
        type  INTEGER NOT NULL,
        queue INTEGER NOT NULL,
        due   INTEGER NOT NULL,
        ivl   INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        reps  INTEGER NOT NULL,
        lapses INTEGER NOT NULL,
        left  INTEGER NOT NULL,
        odue  INTEGER NOT NULL,
        odid  INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data  TEXT NOT NULL
      );

      CREATE TABLE revlog (
        id    INTEGER PRIMARY KEY,
        cid   INTEGER NOT NULL,
        usn   INTEGER NOT NULL,
        ease  INTEGER NOT NULL,
        ivl   INTEGER NOT NULL,
        lastIvl INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        time  INTEGER NOT NULL,
        type  INTEGER NOT NULL
      );

      CREATE TABLE graves (
        usn  INTEGER NOT NULL,
        oid  INTEGER NOT NULL,
        type INTEGER NOT NULL
      );

      CREATE INDEX ix_notes_usn ON notes (usn);
      CREATE INDEX ix_cards_usn ON cards (usn);
      CREATE INDEX ix_revlog_usn ON revlog (usn);
      CREATE INDEX ix_cards_nid ON cards (nid);
      CREATE INDEX ix_cards_sched ON cards (did, queue, due);
      CREATE INDEX ix_revlog_cid ON revlog (cid);
      CREATE INDEX ix_notes_csum ON notes (csum);
    `);

    const now = Math.floor(Date.now() / 1000);
    const modelId = Date.now();

    // ── Build model (note type) — Basic with Front/Back ──
    const model: Record<string, unknown> = {
      [modelId]: {
        id: modelId,
        name: "Basic",
        type: 0,
        mod: now,
        usn: -1,
        sortf: 0,
        did: 1,
        tmpls: [
          {
            name: "Card 1",
            ord: 0,
            qfmt: "{{Front}}",
            afmt: '{{FrontSide}}<hr id="answer">{{Back}}',
            bqfmt: "",
            bafmt: "",
            did: null,
            bfont: "",
            bsize: 0,
          },
        ],
        flds: [
          { name: "Front", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20, media: [] },
          { name: "Back", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20, media: [] },
        ],
        css: ".card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\n",
        latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
        latexPost: "\\end{document}",
        latexsvg: false,
        req: [[0, "any", [0]]],
        tags: [],
        vers: [],
      },
    };

    // ── Build deck entries ──
    // Always include the Default deck (id=1) as Anki requires it
    const ankiDecks: Record<string, unknown> = {
      "1": {
        id: 1,
        name: "Default",
        mod: now,
        usn: -1,
        lrnToday: [0, 0],
        revToday: [0, 0],
        newToday: [0, 0],
        timeToday: [0, 0],
        collapsed: false,
        desc: "",
        dyn: 0,
        conf: 1,
        extendNew: 10,
        extendRev: 50,
      },
    };

    // Assign each deck a unique ID starting from a large timestamp base
    const deckIdMap = new Map<string, number>();
    let nextDeckId = Date.now();

    for (const deck of decks) {
      const did = nextDeckId++;
      deckIdMap.set(deck.id, did);
      ankiDecks[String(did)] = {
        id: did,
        name: deck.name,
        mod: now,
        usn: -1,
        lrnToday: [0, 0],
        revToday: [0, 0],
        newToday: [0, 0],
        timeToday: [0, 0],
        collapsed: false,
        desc: deck.description || "",
        dyn: 0,
        conf: 1,
        extendNew: 10,
        extendRev: 50,
      };
    }

    // Default deck config
    const dconf: Record<string, unknown> = {
      "1": {
        id: 1,
        name: "Default",
        mod: 0,
        usn: 0,
        maxTaken: 60,
        autoplay: true,
        timer: 0,
        replayq: true,
        new: { delays: [1, 10], ints: [1, 4, 0], initialFactor: 2500, order: 1, perDay: 20 },
        rev: { perDay: 200, ease4: 1.3, ivlFct: 1, maxIvl: 36500, fuzz: 0.05 },
        lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 0 },
      },
    };

    // ── Insert col row ──
    db.prepare(`
      INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')
    `).run(
      now,
      now,
      now * 1000,
      JSON.stringify({}),        // conf
      JSON.stringify(model),     // models
      JSON.stringify(ankiDecks), // decks
      JSON.stringify(dconf),     // dconf
    );

    // ── Insert notes and cards ──
    const insertNote = db.prepare(
      "INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')",
    );
    const insertCard = db.prepare(
      "INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, '')",
    );

    let noteIdCounter = Date.now() * 1000; // microsecond-ish base
    let cardIdCounter = noteIdCounter + 1000000; // offset to prevent ID collision

    for (const deck of decks) {
      const did = deckIdMap.get(deck.id) ?? 1;

      for (const note of deck.notes) {
        const noteId = noteIdCounter++;
        const cardId = cardIdCounter++;
        const guid = note.id.replace(/-/g, "").slice(0, 10);
        const flds = `${note.front}\x1f${note.back}`;
        const sfld = note.front;
        const tags = note.tags.length > 0 ? ` ${note.tags.join(" ")} ` : "";

        // Simple checksum of the sort field (first 8 hex digits of a basic hash)
        const csum = simpleChecksum(sfld);

        insertNote.run(noteId, guid, modelId, now, tags, flds, sfld, csum);

        // Map review state to Anki card types
        const reps = note.review.repetitions;
        const ivl = note.review.interval;
        const factor = Math.round(note.review.easeFactor * 1000);

        // type: 0=new, 1=learning, 2=review
        // queue: 0=new, 1=learning, 2=review
        let type = 0;
        let queue = 0;
        let due = noteId; // new cards use noteId as due (position)

        if (reps > 0) {
          type = 2;
          queue = 2;
          // due = days since collection creation epoch
          const dueDate = new Date(note.review.dueDate);
          due = Math.floor(dueDate.getTime() / 86400000);
        }

        insertCard.run(cardId, noteId, did, now, type, queue, due, ivl, factor, reps);
      }
    }

    db.close();

    // ── Create media file (empty — we have no media) ──
    const mediaPath = path.join(tempDir, "media");
    fs.writeFileSync(mediaPath, "{}", "utf-8");

    // ── Zip into .apkg ──
    const zip = new AdmZip();
    zip.addLocalFile(dbPath, "", "collection.anki2");
    zip.addLocalFile(mediaPath, "", "media");
    zip.writeZip(filePath);

    return filePath;
  } catch (err) {
    console.error("APKG export error:", err);
    return null;
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Simple checksum for Anki's csum field.
 * Anki uses the first 8 hex digits of SHA1, but we use a basic hash
 * since it's only used for duplicate detection within Anki.
 */
function simpleChecksum(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash);
}
