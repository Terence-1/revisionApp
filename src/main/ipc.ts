// IPC handlers — bridge between Electron main process and renderer

import { ipcMain, dialog, powerMonitor, BrowserWindow } from "electron";
import {
  getAllDecks,
  getDeck,
  createDeck,
  deleteDeck,
  renameDeck,
  addNote,
  updateNote,
  deleteNote,
  updateNoteReview,
  moveDeck,
  deleteByPath,
  getDecksByPath,
  searchAllDecks,
} from "./storage.js";
import {
  checkOllamaStatus,
  startOllamaServe,
  listAvailableModels,
} from "./ollama.js";
import { getConfig, setConfig } from "./config.js";
import {
  gradeAnswer,
  generateCards,
  deepReview,
  prioritizeCards,
  generateHint,
} from "./ai.js";
import type { CardMeta } from "./ai.js";
import {
  exportToJSON,
  exportToApkg,
} from "./exporter.js";
import { sm2, getDueDate, isDue } from "./sm2.js";
import { importFromJSON, importFromApkg } from "./importer.js";

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

interface DeckStats {
  totalCards: number;
  dueToday: number;
  newCards: number;
  learningCards: number;
  matureCards: number;
}

function isOnBattery(): boolean {
  try {
    return powerMonitor.onBatteryPower;
  } catch {
    return false;
  }
}

export function registerIpcHandlers(): void {
  // ── Deck operations ──

  ipcMain.handle("get-decks", () => getAllDecks());

  ipcMain.handle("get-deck", (_e, id: string) => getDeck(id));

  ipcMain.handle("create-deck", (_e, name: string, description?: string) =>
    createDeck(name, description),
  );

  ipcMain.handle("delete-deck", (_e, id: string) => deleteDeck(id));

  ipcMain.handle("rename-deck", (_e, id: string, name: string) =>
    renameDeck(id, name),
  );

  // ── Hierarchy operations ──

  ipcMain.handle("move-deck", (_e, id: string, newPath: string) =>
    moveDeck(id, newPath),
  );

  ipcMain.handle("delete-by-path", (_e, pathPrefix: string) =>
    deleteByPath(pathPrefix),
  );

  // ── Note operations ──

  ipcMain.handle(
    "add-note",
    (_e, deckId: string, front: string, back: string, tags?: string[]) =>
      addNote(deckId, front, back, tags),
  );

  ipcMain.handle(
    "update-note",
    (_e, deckId: string, noteId: string, front: string, back: string, tags?: string[]) =>
      updateNote(deckId, noteId, front, back, tags),
  );

  ipcMain.handle("delete-note", (_e, deckId: string, noteId: string) =>
    deleteNote(deckId, noteId),
  );

  // ── Review operations ──

  ipcMain.handle("get-due-notes", (_e, deckId: string) => {
    const deck = getDeck(deckId);
    if (!deck) return [];
    return deck.notes.filter((n) => isDue(n.review.dueDate));
  });

  ipcMain.handle(
    "grade-answer",
    async (_e, deckId: string, noteId: string, userAnswer: string) => {
      const deck = getDeck(deckId);
      if (!deck) return { score: 0, feedback: "Deck not found" };
      const note = deck.notes.find((n) => n.id === noteId);
      if (!note) return { score: 0, feedback: "Note not found" };

      const models = getConfig().aiProvider === "ollama" ? await listAvailableModels() : [];
      return gradeAnswer(note.front, note.back, userAnswer, isOnBattery(), models);
    },
  );

  ipcMain.handle(
    "update-review",
    (_e, deckId: string, noteId: string, score: number) => {
      const deck = getDeck(deckId);
      if (!deck) return null;
      const note = deck.notes.find((n) => n.id === noteId);
      if (!note) return null;

      const result = sm2(
        score,
        note.review.repetitions,
        note.review.easeFactor,
        note.review.interval,
      );

      const newReview: ReviewData = {
        interval: result.interval,
        easeFactor: result.easeFactor,
        repetitions: result.repetitions,
        dueDate: getDueDate(result.interval),
        lastReview: new Date().toISOString().split("T")[0]!,
      };

      return updateNoteReview(deckId, noteId, newReview);
    },
  );

  // ── Aggregated review (multi-deck, for hierarchy) ──

  ipcMain.handle("get-due-notes-for-path", (_e, pathPrefix: string) => {
    const decks = getDecksByPath(pathPrefix);
    const result: Array<{ note: Note; deckId: string; deckName: string }> = [];
    for (const deck of decks) {
      for (const note of deck.notes) {
        if (isDue(note.review.dueDate)) {
          result.push({ note, deckId: deck.id, deckName: deck.name });
        }
      }
    }
    return result;
  });

  // ── Import ──

  ipcMain.handle("import-json", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: "Import JSON Flashcards",
      filters: [{ name: "JSON Files", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return importFromJSON(result.filePaths[0]!);
  });

  ipcMain.handle("import-apkg", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: "Import Anki Package",
      filters: [{ name: "Anki Packages", extensions: ["apkg"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return importFromApkg(result.filePaths[0]!);
  });

  // ── Export ──

  ipcMain.handle(
    "export-deck",
    async (_e, deckId: string, format: "json" | "apkg") => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return { success: false, error: "No window" };

      const filters =
        format === "json"
          ? [{ name: "JSON Files", extensions: ["json"] }]
          : [{ name: "Anki Packages", extensions: ["apkg"] }];

      const result = await dialog.showSaveDialog(win, {
        title: `Export Deck as ${format === "json" ? "JSON" : "Anki Package"}`,
        filters,
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: "Cancelled" };
      }

      const exported =
        format === "json"
          ? exportToJSON(result.filePath, deckId)
          : exportToApkg(result.filePath, deckId);

      return exported
        ? { success: true, filePath: exported }
        : { success: false, error: "Export failed — deck may be empty." };
    },
  );

  // ── Ollama ──

  ipcMain.handle("check-ollama", async () => checkOllamaStatus());

  ipcMain.handle("start-ollama", async () => startOllamaServe());

  ipcMain.handle("get-available-models", async () => listAvailableModels());

  // ── Config ──

  ipcMain.handle("get-config", () => getConfig());

  ipcMain.handle("set-config", (_e, partial: Record<string, unknown>) =>
    setConfig(partial),
  );

  // ── Power / battery ──

  ipcMain.handle("get-power-state", () => ({
    onBattery: isOnBattery(),
  }));

  // ── AI: Card generation ──

  ipcMain.handle(
    "generate-cards",
    async (_e, notes: string, count: number) => {
      const models = getConfig().aiProvider === "ollama" ? await listAvailableModels() : [];
      return generateCards(notes, count, isOnBattery(), models);
    },
  );

  // ── AI: Deep review ──

  ipcMain.handle(
    "deep-review",
    async (_e, front: string, back: string, userAnswer: string) => {
      const models = getConfig().aiProvider === "ollama" ? await listAvailableModels() : [];
      return deepReview(front, back, userAnswer, isOnBattery(), models);
    },
  );

  // ── AI: Card prioritization ──

  ipcMain.handle(
    "prioritize-cards",
    async (_e, cards: CardMeta[], totalCount: number) => {
      const models = getConfig().aiProvider === "ollama" ? await listAvailableModels() : [];
      return prioritizeCards(cards, totalCount, isOnBattery(), models);
    },
  );

  // ── Stats ──

  ipcMain.handle("get-deck-stats", (_e, deckId: string) => {
    const deck = getDeck(deckId);
    if (!deck) {
      return {
        totalCards: 0,
        dueToday: 0,
        newCards: 0,
        learningCards: 0,
        matureCards: 0,
      } satisfies DeckStats;
    }

    const today = new Date().toISOString().split("T")[0]!;
    return {
      totalCards: deck.notes.length,
      dueToday: deck.notes.filter((n: Note) => n.review.dueDate <= today).length,
      newCards: deck.notes.filter((n: Note) => n.review.repetitions === 0).length,
      learningCards: deck.notes.filter(
        (n: Note) => n.review.repetitions > 0 && n.review.interval < 21,
      ).length,
      matureCards: deck.notes.filter((n: Note) => n.review.interval >= 21).length,
    } satisfies DeckStats;
  });

  ipcMain.handle("get-stats-for-path", (_e, pathPrefix: string) => {
    const decks = getDecksByPath(pathPrefix);
    const allNotes: Note[] = [];
    for (const deck of decks) allNotes.push(...deck.notes);

    const today = new Date().toISOString().split("T")[0]!;
    return {
      totalCards: allNotes.length,
      dueToday: allNotes.filter((n: Note) => n.review.dueDate <= today).length,
      newCards: allNotes.filter((n: Note) => n.review.repetitions === 0).length,
      learningCards: allNotes.filter(
        (n: Note) => n.review.repetitions > 0 && n.review.interval < 21,
      ).length,
      matureCards: allNotes.filter((n: Note) => n.review.interval >= 21).length,
    } satisfies DeckStats;
  });

  // ── Search ──

  ipcMain.handle("search-all-decks", (_e, query: string, limit?: number) =>
    searchAllDecks(query, limit),
  );

  // ── AI: Hint generation ──

  ipcMain.handle(
    "generate-hint",
    async (_e, front: string, back: string) => {
      const models = getConfig().aiProvider === "ollama" ? await listAvailableModels() : [];
      return generateHint(front, back, isOnBattery(), models);
    },
  );
}
