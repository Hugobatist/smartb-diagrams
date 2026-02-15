---
phase: 10-graph-model-parser
plan: 01
subsystem: diagram
tags: [typescript, graph-model, mermaid, types, fixtures]

requires:
  - phase: 09-foundation-refactoring
    provides: modular frontend, event bus, DiagramDOM abstraction
provides:
  - GraphModel type system (GraphNode, GraphEdge, GraphSubgraph, GraphModel)
  - NodeShape (13), EdgeType (5), FlowDirection (4) union types
  - SHAPE_PATTERNS and EDGE_SYNTAX lookup tables for parser/serializer
  - 22 .mmd fixture files covering all flowchart syntax features
affects: [10-02-parser, 10-03-serializer, 11-custom-renderer]

tech-stack:
  added: []
  patterns: [graph-type-system, shape-registry-pattern, edge-syntax-mapping]

key-files:
  created:
    - src/diagram/graph-types.ts
    - test/fixtures/graph/*.mmd (22 files)
  modified: []

key-decisions:
  - "Separate graph-types.ts file instead of extending types.ts — backward compatibility for existing DiagramNode/DiagramEdge"
  - "SHAPE_PATTERNS ordered longest-first — correct parsing precedence for overlapping bracket patterns"
  - "Map<K,V> for all collections in GraphModel — consistent with existing DiagramContent.flags pattern"
  - "Trapezoid vs parallelogram disambiguation via close bracket — [/t\\] is trapezoid, [/t/] is parallelogram"

patterns-established:
  - "Shape registry pattern: SHAPE_PATTERNS array with open/close/shape for both parsing and serialization"
  - "Edge syntax mapping: EDGE_SYNTAX record for type-safe edge serialization"

duration: 2min
completed: 2026-02-15
---

# Phase 10 Plan 01: Graph Model Types and Test Fixtures Summary

**GraphModel type system with 13 node shapes, 5 edge types, and 22 .mmd fixture files for comprehensive round-trip testing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T21:53:36Z
- **Completed:** 2026-02-15T21:55:41Z
- **Tasks:** 2
- **Files created:** 23

## Accomplishments

- Complete GraphModel type system in 83 lines — all 9 exports: NodeShape, EdgeType, FlowDirection, GraphNode, GraphEdge, GraphSubgraph, GraphModel, SHAPE_PATTERNS, EDGE_SYNTAX
- 22 .mmd fixture files covering all 13 node shapes, all 5 edge types, nested subgraphs, classDef/style directives, annotations, chained edges, bidirectional edges, implicit nodes, and edge cases
- Zero new dependencies — pure TypeScript types and .mmd text files
- All 131 existing tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Define GraphModel type system** - `46e147a` (feat)
2. **Task 2: Create 22 .mmd fixture files** - `7c64647` (feat)

## Files Created/Modified

- `src/diagram/graph-types.ts` - GraphModel type system with all interfaces, union types, and lookup tables (83 lines)
- `test/fixtures/graph/basic-flowchart.mmd` - 3-node LR flowchart with arrow edges
- `test/fixtures/graph/all-node-shapes.mmd` - All 13 Mermaid flowchart node shapes
- `test/fixtures/graph/all-edge-types.mmd` - All 5 edge types (arrow, open, dotted, thick, invisible)
- `test/fixtures/graph/nested-subgraphs.mmd` - 3 levels of subgraph nesting
- `test/fixtures/graph/with-flags-and-statuses.mmd` - SmartB annotation block with flags and statuses
- `test/fixtures/graph/with-classdefs.mmd` - classDef definitions and class assignments
- `test/fixtures/graph/with-styles.mmd` - Inline style directives on nodes
- `test/fixtures/graph/special-characters.mmd` - Quoted labels with parentheses, brackets, quotes
- `test/fixtures/graph/chained-edges.mmd` - Multi-node edge chains on single lines
- `test/fixtures/graph/unicode-labels.mmd` - Portuguese/unicode text in node labels
- `test/fixtures/graph/empty-subgraph.mmd` - Edge case: subgraph with no nodes
- `test/fixtures/graph/direction-variants.mmd` - TB direction layout intent
- `test/fixtures/graph/graph-keyword.mmd` - Uses `graph TD` keyword alias
- `test/fixtures/graph/inline-class-assignment.mmd` - `:::className` syntax
- `test/fixtures/graph/implicit-nodes.mmd` - Nodes defined only via edge references
- `test/fixtures/graph/mixed-edge-labels.mmd` - Pipe and inline label syntax
- `test/fixtures/graph/subgraph-edges.mmd` - Edges from/to subgraph IDs
- `test/fixtures/graph/link-styles.mmd` - linkStyle directives on edges
- `test/fixtures/graph/class-directive.mmd` - `class A,B,C highlight` directive
- `test/fixtures/graph/comments-and-blanks.mmd` - Mermaid comments and blank lines
- `test/fixtures/graph/single-node.mmd` - Edge case: graph with no edges
- `test/fixtures/graph/bidirectional-edges.mmd` - `<-->` and `<-.->` syntax

## Decisions Made

- **Separate graph-types.ts:** Created new file instead of extending existing types.ts. The existing DiagramNode/DiagramEdge types are simpler structures used by the current non-graph pipeline. Keeping them separate ensures backward compatibility. Phase 12 may deprecate old types.
- **SHAPE_PATTERNS ordering:** Longest patterns first (e.g., `([` before `(`, `[[` before `[`) ensures correct precedence when matching overlapping bracket syntax.
- **Map for collections:** Used Map<K,V> for nodes, subgraphs, classDefs, etc. — consistent with existing DiagramContent.flags pattern. JSON serialization concern deferred to Phase 12.
- **Trapezoid disambiguation:** `[/text\]` is trapezoid (wider top), `[/text/]` is parallelogram. Close bracket determines the shape.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GraphModel types ready for import by `graph-parser.ts` (Plan 10-02)
- 22 fixture files ready for round-trip test corpus
- SHAPE_PATTERNS and EDGE_SYNTAX lookup tables ready for parser and serializer
- All existing tests (131) still pass — no regressions

## Self-Check: PASSED

- [x] src/diagram/graph-types.ts exists (83 lines)
- [x] test/fixtures/graph/ contains 22 .mmd files
- [x] 10-01-SUMMARY.md exists
- [x] Commit 46e147a exists (Task 1)
- [x] Commit 7c64647 exists (Task 2)

---
*Phase: 10-graph-model-parser*
*Completed: 2026-02-15*
