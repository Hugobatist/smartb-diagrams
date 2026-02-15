import type { Flag, NodeStatus, ValidationResult } from './types.js';

export type NodeShape =
  | 'rect' | 'rounded' | 'stadium' | 'subroutine' | 'cylinder'
  | 'circle' | 'asymmetric' | 'diamond' | 'hexagon'
  | 'parallelogram' | 'parallelogram-alt' | 'trapezoid' | 'trapezoid-alt';

export type EdgeType = 'arrow' | 'open' | 'dotted' | 'thick' | 'invisible';

export type FlowDirection = 'TB' | 'LR' | 'BT' | 'RL';

export interface GraphNode {
  id: string;
  label: string;
  shape: NodeShape;
  status?: NodeStatus;
  flag?: Flag;
  subgraphId?: string;
  cssClass?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  type: EdgeType;
  bidirectional?: boolean;
}

export interface GraphSubgraph {
  id: string;
  label: string;
  parentId: string | null;
  nodeIds: string[];
  childSubgraphIds: string[];
}

export interface GraphModel {
  diagramType: 'flowchart' | 'graph';
  direction: FlowDirection;
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  subgraphs: Map<string, GraphSubgraph>;
  classDefs: Map<string, string>;
  nodeStyles: Map<string, string>;
  linkStyles: Map<number, string>;
  classAssignments: Map<string, string>;
  filePath: string;
  flags: Map<string, Flag>;
  statuses: Map<string, NodeStatus>;
  validation: ValidationResult;
}

/** Shape bracket patterns — ordered longest-first for correct parsing precedence */
export const SHAPE_PATTERNS: Array<{ open: string; close: string; shape: NodeShape }> = [
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[[', close: ']]', shape: 'subroutine' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[/', close: '\\]', shape: 'trapezoid' },
  { open: '[\\', close: '/]', shape: 'trapezoid-alt' },
  { open: '[/', close: '/]', shape: 'parallelogram' },
  { open: '[\\', close: '\\]', shape: 'parallelogram-alt' },
  { open: '>', close: ']', shape: 'asymmetric' },
  { open: '{', close: '}', shape: 'diamond' },
  { open: '(', close: ')', shape: 'rounded' },
  { open: '[', close: ']', shape: 'rect' },
];

/** Edge type to serialization syntax mapping */
export const EDGE_SYNTAX: Record<EdgeType, string> = {
  arrow: '-->',
  open: '---',
  dotted: '-.->',
  thick: '==>',
  invisible: '~~~',
};
