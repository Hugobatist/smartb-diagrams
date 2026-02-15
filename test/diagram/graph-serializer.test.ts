import { describe, it, expect } from 'vitest';
import { serializeGraphToMermaid } from '../../src/diagram/graph-serializer.js';
import type { GraphModel, GraphNode, GraphEdge, GraphSubgraph } from '../../src/diagram/graph-types.js';
import type { ValidationResult } from '../../src/diagram/types.js';

// ─── Helper: create a minimal valid GraphModel ──────────────────────────────

function emptyModel(overrides: Partial<GraphModel> = {}): GraphModel {
  return {
    diagramType: 'flowchart',
    direction: 'LR',
    nodes: new Map(),
    edges: [],
    subgraphs: new Map(),
    classDefs: new Map(),
    nodeStyles: new Map(),
    linkStyles: new Map(),
    classAssignments: new Map(),
    filePath: 'test.mmd',
    flags: new Map(),
    statuses: new Map(),
    validation: { valid: true, errors: [] } as ValidationResult,
    ...overrides,
  };
}

function makeNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, shape: 'rect', ...overrides };
}

// ─── Serializer unit tests ──────────────────────────────────────────────────

describe('serializeGraphToMermaid', () => {
  it('serializes minimal graph (1 node, 0 edges)', () => {
    const model = emptyModel({
      nodes: new Map([['A', makeNode('A', { label: 'Only node' })]]),
    });
    const output = serializeGraphToMermaid(model);
    expect(output).toBe('flowchart LR\n    A["Only node"]\n');
  });

  it('preserves direction: LR, TB, BT, RL', () => {
    for (const dir of ['LR', 'TB', 'BT', 'RL'] as const) {
      const model = emptyModel({ direction: dir, nodes: new Map([['X', makeNode('X')]]) });
      const output = serializeGraphToMermaid(model);
      expect(output).toContain(`flowchart ${dir}`);
    }
  });

  it('serializes all 13 node shapes with correct bracket syntax', () => {
    const shapeTests: Array<{ shape: GraphNode['shape']; open: string; close: string }> = [
      { shape: 'rect', open: '[', close: ']' },
      { shape: 'rounded', open: '(', close: ')' },
      { shape: 'stadium', open: '([', close: '])' },
      { shape: 'subroutine', open: '[[', close: ']]' },
      { shape: 'cylinder', open: '[(', close: ')]' },
      { shape: 'circle', open: '((', close: '))' },
      { shape: 'asymmetric', open: '>', close: ']' },
      { shape: 'diamond', open: '{', close: '}' },
      { shape: 'hexagon', open: '{{', close: '}}' },
      { shape: 'parallelogram', open: '[/', close: '/]' },
      { shape: 'parallelogram-alt', open: '[\\', close: '\\]' },
      { shape: 'trapezoid', open: '[/', close: '\\]' },
      { shape: 'trapezoid-alt', open: '[\\', close: '/]' },
    ];

    for (const { shape, open, close } of shapeTests) {
      const model = emptyModel({
        nodes: new Map([['N', makeNode('N', { label: 'Test', shape })]]),
      });
      const output = serializeGraphToMermaid(model);
      expect(output).toContain(`N${open}"Test"${close}`);
    }
  });

  it('serializes all 5 edge types with correct arrow syntax', () => {
    const edgeTypes: Array<{ type: GraphEdge['type']; syntax: string }> = [
      { type: 'arrow', syntax: '-->' },
      { type: 'open', syntax: '---' },
      { type: 'dotted', syntax: '-.->' },
      { type: 'thick', syntax: '==>' },
      { type: 'invisible', syntax: '~~~' },
    ];

    for (const { type, syntax } of edgeTypes) {
      const model = emptyModel({
        nodes: new Map([['A', makeNode('A')], ['B', makeNode('B')]]),
        edges: [{ id: 'A->B', from: 'A', to: 'B', type, label: undefined }],
      });
      const output = serializeGraphToMermaid(model);
      expect(output).toContain(`A ${syntax} B`);
    }
  });

  it('serializes edge labels in pipe syntax', () => {
    const model = emptyModel({
      nodes: new Map([['A', makeNode('A')], ['B', makeNode('B')]]),
      edges: [{ id: 'A->B', from: 'A', to: 'B', type: 'arrow', label: 'text' }],
    });
    const output = serializeGraphToMermaid(model);
    expect(output).toContain('-->|"text"|');
  });

  it('serializes bidirectional edges', () => {
    const model = emptyModel({
      nodes: new Map([['A', makeNode('A')], ['B', makeNode('B')]]),
      edges: [{ id: 'A->B', from: 'A', to: 'B', type: 'arrow', bidirectional: true }],
    });
    const output = serializeGraphToMermaid(model);
    expect(output).toContain('<-->');
  });

  it('serializes subgraphs with correct structure', () => {
    const model = emptyModel({
      nodes: new Map([['A', makeNode('A', { label: 'Inner Node', subgraphId: 'SG1' })]]),
      subgraphs: new Map([
        ['SG1', { id: 'SG1', label: 'My Group', parentId: null, nodeIds: ['A'], childSubgraphIds: [] }],
      ]),
    });
    const output = serializeGraphToMermaid(model);
    expect(output).toContain('subgraph SG1["My Group"]');
    expect(output).toContain('end');
  });

  it('serializes nested subgraphs with deeper indentation', () => {
    const model = emptyModel({
      nodes: new Map([
        ['A', makeNode('A', { label: 'Deep', subgraphId: 'Inner' })],
      ]),
      subgraphs: new Map([
        ['Outer', { id: 'Outer', label: 'Outer', parentId: null, nodeIds: [], childSubgraphIds: ['Inner'] }],
        ['Inner', { id: 'Inner', label: 'Inner', parentId: 'Outer', nodeIds: ['A'], childSubgraphIds: [] }],
      ]),
    });
    const output = serializeGraphToMermaid(model);
    const lines = output.split('\n');
    const outerLine = lines.find(l => l.includes('subgraph Outer'));
    const innerLine = lines.find(l => l.includes('subgraph Inner'));
    expect(outerLine).toBeDefined();
    expect(innerLine).toBeDefined();
    // Inner should have more indentation than outer
    const outerIndent = outerLine!.match(/^(\s*)/)![1]!.length;
    const innerIndent = innerLine!.match(/^(\s*)/)![1]!.length;
    expect(innerIndent).toBeGreaterThan(outerIndent);
  });

  it('serializes classDef directives', () => {
    const model = emptyModel({
      classDefs: new Map([['okStyle', 'fill:#22c55e,stroke:#16a34a']]),
      nodes: new Map([['A', makeNode('A')]]),
    });
    const output = serializeGraphToMermaid(model);
    expect(output).toContain('classDef okStyle fill:#22c55e,stroke:#16a34a');
  });

  it('serializes style directives', () => {
    const model = emptyModel({
      nodeStyles: new Map([['A', 'fill:#f9f,stroke:#333']]),
      nodes: new Map([['A', makeNode('A')]]),
    });
    const output = serializeGraphToMermaid(model);
    expect(output).toContain('style A fill:#f9f,stroke:#333');
  });

  it('serializes linkStyle directives', () => {
    const model = emptyModel({
      linkStyles: new Map([[0, 'stroke:#ff3,stroke-width:4px']]),
      nodes: new Map([['A', makeNode('A')], ['B', makeNode('B')]]),
      edges: [{ id: 'A->B', from: 'A', to: 'B', type: 'arrow' }],
    });
    const output = serializeGraphToMermaid(model);
    expect(output).toContain('linkStyle 0 stroke:#ff3,stroke-width:4px');
  });

  it('serializes class assignments as class directive', () => {
    const model = emptyModel({
      classAssignments: new Map([['A', 'highlight'], ['B', 'highlight'], ['C', 'other']]),
      nodes: new Map([
        ['A', makeNode('A')],
        ['B', makeNode('B')],
        ['C', makeNode('C')],
      ]),
    });
    const output = serializeGraphToMermaid(model);
    expect(output).toContain('class A,B highlight');
    expect(output).toContain('class C other');
  });

  it('serializes graph diagramType as graph (not flowchart)', () => {
    const model = emptyModel({
      diagramType: 'graph',
      nodes: new Map([['A', makeNode('A')]]),
    });
    const output = serializeGraphToMermaid(model);
    expect(output.startsWith('graph ')).toBe(true);
  });

  it('omits brackets for bare ID nodes (label === id, shape === rect)', () => {
    const model = emptyModel({
      nodes: new Map([['A', makeNode('A')]]),
      edges: [],
    });
    const output = serializeGraphToMermaid(model);
    // Bare ID node: just "A" without brackets
    const lines = output.split('\n');
    const nodeLine = lines.find(l => l.trim() === 'A');
    expect(nodeLine).toBeDefined();
  });

  it('outputs trailing newline', () => {
    const model = emptyModel({ nodes: new Map([['A', makeNode('A')]]) });
    const output = serializeGraphToMermaid(model);
    expect(output.endsWith('\n')).toBe(true);
  });
});
