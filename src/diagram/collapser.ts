/**
 * SmartCode — Subgraph Collapse/Expand Module
 *
 * Re-exports all public API from the split modules.
 * Import from this file for backward compatibility.
 *
 * Internal modules:
 *   - collapser-parser.ts    — Mermaid parsing, node counting, subgraph queries
 *   - collapser-transform.ts — State management, auto-collapse, view generation, focus mode
 */

// ─── Parser (types + functions) ──────────────────────────────────────────────

export type { SubgraphInfo, CollapseState } from './collapser-parser.js';

export {
  parseSubgraphs,
  countAllNodes,
  countNodesInSubgraph,
  countVisibleNodes,
  getLeafSubgraphs,
  getAllNodesInSubgraph,
  findContainingSubgraph,
  getPathToRoot,
} from './collapser-parser.js';

// ─── Transform (types + functions + config) ──────────────────────────────────

export type { CollapseConfig, CollapsedDiagram } from './collapser-transform.js';

export {
  DEFAULT_CONFIG,
  createEmptyState,
  toggleSubgraph,
  autoCollapseToLimit,
  generateCollapsedView,
  focusOnNode,
  navigateToBreadcrumb,
  exitFocus,
  getBreadcrumbs,
} from './collapser-transform.js';
