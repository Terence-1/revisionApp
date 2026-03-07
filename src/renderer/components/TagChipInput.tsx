import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Existing tags in the deck — drives autocomplete suggestions */
  suggestions?: string[];
  placeholder?: string;
}

export default function TagChipInput({
  tags,
  onChange,
  suggestions = [],
  placeholder = "Add tag...",
}: Props) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions: match input prefix, exclude already-added tags
  const filtered = input.trim()
    ? suggestions.filter(
        (s) =>
          s.toLowerCase().startsWith(input.trim().toLowerCase()) &&
          !tags.includes(s),
      )
    : [];

  const addTag = useCallback(
    (tag: string) => {
      const t = tag.trim();
      if (!t || tags.includes(t)) return;
      onChange([...tags, t]);
      setInput("");
      setShowSuggestions(false);
      setHighlightIdx(-1);
    },
    [tags, onChange],
  );

  const removeTag = useCallback(
    (idx: number) => {
      onChange(tags.filter((_, i) => i !== idx));
    },
    [tags, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        addTag(filtered[highlightIdx]!);
      } else {
        addTag(input);
      }
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      removeTag(tags.length - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightIdx(-1);
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg min-h-[38px] cursor-text"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Tag chips */}
        {tags.map((tag, idx) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
            style={{
              backgroundColor: "var(--accent-subtle)",
              color: "var(--accent)",
              border: "1px solid transparent",
            }}
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(idx);
              }}
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm cursor-pointer"
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                fontSize: "11px",
                lineHeight: 1,
                padding: 0,
                opacity: 0.7,
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.opacity = "0.7";
              }}
            >
              ×
            </button>
          </span>
        ))}

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
            setHighlightIdx(-1);
          }}
          onFocus={() => {
            if (input.trim()) setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm"
          style={{
            color: "var(--text-primary)",
            border: "none",
            padding: 0,
          }}
        />
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && filtered.length > 0 && (
        <div
          className="absolute left-0 right-0 mt-1 py-1 rounded-lg z-10 max-h-40 overflow-y-auto"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {filtered.map((s, idx) => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm cursor-pointer"
              style={{
                background:
                  idx === highlightIdx
                    ? "var(--bg-hover)"
                    : "transparent",
                border: "none",
                color:
                  idx === highlightIdx
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
              }}
              onMouseEnter={() => setHighlightIdx(idx)}
              onClick={() => addTag(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
