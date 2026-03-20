import { useState, useEffect, useRef, useCallback } from "react";
import type { SearchResult } from "../types/index.js";
import MarkdownContent from "./MarkdownContent.js";

interface Props {
  onSelectResult: (deckId: string, path: string) => void;
  onClose: () => void;
}

export default function GlobalSearch({ onSelectResult, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    try {
      const res = await window.api.searchAllDecks(q, 50);
      setResults(res);
      setHasSearched(true);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  };

  const handleSelectResult = (result: SearchResult) => {
    onSelectResult(result.deckId, result.deckName);
    onClose();
  };

  // Highlight matching text
  const highlightMatch = (text: string, maxLen = 120) => {
    const q = query.trim().toLowerCase();
    if (!q) return text.slice(0, maxLen);

    const lower = text.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) return text.slice(0, maxLen);

    // Show context around the match
    const start = Math.max(0, idx - 30);
    const end = Math.min(text.length, idx + q.length + 60);
    let slice = text.slice(start, end);
    if (start > 0) slice = "..." + slice;
    if (end < text.length) slice = slice + "...";

    return slice;
  };

  return (
    <div
      className="fixed inset-0 flex items-start justify-center z-50 pt-[10vh]"
      style={{
        backgroundColor: "var(--overlay-bg)",
        backdropFilter: "var(--overlay-blur)",
        WebkitBackdropFilter: "var(--overlay-blur)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--text-muted)", flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Search across all decks..."
            className="flex-1 text-sm outline-none bg-transparent"
            style={{ color: "var(--text-primary)" }}
          />
          {searching && (
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
              style={{
                borderColor: "var(--border)",
                borderTopColor: "var(--accent)",
              }}
            />
          )}
          <span
            className="text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: "var(--bg-hover)",
              color: "var(--text-muted)",
            }}
          >
            ESC
          </span>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
          {!hasSearched && !searching && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Search card fronts, backs, and tags across all your decks
              </p>
            </div>
          )}

          {hasSearched && results.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No cards found matching "{query}"
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div>
              <div
                className="px-5 py-2 text-xs"
                style={{
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {results.length} result{results.length === 1 ? "" : "s"}
              </div>
              {results.map((result, idx) => (
                <div
                  key={`${result.deckId}-${result.note.id}`}
                  onClick={() => handleSelectResult(result)}
                  className="px-5 py-3 cursor-pointer"
                  style={{
                    borderBottom:
                      idx < results.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  {/* Deck name */}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--accent-subtle)",
                        color: "var(--accent)",
                        fontSize: "10px",
                      }}
                    >
                      {result.deckName.split("::").pop()}
                    </span>
                    {result.deckName.includes("::") && (
                      <span
                        className="text-xs truncate"
                        style={{ color: "var(--text-muted)", fontSize: "10px" }}
                      >
                        {result.deckName}
                      </span>
                    )}
                  </div>

                  {/* Front */}
                  <div className="text-sm font-medium mb-0.5">
                    <MarkdownContent
                      content={highlightMatch(result.note.front)}
                      clampLines={2}
                    />
                  </div>

                  {/* Back */}
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <MarkdownContent
                      content={highlightMatch(result.note.back)}
                      clampLines={1}
                    />
                  </div>

                  {/* Tags */}
                  {result.note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.note.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--bg-hover)",
                            color: "var(--text-muted)",
                            fontSize: "10px",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
