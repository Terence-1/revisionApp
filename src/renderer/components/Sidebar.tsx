import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { DeckTreeNode, OllamaStatus } from "../types/index.js";
import { buildDeckTree, isDescendantOrSelf } from "../utils/deckTree.js";
import ImportModal from "./ImportModal.js";

interface Props {
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  onSelectDeckId: (deckId: string, path: string) => void;
  onStartReview: (path: string) => void;
  onToggleSettings: () => void;
  isSettingsOpen: boolean;
  refreshKey: number;
  ollamaStatus: OllamaStatus | null;
}

type DropPosition = "above" | "inside" | "below";

interface DragState {
  sourcePath: string;
  sourceDeckId: string;
}

interface DropTarget {
  path: string;
  position: DropPosition;
}

/**
 * Collect all visible node paths (respecting expanded state) in render order.
 * Used for keyboard navigation.
 */
function getVisiblePaths(
  nodes: DeckTreeNode[],
  expanded: Set<string>
): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    result.push(node.fullPath);
    if (node.children.length > 0 && expanded.has(node.fullPath)) {
      result.push(...getVisiblePaths(node.children, expanded));
    }
  }
  return result;
}

/**
 * Get the parent path of a :: separated path, or null if root-level.
 */
function getParentPath(fullPath: string): string | null {
  const idx = fullPath.lastIndexOf("::");
  return idx === -1 ? null : fullPath.substring(0, idx);
}

/**
 * Compute the new deck name after a drag-and-drop move.
 */
function computeNewPath(
  sourcePath: string,
  targetPath: string,
  position: DropPosition
): string {
  const sourceName = sourcePath.includes("::")
    ? sourcePath.substring(sourcePath.lastIndexOf("::") + 2)
    : sourcePath;

  if (position === "inside") {
    return targetPath + "::" + sourceName;
  }
  const targetParent = getParentPath(targetPath);
  return targetParent ? targetParent + "::" + sourceName : sourceName;
}

export default function Sidebar({
  selectedPath,
  onSelectPath,
  onSelectDeckId,
  onStartReview,
  onToggleSettings,
  isSettingsOpen,
  refreshKey,
  ollamaStatus,
}: Props) {
  const [tree, setTree] = useState<DeckTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("sidebar-expanded");
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [loading, setLoading] = useState(true);

  // Drag-and-drop state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Keyboard navigation state
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const allDecks = await window.api.getDecks();
      const statsMap: Record<string, import("../types/index.js").DeckStats> = {};
      for (const deck of allDecks) {
        statsMap[deck.id] = await window.api.getDeckStats(deck.id);
      }
      const roots = buildDeckTree(allDecks, statsMap);
      setTree(roots);
    } catch (err) {
      console.error("Failed to load deck tree:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree, refreshKey]);

  // Persist expanded state
  useEffect(() => {
    localStorage.setItem(
      "sidebar-expanded",
      JSON.stringify([...expanded])
    );
  }, [expanded]);

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  // Compute visible paths for keyboard navigation
  const visiblePaths = useMemo(
    () => getVisiblePaths(tree, expanded),
    [tree, expanded]
  );

  // Scroll focused node into view
  useEffect(() => {
    if (focusedPath) {
      const el = nodeRefs.current.get(focusedPath);
      if (el) {
        el.scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedPath]);

  const toggleExpand = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return;
    const name = newDeckName.trim();
    await window.api.createDeck(name);
    setNewDeckName("");
    setShowCreate(false);
    const segments = name.split("::");
    if (segments.length > 1) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (let i = 1; i < segments.length; i++) {
          next.add(segments.slice(0, i).join("::"));
        }
        return next;
      });
    }
    loadTree();
  };

  const handleImportDone = () => {
    setShowImport(false);
    loadTree();
  };

  // ── Drag-and-drop handlers ──

  const handleDragStart = (
    e: React.DragEvent,
    node: DeckTreeNode
  ) => {
    if (!node.deck) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.fullPath);
    setDragState({
      sourcePath: node.fullPath,
      sourceDeckId: node.deck.id,
    });
  };

  const handleDragOver = (
    e: React.DragEvent,
    node: DeckTreeNode
  ) => {
    if (!dragState) return;

    e.preventDefault();
    e.stopPropagation();

    if (dragState.sourcePath === node.fullPath) {
      e.dataTransfer.dropEffect = "none";
      setDropTarget(null);
      return;
    }

    if (isDescendantOrSelf(node.fullPath, dragState.sourcePath)) {
      e.dataTransfer.dropEffect = "none";
      setDropTarget(null);
      return;
    }

    e.dataTransfer.dropEffect = "move";

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: DropPosition;
    if (node.children.length > 0 || !node.deck) {
      if (y < height * 0.25) {
        position = "above";
      } else if (y > height * 0.75) {
        position = "below";
      } else {
        position = "inside";
      }
    } else {
      if (y < height * 0.5) {
        position = "above";
      } else {
        position = "below";
      }
    }

    setDropTarget({ path: node.fullPath, position });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    setDropTarget(null);
  };

  const handleDrop = async (
    e: React.DragEvent,
    targetNode: DeckTreeNode
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragState || !dropTarget) {
      setDragState(null);
      setDropTarget(null);
      return;
    }

    const newPath = computeNewPath(
      dragState.sourcePath,
      targetNode.fullPath,
      dropTarget.position
    );

    if (newPath !== dragState.sourcePath) {
      try {
        await window.api.moveDeck(dragState.sourceDeckId, newPath);
        const newParent = getParentPath(newPath);
        if (newParent) {
          setExpanded((prev) => {
            const next = new Set(prev);
            const segments = newPath.split("::");
            for (let i = 1; i < segments.length; i++) {
              next.add(segments.slice(0, i).join("::"));
            }
            return next;
          });
        }
        loadTree();
      } catch (err) {
        console.error("Failed to move deck:", err);
      }
    }

    setDragState(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDropTarget(null);
  };

  // ── Sidebar-level drop zone (drop to root) ──

  const handleTreeDragOver = (e: React.DragEvent) => {
    if (!dragState) return;
    const target = e.target as HTMLElement;
    if (target === treeContainerRef.current) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleTreeDrop = async (e: React.DragEvent) => {
    if (!dragState) return;
    const target = e.target as HTMLElement;
    if (target !== treeContainerRef.current) return;

    e.preventDefault();
    const sourceName = dragState.sourcePath.includes("::")
      ? dragState.sourcePath.substring(
          dragState.sourcePath.lastIndexOf("::") + 2
        )
      : dragState.sourcePath;

    if (sourceName !== dragState.sourcePath) {
      try {
        await window.api.moveDeck(dragState.sourceDeckId, sourceName);
        loadTree();
      } catch (err) {
        console.error("Failed to move deck to root:", err);
      }
    }

    setDragState(null);
    setDropTarget(null);
  };

  // ── Keyboard navigation ──

  const handleTreeKeyDown = (e: React.KeyboardEvent) => {
    if (visiblePaths.length === 0) return;

    const currentIndex = focusedPath
      ? visiblePaths.indexOf(focusedPath)
      : -1;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const nextIndex =
          currentIndex < visiblePaths.length - 1 ? currentIndex + 1 : 0;
        setFocusedPath(visiblePaths[nextIndex]!);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prevIndex =
          currentIndex > 0
            ? currentIndex - 1
            : visiblePaths.length - 1;
        setFocusedPath(visiblePaths[prevIndex]!);
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        if (!focusedPath) break;
        if (!expanded.has(focusedPath)) {
          const hasChildren = visiblePaths.some(
            (p) =>
              p !== focusedPath &&
              p.startsWith(focusedPath + "::")
          ) || tree.some((root) => {
            const find = (node: DeckTreeNode): boolean => {
              if (node.fullPath === focusedPath) {
                return node.children.length > 0;
              }
              return node.children.some(find);
            };
            return find(root);
          });
          if (hasChildren) {
            setExpanded((prev) => new Set([...prev, focusedPath]));
          }
        } else {
          const childIndex = currentIndex + 1;
          if (
            childIndex < visiblePaths.length &&
            visiblePaths[childIndex]!.startsWith(focusedPath + "::")
          ) {
            setFocusedPath(visiblePaths[childIndex]!);
          }
        }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (!focusedPath) break;
        if (expanded.has(focusedPath)) {
          setExpanded((prev) => {
            const next = new Set(prev);
            next.delete(focusedPath);
            return next;
          });
        } else {
          const parent = getParentPath(focusedPath);
          if (parent && visiblePaths.includes(parent)) {
            setFocusedPath(parent);
          }
        }
        break;
      }
      case "Enter": {
        e.preventDefault();
        if (!focusedPath) break;
        const focusedNode = findNodeInTree(tree, focusedPath);
        if (focusedNode) {
          if (focusedNode.children.length === 0 && focusedNode.deck) {
            onSelectDeckId(focusedNode.deck.id, focusedNode.fullPath);
          } else {
            onSelectPath(focusedNode.fullPath);
          }
        }
        break;
      }
      case " ": {
        e.preventDefault();
        if (!focusedPath) break;
        toggleExpand(focusedPath);
        break;
      }
      case "Home": {
        e.preventDefault();
        if (visiblePaths.length > 0) {
          setFocusedPath(visiblePaths[0]!);
        }
        break;
      }
      case "End": {
        e.preventDefault();
        if (visiblePaths.length > 0) {
          setFocusedPath(visiblePaths[visiblePaths.length - 1]!);
        }
        break;
      }
    }
  };

  function findNodeInTree(
    nodes: DeckTreeNode[],
    path: string
  ): DeckTreeNode | null {
    for (const node of nodes) {
      if (node.fullPath === path) return node;
      const found = findNodeInTree(node.children, path);
      if (found) return found;
    }
    return null;
  }

  // ── Rendering ──

  const renderNode = (node: DeckTreeNode, depth: number) => {
    const isExpanded = expanded.has(node.fullPath);
    const isSelected = selectedPath === node.fullPath;
    const isFocused = focusedPath === node.fullPath;
    const hasChildren = node.children.length > 0;
    const isDragging =
      dragState !== null && dragState.sourcePath === node.fullPath;
    const isDropTarget = dropTarget?.path === node.fullPath;

    let dropIndicatorClass = "";
    if (isDropTarget && dropTarget) {
      dropIndicatorClass = `sidebar-drop-${dropTarget.position}`;
    }

    return (
      <div key={node.fullPath}>
        <div
          ref={(el) => {
            if (el) {
              nodeRefs.current.set(node.fullPath, el);
            } else {
              nodeRefs.current.delete(node.fullPath);
            }
          }}
          className={`sidebar-node ${isDragging ? "sidebar-node-dragging" : ""} ${dropIndicatorClass} ${isFocused ? "sidebar-node-focused" : ""}`}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={isSelected}
          tabIndex={isFocused ? 0 : -1}
          style={{
            paddingLeft: `${10 + depth * 14}px`,
            backgroundColor: isSelected
              ? "var(--accent-subtle)"
              : "transparent",
            borderRadius: isSelected ? "6px" : undefined,
            marginLeft: isSelected ? "4px" : undefined,
            marginRight: isSelected ? "4px" : undefined,
          }}
          onClick={() => {
            setFocusedPath(node.fullPath);
            if (node.children.length === 0 && node.deck) {
              onSelectDeckId(node.deck.id, node.fullPath);
            } else {
              onSelectPath(node.fullPath);
            }
          }}
          draggable={!!node.deck}
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node)}
          onDragEnd={handleDragEnd}
        >
          {/* Expand/collapse toggle */}
          <button
            className="sidebar-chevron"
            onClick={(e) => toggleExpand(node.fullPath, e)}
            tabIndex={-1}
            style={{
              visibility: hasChildren ? "visible" : "hidden",
              color: "var(--text-muted)",
            }}
          >
            {isExpanded ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            )}
          </button>

          {/* Folder/deck icon */}
          <span className="sidebar-icon" style={{ color: "var(--text-muted)" }}>
            {hasChildren ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="9" x2="15" y2="9" />
                <line x1="9" y1="13" x2="15" y2="13" />
              </svg>
            )}
          </span>

          {/* Name */}
          <span
            className="sidebar-name"
            style={{
              color: isSelected
                ? "var(--accent)"
                : node.deck
                  ? "var(--text-secondary)"
                  : "var(--text-muted)",
              fontWeight: isSelected ? 600 : 400,
              fontStyle: !node.deck ? "italic" : "normal",
            }}
          >
            {node.name}
          </span>

          {/* Due badge */}
          {node.dueCards > 0 && (
            <span
              className="sidebar-badge"
              style={{
                backgroundColor: "var(--accent)",
                fontSize: "10px",
                padding: "1px 5px",
                minWidth: "16px",
              }}
            >
              {node.dueCards}
            </span>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div role="group">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ── Ollama status rendering ──
  const ollamaColor = ollamaStatus?.connected
    ? ollamaStatus?.error
      ? "var(--warning)"
      : "var(--success)"
    : "var(--danger)";

  const ollamaLabel = ollamaStatus?.connected
    ? ollamaStatus?.error
      ? ollamaStatus.error
      : ollamaStatus.model
    : "Disconnected";

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Sidebar header */}
      <div className="sidebar-header">
        {!collapsed && (
          <>
            <span
              className="sidebar-title"
              style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "14px" }}
            >
              Cards
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setShowImport(true)}
                className="sidebar-action-btn"
                style={{ color: "var(--text-muted)" }}
                title="Import"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setShowCreate(true);
                  setNewDeckName(
                    selectedPath ? selectedPath + "::" : ""
                  );
                }}
                className="sidebar-action-btn"
                style={{ color: "var(--text-muted)" }}
                title="New Deck"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="sidebar-action-btn"
          style={{ color: "var(--text-muted)" }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>

      {/* Create deck inline form */}
      {showCreate && !collapsed && (
        <div className="sidebar-create-form">
          <input
            type="text"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateDeck();
              if (e.key === "Escape") {
                setShowCreate(false);
                setNewDeckName("");
              }
            }}
            placeholder="Deck name (use :: for nesting)"
            autoFocus
            className="sidebar-create-input"
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <div className="flex gap-1 mt-1">
            <button
              onClick={handleCreateDeck}
              className="sidebar-create-btn"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
              }}
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewDeckName("");
              }}
              className="sidebar-create-btn"
              style={{
                backgroundColor: "var(--bg-hover)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tree */}
      {!collapsed && (
        <div
          ref={treeContainerRef}
          className="sidebar-tree"
          role="tree"
          tabIndex={0}
          onKeyDown={handleTreeKeyDown}
          onFocus={() => {
            if (!focusedPath && visiblePaths.length > 0) {
              setFocusedPath(visiblePaths[0]!);
            }
          }}
          onDragOver={handleTreeDragOver}
          onDrop={handleTreeDrop}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{
                  borderColor: "var(--border)",
                  borderTopColor: "var(--accent)",
                }}
              />
            </div>
          ) : tree.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                No decks yet
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Create or import one to start
              </p>
            </div>
          ) : (
            tree.map((node) => renderNode(node, 0))
          )}
        </div>
      )}

      {/* Sidebar footer: settings + Ollama status */}
      <div className="sidebar-footer">
        {/* Settings gear */}
        <button
          onClick={onToggleSettings}
          className="sidebar-action-btn"
          style={{ color: isSettingsOpen ? "var(--accent)" : "var(--text-muted)" }}
          title="Settings"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        {/* Ollama status */}
        <div
          className="flex items-center gap-2"
          title={`Ollama: ${ollamaLabel}`}
          style={{ overflow: "hidden" }}
        >
          <div
            className="flex-shrink-0"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: ollamaColor,
            }}
          />
          {!collapsed && (
            <span
              className="text-xs truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {ollamaLabel}
            </span>
          )}
        </div>
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={handleImportDone}
        />
      )}
    </aside>
  );
}
