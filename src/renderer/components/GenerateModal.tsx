import { useState, useRef, useEffect } from "react";
import type { GeneratedCard } from "../types/index.js";

interface Props {
  deckId: string;
  onAdded: () => void;
  onClose: () => void;
}

type Phase = "input" | "generating" | "preview" | "adding" | "done";

export default function GenerateModal({ deckId, onAdded, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("input");
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState(10);
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [addedCount, setAddedCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleGenerate = async () => {
    if (!notes.trim()) {
      setError("Paste some notes or text first.");
      return;
    }
    setError("");
    setPhase("generating");

    try {
      const generated = await window.api.generateCards(notes.trim(), count);
      if (!generated || generated.length === 0) {
        setError("AI returned no cards. Try adding more detailed notes.");
        setPhase("input");
        return;
      }
      setCards(generated);
      // Select all by default
      setSelected(new Set(generated.map((_, i) => i)));
      setPhase("preview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate cards. Check your AI settings.",
      );
      setPhase("input");
    }
  };

  const handleAddSelected = async () => {
    const toAdd = cards.filter((_, i) => selected.has(i));
    if (toAdd.length === 0) {
      setError("Select at least one card to add.");
      return;
    }
    setError("");
    setPhase("adding");

    let added = 0;
    for (const card of toAdd) {
      const result = await window.api.addNote(deckId, card.front, card.back, []);
      if (result) added++;
    }

    setAddedCount(added);
    setPhase("done");
  };

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === cards.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(cards.map((_, i) => i)));
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{
        backgroundColor: "var(--overlay-bg)",
        backdropFilter: "var(--overlay-blur)",
        WebkitBackdropFilter: "var(--overlay-blur)",
      }}
      onClick={phase === "generating" || phase === "adding" ? undefined : onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-7 pt-6 pb-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <h2 className="text-lg font-bold">Generate Cards from Notes</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {phase === "input" && "Paste text or notes and let AI create flashcard pairs."}
              {phase === "generating" && "AI is reading your notes…"}
              {phase === "preview" && `${cards.length} cards generated — select which to add.`}
              {phase === "adding" && "Adding cards to deck…"}
              {phase === "done" && `${addedCount} card${addedCount === 1 ? "" : "s"} added successfully.`}
            </p>
          </div>
          {phase !== "generating" && phase !== "adding" && (
            <button
              onClick={onClose}
              className="text-lg leading-none cursor-pointer"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "20px",
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-7 py-5">

          {/* ── Input phase ── */}
          {(phase === "input" || phase === "generating") && (
            <div className="space-y-4">
              {/* Notes textarea */}
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Your notes or text
                </label>
                <textarea
                  ref={textareaRef}
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    if (error) setError("");
                  }}
                  disabled={phase === "generating"}
                  rows={12}
                  placeholder={`Paste your notes here. For example:\n\n- The mitochondria is the powerhouse of the cell\n- ATP synthesis occurs through oxidative phosphorylation\n- The Krebs cycle produces NADH and FADH2\n\nThe more detail you provide, the better the cards.`}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    lineHeight: "1.6",
                    opacity: phase === "generating" ? 0.5 : 1,
                  }}
                />
              </div>

              {/* Card count slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    className="text-xs font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Number of cards to generate
                  </label>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {count}
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={30}
                  step={1}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  disabled={phase === "generating"}
                  className="w-full"
                  style={{ accentColor: "var(--accent)" }}
                />
                <div
                  className="flex justify-between text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span>3</span>
                  <span>30</span>
                </div>
              </div>

              {error && (
                <p className="text-xs font-medium" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              )}
            </div>
          )}

          {/* ── Generating spinner ── */}
          {phase === "generating" && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div
                className="w-10 h-10 border-2 rounded-full animate-spin"
                style={{
                  borderColor: "var(--border)",
                  borderTopColor: "var(--accent)",
                }}
              />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Generating {count} cards…
              </p>
            </div>
          )}

          {/* ── Preview phase ── */}
          {phase === "preview" && (
            <div className="space-y-3">
              {/* Select all toggle */}
              <div className="flex items-center justify-between">
                <button
                  onClick={toggleAll}
                  className="text-xs cursor-pointer"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    padding: 0,
                  }}
                >
                  {selected.size === cards.length ? "Deselect all" : "Select all"}
                </button>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {selected.size} of {cards.length} selected
                </span>
              </div>

              {/* Card list */}
              <div className="space-y-2">
                {cards.map((card, idx) => {
                  const isSelected = selected.has(idx);
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-lg cursor-pointer"
                      style={{
                        backgroundColor: isSelected
                          ? "var(--accent-subtle)"
                          : "var(--bg-card)",
                        border: isSelected
                          ? "1px solid var(--accent)"
                          : "1px solid var(--border)",
                      }}
                      onClick={() => toggleSelect(idx)}
                    >
                      {/* Checkbox */}
                      <div
                        className="shrink-0 mt-0.5 flex items-center justify-center rounded"
                        style={{
                          width: "16px",
                          height: "16px",
                          backgroundColor: isSelected ? "var(--accent)" : "transparent",
                          border: isSelected
                            ? "2px solid var(--accent)"
                            : "2px solid var(--border-hover)",
                          color: "white",
                          fontSize: "10px",
                          lineHeight: 1,
                        }}
                      >
                        {isSelected && "✓"}
                      </div>

                      {/* Card content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">
                          {card.front}
                        </p>
                        <p
                          className="text-xs mt-1 leading-snug"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {card.back}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && (
                <p className="text-xs font-medium" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              )}
            </div>
          )}

          {/* ── Adding spinner ── */}
          {phase === "adding" && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div
                className="w-10 h-10 border-2 rounded-full animate-spin"
                style={{
                  borderColor: "var(--border)",
                  borderTopColor: "var(--accent)",
                }}
              />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Adding {selected.size} card{selected.size === 1 ? "" : "s"} to deck…
              </p>
            </div>
          )}

          {/* ── Done ── */}
          {phase === "done" && (
            <div className="text-center py-8">
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
                style={{ backgroundColor: "var(--accent-subtle)" }}
              >
                <span style={{ fontSize: "24px", color: "var(--accent)" }}>✓</span>
              </div>
              <h3 className="text-base font-semibold mb-1">Cards added!</h3>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {addedCount} card{addedCount === 1 ? "" : "s"} added to your deck.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex gap-2 px-7 py-4 shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {phase === "input" && (
            <>
              <button
                onClick={handleGenerate}
                disabled={!notes.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "white",
                  border: "none",
                }}
              >
                Generate {count} Cards
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg text-sm cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  border: "none",
                }}
              >
                Cancel
              </button>
            </>
          )}

          {phase === "preview" && (
            <>
              <button
                onClick={handleAddSelected}
                disabled={selected.size === 0}
                className="px-5 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "white",
                  border: "none",
                }}
              >
                Add {selected.size} Selected Card{selected.size === 1 ? "" : "s"}
              </button>
              <button
                onClick={() => {
                  setPhase("input");
                  setCards([]);
                  setSelected(new Set());
                  setError("");
                }}
                className="px-5 py-2 rounded-lg text-sm cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  border: "none",
                }}
              >
                Re-generate
              </button>
            </>
          )}

          {phase === "done" && (
            <button
              onClick={onAdded}
              className="px-5 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
                border: "none",
              }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
