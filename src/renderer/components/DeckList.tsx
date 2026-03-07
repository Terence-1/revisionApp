import { useState, useEffect, useCallback } from "react";
import type { DeckStats, DeckTreeNode } from "../types/index.js";
import { buildDeckTree, findNode, getBreadcrumbs } from "../utils/deckTree.js";

interface Props {
  pathPrefix?: string; // undefined = show all root-level nodes
  onSelectPath: (path: string) => void;
  onViewDeck: (deckId: string, path: string) => void;
  onStartReview: (path: string) => void;
  onDataChanged: () => void;
  refreshKey: number;
}

export default function DeckList({
  pathPrefix,
  onSelectPath,
  onViewDeck,
  onStartReview,
  onDataChanged,
  refreshKey,
}: Props) {
  const [tree, setTree] = useState<DeckTreeNode[]>([]);
  const [currentNode, setCurrentNode] = useState<DeckTreeNode | null>(null);
  const [aggregatedStats, setAggregatedStats] = useState<DeckStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allDecks = await window.api.getDecks();
      const statsMap: Record<string, DeckStats> = {};
      for (const deck of allDecks) {
        statsMap[deck.id] = await window.api.getDeckStats(deck.id);
      }
      const roots = buildDeckTree(allDecks, statsMap);
      setTree(roots);

      if (pathPrefix) {
        const node = findNode(roots, pathPrefix);
        setCurrentNode(node);
        const aStats = await window.api.getStatsForPath(pathPrefix);
        setAggregatedStats(aStats);
      } else {
        setCurrentNode(null);
        setAggregatedStats(null);
      }
    } catch (err) {
      console.error("Failed to load decks:", err);
      setError("Failed to load decks.");
    }
    setLoading(false);
  }, [pathPrefix]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  const handleDeleteNode = async (node: DeckTreeNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const hasChildren = node.children.length > 0;
    const msg = hasChildren
      ? `Delete "${node.name}" and all ${node.children.length} sub-deck(s)? This will remove all cards.`
      : `Delete "${node.name}" and all its cards?`;
    if (!confirm(msg)) return;

    await window.api.deleteByPath(node.fullPath);
    loadData();
    onDataChanged();
  };

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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p style={{ color: "var(--danger)" }}>{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 rounded-lg text-sm cursor-pointer"
          style={{
            backgroundColor: "var(--accent)",
            color: "white",
            border: "none",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const displayNodes: DeckTreeNode[] = pathPrefix && currentNode
    ? currentNode.children
    : tree;

  const breadcrumbs = pathPrefix ? getBreadcrumbs(pathPrefix) : [];

  return (
    <div>
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="breadcrumbs mb-4">
          <button
            className="breadcrumb-item"
            onClick={() => onSelectPath("")}
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
                    onSelectPath(bc.fullPath);
                  }
                }}
              >
                {bc.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {currentNode ? currentNode.name : "All Decks"}
          </h1>
          {currentNode && currentNode.deck?.description && (
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {currentNode.deck.description}
            </p>
          )}
        </div>
      </div>

      {/* Aggregated stats for current folder - condensed inline bar */}
      {currentNode && aggregatedStats && (
        <div
          className="flex items-center gap-6 mb-6 px-4 py-3 rounded-lg text-sm"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {aggregatedStats.totalCards}
            </span>
            <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>cards</span>
          </span>
          <span>
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {aggregatedStats.dueToday}
            </span>
            <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>due</span>
          </span>
          <span>
            <span className="font-semibold" style={{ color: "var(--info)" }}>
              {aggregatedStats.newCards}
            </span>
            <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>new</span>
          </span>
        </div>
      )}

      {/* Study button for folder */}
      {currentNode && aggregatedStats && aggregatedStats.dueToday > 0 && (
        <button
          onClick={() => onStartReview(pathPrefix!)}
          className="w-full py-3 mb-6 rounded-lg text-sm font-medium cursor-pointer"
          style={{
            backgroundColor: "var(--accent)",
            color: "white",
            border: "none",
          }}
        >
          Study All ({aggregatedStats.dueToday} due)
        </button>
      )}

      {/* Own cards section (if current node is an actual deck with cards) */}
      {currentNode && currentNode.deck && currentNode.deck.notes.length > 0 && (
        <div
          className="mb-6 p-4 rounded-lg cursor-pointer card-hover"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
          onClick={() => onViewDeck(currentNode.deck!.id, currentNode.fullPath)}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                Cards in this deck
              </h3>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {currentNode.deck.notes.length} card{currentNode.deck.notes.length !== 1 ? "s" : ""} directly in "{currentNode.name}"
              </p>
            </div>
            <span
              className="text-sm px-3 py-1 rounded"
              style={{ color: "var(--accent)" }}
            >
              View Cards
            </span>
          </div>
        </div>
      )}

      {/* Child deck/folder grid */}
      {displayNodes.length === 0 && !currentNode ? (
        <div
          className="text-center py-20 rounded-lg"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <p className="text-lg mb-2" style={{ color: "var(--text-muted)" }}>
            No decks yet
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Import a deck from the sidebar to get started
          </p>
        </div>
      ) : displayNodes.length === 0 && currentNode ? (
        <div
          className="text-center py-12 rounded-lg"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {currentNode.deck
              ? "No sub-decks. Use the cards above or create a sub-deck."
              : "Empty folder. Create a sub-deck to get started."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayNodes.map((node) => (
            <div
              key={node.fullPath}
              onClick={() => {
                if (node.children.length === 0 && node.deck) {
                  onViewDeck(node.deck.id, node.fullPath);
                } else {
                  onSelectPath(node.fullPath);
                }
              }}
              className="p-4 rounded-lg cursor-pointer card-hover hover-reveal"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              {/* Name + delete */}
              <div className="flex items-center justify-between mb-2">
                <h3
                  className="font-semibold text-sm truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {node.name}
                </h3>
                <button
                  onClick={(e) => handleDeleteNode(node, e)}
                  className="hover-reveal-target text-xs px-2 py-0.5 rounded cursor-pointer"
                  style={{
                    color: "var(--danger)",
                    background: "none",
                    border: "none",
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Condensed meta line + due badge */}
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {node.totalCards} card{node.totalCards !== 1 ? "s" : ""}
                  {node.children.length > 0 && (
                    <span>
                      {" "}
                      &middot; {node.children.length} sub-deck{node.children.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </span>
                {node.dueCards > 0 && (
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "white",
                    }}
                  >
                    {node.dueCards} due
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
