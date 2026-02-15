# Plan 12-03 Summary: DiagramDOM, Collapse-UI, Annotations & Export for Custom SVG

**Status**: COMPLETE
**Date**: 2026-02-15

## Changes Made

### Task 1: DiagramDOM (`static/diagram-dom.js`)

1. **`getAllNodeLabels()`** — Updated to detect renderer type. Custom SVG returns `.smartb-node > text` elements; Mermaid returns `.nodeLabel` elements as before.

2. **`findMatchParent()`** — Added `.smartb-edge` to the class list checked during DOM walk-up, alongside existing `.node`, `.cluster`, `.smartb-node`, `.smartb-subgraph`.

3. **`findEdgeElement(edgeId)`** — New method added. Tries `[data-edge-id]` attribute first (custom renderer), then falls back to `[id="L-{edgeId}"]` (Mermaid).

### Task 2: Collapse-UI, Annotations Edge Flags, Export

#### collapse-ui.js (`static/collapse-ui.js`)
- **`attachClickHandlers`**: Node target now uses `e.target.closest('.node') || e.target.closest('.smartb-node')` to match both Mermaid and custom nodes.
- **Cluster label section**: Now checks `.cluster` OR `.smartb-subgraph` for the parent element.
- **`attachFocusHandlers`**: Double-click target similarly updated to match `.node` or `.smartb-node`.

#### annotations.js (`static/annotations.js`)
- **`applyFlagsToSVG` edge flag section**: Expanded to support custom SVG `data-edge-id` lookups:
  - For `L-` prefixed IDs: tries Mermaid `[id="L-..."]` first, then strips prefix and tries `[data-edge-id="..."]`.
  - For non-prefixed IDs: tries direct `[data-edge-id="..."]` lookup.
  - Both paths now call `addBadge()` for visual flag indicators on edges.

#### export.js (`static/export.js`)
- **Custom SVG PNG export**: Added early-return path at the top of `exportPNG()`. When `DiagramDOM.getRendererType() === 'custom'`, clones the current SVG directly, serializes to data URI, and renders to canvas at 2x scale. Bypasses the Mermaid re-render pipeline entirely (which would fail for non-Mermaid SVGs).

## Line Counts (all under 500)

| File | Lines |
|------|-------|
| diagram-dom.js | 213 |
| collapse-ui.js | 310 |
| annotations.js | 491 |
| export.js | 145 |

## Verification

- `npm run build` -- PASS
- `npm test` -- 225 tests passed, 17 test files, 0 failures
