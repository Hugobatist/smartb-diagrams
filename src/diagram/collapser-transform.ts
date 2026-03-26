/**
 * SmartCode — Collapser Transform Module
 * State management, auto-collapse, view generation, and focus mode.
 */

import type { SubgraphInfo, CollapseState } from './collapser-parser.js';
import {
  countVisibleNodes,
  countNodesInSubgraph,
  getLeafSubgraphs,
  getAllNodesInSubgraph,
  findContainingSubgraph,
  getPathToRoot,
} from './collapser-parser.js';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface CollapseConfig {
  collapsedNodePrefix: string;
  maxVisibleNodes: number;
  autoCollapse: boolean;
}

export interface CollapsedDiagram {
  content: string;
  visibleNodes: number;
  autoCollapsed: string[];
  manualCollapsed: string[];
}

export const DEFAULT_CONFIG: CollapseConfig = {
  collapsedNodePrefix: '__collapsed__',
  maxVisibleNodes: 50,
  autoCollapse: true,
};

// ─── State Factory ───────────────────────────────────────────────────────────

export function createEmptyState(): CollapseState {
  return {
    collapsed: new Set(),
    focusPath: [],
    focusedSubgraph: null,
  };
}

// ─── State Management ────────────────────────────────────────────────────────

/**
 * Toggle collapse state for a subgraph.
 */
export function toggleSubgraph(
  state: CollapseState,
  subgraphId: string,
  subgraphs: Map<string, SubgraphInfo>
): CollapseState {
  const newCollapsed = new Set(state.collapsed);

  if (newCollapsed.has(subgraphId)) {
    // Expanding - also expand all parents
    newCollapsed.delete(subgraphId);
    let current = subgraphs.get(subgraphId);
    while (current?.parent) {
      newCollapsed.delete(current.parent);
      current = subgraphs.get(current.parent);
    }
  } else {
    // Collapsing
    newCollapsed.add(subgraphId);
  }

  return { ...state, collapsed: newCollapsed };
}

// ─── Auto-Collapse ───────────────────────────────────────────────────────────

/**
 * Auto-collapse largest leaf subgraphs until under node limit.
 */
export function autoCollapseToLimit(
  content: string,
  subgraphs: Map<string, SubgraphInfo>,
  state: CollapseState,
  config: CollapseConfig
): CollapseState {
  if (!config.autoCollapse) return state;

  const newCollapsed = new Set(state.collapsed);
  let visibleNodes = countVisibleNodes(content, subgraphs, { ...state, collapsed: newCollapsed });

  while (visibleNodes > config.maxVisibleNodes) {
    // Find uncollapsed leaf subgraphs
    const leaves = getLeafSubgraphs(subgraphs)
      .filter(s => !newCollapsed.has(s.id))
      .sort((a, b) => countNodesInSubgraph(b, subgraphs) - countNodesInSubgraph(a, subgraphs));

    if (leaves.length === 0) break;

    // Collapse largest leaf
    const largest = leaves[0]!;
    newCollapsed.add(largest.id);
    visibleNodes = countVisibleNodes(content, subgraphs, { ...state, collapsed: newCollapsed });
  }

  return { ...state, collapsed: newCollapsed };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Transformation ──────────────────────────────────────────────────────────

/**
 * Generate Mermaid content with collapsed subgraphs replaced by summary nodes.
 * Precompiles regex patterns for edge redirects to avoid per-line compilation.
 */
export function generateCollapsedView(
  content: string,
  subgraphs: Map<string, SubgraphInfo>,
  state: CollapseState,
  config: CollapseConfig = DEFAULT_CONFIG
): CollapsedDiagram {
  // Apply auto-collapse
  const autoState = autoCollapseToLimit(content, subgraphs, state, config);
  const autoCollapsed = [...autoState.collapsed].filter(id => !state.collapsed.has(id));
  const manualCollapsed = [...state.collapsed];

  // Apply transformation
  const lines = content.split('\n');
  const result: string[] = [];
  const edgeRedirects = new Map<string, string>();
  const skipRanges: Array<{ start: number; end: number; id: string }> = [];

  // Build skip ranges and edge redirects
  for (const subgraphId of autoState.collapsed) {
    const info = subgraphs.get(subgraphId);
    if (!info) continue;

    // Skip if parent is also collapsed
    if (info.parent && autoState.collapsed.has(info.parent)) continue;

    skipRanges.push({ start: info.startLine, end: info.endLine, id: subgraphId });

    // Redirect edges from nodes inside to summary node
    const summaryId = `${config.collapsedNodePrefix}${subgraphId}`;
    for (const nodeId of getAllNodesInSubgraph(info, subgraphs)) {
      edgeRedirects.set(nodeId, summaryId);
    }
  }

  // Sort ranges by start line
  skipRanges.sort((a, b) => a.start - b.start);

  // Precompile regex patterns for edge redirects (performance fix)
  const compiledRedirects: Array<{ regex: RegExp; replacement: string }> = [];
  for (const [from, to] of edgeRedirects) {
    compiledRedirects.push({
      regex: new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g'),
      replacement: to,
    });
  }

  // Build output
  let skipIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    // Check if in skip range
    if (skipIndex < skipRanges.length && i >= skipRanges[skipIndex]!.start) {
      if (i === skipRanges[skipIndex]!.start) {
        // Insert summary node at start of collapsed subgraph
        const range = skipRanges[skipIndex]!;
        const summaryId = `${config.collapsedNodePrefix}${range.id}`;
        const info = subgraphs.get(range.id)!;
        const nodeCount = countNodesInSubgraph(info, subgraphs);
        result.push(`    ${summaryId}["[+]${info.label} (${nodeCount} nodes)"]`);
      }
      if (i <= skipRanges[skipIndex]!.end) {
        if (i === skipRanges[skipIndex]!.end) skipIndex++;
        continue;
      }
    }

    // Redirect edges using precompiled regex
    let line = lines[i]!;
    for (const { regex, replacement } of compiledRedirects) {
      regex.lastIndex = 0;  // reset stateful global regex
      line = line.replace(regex, replacement);
    }

    result.push(line);
  }

  const collapsedContent = result.join('\n');
  const visibleNodes = countVisibleNodes(content, subgraphs, autoState);

  return {
    content: collapsedContent,
    visibleNodes,
    autoCollapsed,
    manualCollapsed,
  };
}

// ─── Focus Mode ──────────────────────────────────────────────────────────────

/**
 * Enter focus mode on a specific node.
 */
export function focusOnNode(
  nodeId: string,
  subgraphs: Map<string, SubgraphInfo>,
  currentState: CollapseState
): CollapseState {
  const containingSubgraph = findContainingSubgraph(nodeId, subgraphs);
  if (!containingSubgraph) return currentState;

  const focusPath = getPathToRoot(containingSubgraph, subgraphs);
  const newCollapsed = new Set<string>();

  // Collapse all subgraphs not in focus path that are siblings at any level
  for (const info of subgraphs.values()) {
    if (!focusPath.includes(info.id)) {
      // Collapse if parent is in focusPath (sibling at any level)
      // or if parent is null/undefined (root-level sibling)
      if (info.parent == null || focusPath.includes(info.parent)) {
        newCollapsed.add(info.id);
      }
    }
  }

  return {
    collapsed: newCollapsed,
    focusPath,
    focusedSubgraph: containingSubgraph,
  };
}

/**
 * Navigate to a specific breadcrumb.
 */
export function navigateToBreadcrumb(
  breadcrumbId: string,
  _subgraphs: Map<string, SubgraphInfo>,  // reserved for future breadcrumb validation
  currentState: CollapseState
): CollapseState {
  if (breadcrumbId === 'root') {
    return exitFocus();
  }

  const index = currentState.focusPath.indexOf(breadcrumbId);
  if (index === -1) return currentState;

  const newFocusPath = currentState.focusPath.slice(0, index + 1);
  const focusedSubgraph = newFocusPath[newFocusPath.length - 1] || null;

  return {
    ...currentState,
    focusPath: newFocusPath,
    focusedSubgraph,
  };
}

/**
 * Exit focus mode.
 */
export function exitFocus(): CollapseState {
  return {
    collapsed: new Set(),
    focusPath: [],
    focusedSubgraph: null,
  };
}

/**
 * Get breadcrumb path for current state.
 */
export function getBreadcrumbs(
  state: CollapseState,
  subgraphs: Map<string, SubgraphInfo>
): Array<{ id: string; label: string }> {
  const crumbs: Array<{ id: string; label: string }> = [{ id: 'root', label: 'Overview' }];

  for (const id of state.focusPath) {
    const info = subgraphs.get(id);
    if (info) crumbs.push({ id, label: info.label });
  }

  return crumbs;
}
