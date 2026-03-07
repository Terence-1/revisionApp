import { useState } from "react";
import type { ImportResult } from "../types/index.js";

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export default function ImportModal({ onClose, onImported }: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleImportJSON = async () => {
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const result = await window.api.importJSON();
      if (!result) {
        // Dialog was canceled
        setImporting(false);
        return;
      }
      if (result.error) {
        setError(result.error);
      } else if (result.decks.length === 0 && result.stats.imported === 0) {
        setError("No valid cards found in file. All cards were skipped.");
        if (result.stats.skipped > 0) {
          setImportResult(result);
        }
      } else {
        setImportResult(result);
        onImported();
      }
    } catch (err) {
      setError("Failed to import JSON file.");
    }
    setImporting(false);
  };

  const handleImportApkg = async () => {
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const result = await window.api.importApkg();
      if (!result) {
        // Dialog was canceled
        setImporting(false);
        return;
      }
      if (result.error) {
        setError(result.error);
      } else if (result.decks.length === 0 && result.stats.imported === 0) {
        setError("No valid cards found in package. All cards were skipped.");
        if (result.stats.skipped > 0) {
          setImportResult(result);
        }
      } else {
        setImportResult(result);
        onImported();
      }
    } catch (err) {
      setError("Failed to import .apkg file.");
    }
    setImporting(false);
  };

  // Show summary view after import completes (with or without errors)
  if (importResult) {
    const { stats, decks } = importResult;
    const hasSkips = stats.skipped > 0;

    return (
      <div
        className="fixed inset-0 flex items-center justify-center z-50"
        style={{
          backgroundColor: "var(--overlay-bg)",
          backdropFilter: "var(--overlay-blur)",
          WebkitBackdropFilter: "var(--overlay-blur)",
        }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-md p-7 rounded-2xl"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-card)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-bold mb-4">Import Summary</h2>

          {/* Error banner (shown when there was both an error and partial results) */}
          {error && (
            <div
              className="mb-4 p-3 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(248, 113, 113, 0.1)",
                color: "var(--danger)",
                border: "1px solid rgba(248, 113, 113, 0.2)",
              }}
            >
              {error}
            </div>
          )}

          {/* Success stats */}
          <div
            className="p-4 rounded-lg mb-4"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            {/* Decks created */}
            {decks.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium">
                  {decks.length} deck{decks.length === 1 ? "" : "s"} created
                </p>
                <div className="mt-1 space-y-1">
                  {decks.map((deck) => (
                    <p
                      key={deck.id}
                      className="text-xs truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {deck.name} ({deck.notes.length} card{deck.notes.length === 1 ? "" : "s"})
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Card counts */}
            <div className="flex gap-4 text-sm">
              <div>
                <span className="font-medium" style={{ color: "var(--success)" }}>
                  {stats.imported}
                </span>
                <span style={{ color: "var(--text-muted)" }}> imported</span>
              </div>
              {hasSkips && (
                <div>
                  <span className="font-medium" style={{ color: "var(--warning)" }}>
                    {stats.skipped}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}> skipped</span>
                </div>
              )}
              <div>
                <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                  {stats.totalProcessed}
                </span>
                <span style={{ color: "var(--text-muted)" }}> total</span>
              </div>
            </div>
          </div>

          {/* Skip reasons breakdown */}
          {hasSkips && (
            <div
              className="p-4 rounded-lg mb-4"
              style={{
                backgroundColor: "rgba(251, 191, 36, 0.05)",
                border: "1px solid rgba(251, 191, 36, 0.15)",
              }}
            >
              <p
                className="text-xs font-medium mb-2 uppercase tracking-wider"
                style={{ color: "var(--warning)" }}
              >
                Skipped cards
              </p>
              <div className="space-y-1">
                {stats.skipReasons.map((sr, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {sr.reason}
                    </p>
                    <span
                      className="text-xs font-medium shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {sr.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "white",
              border: "none",
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Default: import selection view
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{
        backgroundColor: "var(--overlay-bg)",
        backdropFilter: "var(--overlay-blur)",
        WebkitBackdropFilter: "var(--overlay-blur)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md p-7 rounded-2xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4">Import Flashcards</h2>

        {error && (
          <div
            className="mb-4 p-3 rounded-lg text-sm"
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.1)",
              color: "var(--danger)",
              border: "1px solid rgba(248, 113, 113, 0.2)",
            }}
          >
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* JSON import */}
          <button
            onClick={handleImportJSON}
            disabled={importing}
            className="w-full p-4 rounded-lg text-left cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            <h3 className="text-sm font-medium mb-1">JSON File</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Smart auto-detect: front/back, question/answer, term/definition,
              q/a, prompt/response, arrays of arrays, multi-deck, and more.
            </p>
          </button>

          {/* APKG import */}
          <button
            onClick={handleImportApkg}
            disabled={importing}
            className="w-full p-4 rounded-lg text-left cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            <h3 className="text-sm font-medium mb-1">Anki Package (.apkg)</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              All Anki note types: basic, basic + reversed, cloze deletions,
              and multi-field notes. Sub-decks are preserved.
            </p>
          </button>
        </div>

        {/* JSON format examples */}
        <div className="mt-4">
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            Accepted JSON formats (auto-detected):
          </p>
          <pre
            className="text-xs p-3 rounded-lg overflow-x-auto"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-secondary)",
            }}
          >
            {`// Standard:
{ "name": "Deck", "notes": [{ "front": "Q", "back": "A" }] }

// Quizlet-style:
[{ "term": "Mitosis", "definition": "Cell division" }]

// Array of arrays:
[["Capital of France?", "Paris"]]

// Any 2-field object is auto-detected`}
          </pre>
        </div>

        {importing && (
          <div className="flex items-center justify-center mt-4">
            <div
              className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--border)",
                borderTopColor: "var(--accent)",
              }}
            />
            <span className="ml-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Importing...
            </span>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-2 rounded-lg text-sm cursor-pointer"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
            border: "none",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
