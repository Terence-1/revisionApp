import { useState, useEffect, useRef, useCallback } from "react";
import type { Note } from "../types/index.js";
import MarkdownContent from "./MarkdownContent.js";
import TagChipInput from "./TagChipInput.js";

type Tab = "write" | "preview";

interface Props {
  /** null = add mode, Note = edit mode */
  note: Note | null;
  deckId: string;
  /** All unique tags in the deck — for autocomplete */
  allTags: string[];
  onSaved: () => void;
  onClose: () => void;
}

export default function CardModal({
  note,
  deckId,
  allTags,
  onSaved,
  onClose,
}: Props) {
  const isEdit = note !== null;

  const [front, setFront] = useState(note?.front ?? "");
  const [back, setBack] = useState(note?.back ?? "");
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [frontTab, setFrontTab] = useState<Tab>("write");
  const [backTab, setBackTab] = useState<Tab>("write");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const frontRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus front textarea on mount and after rapid-add reset
  useEffect(() => {
    frontRef.current?.focus();
  }, [justAdded]);

  const resetForm = useCallback(() => {
    setFront("");
    setBack("");
    setTags([]);
    setFrontTab("write");
    setBackTab("write");
    setError("");
    setJustAdded((j) => !j); // toggle to trigger focus effect
  }, []);

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) {
      setError(
        !front.trim() && !back.trim()
          ? "Both front and back are required."
          : !front.trim()
            ? "Front side cannot be empty."
            : "Back side cannot be empty.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        const result = await window.api.updateNote(
          deckId,
          note.id,
          front.trim(),
          back.trim(),
          tags,
        );
        if (!result) {
          setError("Failed to save card.");
          setSaving(false);
          return;
        }
        onSaved();
        onClose();
      } else {
        // Add mode — rapid entry: save, reset, stay open
        const result = await window.api.addNote(
          deckId,
          front.trim(),
          back.trim(),
          tags,
        );
        if (!result) {
          setError("Failed to add card.");
          setSaving(false);
          return;
        }
        onSaved();
        resetForm();
      }
    } catch {
      setError("An unexpected error occurred.");
    }
    setSaving(false);
  };

  // Keyboard: Escape to close, Ctrl+Enter to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front, back, tags]);

  const tabButton = (
    active: Tab,
    tab: Tab,
    label: string,
    setTab: (t: Tab) => void,
  ) => (
    <button
      type="button"
      onClick={() => setTab(tab)}
      className="px-3 py-1 text-xs font-medium rounded cursor-pointer"
      style={{
        backgroundColor: active === tab ? "var(--bg-hover)" : "transparent",
        color:
          active === tab ? "var(--text-primary)" : "var(--text-muted)",
        border: "none",
      }}
    >
      {label}
    </button>
  );

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
        className="w-full max-w-lg p-7 rounded-2xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">
            {isEdit ? "Edit Card" : "Add Cards"}
          </h2>
          <span
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {isEdit ? "Ctrl+Enter to save" : "Ctrl+Enter to add"}
          </span>
        </div>

        {/* Front field */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Front
            </label>
            <div className="flex gap-0.5">
              {tabButton(frontTab, "write", "Write", setFrontTab)}
              {tabButton(frontTab, "preview", "Preview", setFrontTab)}
            </div>
          </div>

          {frontTab === "write" ? (
            <textarea
              ref={frontRef}
              value={front}
              onChange={(e) => {
                setFront(e.target.value);
                if (error) setError("");
              }}
              rows={4}
              placeholder="Question or prompt (supports markdown)"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                fontFamily:
                  "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace",
                fontSize: "13px",
                lineHeight: "1.6",
              }}
            />
          ) : (
            <div
              className="px-3 py-2 rounded-lg min-h-[96px]"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {front.trim() ? (
                <MarkdownContent content={front} />
              ) : (
                <span
                  className="text-sm italic"
                  style={{ color: "var(--text-muted)" }}
                >
                  Nothing to preview
                </span>
              )}
            </div>
          )}
        </div>

        {/* Back field */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Back
            </label>
            <div className="flex gap-0.5">
              {tabButton(backTab, "write", "Write", setBackTab)}
              {tabButton(backTab, "preview", "Preview", setBackTab)}
            </div>
          </div>

          {backTab === "write" ? (
            <textarea
              value={back}
              onChange={(e) => {
                setBack(e.target.value);
                if (error) setError("");
              }}
              rows={4}
              placeholder="Answer or explanation (supports markdown)"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                fontFamily:
                  "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace",
                fontSize: "13px",
                lineHeight: "1.6",
              }}
            />
          ) : (
            <div
              className="px-3 py-2 rounded-lg min-h-[96px]"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {back.trim() ? (
                <MarkdownContent content={back} />
              ) : (
                <span
                  className="text-sm italic"
                  style={{ color: "var(--text-muted)" }}
                >
                  Nothing to preview
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="mb-5">
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            Tags
          </label>
          <TagChipInput
            tags={tags}
            onChange={setTags}
            suggestions={allTags}
          />
        </div>

        {/* Error */}
        {error && (
          <p
            className="text-xs font-medium mb-4"
            style={{ color: "var(--danger)" }}
          >
            {error}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: "var(--accent)",
              color: "white",
              border: "none",
            }}
          >
            {saving
              ? "Saving..."
              : isEdit
                ? "Save Changes"
                : "Add Card"}
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
            {isEdit ? "Cancel" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
