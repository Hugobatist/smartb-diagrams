/**
 * SmartCode - GraphModel to Mermaid Serializer
 * Converts a structured GraphModel back into valid Mermaid flowchart text.
 * Counterpart to graph-parser.ts — together they enable round-trip fidelity.
 */

import type { GraphModel, GraphSubgraph, NodeShape } from './graph-types.js';
import { SHAPE_PATTERNS, EDGE_SYNTAX } from './graph-types.js';

// ─── Shape reverse lookup ───────────────────────────────────────────────────

/** Map from shape name to bracket pair { open, close } */
const SHAPE_BRACKETS = new Map<NodeShape, { open: string; close: string }>();

for (const sp of SHAPE_PATTERNS) {
  // Only set the first match per shape (SHAPE_PATTERNS is ordered longest-first)
  if (!SHAPE_BRACKETS.has(sp.shape)) {
    SHAPE_BRACKETS.set(sp.shape, { open: sp.open, close: sp.close });
  }
}

// ─── Main serializer ────────────────────────────────────────────────────────

/**
 * Serialize a GraphModel to valid Mermaid flowchart text.
 *
 * Output order (canonical):
 *   1. Direction line: `flowchart LR`
 *   2. classDef directives
 *   3. Subgraph blocks (recursive, with nodes inside)
 *   4. Root-level nodes (not inside any subgraph)
 *   5. Edges
 *   6. style directives
 *   7. linkStyle directives
 *   8. class assignments
 */
export function serializeGraphToMermaid(graph: GraphModel): string {
  const lines: string[] = [];

  // 1. Direction line
  lines.push(`${graph.diagramType} ${graph.direction}`);

  // 2. classDef directives
  for (const [name, styles] of graph.classDefs) {
    lines.push(`    classDef ${name} ${styles}`);
  }

  // 3. Subgraph blocks (recursive) — track which nodes are emitted inside subgraphs
  const emittedNodes = new Set<string>();

  // Find root-level subgraphs (parentId === null)
  const rootSubgraphs: GraphSubgraph[] = [];
  for (const sg of graph.subgraphs.values()) {
    if (sg.parentId === null) {
      rootSubgraphs.push(sg);
    }
  }

  for (const sg of rootSubgraphs) {
    emitSubgraph(graph, sg, lines, emittedNodes, 1);
  }

  // 4. Root-level nodes (not emitted inside any subgraph)
  for (const [id, node] of graph.nodes) {
    if (emittedNodes.has(id)) continue;
    lines.push(`    ${serializeNode(id, node.label, node.shape)}`);
  }

  // 5. Edges
  for (const edge of graph.edges) {
    const arrow = serializeEdgeOperator(edge.type, edge.bidirectional, edge.label);
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }

  // 6. style directives
  for (const [nodeId, styles] of graph.nodeStyles) {
    lines.push(`    style ${nodeId} ${styles}`);
  }

  // 7. linkStyle directives
  const sortedLinkStyles = [...graph.linkStyles.entries()].sort((a, b) => a[0] - b[0]);
  for (const [idx, styles] of sortedLinkStyles) {
    lines.push(`    linkStyle ${idx} ${styles}`);
  }

  // 8. class assignments — group by class name
  const classGroups = new Map<string, string[]>();
  for (const [nodeId, className] of graph.classAssignments) {
    if (!classGroups.has(className)) {
      classGroups.set(className, []);
    }
    classGroups.get(className)!.push(nodeId);
  }
  for (const [className, nodeIds] of classGroups) {
    lines.push(`    class ${nodeIds.join(',')} ${className}`);
  }

  return lines.join('\n') + '\n';
}

// ─── Subgraph emitter (recursive) ───────────────────────────────────────────

function emitSubgraph(
  graph: GraphModel,
  sg: GraphSubgraph,
  lines: string[],
  emittedNodes: Set<string>,
  depth: number,
): void {
  const indent = '    '.repeat(depth);

  // Subgraph header
  if (sg.label !== sg.id) {
    lines.push(`${indent}subgraph ${sg.id}["${sg.label}"]`);
  } else {
    lines.push(`${indent}subgraph ${sg.id}`);
  }

  // Child subgraphs first
  for (const childId of sg.childSubgraphIds) {
    const child = graph.subgraphs.get(childId);
    if (child) {
      emitSubgraph(graph, child, lines, emittedNodes, depth + 1);
    }
  }

  // Nodes inside this subgraph
  for (const nodeId of sg.nodeIds) {
    const node = graph.nodes.get(nodeId);
    if (node) {
      lines.push(`${indent}    ${serializeNode(nodeId, node.label, node.shape)}`);
      emittedNodes.add(nodeId);
    }
  }

  // Also emit nodes that have subgraphId matching this subgraph but aren't in nodeIds
  for (const [id, node] of graph.nodes) {
    if (node.subgraphId === sg.id && !emittedNodes.has(id)) {
      lines.push(`${indent}    ${serializeNode(id, node.label, node.shape)}`);
      emittedNodes.add(id);
    }
  }

  lines.push(`${indent}end`);
}

// ─── Node serializer ────────────────────────────────────────────────────────

/**
 * Serialize a single node definition.
 * - If label === id AND shape === 'rect', emit bare id
 * - Otherwise emit id + shape brackets + quoted label
 */
function serializeNode(id: string, label: string, shape: NodeShape): string {
  if (label === id && shape === 'rect') {
    return id;
  }

  const brackets = SHAPE_BRACKETS.get(shape);
  if (!brackets) {
    // Fallback to rect brackets
    return `${id}["${label}"]`;
  }

  return `${id}${brackets.open}"${label}"${brackets.close}`;
}

// ─── Edge operator serializer ───────────────────────────────────────────────

function serializeEdgeOperator(
  type: string,
  bidirectional?: boolean,
  label?: string,
): string {
  const baseSyntax = EDGE_SYNTAX[type as keyof typeof EDGE_SYNTAX] ?? '-->';

  if (bidirectional) {
    // Prepend '<' to make bidirectional: --> becomes <-->, -.-> becomes <-.->
    return `<${baseSyntax}`;
  }

  if (label) {
    // Insert label in pipe syntax: -->|"label"|
    return `${baseSyntax}|"${label}"|`;
  }

  return baseSyntax;
}

// ─── JSON serializer (for WebSocket / REST) ─────────────────────────────────

/**
 * Serialize a GraphModel to a plain JSON-safe object.
 * Converts all Map fields to plain objects for transmission over WebSocket or REST.
 */
export function serializeGraphModel(graph: GraphModel): Record<string, unknown> {
  return {
    diagramType: graph.diagramType,
    direction: graph.direction,
    nodes: Object.fromEntries(graph.nodes),
    edges: graph.edges,
    subgraphs: Object.fromEntries(graph.subgraphs),
    classDefs: Object.fromEntries(graph.classDefs),
    nodeStyles: Object.fromEntries(graph.nodeStyles),
    linkStyles: Object.fromEntries(graph.linkStyles),
    classAssignments: Object.fromEntries(graph.classAssignments),
    filePath: graph.filePath,
    flags: Object.fromEntries(graph.flags),
    statuses: Object.fromEntries(graph.statuses),
  };
}
