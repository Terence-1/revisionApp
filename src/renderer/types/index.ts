// ── Flashcard Types ──

export interface ReviewData {
  interval: number; // days until next review
  easeFactor: number; // SM-2 ease factor (minimum 1.3)
  repetitions: number; // consecutive correct reviews
  dueDate: string; // ISO date string (YYYY-MM-DD)
  lastReview: string | null; // ISO date string
}

export interface Note {
  id: string;
  front: string;
  back: string;
  tags: string[];
  review: ReviewData;
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  notes: Note[];
}

// ── Tree Types ──

export interface DeckTreeNode {
  name: string; // segment name (e.g., "Japanese")
  fullPath: string; // full deck path (e.g., "Languages::Japanese")
  deck: Deck | null; // null for virtual parent nodes (auto-created)
  children: DeckTreeNode[];
  // Aggregated stats (self + all descendants)
  totalCards: number;
  dueCards: number;
  newCards: number;
}

// A note returned from multi-deck queries, tagged with its source deck
export interface DueNoteWithDeck {
  note: Note;
  deckId: string;
  deckName: string;
}

// ── Import Result Types ──

export interface ImportSkipReason {
  reason: string;
  count: number;
}

export interface ImportStats {
  totalProcessed: number;
  imported: number;
  skipped: number;
  skipReasons: ImportSkipReason[];
}

export interface ImportResult {
  decks: Deck[];
  stats: ImportStats;
  error?: string; // top-level error (e.g. unsupported format)
}

// ── Grading Types ──

export interface GradeResult {
  score: number; // 0-4 (SM-2 quality rating)
  feedback: string;
}

export interface ReviewAnswer {
  noteId: string;
  deckId: string;
  userAnswer: string;
}

// ── Ollama Types ──

export interface OllamaStatus {
  connected: boolean;
  model: string;
  error?: string;
}

// ── Stats Types ──

export interface DeckStats {
  totalCards: number;
  dueToday: number;
  newCards: number; // never reviewed
  learningCards: number; // interval < 21 days
  matureCards: number; // interval >= 21 days
}

// ── Config Types ──

export type AIProvider = "ollama" | "openai" | "anthropic" | "gemini";

export interface ModelConfig {
  grading: string;
  generation: string;
  deepReview: string;
  battery: string;
}

export interface AppConfig {
  aiProvider: AIProvider;
  ollamaBaseUrl: string;
  autoStartOllama: boolean;
  models: ModelConfig;
  openaiApiKey: string;
  openaiGradingModel: string;
  openaiFullModel: string;
  anthropicApiKey: string;
  anthropicGradingModel: string;
  anthropicFullModel: string;
  geminiApiKey: string;
  geminiGradingModel: string;
  geminiFullModel: string;
}

// ── AI Generation Types ──

export interface GeneratedCard {
  front: string;
  back: string;
}

// ── Deep Review Types ──

export interface DeepReviewSource {
  title: string;
  url: string;
  summary: string;
}

export interface DeepReviewResult {
  explanation: string;
  sources: DeepReviewSource[];
}

// ── Card Prioritization Types ──

export interface CardMeta {
  id: string;
  deckId: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueDate: string;
  lastReview: string | null;
}

// ── Search Types ──

export interface SearchResult {
  deckId: string;
  deckName: string;
  note: Note;
}

// ── AI Hint Types ──

export interface HintResult {
  hint: string;
}

// ── Power State ──

export interface PowerState {
  onBattery: boolean;
}

// ── IPC API shape ──

export interface FlashcardAPI {
  // Deck operations
  getDecks: () => Promise<Deck[]>;
  getDeck: (id: string) => Promise<Deck | null>;
  createDeck: (name: string, description?: string) => Promise<Deck>;
  deleteDeck: (id: string) => Promise<void>;
  renameDeck: (id: string, name: string) => Promise<Deck>;

  // Hierarchy operations
  moveDeck: (deckId: string, newPath: string) => Promise<Deck | null>;
  deleteByPath: (pathPrefix: string) => Promise<void>;

  // Note operations
  addNote: (deckId: string, front: string, back: string, tags?: string[]) => Promise<Note | null>;
  updateNote: (deckId: string, noteId: string, front: string, back: string, tags?: string[]) => Promise<Note | null>;
  deleteNote: (deckId: string, noteId: string) => Promise<void>;

  // Review operations
  getDueNotes: (deckId: string) => Promise<Note[]>;
  getDueNotesForPath: (pathPrefix: string) => Promise<DueNoteWithDeck[]>;
  gradeAnswer: (deckId: string, noteId: string, userAnswer: string) => Promise<GradeResult>;
  updateReview: (deckId: string, noteId: string, score: number) => Promise<Note>;

  // Import
  importJSON: () => Promise<ImportResult | null>;
  importApkg: () => Promise<ImportResult | null>;

  // Export
  exportDeck: (deckId: string, format: "json" | "apkg") => Promise<{ success: boolean; filePath?: string; error?: string }>;

  // Ollama
  checkOllama: () => Promise<OllamaStatus>;
  startOllama: () => Promise<{ started: boolean; error?: string }>;
  getAvailableModels: () => Promise<string[]>;

  // Config
  getConfig: () => Promise<AppConfig>;
  setConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>;

  // Power
  getPowerState: () => Promise<PowerState>;

  // AI
  generateCards: (notes: string, count: number) => Promise<GeneratedCard[]>;
  deepReview: (front: string, back: string, userAnswer: string) => Promise<DeepReviewResult>;
  prioritizeCards: (cards: CardMeta[], totalCount: number) => Promise<string[]>;

  // Stats
  getDeckStats: (deckId: string) => Promise<DeckStats>;
  getStatsForPath: (pathPrefix: string) => Promise<DeckStats>;

  // Search
  searchAllDecks: (query: string, limit?: number) => Promise<SearchResult[]>;

  // AI: Hint generation
  generateHint: (front: string, back: string) => Promise<HintResult>;
}

declare global {
  interface Window {
    api: FlashcardAPI;
  }
}
