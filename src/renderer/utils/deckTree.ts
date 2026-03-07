// Utility to build an Anki-style deck tree from a flat list of decks.
// Deck names use "::" as a separator (e.g., "Languages::Japanese::Vocab").

import type { Deck, DeckTreeNode, DeckStats } from "../types/index.js";

/**
 * Build a tree of DeckTreeNodes from a flat deck list.
 * Virtual parent nodes (where no actual deck exists) get deck = null.
 */
export function buildDeckTree(
  decks: Deck[],
  statsMap: Record<string, DeckStats>
): DeckTreeNode[] {
  const nodeMap = new Map<string, DeckTreeNode>();

  // Ensure a node exists for every segment of a path
  function ensureNode(fullPath: string): DeckTreeNode {
    const existing = nodeMap.get(fullPath);
    if (existing) return existing;

    const segments = fullPath.split("::");
    const name = segments[segments.length - 1]!;

    const node: DeckTreeNode = {
      name,
      fullPath,
      deck: null,
      children: [],
      totalCards: 0,
      dueCards: 0,
      newCards: 0,
    };
    nodeMap.set(fullPath, node);

    // Ensure parent exists and link
    if (segments.length > 1) {
      const parentPath = segments.slice(0, -1).join("::");
      const parent = ensureNode(parentPath);
      if (!parent.children.find((c) => c.fullPath === fullPath)) {
        parent.children.push(node);
      }
    }

    return node;
  }

  // Create nodes for every deck
  for (const deck of decks) {
    const node = ensureNode(deck.name);
    node.deck = deck;

    // Set own stats
    const s = statsMap[deck.id];
    if (s) {
      node.totalCards = s.totalCards;
      node.dueCards = s.dueToday;
      node.newCards = s.newCards;
    }
  }

  // Aggregate stats bottom-up (children first)
  function aggregateStats(node: DeckTreeNode): {
    total: number;
    due: number;
    newC: number;
  } {
    let total = node.totalCards;
    let due = node.dueCards;
    let newC = node.newCards;

    for (const child of node.children) {
      const childStats = aggregateStats(child);
      total += childStats.total;
      due += childStats.due;
      newC += childStats.newC;
    }

    node.totalCards = total;
    node.dueCards = due;
    node.newCards = newC;

    return { total, due, newC };
  }

  // Collect root nodes (those without "::" in their path, or whose parent is not in the map)
  const roots: DeckTreeNode[] = [];
  for (const [path, node] of nodeMap) {
    const segments = path.split("::");
    if (segments.length === 1) {
      roots.push(node);
    }
  }

  // Sort children alphabetically at each level
  function sortTree(nodes: DeckTreeNode[]): void {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortTree(node.children);
    }
  }

  sortTree(roots);

  // Aggregate stats from leaves up
  for (const root of roots) {
    aggregateStats(root);
  }

  return roots;
}

/**
 * Find a node in the tree by its full path.
 */
export function findNode(
  roots: DeckTreeNode[],
  fullPath: string
): DeckTreeNode | null {
  for (const root of roots) {
    if (root.fullPath === fullPath) return root;
    const found = findNode(root.children, fullPath);
    if (found) return found;
  }
  return null;
}

/**
 * Get all deck IDs under a given path (inclusive of the node itself).
 */
export function getAllDeckIdsUnderPath(
  roots: DeckTreeNode[],
  fullPath: string
): string[] {
  const node = findNode(roots, fullPath);
  if (!node) return [];
  return collectDeckIds(node);
}

function collectDeckIds(node: DeckTreeNode): string[] {
  const ids: string[] = [];
  if (node.deck) {
    ids.push(node.deck.id);
  }
  for (const child of node.children) {
    ids.push(...collectDeckIds(child));
  }
  return ids;
}

/**
 * Get breadcrumb segments from a full path.
 * e.g., "Languages::Japanese::Vocab" -> ["Languages", "Languages::Japanese", "Languages::Japanese::Vocab"]
 */
export function getBreadcrumbs(
  fullPath: string
): { name: string; fullPath: string }[] {
  const segments = fullPath.split("::");
  return segments.map((seg, i) => ({
    name: seg,
    fullPath: segments.slice(0, i + 1).join("::"),
  }));
}

/**
 * Check if a path matches or is a descendant of a prefix.
 * e.g., isDescendant("Languages::Japanese", "Languages") -> true
 */
export function isDescendantOrSelf(
  deckName: string,
  pathPrefix: string
): boolean {
  return (
    deckName === pathPrefix || deckName.startsWith(pathPrefix + "::")
  );
}
