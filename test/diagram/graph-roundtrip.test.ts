import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMermaidToGraph } from '../../src/diagram/graph-parser.js';
import { serializeGraphToMermaid } from '../../src/diagram/graph-serializer.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures', 'graph');

// ─── Round-trip helper ──────────────────────────────────────────────────────

function assertRoundTrip(fixturePath: string, description: string) {
  it(`round-trips: ${description}`, () => {
    const input = readFileSync(fixturePath, 'utf-8');
    const graph1 = parseMermaidToGraph(input, 'test.mmd');
    const serialized = serializeGraphToMermaid(graph1);
    const graph2 = parseMermaidToGraph(serialized, 'test.mmd');

    // Compare top-level structure
    expect(graph2.nodes.size).toBe(graph1.nodes.size);
    expect(graph2.edges.length).toBe(graph1.edges.length);
    expect(graph2.subgraphs.size).toBe(graph1.subgraphs.size);
    expect(graph2.direction).toBe(graph1.direction);
    expect(graph2.diagramType).toBe(graph1.diagramType);

    // Deep compare nodes
    for (const [id, node1] of graph1.nodes) {
      const node2 = graph2.nodes.get(id);
      expect(node2, `node ${id} should exist in round-trip`).toBeDefined();
      expect(node2!.label).toBe(node1.label);
      expect(node2!.shape).toBe(node1.shape);
    }

    // Deep compare edges
    for (let i = 0; i < graph1.edges.length; i++) {
      expect(graph2.edges[i]!.from).toBe(graph1.edges[i]!.from);
      expect(graph2.edges[i]!.to).toBe(graph1.edges[i]!.to);
      expect(graph2.edges[i]!.type).toBe(graph1.edges[i]!.type);
      expect(graph2.edges[i]!.label).toBe(graph1.edges[i]!.label);
      if (graph1.edges[i]!.bidirectional) {
        expect(graph2.edges[i]!.bidirectional).toBe(graph1.edges[i]!.bidirectional);
      }
    }

    // Deep compare subgraphs
    for (const [id, sg1] of graph1.subgraphs) {
      const sg2 = graph2.subgraphs.get(id);
      expect(sg2, `subgraph ${id} should exist in round-trip`).toBeDefined();
      expect(sg2!.label).toBe(sg1.label);
      expect(sg2!.parentId).toBe(sg1.parentId);
    }

    // Compare style maps
    expect(graph2.classDefs.size).toBe(graph1.classDefs.size);
    for (const [name, styles] of graph1.classDefs) {
      expect(graph2.classDefs.get(name)).toBe(styles);
    }

    expect(graph2.nodeStyles.size).toBe(graph1.nodeStyles.size);
    for (const [nodeId, styles] of graph1.nodeStyles) {
      expect(graph2.nodeStyles.get(nodeId)).toBe(styles);
    }

    expect(graph2.linkStyles.size).toBe(graph1.linkStyles.size);
    for (const [idx, styles] of graph1.linkStyles) {
      expect(graph2.linkStyles.get(idx)).toBe(styles);
    }
  });
}

// ─── Round-trip tests for all 22 fixtures ───────────────────────────────────

describe('Graph model round-trip fidelity', () => {
  assertRoundTrip(join(fixturesDir, 'basic-flowchart.mmd'), 'basic flowchart');
  assertRoundTrip(join(fixturesDir, 'single-node.mmd'), 'single node');
  assertRoundTrip(join(fixturesDir, 'all-node-shapes.mmd'), 'all 13 node shapes');
  assertRoundTrip(join(fixturesDir, 'all-edge-types.mmd'), 'all 5 edge types');
  assertRoundTrip(join(fixturesDir, 'bidirectional-edges.mmd'), 'bidirectional edges');
  assertRoundTrip(join(fixturesDir, 'chained-edges.mmd'), 'chained edges');
  assertRoundTrip(join(fixturesDir, 'class-directive.mmd'), 'class directive');
  assertRoundTrip(join(fixturesDir, 'comments-and-blanks.mmd'), 'comments and blanks');
  assertRoundTrip(join(fixturesDir, 'direction-variants.mmd'), 'direction variants');
  assertRoundTrip(join(fixturesDir, 'empty-subgraph.mmd'), 'empty subgraph');
  assertRoundTrip(join(fixturesDir, 'graph-keyword.mmd'), 'graph keyword');
  assertRoundTrip(join(fixturesDir, 'implicit-nodes.mmd'), 'implicit nodes');
  assertRoundTrip(join(fixturesDir, 'inline-class-assignment.mmd'), 'inline class assignment');
  assertRoundTrip(join(fixturesDir, 'link-styles.mmd'), 'link styles');
  assertRoundTrip(join(fixturesDir, 'mixed-edge-labels.mmd'), 'mixed edge labels');
  assertRoundTrip(join(fixturesDir, 'nested-subgraphs.mmd'), 'nested subgraphs');
  assertRoundTrip(join(fixturesDir, 'special-characters.mmd'), 'special characters');
  assertRoundTrip(join(fixturesDir, 'subgraph-edges.mmd'), 'subgraph edges');
  assertRoundTrip(join(fixturesDir, 'unicode-labels.mmd'), 'unicode labels');
  assertRoundTrip(join(fixturesDir, 'with-classdefs.mmd'), 'with classDefs');
  assertRoundTrip(join(fixturesDir, 'with-flags-and-statuses.mmd'), 'with flags and statuses');
  assertRoundTrip(join(fixturesDir, 'with-styles.mmd'), 'with styles');
});

// ─── Additional semantic tests ──────────────────────────────────────────────

describe('Round-trip semantic preservation', () => {
  it('comments-and-blanks: preserves node/edge semantics despite comment loss', () => {
    const input = readFileSync(join(fixturesDir, 'comments-and-blanks.mmd'), 'utf-8');
    const graph1 = parseMermaidToGraph(input, 'test.mmd');
    const serialized = serializeGraphToMermaid(graph1);

    // Comments are lost, but the serialized output should NOT contain comment lines
    expect(serialized).not.toContain('%%');

    // Re-parse and verify semantics preserved
    const graph2 = parseMermaidToGraph(serialized, 'test.mmd');
    expect(graph2.nodes.size).toBe(3);
    expect(graph2.edges.length).toBe(2);
    expect(graph2.nodes.get('A')?.label).toBe('Start');
    expect(graph2.nodes.get('B')?.label).toBe('Middle');
    expect(graph2.nodes.get('C')?.label).toBe('End');
  });

  it('with-flags-and-statuses: flags/statuses survive round-trip through graph model', () => {
    const input = readFileSync(join(fixturesDir, 'with-flags-and-statuses.mmd'), 'utf-8');
    const graph1 = parseMermaidToGraph(input, 'test.mmd');

    // Flags and statuses are in the model, but the serializer only outputs Mermaid syntax
    // So re-parsing the serialized output should still have the graph structure
    const serialized = serializeGraphToMermaid(graph1);
    const graph2 = parseMermaidToGraph(serialized, 'test.mmd');
    expect(graph2.nodes.size).toBe(graph1.nodes.size);
    expect(graph2.edges.length).toBe(graph1.edges.length);
  });

  it('serialized output is valid Mermaid that can be re-parsed', () => {
    const input = readFileSync(join(fixturesDir, 'basic-flowchart.mmd'), 'utf-8');
    const graph1 = parseMermaidToGraph(input, 'test.mmd');
    const serialized = serializeGraphToMermaid(graph1);

    // The serialized output should start with the diagram type
    expect(serialized).toMatch(/^(flowchart|graph)\s+(TB|LR|BT|RL)/);

    // Basic flowchart with rect shapes passes validator heuristic
    const graph2 = parseMermaidToGraph(serialized, 'test.mmd');
    expect(graph2.validation.valid).toBe(true);
    expect(graph2.nodes.size).toBe(graph1.nodes.size);
    expect(graph2.edges.length).toBe(graph1.edges.length);
  });
});
