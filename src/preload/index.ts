// Preload script — secure bridge between renderer and main process

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  // Deck operations
  getDecks: () => ipcRenderer.invoke("get-decks"),
  getDeck: (id: string) => ipcRenderer.invoke("get-deck", id),
  createDeck: (name: string, description?: string) =>
    ipcRenderer.invoke("create-deck", name, description),
  deleteDeck: (id: string) => ipcRenderer.invoke("delete-deck", id),
  renameDeck: (id: string, name: string) =>
    ipcRenderer.invoke("rename-deck", id, name),

  // Hierarchy operations
  moveDeck: (deckId: string, newPath: string) =>
    ipcRenderer.invoke("move-deck", deckId, newPath),
  deleteByPath: (pathPrefix: string) =>
    ipcRenderer.invoke("delete-by-path", pathPrefix),

  // Note operations
  addNote: (deckId: string, front: string, back: string, tags?: string[]) =>
    ipcRenderer.invoke("add-note", deckId, front, back, tags),
  updateNote: (
    deckId: string,
    noteId: string,
    front: string,
    back: string,
    tags?: string[],
  ) => ipcRenderer.invoke("update-note", deckId, noteId, front, back, tags),
  deleteNote: (deckId: string, noteId: string) =>
    ipcRenderer.invoke("delete-note", deckId, noteId),

  // Review operations
  getDueNotes: (deckId: string) => ipcRenderer.invoke("get-due-notes", deckId),
  getDueNotesForPath: (pathPrefix: string) =>
    ipcRenderer.invoke("get-due-notes-for-path", pathPrefix),
  gradeAnswer: (deckId: string, noteId: string, userAnswer: string) =>
    ipcRenderer.invoke("grade-answer", deckId, noteId, userAnswer),
  updateReview: (deckId: string, noteId: string, score: number) =>
    ipcRenderer.invoke("update-review", deckId, noteId, score),

  // Import
  importJSON: () => ipcRenderer.invoke("import-json"),
  importApkg: () => ipcRenderer.invoke("import-apkg"),

  // Export
  exportDeck: (deckId: string, format: "json" | "apkg") =>
    ipcRenderer.invoke("export-deck", deckId, format),

  // Ollama
  checkOllama: () => ipcRenderer.invoke("check-ollama"),
  startOllama: () => ipcRenderer.invoke("start-ollama"),
  getAvailableModels: () => ipcRenderer.invoke("get-available-models"),

  // Config
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke("set-config", partial),

  // Power state
  getPowerState: () => ipcRenderer.invoke("get-power-state"),

  // AI: Card generation
  generateCards: (notes: string, count: number) =>
    ipcRenderer.invoke("generate-cards", notes, count),

  // AI: Deep review
  deepReview: (front: string, back: string, userAnswer: string) =>
    ipcRenderer.invoke("deep-review", front, back, userAnswer),

  // AI: Card prioritization
  prioritizeCards: (cards: Array<{ id: string; deckId: string; easeFactor: number; interval: number; repetitions: number; dueDate: string; lastReview: string | null }>, totalCount: number) =>
    ipcRenderer.invoke("prioritize-cards", cards, totalCount),

  // Stats
  getDeckStats: (deckId: string) =>
    ipcRenderer.invoke("get-deck-stats", deckId),
  getStatsForPath: (pathPrefix: string) =>
    ipcRenderer.invoke("get-stats-for-path", pathPrefix),
});
