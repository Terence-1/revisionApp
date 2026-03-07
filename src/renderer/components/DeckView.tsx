import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Deck, Note, DeckStats } from "../types/index.js";
import { getBreadcrumbs } from "../utils/deckTree.js";
import Stats from "./Stats.js";
import CardModal from "./CardModal.js";
import GenerateModal from "./GenerateModal.js";
import MarkdownContent from "./MarkdownContent.js";

interface Props {
  deckId: string;
  path: string;
  onNavigate: (path: string) => void;
  onBack: () => void;
  onStartReview: () => void;
  onDataChanged: () => void;
}

export default function DeckView({
  deckId,
  path,
  onNavigate,
  onBack,
  onStartReview,
  onDataChanged,
}: Props) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [stats, setStats] = useState<DeckStats | null>(null);

  // Search & filter state
  const [search, setSearch] = useState("");
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(
    new Set(),
  );

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const loadDeck = useCallback(async () => {
    const d = await window.api.getDeck(deckId);
    setDeck(d);
    const s = await window.api.getDeckStats(deckId);
    setStats(s);
  }, [deckId]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  // Collect all unique tags in this deck
  const allTags = useMemo(() => {
    if (!deck) return [];
    const set = new Set<string>();
    for (const note of deck.notes) {
      for (const t of note.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [deck]);

  // Filtered notes
  const filteredNotes = useMemo(() => {
    if (!deck) return [];
    let notes = deck.notes;

    // Text search (front + back)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      notes = notes.filter(
        (n) =>
          n.front.toLowerCase().includes(q) ||
          n.back.toLowerCase().includes(q),
      );
    }

    // Tag filters (AND — must have ALL active tags)
    if (activeTagFilters.size > 0) {
      notes = notes.filter((n) =>
        Array.from(activeTagFilters).every((t) => n.tags.includes(t)),
      );
    }

    return notes;
  }, [deck, search, activeTagFilters]);

  const handleDeleteCard = async (noteId: string) => {
    if (!confirm("Delete this card?")) return;
    await window.api.deleteNote(deckId, noteId);
    loadDeck();
    onDataChanged();
  };

  const openAdd = () => {
    setEditingNote(null);
    setModalOpen(true);
  };

  const openEdit = (note: Note) => {
    setEditingNote(note);
    setModalOpen(true);
  };

  const handleModalSaved = () => {
    loadDeck();
    onDataChanged();
  };

  const toggleTagFilter = (tag: string) => {
    setActiveTagFilters((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const handleExport = async (format: "json" | "apkg") => {
    setExportOpen(false);
    setExporting(true);
    try {
      const result = await window.api.exportDeck(deckId, format);
      if (!result.success && result.error !== "Cancelled") {
        alert(result.error ?? "Export failed.");
      }
    } catch {
      alert("Export failed unexpectedly.");
    }
    setExporting(false);
  };

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportOpen]);

  if (!deck) {
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

  const breadcrumbs = getBreadcrumbs(path);
  const isFiltering = search.trim() !== "" || activeTagFilters.size > 0;

  return (
    <div>
      {/* Breadcrumbs */}
      <div className="breadcrumbs mb-4">
        <button
          className="breadcrumb-item"
          onClick={() => onNavigate("")}
          style={{ color: "var(--text-muted)" }}
        >
          All Decks
        </button>
        {breadcrumbs.map((bc, i) => (
          <span key={bc.fullPath} className="flex items-center gap-1">
            <span className="breadcrumb-sep">/</span>
            <button
              className={`breadcrumb-item ${i === breadcrumbs.length - 1 ? "active" : ""}`}
              onClick={() => {
                if (i < breadcrumbs.length - 1) {
                  onNavigate(bc.fullPath);
                }
              }}
            >
              {bc.name}
            </button>
          </span>
        ))}
      </div>

      {/* Deck header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {deck.name.split("::").pop()}
          </h1>
          {deck.description && (
            <p
              className="text-sm mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              {deck.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={() => setGenerateOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            Generate
          </button>
          {/* Export dropdown */}
          <div className="relative inline-flex" ref={exportRef}>
            <button
              onClick={() => setExportOpen((o) => !o)}
              disabled={exporting || !deck || deck.notes.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {exporting ? "Exporting..." : "Export"}
            </button>
            {exportOpen && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg py-1 z-10"
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-card)",
                  minWidth: "200px",
                }}
              >
                <button
                  onClick={() => handleExport("json")}
                  className="w-full text-left px-4 py-2.5 text-sm cursor-pointer"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-primary)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  Export as JSON
                </button>
                <button
                  onClick={() => handleExport("apkg")}
                  className="w-full text-left px-4 py-2.5 text-sm cursor-pointer"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-primary)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  Export as Anki (.apkg)
                </button>
              </div>
            )}
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            + Add Card
          </button>
          {stats && stats.dueToday > 0 && (
            <button
              onClick={onStartReview}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
                border: "none",
              }}
            >
              Study ({stats.dueToday} due)
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && <Stats stats={stats} />}

      {/* Search + tag filters */}
      {deck.notes.length > 0 && (
        <div className="mb-4 space-y-3">
          {/* Search bar */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--text-muted)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const active = activeTagFilters.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTagFilter(tag)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-subtle)"
                        : "var(--bg-card)",
                      color: active
                        ? "var(--accent)"
                        : "var(--text-muted)",
                      border: active
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border)",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
              {activeTagFilters.size > 0 && (
                <button
                  onClick={() => setActiveTagFilters(new Set())}
                  className="px-2 py-1 text-xs cursor-pointer"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    textDecoration: "underline",
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Card list */}
      {deck.notes.length === 0 ? (
        <div
          className="text-center py-16 rounded-lg"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <p
            className="text-lg mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            No cards yet
          </p>
          <p
            className="text-sm mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Add cards to start studying
          </p>
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "white",
              border: "none",
            }}
          >
            + Add Card
          </button>
        </div>
      ) : (
        <div>
          {/* Card count */}
          <h3
            className="text-sm font-medium mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            {isFiltering
              ? `Showing ${filteredNotes.length} of ${deck.notes.length} cards`
              : `Cards (${deck.notes.length})`}
          </h3>

          {filteredNotes.length === 0 ? (
            <div
              className="text-center py-10 rounded-lg"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                No cards match your search
              </p>
            </div>
          ) : (
            <div
              className="rounded-lg overflow-hidden"
              style={{
                border: "1px solid var(--border)",
              }}
            >
              {filteredNotes.map((note, idx) => (
                <div
                  key={note.id}
                  className="note-row hover-reveal"
                  style={{
                    borderBottom:
                      idx < filteredNotes.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    {/* Front — markdown, 2-line clamp */}
                    <div className="text-sm font-medium">
                      <MarkdownContent
                        content={note.front.trim() || "*(empty)*"}
                        clampLines={2}
                      />
                    </div>
                    {/* Back — markdown, 2-line clamp */}
                    <div
                      className="text-xs mt-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <MarkdownContent
                        content={note.back.trim() || "*(empty)*"}
                        clampLines={2}
                      />
                    </div>
                    {/* Tags */}
                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "var(--accent-subtle)",
                              color: "var(--accent)",
                              fontSize: "10px",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right side: status + actions */}
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {!note.review || note.review.repetitions === 0
                        ? "New"
                        : `${note.review.interval}d`}
                    </span>
                    <button
                      onClick={() => openEdit(note)}
                      className="hover-reveal-target text-xs px-2 py-1 rounded cursor-pointer"
                      style={{
                        color: "var(--text-secondary)",
                        background: "none",
                        border: "none",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCard(note.id)}
                      className="hover-reveal-target text-xs px-2 py-1 rounded cursor-pointer"
                      style={{
                        color: "var(--danger)",
                        background: "none",
                        border: "none",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Card Modal */}
      {modalOpen && (
        <CardModal
          note={editingNote}
          deckId={deckId}
          allTags={allTags}
          onSaved={handleModalSaved}
          onClose={() => {
            setModalOpen(false);
            setEditingNote(null);
          }}
        />
      )}

      {/* Generate Modal */}
      {generateOpen && (
        <GenerateModal
          deckId={deckId}
          onAdded={() => {
            setGenerateOpen(false);
            loadDeck();
            onDataChanged();
          }}
          onClose={() => setGenerateOpen(false)}
        />
      )}
    </div>
  );
}
