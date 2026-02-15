# Phase 10: Graph Model + Parser - Research

**Researched:** 2026-02-15
**Domain:** Mermaid flowchart parsing, graph data structures, round-trip serialization
**Confidence:** HIGH

## Summary

Phase 10 builds the foundational graph model that all subsequent v2.0 phases depend on. The task is to define TypeScript types for `GraphNode`, `GraphEdge`, and `GraphSubgraph`, implement a regex-based parser (`parseMermaidToGraph()`) that converts .mmd flowchart text into a structured `GraphModel`, and implement a serializer (`serializeGraphToMermaid()`) that converts the model back to semantically equivalent .mmd text with round-trip fidelity.

The existing codebase already has significant parsing infrastructure: `parser.ts` (diagram type detection), `annotations.ts` (flag/status parsing + stripping + injection), `collapser.ts` (subgraph parsing with regex, node counting), and `validator.ts` (bracket matching, dangling arrows). The collapser already identifies subgraphs, their nesting, and the nodes inside them using regex patterns. The new graph parser extends this foundation to also capture node shapes, edge types with labels, classDef/style directives, and the flowchart direction. The serializer is the inverse -- it produces clean .mmd text from a GraphModel.

The project has already decided on a custom regex parser (not `@mermaid-js/parser` which lacks flowchart support, confirmed in `validator.ts` comments and `package.json` where it is a devDependency). The parser targets `flowchart` and `graph` diagram types only -- other types (sequence, state, etc.) are out of scope and use Mermaid fallback. The architecture plan in `ARCHITECTURE.md` already defines the GraphModel types and file locations.

**Primary recommendation:** Build incrementally on existing regex patterns from `collapser.ts`. Structure the parser as a multi-pass pipeline: (1) strip annotations, (2) parse direction + diagram type, (3) parse classDef/style directives, (4) parse subgraphs into a tree, (5) parse node definitions with shapes, (6) parse edges with labels and types, (7) merge flags/statuses from annotations. Keep each parsing concern in its own function. The serializer emits sections in canonical order: direction line, subgraph blocks with nodes, root-level edges, classDef/style directives.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.9 | All graph model types and parser code | Already the project's language |
| Vitest | ^4.0 | Test framework for round-trip tests | Already in use (131 tests passing) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | - | Zero new dependencies -- pure TypeScript regex parsing |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom regex parser | `@mermaid-js/parser` (v0.6) | Does NOT support flowchart/graph diagrams (confirmed). Only supports info, packet, pie, architecture, gitGraph, radar. Unusable for our primary diagram type. |
| Custom regex parser | Chevrotain / ANTLR / PEG.js | Formal grammar parser -- more robust for complex languages, but Mermaid flowchart grammar is not formally specified. Would require reverse-engineering the grammar from Mermaid source. Regex is simpler, already proven in collapser.ts, and sufficient for the subset of Mermaid we support. |
| Custom regex parser | Mermaid.js source code extraction | Could fork internal parser from mermaid package. But Mermaid's internal parser is tightly coupled to its rendering pipeline and uses JISON (legacy). Extremely difficult to extract and maintain independently. |

**Installation:**
```bash
# No new packages needed -- zero new dependencies
```

## Architecture Patterns

### Recommended Project Structure

```
src/
  diagram/
    types.ts              # EXTENDED -- add GraphNode, GraphEdge, GraphSubgraph, GraphModel
    graph-types.ts         # NEW -- GraphModel types (if types.ts gets too large)
    graph-parser.ts        # NEW -- parseMermaidToGraph()
    graph-serializer.ts    # NEW -- serializeGraphToMermaid()
    parser.ts              # EXISTING -- parseDiagramType(), parseDiagramContent()
    annotations.ts         # EXISTING -- flag/status parsing (used by graph-parser)
    collapser.ts           # EXISTING -- subgraph parsing (patterns reused)
    validator.ts           # EXISTING -- validation (used by graph-parser)
    service.ts             # MODIFIED -- add readGraph(), writeFromGraph()
test/
  diagram/
    graph-parser.test.ts   # NEW -- parser unit tests
    graph-serializer.test.ts # NEW -- serializer unit tests
    graph-roundtrip.test.ts  # NEW -- parse(serialize(parse(text))) === parse(text) tests
  fixtures/
    graph/                 # NEW -- 20+ .mmd fixtures for round-trip tests
      basic-flowchart.mmd
      all-node-shapes.mmd
      all-edge-types.mmd
      nested-subgraphs.mmd
      with-flags-and-statuses.mmd
      with-classdefs.mmd
      with-styles.mmd
      special-characters.mmd
      chained-edges.mmd
      unicode-labels.mmd
      empty-subgraph.mmd
      direction-variants.mmd
      ... (20+ fixtures)
```

### Pattern 1: Multi-Pass Parser Pipeline

**What:** Parse the .mmd content in multiple sequential passes, each extracting one concern.
**When to use:** Always -- this is the core parsing strategy.

```typescript
// src/diagram/graph-parser.ts

export function parseMermaidToGraph(rawContent: string, filePath: string): GraphModel {
  // Pre-processing: separate annotations from mermaid content
  const flags = parseFlags(rawContent);
  const statuses = parseStatuses(rawContent);
  const mermaidContent = stripAnnotations(rawContent);

  // Pass 1: Direction + diagram type
  const { diagramType, direction } = parseDirectionLine(mermaidContent);

  // Pass 2: Extract and remove classDef/style directives
  const { cleanContent, classDefs, nodeStyles } = extractStyleDirectives(mermaidContent);

  // Pass 3: Parse subgraph structure (reuse collapser patterns)
  const subgraphs = parseSubgraphStructure(cleanContent);

  // Pass 4: Parse node definitions with shapes
  const nodes = parseNodeDefinitions(cleanContent, subgraphs);

  // Pass 5: Parse edges with labels and types
  const edges = parseEdgeDefinitions(cleanContent);

  // Pass 6: Merge flags and statuses into nodes
  mergeAnnotations(nodes, flags, statuses);

  // Pass 7: Validate referential integrity
  const validation = validateMermaidSyntax(mermaidContent);

  return {
    diagramType: diagramType ?? 'flowchart',
    direction: direction ?? 'TB',
    nodes,
    edges,
    subgraphs,
    classDefs,
    nodeStyles,
    filePath,
    flags,
    statuses,
    validation,
  };
}
```

### Pattern 2: Canonical Serialization Order

**What:** Serialize the GraphModel back to .mmd text in a deterministic order.
**When to use:** Always -- the serializer must produce consistent output.

```typescript
// src/diagram/graph-serializer.ts

export function serializeGraphToMermaid(graph: GraphModel): string {
  const lines: string[] = [];

  // Line 1: diagram type + direction
  lines.push(`${graph.diagramType} ${graph.direction}`);

  // Section: classDef directives
  for (const [name, styles] of graph.classDefs) {
    lines.push(`    classDef ${name} ${styles}`);
  }

  // Section: subgraphs (recursive, depth-first)
  const rootSubgraphs = getRootSubgraphs(graph.subgraphs);
  const nodesInSubgraphs = new Set<string>();
  for (const sg of rootSubgraphs) {
    serializeSubgraph(sg, graph, lines, nodesInSubgraphs, 1);
  }

  // Section: root-level nodes (not inside any subgraph)
  for (const [id, node] of graph.nodes) {
    if (!nodesInSubgraphs.has(id)) {
      lines.push(`    ${serializeNode(id, node)}`);
    }
  }

  // Section: edges
  for (const edge of graph.edges) {
    lines.push(`    ${serializeEdge(edge)}`);
  }

  // Section: node style directives
  for (const [nodeId, styles] of graph.nodeStyles) {
    lines.push(`    style ${nodeId} ${styles}`);
  }

  // Section: class assignments
  // (classDef is above, but class assignments like `class A,B myClass` go here)

  return lines.join('\n') + '\n';
}
```

### Pattern 3: Shape Registry

**What:** A mapping from Mermaid bracket syntax to shape names and back.
**When to use:** In both parser (bracket syntax -> shape name) and serializer (shape name -> bracket syntax).

```typescript
// Shape bracket patterns for parsing
// Order matters: longer patterns must be checked before shorter ones
const SHAPE_PATTERNS: Array<{ open: string; close: string; shape: NodeShape }> = [
  { open: '([',  close: '])', shape: 'stadium' },     // A([text])
  { open: '[[',  close: ']]', shape: 'subroutine' },  // A[[text]]
  { open: '[(',  close: ')]', shape: 'cylinder' },     // A[(text)]
  { open: '((',  close: '))', shape: 'circle' },       // A((text))
  { open: '{{',  close: '}}', shape: 'hexagon' },      // A{{text}}
  { open: '[/',  close: '/]', shape: 'parallelogram' },   // A[/text/]
  { open: '[\\', close: '\\]', shape: 'parallelogram-alt' }, // A[\text\]
  { open: '[/',  close: '\\]', shape: 'trapezoid' },      // A[/text\]
  { open: '[\\', close: '/]', shape: 'trapezoid-alt' },   // A[\text/]
  { open: '>',   close: ']',  shape: 'asymmetric' },  // A>text]
  { open: '{',   close: '}',  shape: 'diamond' },     // A{text}
  { open: '(',   close: ')',  shape: 'rounded' },     // A(text)
  { open: '[',   close: ']',  shape: 'rect' },        // A[text]
];

// For serializer: shape name -> bracket syntax
const SHAPE_BRACKETS: Record<NodeShape, { open: string; close: string }> = {
  rect: { open: '[', close: ']' },
  rounded: { open: '(', close: ')' },
  stadium: { open: '([', close: '])' },
  subroutine: { open: '[[', close: ']]' },
  cylinder: { open: '[(', close: ')]' },
  circle: { open: '((', close: '))' },
  diamond: { open: '{', close: '}' },
  hexagon: { open: '{{', close: '}}' },
  asymmetric: { open: '>', close: ']' },
  parallelogram: { open: '[/', close: '/]' },
  'parallelogram-alt': { open: '[\\', close: '\\]' },
  trapezoid: { open: '[/', close: '\\]' },
  'trapezoid-alt': { open: '[\\', close: '/]' },
};
```

### Pattern 4: Edge Type Registry

**What:** A mapping from Mermaid arrow syntax to edge types and back.
**When to use:** In both parser and serializer.

```typescript
// Edge arrow patterns for parsing
// Order matters: longer patterns first (==> before ==, -.-> before -.-)
const EDGE_PATTERNS: Array<{ regex: RegExp; type: EdgeType; hasArrow: boolean }> = [
  // Thick arrow: ==>
  { regex: /==>\|"?([^"|]*)"?\|/, type: 'thick', hasArrow: true },    // A ==>|text| B
  { regex: /==\s+"?([^"]*)"?\s+==>/, type: 'thick', hasArrow: true }, // A == text ==> B
  { regex: /==>/, type: 'thick', hasArrow: true },                      // A ==> B

  // Dotted arrow: -.->
  { regex: /-\.->\|"?([^"|]*)"?\|/, type: 'dotted', hasArrow: true }, // A -.->|text| B
  { regex: /-\.\s+"?([^"]*)"?\s+\.->/, type: 'dotted', hasArrow: true }, // A -. text .-> B
  { regex: /-.->/, type: 'dotted', hasArrow: true },                    // A -.-> B
  { regex: /-\.-/, type: 'dotted', hasArrow: false },                   // A -.- B (no arrow)

  // Standard arrow: -->
  { regex: /-->\|"?([^"|]*)"?\|/, type: 'arrow', hasArrow: true },    // A -->|text| B
  { regex: /--\s+"?([^"]*)"?\s+-->/, type: 'arrow', hasArrow: true }, // A -- text --> B
  { regex: /-->/, type: 'arrow', hasArrow: true },                      // A --> B

  // Open link: ---
  { regex: /---\|"?([^"|]*)"?\|/, type: 'open', hasArrow: false },    // A ---|text| B
  { regex: /--\s+"?([^"]*)"?\s+---/, type: 'open', hasArrow: false }, // A -- text --- B
  { regex: /---/, type: 'open', hasArrow: false },                      // A --- B

  // Invisible: ~~~
  { regex: /~~~/, type: 'invisible', hasArrow: false },                 // A ~~~ B
];
```

### Anti-Patterns to Avoid

- **Single monolithic regex for the whole file:** Parsing a .mmd file with one giant regex is fragile and unmaintainable. Use a multi-pass approach where each pass handles one concern (subgraphs, nodes, edges, styles).

- **Trying to parse all Mermaid diagram types:** The parser targets `flowchart` and `graph` ONLY. Do not attempt to parse sequence diagrams, state diagrams, etc. Those use fundamentally different syntax.

- **Modifying the existing parser.ts/collapser.ts:** These modules are stable and tested. The new graph parser should import and reuse their functions, not modify them. Build new modules alongside, not on top of.

- **Using `Map` in serialized JSON:** When the GraphModel is sent over WebSocket (Phase 12), `Map` objects do not serialize to JSON. The parser should use `Map` internally (efficient lookups), but the serialized form for WebSocket should use plain objects. Add `toJSON()` / `fromJSON()` conversion methods.

- **Character-for-character round-trip fidelity:** The success criterion is `parse(serialize(parse(text))) === parse(text)` -- semantic equivalence of the *parsed* model, not character-for-character equality of the text. Whitespace, ordering of independent lines, and trailing newlines may differ between original and serialized text.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Flag/status parsing | Custom annotation regex | `parseFlags()` and `parseStatuses()` from `annotations.ts` | Already tested, handles edge cases, handles annotation block boundaries |
| Annotation stripping | Custom block remover | `stripAnnotations()` from `annotations.ts` | Handles trailing blank lines, ensures single trailing newline |
| Diagram type detection | Custom first-line parser | `parseDiagramType()` from `parser.ts` | Already handles comment skipping, known type list |
| Subgraph tree structure | Custom subgraph parser | Reuse regex patterns from `collapser.ts` | `SUBGRAPH_START`, `SUBGRAPH_END` regexes already handle ID + label + nesting |
| Annotation injection | Custom block builder | `injectAnnotations()` from `annotations.ts` | Handles flag escaping, clean/inject cycle |
| Syntax validation | Custom validator | `validateMermaidSyntax()` from `validator.ts` | Bracket matching, dangling arrows already handled |

**Key insight:** The existing codebase does ~60% of what the graph parser needs. The new parser orchestrates existing functions and adds node shape parsing, edge type parsing, and style directive extraction -- the three capabilities that currently do not exist.

## Common Pitfalls

### Pitfall 1: Node ID Ambiguity in Chained Edges

**What goes wrong:** In `A --> B --> C`, node B appears on an edge line but has no explicit shape definition. The parser must still register B as a node (with default shape 'rect').
**Why it happens:** Mermaid allows implicit node creation on edge lines. A node referenced only in edges (never with its own definition line) still exists in the graph.
**How to avoid:** Parse edges AFTER node definitions, but also create nodes for any unrecognized IDs found on edge lines. Use a two-pass approach: first collect all explicit node definitions, then scan edges and create implicit nodes for any missing IDs.
**Warning signs:** `nodes.get('B')` returns undefined for nodes that only appear in edge chains.

### Pitfall 2: Quoted Labels with Special Characters

**What goes wrong:** `A["Node with (brackets) and [more]"]` -- the brackets inside the quoted label are NOT shape delimiters. Naive bracket matching treats them as nested shapes.
**Why it happens:** Mermaid uses `"..."` to escape special characters in labels. The parser must recognize quoted strings and skip bracket matching inside them.
**How to avoid:** Parse quoted labels first (everything between `["` and `"]`), then parse the remaining bracket syntax for shapes. The regex must match the *outermost* brackets considering quotes.
**Warning signs:** Labels with parentheses or brackets are truncated or cause parse errors. Node shapes misidentified.

### Pitfall 3: Subgraph ID vs Label Confusion

**What goes wrong:** `subgraph Auth["Authentication"]` -- the ID is `Auth`, the label is `Authentication`. But `subgraph Authentication` (without brackets) means both ID and label are `Authentication`.
**Why it happens:** Mermaid overloads the subgraph syntax: `subgraph ID["Label"]` vs `subgraph ID` (where ID is also the label).
**How to avoid:** The existing collapser regex handles this correctly: `SUBGRAPH_START = /^\s*subgraph\s+([^\s\[]+)(?:\s*\["([^"]+)"\])?/`. If capture group 2 (label in brackets) is absent, use the ID as the label. Reuse this pattern.
**Warning signs:** Subgraph labels show raw IDs when the bracket syntax is not used.

### Pitfall 4: Multi-line Edge Definitions and Class Shorthand

**What goes wrong:** `A:::myClass --> B` uses the `:::` shorthand to apply a classDef inline. The parser must extract both the edge and the class assignment.
**Why it happens:** Mermaid allows inline class assignment with `:::className` on any node reference.
**How to avoid:** Strip `:::className` suffixes during node parsing and store them as class assignments. Process this before edge parsing so edge regex does not trip on the extra syntax.
**Warning signs:** Edges fail to parse when nodes have `:::` class assignments. Class assignments are lost.

### Pitfall 5: `graph` vs `flowchart` Direction Aliases

**What goes wrong:** `graph TD` and `flowchart TB` are equivalent (TD = TB = top-down). Parser must normalize these.
**Why it happens:** Mermaid accepts both `graph` and `flowchart` keywords, and both `TD` and `TB` for top-down direction.
**How to avoid:** Normalize during parsing: treat `graph` as equivalent to `flowchart`, and `TD` as equivalent to `TB`. The GraphModel stores a canonical direction value.
**Warning signs:** Round-trip test fails because `graph TD` is serialized as `flowchart TB`.

### Pitfall 6: Edge Between Subgraph IDs

**What goes wrong:** `subgraph A ... end` followed by `A --> B` creates an edge FROM the subgraph, not a node named A. If A is both a subgraph ID and could be a node ID, the parser must disambiguate.
**Why it happens:** Mermaid allows edges from/to subgraph IDs, treating the subgraph as a composite node. The parser must check whether an edge endpoint is a subgraph ID.
**How to avoid:** Parse subgraphs first, build a set of subgraph IDs. When parsing edges, check if either endpoint is a subgraph ID. If so, store the edge with a flag indicating it connects to a subgraph rather than a regular node.
**Warning signs:** Edges to subgraphs create phantom "implicit" nodes with the subgraph's ID.

### Pitfall 7: Round-Trip Fidelity for Comments and Blank Lines

**What goes wrong:** The original .mmd file has comments (`%% This is a comment`) and blank lines for readability. The serializer strips them, breaking the developer's formatting.
**Why it happens:** Comments and blank lines are not part of the graph model structure. The parser ignores them (correctly), but the serializer has no information to reproduce them.
**How to avoid:** Store comments and blank lines as metadata in the GraphModel (e.g., a `rawLines` array or `comments` array with line numbers). The serializer can then re-inject them at approximately the right positions. Alternatively, accept that serialized output will not preserve comments -- document this as a known limitation and only serialize when the model has been mutated (visual edits). File-watching round-trips that have no model changes should pass through the original text unchanged.
**Warning signs:** Developer comments disappear after any edit operation that triggers serialization.

## Code Examples

### Existing Infrastructure to Reuse

```typescript
// From annotations.ts -- already handles flag/status parsing
import { parseFlags, parseStatuses, stripAnnotations, injectAnnotations } from './annotations.js';

// From parser.ts -- already handles diagram type detection
import { parseDiagramType, parseDiagramContent } from './parser.js';

// From validator.ts -- already handles syntax validation
import { validateMermaidSyntax } from './validator.js';

// From collapser.ts -- regex patterns for subgraphs and nodes
// SUBGRAPH_START = /^\s*subgraph\s+([^\s\[]+)(?:\s*\["([^"]+)"\])?/
// SUBGRAPH_END = /^\s*end\s*$/
// NODE_DEF = /^\s*(\w[\w\d_-]*)(?:\s*\[|\s*\(|\s*\{|\s*\[\[|\s*>)/
// EDGE_LINE = /^\s*(\w[\w\d_-]*)\s*(?:-->|---|-\.-|-.->|==>|-.->)/
```

### Complete Node Shape Definitions (from Mermaid docs, verified via Context7)

```typescript
// All Mermaid v11 flowchart node shapes
type NodeShape =
  | 'rect'              // A[text]      -- rectangle (default)
  | 'rounded'           // A(text)      -- round edges
  | 'stadium'           // A([text])    -- stadium shape
  | 'subroutine'        // A[[text]]    -- double-bordered rectangle
  | 'cylinder'          // A[(text)]    -- cylindrical (database)
  | 'circle'            // A((text))    -- circle
  | 'asymmetric'        // A>text]      -- flag/asymmetric
  | 'diamond'           // A{text}      -- rhombus/diamond
  | 'hexagon'           // A{{text}}    -- hexagon
  | 'parallelogram'     // A[/text/]    -- parallelogram (lean right)
  | 'parallelogram-alt' // A[\text\]    -- parallelogram (lean left)
  | 'trapezoid'         // A[/text\]    -- trapezoid (wider top)
  | 'trapezoid-alt';    // A[\text/]    -- trapezoid (wider bottom)
```

### Complete Edge Type Definitions (from Mermaid docs, verified via Context7)

```typescript
// All Mermaid v11 flowchart edge types
type EdgeType =
  | 'arrow'     // -->    -- standard directed arrow
  | 'open'      // ---    -- undirected line (no arrowhead)
  | 'dotted'    // -.->   -- dotted arrow
  | 'thick'     // ==>    -- thick/bold arrow
  | 'invisible'; // ~~~   -- invisible link (for layout only)

// Edge can also have:
// - Label text: -->|"text"| or -- text -->
// - Bidirectional: <-->
// - Extended length: ----> (extra dashes)
```

### GraphModel Type Definitions

```typescript
// src/diagram/graph-types.ts

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
  // Metadata from annotations
  status?: NodeStatus;
  flag?: Flag;
  // Layout (computed later in Phase 11, not populated by parser)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // Which subgraph this node belongs to (null for root-level)
  subgraphId?: string;
  // Inline class assignment via :::className
  cssClass?: string;
}

export interface GraphEdge {
  id: string;          // Generated: `${from}->${to}` (or `${from}->${to}#${index}` for multi-edges)
  from: string;        // Source node ID (or subgraph ID)
  to: string;          // Target node ID (or subgraph ID)
  label?: string;      // Optional text label on the edge
  type: EdgeType;      // Arrow style
  bidirectional?: boolean;  // <--> edges
}

export interface GraphSubgraph {
  id: string;
  label: string;
  parentId: string | null;   // null for root-level subgraphs
  nodeIds: string[];          // Directly contained node IDs
  childSubgraphIds: string[]; // Nested subgraph IDs
}

export interface GraphModel {
  diagramType: 'flowchart' | 'graph';
  direction: FlowDirection;
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  subgraphs: Map<string, GraphSubgraph>;
  classDefs: Map<string, string>;        // classDef name -> CSS properties string
  nodeStyles: Map<string, string>;       // nodeId -> inline style string
  linkStyles: Map<number, string>;       // edge index -> CSS properties string
  classAssignments: Map<string, string>; // nodeId -> classDef name
  filePath: string;
  flags: Map<string, Flag>;
  statuses: Map<string, NodeStatus>;
  validation: ValidationResult;
}
```

### Node Parsing Regex Strategy

```typescript
// Comprehensive node definition regex
// Matches: NodeId + optional shape brackets + optional label
// Examples:
//   A                     -> id: A, shape: rect, label: A (implicit)
//   A["Load data"]        -> id: A, shape: rect, label: Load data
//   B("Rounded node")     -> id: B, shape: rounded, label: Rounded node
//   C{Decision?}          -> id: C, shape: diamond, label: Decision?
//   D((Circle))           -> id: D, shape: circle, label: Circle
//   E>Asymmetric]         -> id: E, shape: asymmetric, label: Asymmetric
//   F([Stadium])          -> id: F, shape: stadium, label: Stadium
//   G[[Subroutine]]       -> id: G, shape: subroutine, label: Subroutine
//   H[(Database)]         -> id: H, shape: cylinder, label: Database
//   I{{Hexagon}}          -> id: I, shape: hexagon, label: Hexagon

function parseNodeWithShape(fragment: string): { id: string; label: string; shape: NodeShape; cssClass?: string } | null {
  // Strip :::className suffix first
  let cssClass: string | undefined;
  const classMatch = fragment.match(/^([^:]+):::(\w+)(.*)$/);
  if (classMatch) {
    fragment = classMatch[1]! + classMatch[3]!;
    cssClass = classMatch[2]!;
  }

  // Try each shape pattern (longest first)
  const idMatch = fragment.match(/^(\w[\w\d_-]*)/);
  if (!idMatch) return null;

  const id = idMatch[1]!;
  const rest = fragment.slice(id.length).trim();

  if (!rest) {
    // Bare node reference (e.g., A in "A --> B")
    return { id, label: id, shape: 'rect', cssClass };
  }

  for (const { open, close, shape } of SHAPE_PATTERNS) {
    if (rest.startsWith(open)) {
      const closeIdx = rest.lastIndexOf(close);
      if (closeIdx > open.length - 1) {
        let label = rest.slice(open.length, closeIdx);
        // Strip outer quotes if present: ["text"] -> text
        if (label.startsWith('"') && label.endsWith('"')) {
          label = label.slice(1, -1);
        }
        return { id, label: label || id, shape, cssClass };
      }
    }
  }

  return { id, label: id, shape: 'rect', cssClass };
}
```

### Round-Trip Test Pattern

```typescript
// test/diagram/graph-roundtrip.test.ts
import { describe, it, expect } from 'vitest';
import { parseMermaidToGraph } from '../../src/diagram/graph-parser.js';
import { serializeGraphToMermaid } from '../../src/diagram/graph-serializer.js';

function assertRoundTrip(input: string, description: string) {
  it(`round-trips: ${description}`, () => {
    // Parse original
    const graph1 = parseMermaidToGraph(input, 'test.mmd');
    // Serialize back
    const serialized = serializeGraphToMermaid(graph1);
    // Parse the serialized output
    const graph2 = parseMermaidToGraph(serialized, 'test.mmd');
    // Compare models (not text)
    expect(graph2.nodes.size).toBe(graph1.nodes.size);
    expect(graph2.edges.length).toBe(graph1.edges.length);
    expect(graph2.subgraphs.size).toBe(graph1.subgraphs.size);
    expect(graph2.direction).toBe(graph1.direction);

    // Deep compare nodes
    for (const [id, node1] of graph1.nodes) {
      const node2 = graph2.nodes.get(id);
      expect(node2).toBeDefined();
      expect(node2!.label).toBe(node1.label);
      expect(node2!.shape).toBe(node1.shape);
    }

    // Deep compare edges
    for (let i = 0; i < graph1.edges.length; i++) {
      const e1 = graph1.edges[i]!;
      const e2 = graph2.edges[i]!;
      expect(e2.from).toBe(e1.from);
      expect(e2.to).toBe(e1.to);
      expect(e2.label).toBe(e1.label);
      expect(e2.type).toBe(e1.type);
    }
  });
}

describe('Round-trip fidelity', () => {
  assertRoundTrip('flowchart LR\n    A --> B', 'minimal two-node graph');
  assertRoundTrip('flowchart TB\n    A["Hello"] --> B("World")', 'nodes with shapes and labels');
  assertRoundTrip(
    'flowchart LR\n    subgraph SG["Group"]\n        A --> B\n    end',
    'simple subgraph'
  );
  // ... 20+ more fixtures loaded from test/fixtures/graph/
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No graph model -- raw text is the only representation | GraphModel as structured in-memory representation | Phase 10 (this phase) | Foundation for custom renderer, canvas interactions, AI observability |
| Diagram type detection only (`parser.ts`) | Full flowchart parsing -- nodes, edges, subgraphs, styles | Phase 10 (this phase) | Enables server-side graph operations |
| Subgraph parsing only in `collapser.ts` | Complete graph structure including edges and node shapes | Phase 10 (this phase) | Collapser patterns reused and extended |
| `@mermaid-js/parser` considered | Custom regex parser confirmed | v1.0 decision (validator.ts comment) | @mermaid-js/parser v0.6 does not support flowchart |

**Deprecated/outdated:**
- `@mermaid-js/parser` package: still in `devDependencies` of `package.json` but unused. Was evaluated and rejected because it lacks flowchart support. Can be removed as a cleanup task (item 15 in STATE.md pending items).

## Mermaid Flowchart Syntax Reference

### Complete Node Shape Syntax (13 shapes)

| Shape | Syntax | Example | Notes |
|-------|--------|---------|-------|
| Rectangle | `A[text]` | `A["Load data"]` | Default shape. Quotes optional for simple text. |
| Rounded | `A(text)` | `A("Process")` | Round corners. |
| Stadium | `A([text])` | `A(["Start"])` | Pill shape. `(` then `[`. |
| Subroutine | `A[[text]]` | `A[["Validate"]]` | Double-bordered rectangle. |
| Cylinder | `A[(text)]` | `A[("Database")]` | Database shape. `[` then `(`. |
| Circle | `A((text))` | `A(("Hub"))` | Full circle. Double `(`. |
| Asymmetric | `A>text]` | `A>"Flag"]` | Flag/ribbon shape. `>` then `]`. |
| Diamond | `A{text}` | `A{"Decision?"}` | Rhombus. Decision point. |
| Hexagon | `A{{text}}` | `A{{"Process"}}` | Double `{`. |
| Parallelogram | `A[/text/]` | `A[/"Input"/]` | Lean right. |
| Parallelogram (alt) | `A[\text\]` | `A[\"Output"\]` | Lean left. |
| Trapezoid | `A[/text\]` | `A[/"Wide top"\]` | Wider top. |
| Trapezoid (alt) | `A[\text/]` | `A[\"Wide bottom"/]` | Wider bottom. |

### Complete Edge Syntax (5 types x label variants)

| Type | No Label | With Label (pipe) | With Label (inline) |
|------|----------|-------------------|---------------------|
| Arrow | `A --> B` | `A -->&#124;"text"&#124; B` | `A -- "text" --> B` |
| Open | `A --- B` | `A ---&#124;"text"&#124; B` | `A -- "text" --- B` |
| Dotted | `A -.-> B` | `A -.->&#124;"text"&#124; B` | `A -. "text" .-> B` |
| Thick | `A ==> B` | `A ==>&#124;"text"&#124; B` | `A == "text" ==> B` |
| Invisible | `A ~~~ B` | (no label variant) | (no label variant) |

**Bidirectional:** `A <--> B`, `A <-.-> B`, `A <==> B`, `A o--o B`, `A x--x B`

### Style Directives

```mermaid
classDef myClass fill:#f9f,stroke:#333,stroke-width:4px;
class nodeA,nodeB myClass;
A:::myClass  %% Inline class assignment
style nodeA fill:#f9f,stroke:#333,stroke-width:4px;
linkStyle 3 stroke:#ff3,stroke-width:4px,color:red;
linkStyle default color:Sienna;
```

### Subgraph Syntax

```mermaid
subgraph id["Label Text"]
    direction TB   %% Optional: override parent direction
    A --> B
    subgraph nested["Nested"]
        C --> D
    end
end
```

## Scope Boundaries for the Parser

### IN SCOPE (must handle)

1. All 13 node shapes listed above
2. All 5 edge types with and without labels
3. Chained edges: `A --> B --> C`
4. Nested subgraphs (any depth)
5. `classDef` and `class` directives
6. `style` directives on individual nodes
7. `linkStyle` directives on edges
8. `:::className` inline class assignment
9. `flowchart` and `graph` keywords with all 4 directions (TB/TD, BT, LR, RL)
10. Mermaid comments (`%%`) -- skip during parsing
11. SmartB annotations (`%% @flag`, `%% @status`) -- parsed via existing `annotations.ts`
12. Quoted labels with special characters: `["text with (parens) and 'quotes'"]`
13. Edge labels in pipe syntax: `-->|"label"|` and inline syntax: `-- "label" -->`
14. Implicit nodes (created by edge references only, no explicit definition)
15. Subgraph-to-node and subgraph-to-subgraph edges

### OUT OF SCOPE (do not handle)

1. Non-flowchart diagram types (sequence, state, ER, etc.)
2. Mermaid v11.3+ extended shapes (`@{ shape: shapeName }`)
3. `click` interaction directives
4. Markdown strings in labels (`` ` `` backtick syntax)
5. `direction` keyword inside subgraphs (subgraph-local direction override)
6. HTML entities in labels (`&amp;`, `&#124;`)
7. Extended edge lengths (`---->`, `=====>`  -- extra dashes/equals)
8. Circle/cross edge endpoints (`o--o`, `x--x`)

### PHASE 10 ONLY (no rendering or browser integration)

- The parser and serializer are server-side TypeScript only
- No browser-side code changes
- No WebSocket integration (that is Phase 12)
- No REST API endpoints (that is Phase 12)
- No dagre layout computation (that is Phase 11)
- The `x`, `y`, `width`, `height` fields on GraphNode remain undefined (populated in Phase 11)

## Open Questions

1. **Should the parser preserve original line ordering for round-trip fidelity?**
   - What we know: The success criterion requires `parse(serialize(parse(text))) === parse(text)` -- semantic equivalence of the parsed model, not text equality.
   - What's unclear: Whether to store line numbers or ordering hints in the model for better serializer output.
   - Recommendation: Do NOT store line numbers. The serializer produces canonical output in a fixed section order. Accept that serialized text may differ from original formatting. This simplifies both parser and serializer considerably.

2. **Should the GraphModel use Map or plain objects internally?**
   - What we know: `Map` is more ergonomic for node/edge lookups. But `Map` does not serialize to JSON (WebSocket in Phase 12).
   - What's unclear: Whether to use Map everywhere and add toJSON/fromJSON, or use plain objects from the start.
   - Recommendation: Use `Map` internally (consistent with existing codebase -- `DiagramContent.flags` is already a `Map`). Add `serializeGraphModel()` and `deserializeGraphModel()` utility functions for JSON conversion. This keeps Phase 10 clean and defers JSON concerns to Phase 12.

3. **How should subgraph direction overrides be handled?**
   - What we know: Mermaid supports `direction TB` inside subgraphs to override the parent direction. The ARCHITECTURE.md GraphModel has a single `direction` field.
   - What's unclear: Whether to support per-subgraph direction in the model.
   - Recommendation: Mark as OUT OF SCOPE for Phase 10. The global `direction` field is sufficient. Per-subgraph direction can be added later if needed (extend `GraphSubgraph` with optional `direction` field).

4. **Integration with existing `DiagramNode` and `DiagramEdge` types in `types.ts`?**
   - What we know: `types.ts` already defines `DiagramNode` (id, label, shape, status) and `DiagramEdge` (from, to, label, type). These are similar to the new `GraphNode` and `GraphEdge`.
   - What's unclear: Whether to extend the existing types or define new ones.
   - Recommendation: Define new `GraphNode`/`GraphEdge` in a new `graph-types.ts` file. The existing `DiagramNode`/`DiagramEdge` are simpler types used by the current (non-graph) pipeline and should remain unchanged for backward compatibility. Phase 12 may deprecate the old types.

## File Size Estimates

| File | Estimated Lines | Under 500? |
|------|-----------------|------------|
| `src/diagram/graph-types.ts` | ~80 | Yes |
| `src/diagram/graph-parser.ts` | ~350-450 | Yes (may need splitting if > 400) |
| `src/diagram/graph-serializer.ts` | ~200-250 | Yes |
| `src/diagram/service.ts` (modified) | ~210 (from 191) | Yes |
| `test/diagram/graph-parser.test.ts` | ~300 | Yes |
| `test/diagram/graph-serializer.test.ts` | ~200 | Yes |
| `test/diagram/graph-roundtrip.test.ts` | ~250 | Yes |
| `test/fixtures/graph/*.mmd` | ~20+ files, ~10-30 lines each | Yes |

**Risk:** `graph-parser.ts` could approach 450 lines if all 13 shapes + 5 edge types + subgraphs + styles are in one file. If it exceeds 400 lines, split into `graph-parser.ts` (orchestrator + edges) and `node-parser.ts` (node shapes + class assignments). The serializer is simpler and unlikely to exceed 300 lines.

## Sources

### Primary (HIGH confidence)
- Mermaid.js official documentation (Context7 `/mermaid-js/mermaid`) -- flowchart syntax reference, all node shapes, all edge types, classDef/style syntax
- Mermaid.js official flowchart examples (Context7) -- comprehensive examples showing 14 shape types and styled links
- Existing codebase (`src/diagram/collapser.ts`) -- subgraph regex patterns, node/edge detection regex (verified in 42 tests)
- Existing codebase (`src/diagram/annotations.ts`) -- flag/status parsing, strip/inject functions (verified in 22 tests)
- Existing codebase (`src/diagram/validator.ts`) -- @mermaid-js/parser limitation confirmation (lines 22-25)
- ARCHITECTURE.md -- GraphModel type definitions, file locations, design principles (from v2.0 architecture research)
- Mermaid flowchart official docs (https://mermaid.js.org/syntax/flowchart.html) -- node shapes, edge types, subgraph syntax, styling

### Secondary (MEDIUM confidence)
- SUMMARY.md (v2.0 research summary) -- stack decisions, build order, key types
- FEATURES.md -- feature landscape, anti-features, dependency chain
- Phase 9 RESEARCH.md -- foundation refactoring, event bus, DiagramDOM patterns

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, purely extends existing TypeScript codebase
- Architecture: HIGH -- multi-pass parser pattern is well-established; types already designed in ARCHITECTURE.md; existing regex patterns from collapser.ts proven with 42 tests
- Pitfalls: HIGH -- identified from actual Mermaid syntax analysis and existing codebase patterns; quote handling and implicit node creation are the two trickiest parsing challenges
- Round-trip fidelity: MEDIUM -- semantic equivalence is well-defined but edge cases (comments, blank lines, ordering) need implementation decisions
- Mermaid syntax completeness: HIGH -- all 13 node shapes and 5 edge types verified via Context7 against Mermaid.js official docs

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- Mermaid flowchart syntax is mature and unlikely to change)
