import { useState, useEffect, useCallback } from "react";
import type { GradeResult, DueNoteWithDeck, DeepReviewResult, CardMeta } from "../types/index.js";
import { getBreadcrumbs } from "../utils/deckTree.js";
import GradingResult from "./GradingResult.js";
import MarkdownContent from "./MarkdownContent.js";

// ── Priority scoring (static fallback) ──
// New cards are scored HIGH (45) to bias toward assessment — the AI should
// see what the user doesn't know yet. Struggling review cards still rank
// highest (50-70) since those are proven weak spots.

type CardCategory = "struggling" | "overdue" | "due" | "new";

interface ScoredNote {
  entry: DueNoteWithDeck;
  score: number;
  category: CardCategory;
}

interface CategoryCount {
  struggling: number;
  overdue: number;
  due: number;
  new: number;
}

function computePriorityScore(entry: DueNoteWithDeck): ScoredNote {
  const { review } = entry.note;
  const today = new Date().toISOString().split("T")[0]!;

  // New cards ranked high for assessment bias
  if (review.repetitions === 0) {
    return { entry, score: 45, category: "new" };
  }

  if (review.easeFactor < 2.1) {
    const normalized = (2.1 - review.easeFactor) / (2.1 - 1.3);
    const score = 50 + normalized * 20;
    return { entry, score, category: "struggling" };
  }

  if (review.dueDate < today) {
    const dueDate = new Date(review.dueDate);
    const todayDate = new Date(today);
    const daysOverdue = Math.max(1, Math.floor((todayDate.getTime() - dueDate.getTime()) / 86400000));
    const overdueRatio = Math.min(daysOverdue / Math.max(1, review.interval), 10);
    const score = 30 + Math.min(overdueRatio / 10, 1) * 20;
    return { entry, score, category: "overdue" };
  }

  if (review.dueDate === today) {
    const normalized = Math.max(0, Math.min(1, (3.0 - review.easeFactor) / 1.7));
    const score = 20 + normalized * 10;
    return { entry, score, category: "due" };
  }

  return { entry, score: 20, category: "due" };
}

function categorizeNotes(notes: DueNoteWithDeck[]): { scored: ScoredNote[]; counts: CategoryCount } {
  const scored = notes.map(computePriorityScore);
  const counts: CategoryCount = { struggling: 0, overdue: 0, due: 0, new: 0 };
  for (const s of scored) {
    counts[s.category]++;
  }
  scored.sort((a, b) => b.score - a.score);
  return { scored, counts };
}

// ── Interleave scored notes for variety ──
// After sorting by score, new cards cluster together (all score 45).
// This interleaver spreads new cards evenly among review cards for variety.

function interleaveForVariety(scored: ScoredNote[]): DueNoteWithDeck[] {
  const newCards = scored.filter((s) => s.category === "new").map((s) => s.entry);
  const reviewCards = scored.filter((s) => s.category !== "new").map((s) => s.entry);

  if (newCards.length === 0) return reviewCards;
  if (reviewCards.length === 0) return newCards;

  const result: DueNoteWithDeck[] = [];
  // Alternate: 1 review, 1 new — biased interleave
  let rIdx = 0;
  let nIdx = 0;
  let turn = 0; // 0 = review, 1 = new

  while (rIdx < reviewCards.length || nIdx < newCards.length) {
    if (turn === 0 && rIdx < reviewCards.length) {
      result.push(reviewCards[rIdx]!);
      rIdx++;
    } else if (turn === 1 && nIdx < newCards.length) {
      result.push(newCards[nIdx]!);
      nIdx++;
    } else if (rIdx < reviewCards.length) {
      result.push(reviewCards[rIdx]!);
      rIdx++;
    } else if (nIdx < newCards.length) {
      result.push(newCards[nIdx]!);
      nIdx++;
    }
    turn = turn === 0 ? 1 : 0;
  }

  return result;
}

// ── Category display config ──

const CATEGORY_CONFIG: Record<CardCategory, { label: string; color: string }> = {
  struggling: { label: "Struggling", color: "var(--danger)" },
  overdue: { label: "Overdue", color: "var(--warning)" },
  due: { label: "Due Today", color: "var(--accent)" },
  new: { label: "New", color: "var(--success)" },
};

// ── Stepper sub-component ──

function CountStepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 5))}
          disabled={value <= 0}
          className="w-8 h-8 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        >
          -
        </button>
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onChange(Math.max(0, Math.min(max, v)));
          }}
          className="w-16 text-center text-sm font-medium rounded-lg py-1.5 outline-none"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <button
          onClick={() => onChange(Math.min(max, value + 5))}
          disabled={value >= max}
          className="w-8 h-8 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        >
          +
        </button>
        <span className="text-xs ml-1 tabular-nums" style={{ color: "var(--text-muted)" }}>
          / {max}
        </span>
      </div>
    </div>
  );
}

// ── Component ──

interface Props {
  pathPrefix: string;
  onFinish: () => void;
}

type Phase = "setup" | "reviewing" | "complete";

export default function ReviewSession({ pathPrefix, onFinish }: Props) {
  // Phase state machine
  const [phase, setPhase] = useState<Phase>("setup");

  // Setup phase state
  const [allValidNotes, setAllValidNotes] = useState<DueNoteWithDeck[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCount>({ struggling: 0, overdue: 0, due: 0, new: 0 });
  const [totalCount, setTotalCount] = useState(0);
  const [skippedEmpty, setSkippedEmpty] = useState(0);

  // AI prioritization state
  const [aiLoading, setAiLoading] = useState(false);

  // Static fallback: interleaved list sorted by priority with new-card bias
  const [staticOrder, setStaticOrder] = useState<DueNoteWithDeck[]>([]);

  // Review phase state
  const [dueNotes, setDueNotes] = useState<DueNoteWithDeck[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);

  // End session (two-tap confirm)
  const [confirmQuit, setConfirmQuit] = useState(false);

  // Hint state
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);

  // Deep Review state
  const [deepReviewLoading, setDeepReviewLoading] = useState(false);
  const [deepReviewResult, setDeepReviewResult] = useState<DeepReviewResult | null>(null);
  const [deepReviewError, setDeepReviewError] = useState<string | null>(null);
  const [deepReviewOpen, setDeepReviewOpen] = useState(false);

  // Load and categorize notes on mount (no AI call — that happens on Start)
  const loadAndScoreNotes = useCallback(async () => {
    setLoading(true);
    const notes = await window.api.getDueNotesForPath(pathPrefix);
    const valid = notes.filter(
      (n) => n.note.front.trim() !== "" && n.note.back.trim() !== "",
    );
    setSkippedEmpty(notes.length - valid.length);
    setAllValidNotes(valid);

    const { scored, counts } = categorizeNotes(valid);
    setCategoryCounts(counts);

    // Build static order with new-card bias interleaving
    const interleaved = interleaveForVariety(scored);
    setStaticOrder(interleaved);

    // Default: up to 20 total cards
    setTotalCount(Math.min(20, valid.length));

    setLoading(false);
  }, [pathPrefix]);

  useEffect(() => {
    loadAndScoreNotes();
  }, [loadAndScoreNotes]);

  // Build session: try AI prioritization, fall back to static order
  const handleStartSession = async () => {
    if (totalCount === 0) return;
    setAiLoading(true);

    let selected: DueNoteWithDeck[];

    // Try AI prioritization
    if (allValidNotes.length > 3) {
      const cardMeta: CardMeta[] = allValidNotes.map((n) => ({
        id: n.note.id,
        deckId: n.deckId,
        easeFactor: n.note.review.easeFactor,
        interval: n.note.review.interval,
        repetitions: n.note.review.repetitions,
        dueDate: n.note.review.dueDate,
        lastReview: n.note.review.lastReview,
      }));
      try {
        const ids = await window.api.prioritizeCards(cardMeta, totalCount);
        const noteMap = new Map(allValidNotes.map((n) => [n.note.id, n]));
        const aiSelected: DueNoteWithDeck[] = [];
        for (const id of ids) {
          if (aiSelected.length >= totalCount) break;
          const note = noteMap.get(id);
          if (note) aiSelected.push(note);
        }
        // If AI returned enough cards, use them; otherwise pad with static order
        if (aiSelected.length >= totalCount) {
          selected = aiSelected;
        } else {
          const usedIds = new Set(aiSelected.map((n) => n.note.id));
          const remaining = staticOrder.filter((n) => !usedIds.has(n.note.id));
          selected = [...aiSelected, ...remaining].slice(0, totalCount);
        }
      } catch {
        // Silent fallback to static order
        selected = staticOrder.slice(0, totalCount);
      }
    } else {
      selected = staticOrder.slice(0, totalCount);
    }

    setAiLoading(false);
    setDueNotes(selected);
    setCurrentIndex(0);
    setReviewed(0);
    setPhase("reviewing");
  };

  const current = dueNotes[currentIndex];

  const handleSubmitAnswer = async () => {
    if (!current || grading) return;
    setGrading(true);
    setShowBack(true);
    try {
      const result = await window.api.gradeAnswer(
        current.deckId,
        current.note.id,
        userAnswer
      );
      setGradeResult(result);
    } catch {
      setGradeResult({
        score: 0,
        feedback: "Failed to grade answer. Check Ollama connection.",
      });
    }
    setGrading(false);
  };

  const handleNext = async (overrideScore?: number) => {
    if (!current) return;
    const score =
      overrideScore !== undefined ? overrideScore : (gradeResult?.score ?? 0);
    await window.api.updateReview(current.deckId, current.note.id, score);
    setReviewed((r) => r + 1);
    setUserAnswer("");
    setGradeResult(null);
    setShowBack(false);
    setHint(null);
    setHintLoading(false);
    setHintError(null);
    setDeepReviewResult(null);
    setDeepReviewError(null);
    setDeepReviewOpen(false);
    if (currentIndex + 1 < dueNotes.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      setPhase("complete");
    }
  };

  const handleDeepReview = async () => {
    if (!current) return;
    if (deepReviewOpen) {
      setDeepReviewOpen(false);
      return;
    }
    setDeepReviewOpen(true);
    if (deepReviewResult) return;
    setDeepReviewLoading(true);
    setDeepReviewError(null);
    try {
      const result = await window.api.deepReview(
        current.note.front,
        current.note.back,
        userAnswer,
      );
      setDeepReviewResult(result);
    } catch {
      setDeepReviewError("Deep Review failed. Check your AI connection.");
    }
    setDeepReviewLoading(false);
  };

  const handleGetHint = async () => {
    if (!current || hintLoading || hint) return;
    setHintLoading(true);
    setHintError(null);
    try {
      const result = await window.api.generateHint(
        current.note.front,
        current.note.back,
      );
      setHint(result.hint);
    } catch {
      setHintError("Failed to generate hint. Check your AI connection.");
    }
    setHintLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !gradeResult && !grading) {
      e.preventDefault();
      handleSubmitAnswer();
    }
  };

  const handleQuit = () => {
    if (reviewed === 0) {
      onFinish();
      return;
    }
    if (!confirmQuit) {
      setConfirmQuit(true);
      return;
    }
    onFinish();
  };

  // ── Loading spinner ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor: "var(--border)",
            borderTopColor: "var(--accent)",
          }}
        />
      </div>
    );
  }

  // ── Phase: Setup ──

  if (phase === "setup") {
    const totalDue = allValidNotes.length;

    if (totalDue === 0) {
      return (
        <div
          className="text-center py-16 rounded-lg"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <h2 className="text-2xl font-bold mb-3">No Cards Due</h2>
          <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
            All caught up! Come back later for more reviews.
          </p>
          {skippedEmpty > 0 && (
            <p
              className="text-xs mb-4"
              style={{ color: "var(--warning)" }}
            >
              {skippedEmpty} card{skippedEmpty === 1 ? " was" : "s were"} skipped due to empty front or back.
            </p>
          )}
          <button
            onClick={onFinish}
            className="px-6 py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "white",
              border: "none",
            }}
          >
            Back to Deck
          </button>
        </div>
      );
    }

    const categories: CardCategory[] = ["struggling", "overdue", "due", "new"];

    return (
      <div className="max-w-2xl mx-auto">
        {/* Breadcrumbs */}
        <div className="mb-4">
          <div className="breadcrumbs mb-2">
            {getBreadcrumbs(pathPrefix).map((bc, i, arr) => (
              <span key={bc.fullPath} className="flex items-center gap-1">
                {i > 0 && <span className="breadcrumb-sep">/</span>}
                <span
                  className={`breadcrumb-item ${i === arr.length - 1 ? "active" : ""}`}
                  style={{ cursor: "default" }}
                >
                  {bc.name}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Skipped empty warning */}
        {skippedEmpty > 0 && (
          <div
            className="mb-4 px-3 py-2 rounded-lg text-xs"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--warning)",
            }}
          >
            {skippedEmpty} card{skippedEmpty === 1 ? "" : "s"} with empty front/back excluded.
          </div>
        )}

        <div
          className="rounded-2xl p-10"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-2xl font-bold">Review Session</h2>
          </div>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            AI will assess and pick the optimal card mix when you start
          </p>

          {/* Category breakdown */}
          <div className="space-y-3 mb-8">
            {categories.map((cat) => {
              const count = categoryCounts[cat];
              if (count === 0) return null;
              const { label, color } = CATEGORY_CONFIG[cat];
              const pct = totalDue > 0 ? (count / totalDue) * 100 : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm flex-1" style={{ color: "var(--text-secondary)" }}>
                    {label}
                  </span>
                  <span className="text-sm font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {count}
                  </span>
                  <div
                    className="w-32 h-1.5 rounded-full overflow-hidden flex-shrink-0"
                    style={{ backgroundColor: "var(--border)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ backgroundColor: color, width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div
            className="mb-8"
            style={{ borderTop: "1px solid var(--border)" }}
          />

          {/* Session size picker — single slider */}
          <div className="space-y-4 mb-4">
            <CountStepper
              label="Cards to study"
              value={totalCount}
              max={allValidNotes.length}
              onChange={setTotalCount}
            />
          </div>

          {/* Info text */}
          <p className="text-xs mb-8 tabular-nums" style={{ color: "var(--text-muted)" }}>
            AI will select the optimal mix of new and review cards
          </p>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={onFinish}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm cursor-pointer"
              style={{
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              Back
            </button>
            <button
              onClick={handleStartSession}
              disabled={totalCount === 0 || aiLoading}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
                border: "none",
              }}
            >
              {aiLoading ? (
                <>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
                    style={{
                      borderColor: "rgba(255,255,255,0.3)",
                      borderTopColor: "white",
                    }}
                  />
                  AI is assessing...
                </>
              ) : (
                "Start Session"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: Complete ──

  if (phase === "complete") {
    return (
      <div
        className="text-center py-16 rounded-lg"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <h2 className="text-2xl font-bold mb-3">Session Complete!</h2>
        <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
          You reviewed {reviewed} card{reviewed === 1 ? "" : "s"}.
        </p>
        {skippedEmpty > 0 && (
          <p
            className="text-xs mb-4"
            style={{ color: "var(--warning)" }}
          >
            {skippedEmpty} card{skippedEmpty === 1 ? " was" : "s were"} skipped due to empty front or back.
          </p>
        )}
        <button
          onClick={onFinish}
          className="px-6 py-2 rounded-lg text-sm font-medium cursor-pointer"
          style={{
            backgroundColor: "var(--accent)",
            color: "white",
            border: "none",
          }}
        >
          Back to Deck
        </button>
      </div>
    );
  }

  // ── Phase: Reviewing ──

  const sourceDeckDisplay = current!.deckName.split("::").pop();

  return (
    <div className="max-w-2xl mx-auto">
      {/* Warning about skipped empty cards */}
      {skippedEmpty > 0 && (
        <div
          className="mb-4 px-3 py-2 rounded-lg text-xs"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--warning)",
          }}
        >
          {skippedEmpty} card{skippedEmpty === 1 ? "" : "s"} with empty front/back skipped from this session.
        </div>
      )}

      {/* Header with path context */}
      <div className="mb-4">
        <div className="breadcrumbs mb-2">
          {getBreadcrumbs(pathPrefix).map((bc, i, arr) => (
            <span key={bc.fullPath} className="flex items-center gap-1">
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              <span
                className={`breadcrumb-item ${i === arr.length - 1 ? "active" : ""}`}
                style={{ cursor: "default" }}
              >
                {bc.name}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Card {currentIndex + 1} of {dueNotes.length}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            Reviewed: {reviewed}
          </span>
          <button
            onClick={handleQuit}
            onBlur={() => setConfirmQuit(false)}
            className="px-3 py-1 rounded-lg text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: confirmQuit ? "var(--danger)" : "var(--bg-card)",
              color: confirmQuit ? "white" : "var(--text-muted)",
              border: `1px solid ${confirmQuit ? "var(--danger)" : "var(--border)"}`,
              transition: "all 0.15s",
            }}
          >
            {confirmQuit ? `End? (${reviewed} saved)` : "End Session"}
          </button>
        </div>
      </div>
      <div
        className="w-full rounded-full mb-6"
        style={{ backgroundColor: "var(--border)", height: "2px" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            backgroundColor: "var(--accent)",
            width: `${((currentIndex + 1) / dueNotes.length) * 100}%`,
          }}
        />
      </div>

      {/* Card */}
      <div
        className="p-10 rounded-2xl mb-6"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Source deck indicator (when studying from parent) */}
        {current!.deckName !== pathPrefix && (
          <div className="mb-4">
            <span
              className="text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--bg-hover)",
                color: "var(--text-muted)",
              }}
            >
              {sourceDeckDisplay}
            </span>
          </div>
        )}

        {/* Question */}
        <div className="mb-6">
          <label
            className="block text-xs uppercase tracking-wider mb-2 font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Question
          </label>
          <div className="text-lg leading-relaxed">
            {current!.note.front.trim() ? (
              <MarkdownContent content={current!.note.front} />
            ) : (
              <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>(empty)</span>
            )}
          </div>
        </div>

        {/* Hint display */}
        {hint && !showBack && (
          <div
            className="mb-6 px-4 py-3 rounded-lg"
            style={{
              backgroundColor: "var(--accent-subtle)",
              border: "1px solid var(--border)",
            }}
          >
            <label
              className="block text-xs uppercase tracking-wider mb-1.5 font-medium"
              style={{ color: "var(--accent)" }}
            >
              Hint
            </label>
            <div className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              <MarkdownContent content={hint} />
            </div>
          </div>
        )}
        {hintError && !showBack && (
          <div
            className="mb-6 px-4 py-2 rounded-lg text-xs"
            style={{ color: "var(--danger)" }}
          >
            {hintError}
          </div>
        )}

        {/* Answer comparison — shown after submit */}
        {showBack && (
          <div
            className="pt-6"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            {userAnswer.trim() ? (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {/* User's answer */}
                <div>
                  <label
                    className="block text-xs uppercase tracking-wider mb-2 font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Your Answer
                  </label>
                  <div
                    className="text-sm leading-relaxed rounded-lg p-4"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <MarkdownContent content={userAnswer} />
                  </div>
                </div>
                {/* Correct answer */}
                <div>
                  <label
                    className="block text-xs uppercase tracking-wider mb-2 font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Correct Answer
                  </label>
                  <div
                    className="text-sm leading-relaxed rounded-lg p-4"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      color: "var(--success)",
                    }}
                  >
                    {current!.note.back.trim() ? (
                      <MarkdownContent content={current!.note.back} />
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>(empty)</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <label
                  className="block text-xs uppercase tracking-wider mb-2 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Correct Answer
                </label>
                <div
                  className="text-lg leading-relaxed"
                  style={{ color: "var(--success)" }}
                >
                  {current!.note.back.trim() ? (
                    <MarkdownContent content={current!.note.back} />
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>(empty)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User answer input */}
        {!showBack && (
          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-2 font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Your Answer
            </label>
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              autoFocus
              placeholder="Type your answer..."
              className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        )}
      </div>

      {/* Grading result */}
      {gradeResult && <GradingResult result={gradeResult} />}

      {/* Deep Review — shown after grading */}
      {showBack && gradeResult && !grading && (
        <div className="mb-4">
          {/* Toggle button */}
          <button
            onClick={handleDeepReview}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm cursor-pointer"
            style={{
              backgroundColor: deepReviewOpen ? "var(--accent-subtle)" : "var(--bg-card)",
              border: "1px solid var(--border)",
              color: deepReviewOpen ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            <span className="font-medium">Deep Review</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {deepReviewOpen ? (deepReviewLoading ? "Loading..." : "Hide") : "Explain with Wikipedia context"}
            </span>
          </button>

          {/* Panel */}
          {deepReviewOpen && (
            <div
              className="mt-1 rounded-lg p-4"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              {deepReviewLoading && (
                <div className="flex items-center gap-2 py-2">
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
                    style={{
                      borderColor: "var(--border)",
                      borderTopColor: "var(--accent)",
                    }}
                  />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Searching Wikipedia and generating explanation...
                  </span>
                </div>
              )}

              {deepReviewError && (
                <p className="text-sm" style={{ color: "var(--danger)" }}>
                  {deepReviewError}
                </p>
              )}

              {deepReviewResult && !deepReviewLoading && (
                <div>
                  <div className="text-sm leading-relaxed mb-4">
                    <MarkdownContent content={deepReviewResult.explanation} />
                  </div>

                  {deepReviewResult.sources.length > 0 && (
                    <div>
                      <p
                        className="text-xs font-semibold uppercase tracking-wider mb-2"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Wikipedia Sources
                      </p>
                      <div className="space-y-2">
                        {deepReviewResult.sources.map((src, i) => (
                          <div
                            key={i}
                            className="rounded-lg p-3 text-xs"
                            style={{
                              backgroundColor: "var(--bg-secondary)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium"
                              style={{ color: "var(--accent)", textDecoration: "underline" }}
                            >
                              {src.title}
                            </a>
                            <p
                              className="mt-1 line-clamp-3"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {src.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-center gap-3">
        {!showBack && !grading && (
          <>
            <button
              onClick={handleSubmitAnswer}
              disabled={!userAnswer.trim()}
              className="px-6 py-2.5 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
                border: "none",
              }}
            >
              Submit Answer
            </button>
            <button
              onClick={handleGetHint}
              disabled={hintLoading || !!hint}
              className="px-5 py-2.5 rounded-lg text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                backgroundColor: "var(--bg-card)",
                color: hint ? "var(--accent)" : "var(--text-secondary)",
                border: `1px solid ${hint ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {hintLoading ? (
                <>
                  <div
                    className="w-3.5 h-3.5 border-2 rounded-full animate-spin flex-shrink-0"
                    style={{
                      borderColor: "var(--border)",
                      borderTopColor: "var(--accent)",
                    }}
                  />
                  Thinking...
                </>
              ) : hint ? (
                "Hint Given"
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Get Hint
                </>
              )}
            </button>
            <button
              onClick={() => {
                setShowBack(true);
                setGradeResult({
                  score: 0,
                  feedback: "Skipped - no answer provided.",
                });
              }}
              className="px-6 py-2.5 rounded-lg text-sm cursor-pointer"
              style={{
                backgroundColor: "var(--bg-card)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              Show Answer
            </button>
          </>
        )}

        {grading && (
          <div className="flex items-center gap-2 px-6 py-2.5">
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--border)",
                borderTopColor: "var(--accent)",
              }}
            />
            <span style={{ color: "var(--text-muted)" }}>
              AI is grading your answer...
            </span>
          </div>
        )}

        {showBack && !grading && gradeResult && (
          <div className="flex flex-col items-center gap-3 w-full">
            <button
              onClick={() => handleNext()}
              className="px-6 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
                border: "none",
              }}
            >
              Next Card (Accept AI Score: {gradeResult.score}/4)
            </button>

            <div className="flex items-center gap-2">
              <span
                className="text-xs mr-1"
                style={{ color: "var(--text-muted)" }}
              >
                Override:
              </span>
              {[0, 1, 2, 3, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => handleNext(s)}
                  className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer score-${s}`}
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
