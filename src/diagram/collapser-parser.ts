/**
 * SmartCode — Collapser Parser Module
 * Parses Mermaid subgraph structures and counts nodes.
 */

import { SUBGRAPH_START, SUBGRAPH_END } from './constants.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubgraphInfo {
  id: string;
  label: string;
  startLine: number;
  endLine: number;
  nodeIds: string[];        // nodes directly inside this subgraph
  childSubgraphs: string[]; // nested subgraph IDs
  parent: string | null;    // parent subgraph ID or null for root-level
}

export interface CollapseState {
  collapsed: Set<string>;     // subgraph IDs currently collapsed
  focusPath: string[];        // path of subgraph IDs from root to focus
  focusedSubgraph: string | null;  // the subgraph currently in focus
}

// ─── Regex Patterns ──────────────────────────────────────────────────────────

const NODE_DEF = /^\s*(\w[\w\d_-]*)(?:\s*\[|\s*\(|\s*\{|\s*\[\[|\s*>)/;
const EDGE_LINE = /^\s*(\w[\w\d_-]*)\s*(?:-->|---|-\.-|-.->|==>|-.->)/;

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse Mermaid content to extract subgraph structure.
 */
export function parseSubgraphs(content: string): Map<string, SubgraphInfo> {
  const subgraphs = new Map<string, SubgraphInfo>();
  const lines = content.split('\n');
  const stack: SubgraphInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const startMatch = line.match(SUBGRAPH_START);

    if (startMatch) {
      const id = startMatch[1]!;
      const label = startMatch[2] || id;
      const parent = stack.length > 0 ? stack[stack.length - 1]!.id : null;

      const info: SubgraphInfo = {
        id,
        label,
        startLine: i,
        endLine: -1,
        nodeIds: [],
        childSubgraphs: [],
        parent,
      };

      stack.push(info);

      if (parent) {
        const parentInfo = subgraphs.get(parent) || stack.find(s => s.id === parent);
        if (parentInfo) parentInfo.childSubgraphs.push(id);
      }
      continue;
    }

    if (SUBGRAPH_END.test(line) && stack.length > 0) {
      const completed = stack.pop()!;
      completed.endLine = i;
      subgraphs.set(completed.id, completed);
      continue;
    }

    // Track nodes inside current subgraph
    if (stack.length > 0) {
      const current = stack[stack.length - 1]!;
      const nodeMatch = line.match(NODE_DEF);
      const edgeMatch = line.match(EDGE_LINE);

      if (nodeMatch && !current.nodeIds.includes(nodeMatch[1]!)) {
        current.nodeIds.push(nodeMatch[1]!);
      } else if (edgeMatch && !current.nodeIds.includes(edgeMatch[1]!)) {
        current.nodeIds.push(edgeMatch[1]!);
      }
    }
  }

  // Handle unclosed subgraphs
  while (stack.length > 0) {
    const incomplete = stack.pop()!;
    incomplete.endLine = lines.length - 1;
    subgraphs.set(incomplete.id, incomplete);
  }

  return subgraphs;
}

// ─── Node Counting ───────────────────────────────────────────────────────────

/**
 * Count all node definitions in Mermaid content.
 */
export function countAllNodes(content: string): number {
  const seen = new Set<string>();
  const lines = content.split('\n');

  for (const line of lines) {
    const nodeMatch = line.match(NODE_DEF);
    const edgeMatch = line.match(EDGE_LINE);
    if (nodeMatch) seen.add(nodeMatch[1]!);
    if (edgeMatch) seen.add(edgeMatch[1]!);
  }

  return seen.size;
}

/**
 * Count nodes recursively inside a subgraph (including children).
 */
export function countNodesInSubgraph(
  info: SubgraphInfo,
  subgraphs: Map<string, SubgraphInfo>
): number {
  let count = info.nodeIds.length;

  for (const childId of info.childSubgraphs) {
    const child = subgraphs.get(childId);
    if (child) count += countNodesInSubgraph(child, subgraphs);
  }

  return count;
}

/**
 * Count visible nodes after collapse is applied.
 */
export function countVisibleNodes(
  content: string,
  subgraphs: Map<string, SubgraphInfo>,
  state: CollapseState
): number {
  let total = countAllNodes(content);

  for (const subgraphId of state.collapsed) {
    const info = subgraphs.get(subgraphId);
    if (!info) continue;
    // Skip if parent is also collapsed (parent's count already includes this)
    if (info.parent && state.collapsed.has(info.parent)) continue;
    // Subtract nodes in collapsed subgraph
    total -= countNodesInSubgraph(info, subgraphs);
    // Add 1 for the summary node
    total += 1;
  }

  return Math.max(0, total);
}

/**
 * Get leaf subgraphs (those with no children).
 */
export function getLeafSubgraphs(subgraphs: Map<string, SubgraphInfo>): SubgraphInfo[] {
  return [...subgraphs.values()].filter(s => s.childSubgraphs.length === 0);
}

/**
 * Get all node IDs recursively inside a subgraph (including children).
 */
export function getAllNodesInSubgraph(
  info: SubgraphInfo,
  subgraphs: Map<string, SubgraphInfo>
): string[] {
  const nodes = [...info.nodeIds];
  for (const childId of info.childSubgraphs) {
    const child = subgraphs.get(childId);
    if (child) nodes.push(...getAllNodesInSubgraph(child, subgraphs));
  }
  return nodes;
}

// ─── Focus Utilities ─────────────────────────────────────────────────────────

/**
 * Find which subgraph contains a given node.
 */
export function findContainingSubgraph(
  nodeId: string,
  subgraphs: Map<string, SubgraphInfo>
): string | null {
  let deepest: SubgraphInfo | null = null;

  for (const info of subgraphs.values()) {
    if (info.nodeIds.includes(nodeId)) {
      if (!deepest || (info.parent && info.parent === deepest.id)) {
        deepest = info;
      }
    }
  }

  return deepest?.id || null;
}

/**
 * Get path from root to a subgraph.
 */
export function getPathToRoot(
  subgraphId: string,
  subgraphs: Map<string, SubgraphInfo>
): string[] {
  const path: string[] = [];
  let current = subgraphs.get(subgraphId);

  while (current) {
    path.unshift(current.id);
    current = current.parent ? subgraphs.get(current.parent) : undefined;
  }

  return path;
}
