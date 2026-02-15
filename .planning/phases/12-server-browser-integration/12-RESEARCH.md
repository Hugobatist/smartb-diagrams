# Phase 12: Server + Browser Integration - Research

**Researched:** 2026-02-15
**Domain:** WebSocket real-time graph updates, custom renderer default activation, interaction module integration, status/flag rendering on custom SVG
**Confidence:** HIGH

## Summary

Phase 12 completes the end-to-end data flow: file change on disk triggers the server to parse the file into a GraphModel, which is sent via WebSocket as a `graph:update` message to the browser, which renders it using the custom SVG renderer. Phase 11 already built most of the pipeline -- the `/api/graph/:file` endpoint, dagre layout, SVG renderer, `custom-renderer.js` orchestrator, `?renderer=custom` toggle, and DiagramDOM dual support. What remains is three categories of work:

1. **WebSocket `graph:update` messages** -- The server's file watcher currently sends `file:changed` with raw `.mmd` text. A new `graph:update` message type must be added alongside it (backward compatible), carrying the serialized GraphModel JSON. The browser's `app-init.js` WebSocket handler must process `graph:update` and call `SmartBCustomRenderer.render(graphModel)` directly, avoiding the HTTP roundtrip that `fetchAndRender()` currently performs.

2. **Custom renderer as default for flowcharts** -- Currently `?renderer=custom` is required. Phase 12 makes the custom renderer the **default** for flowchart/graph diagram types, with Mermaid as fallback for other types (sequence, state, etc.) and as error fallback. This requires detecting diagram type from the graph model or `/api/diagrams/:file` validation result.

3. **Interaction module integration** -- All existing interactions (flags/annotations, search, collapse, export, status colors) must work correctly with custom SVG. DiagramDOM already supports both renderers for most operations. The gaps are: (a) status colors not applied to custom SVG nodes, (b) search relies on `.nodeLabel` class which custom SVG uses `<text>` elements instead, (c) collapse-ui uses `.node` and `.cluster` CSS classes that don't exist in custom SVG, (d) export.js PNG export assumes Mermaid re-render, (e) edge flags in annotations use Mermaid's `L-*` ID format.

**Primary recommendation:** Split this phase into 3-4 plans: (1) WebSocket `graph:update` + server-side changes, (2) auto-detection of renderer type and flowchart default, (3) interaction module compatibility (flags, search, collapse, export, status colors), (4) integration tests.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ws (npm) | existing | WebSocket server (already installed) | Already used; no new dependency |
| @dagrejs/dagre | 2.0.4 (CDN) | Browser-side layout (already loaded) | Already loaded from Phase 11 |
| Native SVG DOM API | browser built-in | SVG manipulation for status/flag overlays | Already used by svg-renderer.js, annotations.js |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | Zero new dependencies for this phase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sending full GraphModel via WebSocket | Sending only a diff/patch | Full model is simpler and correct for v2.0. Diffs add complexity. Graph models are typically <50KB even for large diagrams. Optimize later if perf issues arise. |
| Auto-detecting diagram type client-side | Always using custom renderer | Not all diagram types are supported by the custom renderer (only flowchart/graph). Must detect and fall back for sequence, state, class, etc. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Changes Map

```
src/
  server/
    websocket.ts     # MODIFY -- add graph:update to WsMessage type
    routes.ts        # MODIFY -- add flags/statuses to /api/graph/:file response
    server.ts        # MODIFY -- file watcher sends graph:update alongside file:changed
  diagram/
    service.ts       # (unchanged -- readGraph already exists)
static/
    app-init.js      # MODIFY -- handle graph:update WS message, auto-select renderer
    custom-renderer.js # MODIFY -- accept graph model with flags/statuses, apply status colors
    svg-renderer.js  # MODIFY -- add status color support (fill/stroke based on node.status)
    diagram-dom.js   # MODIFY -- add getAllNodeLabels support for custom SVG text elements
    annotations.js   # MODIFY -- handle edge flags for custom renderer's data-edge-id format
    search.js        # MODIFY -- support custom SVG text element search
    collapse-ui.js   # MODIFY -- support custom SVG class names (.smartb-node, .smartb-subgraph)
    export.js        # MODIFY -- custom SVG export path (direct SVG clone, no Mermaid re-render for PNG)
    renderer.js      # (unchanged)
test/
    server/server.test.ts # MODIFY -- add graph:update WebSocket tests
```

### Pattern 1: Dual WebSocket Messages (Backward Compatible)

**What:** The file watcher sends BOTH `file:changed` and `graph:update` when a `.mmd` file changes. The `file:changed` message is unchanged (carries raw text). The `graph:update` message carries the serialized GraphModel JSON.
**When to use:** Every file change event for flowchart/graph files.
**Why both:** Backward compatibility. The VS Code extension and any future consumers rely on `file:changed`. The browser can choose which message to handle based on renderer type.

```typescript
// In server.ts, inside the FileWatcher onFileChanged callback:

async (file) => {
  const content = await readFile(path.join(resolvedDir, file), 'utf-8').catch(() => null);
  if (content === null) return;

  // Always send file:changed (backward compat)
  wsManager.broadcast('default', { type: 'file:changed', file, content });

  // Also send graph:update for custom renderer consumers
  try {
    const graph = await service.readGraph(file);
    const graphJson = serializeGraphModel(graph);
    wsManager.broadcast('default', { type: 'graph:update', file, graph: graphJson });
  } catch {
    // Parse error -- file:changed still sent, browser can fall back to Mermaid
  }
}
```

### Pattern 2: Auto-Select Renderer by Diagram Type

**What:** Instead of requiring `?renderer=custom`, detect diagram type and auto-select the renderer. Flowchart/graph diagrams use the custom renderer by default; all other types use Mermaid.
**When to use:** On initial load and on every diagram switch/update.

```javascript
// In app-init.js:

function selectRendererType(diagramType) {
    // User override via ?renderer= always wins
    var paramRenderer = params.get('renderer');
    if (paramRenderer) return paramRenderer;

    // Auto-select: custom for flowchart/graph, mermaid for everything else
    if (diagramType === 'flowchart' || diagramType === 'graph') {
        return 'custom';
    }
    return 'mermaid';
}
```

### Pattern 3: Status Colors on Custom SVG Nodes

**What:** Apply status-dependent fill/stroke colors directly to SVG node shape elements, matching the Mermaid classDef colors in `renderer.js`.
**When to use:** After SVG rendering, during the `applyFlagsToSVG()` post-processing step.

```javascript
// Status color map (matches renderer.js STATUS_CLASS_MAP + classDef values)
var STATUS_COLORS = {
    'ok':          { fill: '#22c55e', stroke: '#16a34a', text: '#fff' },
    'problem':     { fill: '#ef4444', stroke: '#dc2626', text: '#fff' },
    'in-progress': { fill: '#eab308', stroke: '#ca8a04', text: '#000' },
    'discarded':   { fill: '#9ca3af', stroke: '#6b7280', text: '#fff' },
};

function applyStatusColorsToCustomSVG(statuses) {
    var svg = DiagramDOM.getSVG();
    if (!svg || DiagramDOM.getRendererType() !== 'custom') return;

    for (var entry of statuses) {
        var nodeId = entry[0];
        var status = entry[1];
        var colors = STATUS_COLORS[status];
        if (!colors) continue;

        var nodeEl = svg.querySelector('[data-node-id="' + nodeId + '"]');
        if (!nodeEl) continue;

        // Find the shape element (first child that isn't <text>)
        var shape = nodeEl.querySelector('rect, circle, polygon, path, ellipse');
        if (!shape) {
            // For subroutine <g>, find child shapes
            var shapeG = nodeEl.querySelector('g');
            if (shapeG) shape = shapeG.querySelector('rect');
        }
        if (shape) {
            shape.setAttribute('fill', colors.fill);
            shape.setAttribute('stroke', colors.stroke);
        }
        var text = nodeEl.querySelector('text');
        if (text) text.setAttribute('fill', colors.text);
    }
}
```

### Pattern 4: GraphModel Serialization Helper

**What:** A shared function to convert GraphModel (with Maps) to JSON-safe plain objects, including flags and statuses.
**When to use:** In routes.ts and server.ts when sending graph data over HTTP/WebSocket.

```typescript
// In a new utility or inline in routes.ts / server.ts

function serializeGraphModel(graph: GraphModel): Record<string, unknown> {
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
    // Phase 12 additions:
    flags: Object.fromEntries(graph.flags),
    statuses: Object.fromEntries(graph.statuses),
  };
}
```

### Pattern 5: DiagramDOM Search Support for Custom SVG

**What:** Extend `DiagramDOM.getAllNodeLabels()` to return custom SVG text elements, not just Mermaid `.nodeLabel` spans.
**When to use:** Called by search.js to find matching nodes.

```javascript
// Updated getAllNodeLabels in diagram-dom.js:
getAllNodeLabels: function() {
    var svg = this.getSVG();
    if (!svg) return [];
    if (this.getRendererType() === 'custom') {
        // Custom SVG: text labels are direct children of .smartb-node groups
        return Array.from(svg.querySelectorAll('.smartb-node > text'));
    }
    // Mermaid: .nodeLabel spans
    return Array.from(svg.querySelectorAll('.nodeLabel'));
}
```

### Anti-Patterns to Avoid

- **Breaking existing `file:changed` consumers:** The VS Code extension and future MCP tools rely on `file:changed`. Never replace it -- only ADD `graph:update` alongside it.

- **Forcing custom renderer on non-flowchart diagrams:** The custom renderer only supports flowchart/graph. Sequence diagrams, state diagrams, etc. MUST use Mermaid. Never try to render unsupported types with the custom renderer.

- **Re-parsing graph model on WebSocket receive:** When `graph:update` arrives via WebSocket, the graph model is already parsed. DO NOT call `fetchAndRender()` which would make another HTTP request. Call `render(graphModel)` directly with the received data.

- **Modifying SVG elements during render:** Status colors and flags should be applied AFTER the SVG is inserted into the DOM, not during the render pipeline. The svg-renderer.js `createSVG()` function should remain a pure layout-to-SVG transformation. Post-processing happens via annotations.js and the new status color function.

- **Sending `graph:update` for non-flowchart files:** If the file is a sequence diagram or other unsupported type, `parseMermaidToGraph()` may fail or produce garbage. Guard with try/catch and only send `graph:update` when parsing succeeds.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph model serialization | Inline conversion in each location | Shared `serializeGraphModel()` utility | Currently duplicated between routes.ts handler and will be needed in server.ts WebSocket handler. Extract once. |
| Diagram type detection | Parse Mermaid source in browser | Use `diagramType` field from GraphModel JSON or `/api/diagrams/:file` validation result | The server already parses diagram type during `parseMermaidToGraph()`. The browser should use the server's parsed value, not re-parse. |
| CSS class name matching | Hardcode class names in each module | Extend DiagramDOM with renderer-aware query methods | DiagramDOM already handles Mermaid vs custom for `findNodeElement`, `findSubgraphElement`, `extractNodeId`. Extend the pattern for the remaining gaps. |

**Key insight:** Phase 11 built 90% of the pipeline. Phase 12 is primarily about wiring -- connecting the WebSocket to the graph pipeline, extending DiagramDOM for the remaining interaction gaps, and making the custom renderer the default for flowcharts. No new algorithms or complex logic.

## Common Pitfalls

### Pitfall 1: WebSocket Message Size for Large Diagrams

**What goes wrong:** A large diagram with 200+ nodes produces a GraphModel JSON that could be 100KB+. Sending this on every keystroke via WebSocket could cause lag.
**Why it happens:** chokidar fires `change` events on every file save. Fast typing with auto-save could trigger dozens of `graph:update` messages per second.
**How to avoid:** The existing `file:changed` message already sends full file content, so the WebSocket is already handling similar payloads. However, consider: (1) the graph model JSON will be larger than raw `.mmd` text because it includes parsed structure, (2) debouncing at the watcher level is already handled by chokidar's `atomic: true` option. If size becomes an issue in practice, add a simple debounce (100ms) for `graph:update` messages only. For Phase 12, start without debounce and optimize if needed.
**Warning signs:** Browser becomes sluggish during fast editing; WebSocket messages queue up; memory usage climbs.

### Pitfall 2: Race Condition Between `file:changed` and `graph:update`

**What goes wrong:** Browser receives `file:changed` first, starts Mermaid render; then `graph:update` arrives, starts custom render. Two renders fight for the same `#preview` container.
**Why it happens:** Both messages are sent from the same watcher callback, but the browser handles them asynchronously. If `rendererType` is 'custom', the browser should ignore `file:changed` for rendering (still use it for editor sync).
**How to avoid:** In `app-init.js`, when using the custom renderer, `file:changed` should only update the editor textarea and `lastContent` state. Rendering should be triggered exclusively by `graph:update`. When using Mermaid renderer, only `file:changed` triggers rendering (backward compat).
**Warning signs:** Diagram flickers between Mermaid and custom rendering; render errors from mismatched data.

### Pitfall 3: Search Fails on Custom SVG

**What goes wrong:** Ctrl+F search finds no matches because `search.js` calls `DiagramDOM.getAllNodeLabels()` which returns `.nodeLabel` elements. Custom SVG has `.smartb-node > text` elements instead.
**Why it happens:** `getAllNodeLabels()` was not updated in Phase 11 to support custom SVG. The Phase 11 DiagramDOM updates focused on `findNodeElement`, `findSubgraphElement`, `extractNodeId`, `getNodeLabel`, and `findMatchParent`, but missed `getAllNodeLabels`.
**How to avoid:** Update `getAllNodeLabels()` to check `getRendererType()` and return appropriate elements. Also update `findMatchParent()` to include `.smartb-edge` class (currently only has `.smartb-node` and `.smartb-subgraph`).
**Warning signs:** Search shows "Nenhum" even when matching nodes are visible; search works in Mermaid mode but not custom mode.

### Pitfall 4: Collapse-UI Misses Custom SVG Click Targets

**What goes wrong:** Clicking on collapsed nodes or cluster labels does nothing in custom renderer mode.
**Why it happens:** `collapse-ui.js` uses `e.target.closest('.node')` and `clusterLabel.closest('.cluster')` which are Mermaid-specific CSS classes. Custom SVG uses `.smartb-node` and `.smartb-subgraph`.
**How to avoid:** Update the click handler selectors to check both: `e.target.closest('.node') || e.target.closest('.smartb-node')`. Similarly for cluster: `e.target.closest('.cluster') || e.target.closest('.smartb-subgraph')`. Same for double-click focus mode handler.
**Warning signs:** Collapse/expand buttons don't respond; focus mode doesn't activate on double-click; these features work when `?renderer=mermaid` is forced.

### Pitfall 5: Export PNG Breaks for Custom SVG

**What goes wrong:** PNG export fails or produces wrong output because `export.js` re-renders via `mermaid.render()` with `htmlLabels:false`. For custom SVG, this doesn't apply.
**Why it happens:** The custom SVG already uses native SVG `<text>` elements (no `<foreignObject>`), so it doesn't have the Canvas taint issue. But the export code doesn't know about the custom renderer.
**How to avoid:** In `exportPNG()`, check the renderer type. For custom SVG: clone the existing SVG directly (it's already Canvas-safe), serialize with `XMLSerializer`, and draw to Canvas. No need for the Mermaid re-render dance. For Mermaid: keep existing logic.
**Warning signs:** PNG export produces blank or incorrect image; error "Erro ao exportar PNG"; Canvas taint error even though custom SVG shouldn't have it.

### Pitfall 6: Edge Flags Use Wrong ID Format

**What goes wrong:** Edge flags set via annotations.js use Mermaid's `L-*` edge ID format (e.g., `L-A->B`). Custom SVG uses data-edge-id with the format `A->B`.
**Why it happens:** `annotations.js` line 113 checks `nodeId.startsWith('L-')` and queries `svg.querySelector('[id="' + nodeId + '"]')` for edge flags. Custom SVG edges have `data-edge-id="A->B"` instead.
**How to avoid:** In the edge flag section of `applyFlagsToSVG()`, add a renderer type check. For custom SVG, query by `data-edge-id` and try both the `L-*` stripped format and the direct format. Also handle the reverse direction since edges may be stored as `A->B` but flagged as `L-A->B`.
**Warning signs:** Edge flags show in Mermaid mode but not custom mode; flag badges don't appear on edges.

### Pitfall 7: Graph:update Not Sent for Parse Failures

**What goes wrong:** A malformed `.mmd` file triggers `file:changed` (raw text), but `graph:update` is skipped because `parseMermaidToGraph()` throws. The browser in custom renderer mode has no new data to render.
**Why it happens:** The graph parser is strict and will fail on syntax errors that Mermaid might handle gracefully.
**How to avoid:** Wrap `graph:update` sending in try/catch. On parse failure, don't send `graph:update`. The browser should fall back: if using custom renderer and no `graph:update` arrives within a reasonable window after `file:changed`, re-render with Mermaid. Alternatively, the `file:changed` handler should still update the editor, and the custom renderer should show the last successful render with an error indicator.
**Warning signs:** Diagram goes blank after a syntax error; editor shows updated content but preview doesn't change; no error feedback to user.

## Code Examples

### WebSocket Message Type Extension

```typescript
// In websocket.ts:

export type WsMessage =
  | { type: 'file:changed'; file: string; content: string }
  | { type: 'file:added'; file: string }
  | { type: 'file:removed'; file: string }
  | { type: 'tree:updated'; files: string[] }
  | { type: 'connected'; project: string }
  // Phase 12 addition:
  | { type: 'graph:update'; file: string; graph: Record<string, unknown> };
```

### Browser-Side WebSocket Handler for graph:update

```javascript
// In app-init.js, inside the createReconnectingWebSocket callback:

case 'graph:update':
    if (msg.file === SmartBFileTree.getCurrentFile()) {
        if (effectiveRendererType === 'custom') {
            SmartBCustomRenderer.render(msg.graph);
        }
        // If using Mermaid, ignore graph:update (file:changed handles it)
    }
    break;
```

### Enhanced /api/graph/:file with Flags and Statuses

```typescript
// In routes.ts, updated graph endpoint handler:

const json = {
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
  // Phase 12: include annotations for custom renderer
  flags: Object.fromEntries(graph.flags),
  statuses: Object.fromEntries(graph.statuses),
};
```

### Collapse-UI Updated Click Handlers

```javascript
// In collapse-ui.js, updated attachClickHandlers:

diagram.addEventListener('click', function(e) {
    if (e.target.closest('.zoom-controls')) return;
    if (e.target.closest('.flag-popover')) return;

    // Support both Mermaid (.node) and custom (.smartb-node)
    var target = e.target.closest('.node') || e.target.closest('.smartb-node');
    if (target) {
        var nodeId = self.extractNodeId(target);
        // ... rest unchanged
    }

    // Support both Mermaid (.cluster-label) and custom (.smartb-subgraph)
    var clusterLabel = e.target.closest('.cluster-label');
    var smartbSubgraph = e.target.closest('.smartb-subgraph');
    if (clusterLabel || smartbSubgraph) {
        var cluster = clusterLabel
            ? clusterLabel.closest('.cluster')
            : smartbSubgraph;
        // ... rest unchanged
    }
});
```

### Export PNG for Custom SVG

```javascript
// In export.js, updated exportPNG:

async function exportPNG() {
    var currentSvg = document.querySelector('#preview svg');
    if (!currentSvg) return window.toast && toast('Nada para exportar');

    var isCustom = DiagramDOM.getRendererType() === 'custom';
    var currentFile = window.currentFile || 'diagram.mmd';

    if (isCustom) {
        // Custom SVG is already Canvas-safe (no foreignObject)
        var clone = currentSvg.cloneNode(true);
        // Inline all computed styles for standalone SVG
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var data = new XMLSerializer().serializeToString(clone);
        var img = new Image();
        img.onload = function() {
            canvas.width = img.width * 2;
            canvas.height = img.height * 2;
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(function(blob) {
                download(blob, currentFile.replace('.mmd', '.png'));
            }, 'image/png');
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
        return;
    }

    // Mermaid path: existing logic unchanged
    // ...
}
```

## Existing Code Inventory (What's Already Done)

Phase 11 completed all of these, which Phase 12 builds upon:

| Component | File | Status | Lines |
|-----------|------|--------|-------|
| GET /api/graph/:file | src/server/routes.ts | DONE (needs flags/statuses addition) | 389 |
| dagre layout engine | static/dagre-layout.js | DONE | 283 |
| SVG shape factories (13 shapes) | static/svg-shapes.js | DONE | 218 |
| SVG renderer (nodes, edges, subgraphs) | static/svg-renderer.js | DONE | 279 |
| Custom renderer orchestrator | static/custom-renderer.js | DONE | 92 |
| ViewportTransform | static/viewport-transform.js | DONE | 107 |
| ?renderer=custom toggle | static/app-init.js | DONE | 304 |
| DiagramDOM dual support | static/diagram-dom.js | DONE (needs getAllNodeLabels fix) | 191 |
| renderWithType() wrapper | static/app-init.js | DONE | 304 |
| Mermaid fallback on custom error | static/app-init.js | DONE | 304 |
| data-node-id attributes | static/svg-renderer.js | DONE | 279 |
| data-edge-id attributes | static/svg-renderer.js | DONE | 279 |
| data-subgraph-id attributes | static/svg-renderer.js | DONE | 279 |
| Dagre + ViewportTransform tests | test/ | DONE (20 tests) | 282 |

## Gap Analysis (What Phase 12 Must Build)

### Success Criterion 1: GET /api/graph/:file returns GraphModel JSON
**Status: ALREADY DONE from Phase 11**
**Gap:** Endpoint exists but does not include `flags` and `statuses` in the response. Add these two fields.
**Effort:** ~5 lines changed in routes.ts.

### Success Criterion 2: WebSocket sends `graph:update` messages alongside `file:changed`
**Status: NOT DONE**
**Gaps:**
- `WsMessage` type in websocket.ts does not include `graph:update`
- File watcher in server.ts only sends `file:changed`
- Browser app-init.js WebSocket handler doesn't handle `graph:update`
- Need shared `serializeGraphModel()` helper to avoid duplication with routes.ts
**Effort:** ~40 lines server-side, ~20 lines browser-side.

### Success Criterion 3: live.html uses custom renderer for flowchart diagrams, Mermaid fallback for others
**Status: PARTIALLY DONE (toggle exists, auto-detection does not)**
**Gaps:**
- `rendererType` is currently static from URL `?renderer=` param
- Need dynamic renderer selection based on diagram type
- Need to handle file-switch (when user clicks a different file, re-evaluate renderer type)
- Need to detect diagram type from the `graph:update` message or `/api/diagrams/:file` response
**Effort:** ~30-40 lines in app-init.js.

### Success Criterion 4: All existing interactions work with custom renderer via DiagramDOM
**Status: PARTIALLY DONE**
**Gaps by module:**

| Module | Gap | Fix |
|--------|-----|-----|
| annotations.js `applyFlagsToSVG()` | Edge flags use `L-*` ID format; custom SVG uses `data-edge-id` with `A->B` format | Add renderer-aware edge query in applyFlagsToSVG |
| search.js | `getAllNodeLabels()` returns `.nodeLabel` only; custom SVG has `.smartb-node > text` | Update DiagramDOM.getAllNodeLabels() for custom SVG |
| search.js | `findMatchParent()` doesn't match `.smartb-edge` | Add `.smartb-edge` to class list check |
| collapse-ui.js | Click handler uses `.node` and `.cluster` selectors | Add `.smartb-node` and `.smartb-subgraph` alternatives |
| collapse-ui.js | Double-click focus mode uses `.node` selector | Add `.smartb-node` alternative |
| collapse-ui.js | `extractClusterId()` uses regex on `subGraph*` IDs | Already handled by DiagramDOM.extractNodeId data-* check |
| export.js | PNG export re-renders via Mermaid; doesn't work for custom SVG | Add custom SVG export path (direct SVG clone) |
| export.js | SVG export works (already uses `#preview svg`) | No change needed |

**Effort:** ~60-80 lines across 4-5 files.

### Success Criterion 5: Status colors, flag badges, and search highlights render correctly on custom SVG
**Status: NOT DONE**
**Gaps:**
- Status colors: Not applied to custom SVG nodes. Need new `applyStatusColorsToCustomSVG()` function or integrate into existing `applyFlagsToSVG()`.
- Flag badges: `addBadge()` in annotations.js uses `element.getBBox()` which works on both Mermaid and custom SVG `<g>` elements. **This should already work.**
- Search highlights: `.search-match` and `.search-match-active` CSS classes are added to parent elements. For Mermaid these are `.node`/`.cluster` elements. For custom SVG these would be `.smartb-node`/`.smartb-subgraph` elements. The CSS needs to target both.
- Status colors in `/api/graph/:file`: The endpoint doesn't include statuses. The `GraphModel.nodes` already have `status` field populated by the graph-parser when annotations are present.
**Effort:** ~40-50 lines for status color logic, ~10 lines CSS.

## File Size Projections

| File | Current Lines | Projected Lines | Under 500? | Notes |
|------|--------------|-----------------|------------|-------|
| src/server/websocket.ts | 115 | ~125 | Yes | Add graph:update to WsMessage type |
| src/server/routes.ts | 389 | ~395 | Yes | Add flags/statuses to graph endpoint |
| src/server/server.ts | 296 | ~325 | Yes | Add graph:update to file watcher callbacks |
| static/app-init.js | 304 | ~350 | Yes | Handle graph:update WS, auto-select renderer |
| static/custom-renderer.js | 92 | ~110 | Yes | Accept flags/statuses, apply status colors |
| static/svg-renderer.js | 279 | ~295 | Yes | Minor: status color support via post-render hook |
| static/diagram-dom.js | 191 | ~210 | Yes | getAllNodeLabels custom SVG, findMatchParent edge |
| static/annotations.js | 478 | ~495 | Yes | Edge flag support for custom SVG. CLOSE TO LIMIT |
| static/search.js | 304 | ~310 | Yes | Minor CSS class additions |
| static/collapse-ui.js | 310 | ~325 | Yes | Dual selector support |
| static/export.js | 121 | ~165 | Yes | Custom SVG PNG export path |

**Risk:** `annotations.js` is at 478 lines, close to the 500-line limit. Adding edge flag support for custom SVG will push it near ~495. If it exceeds 500, extract the status color logic into a separate `status-colors.js` module (~40 lines).

## Testing Strategy

### Automated Tests (Vitest)

1. **WebSocket `graph:update` test** -- In `server.test.ts`, write a `.mmd` file, listen for WebSocket messages, verify both `file:changed` AND `graph:update` arrive. Verify `graph:update` has correct structure (diagramType, nodes, edges, flags, statuses).

2. **GET /api/graph/:file with flags/statuses** -- In `server.test.ts`, read a fixture that has `%% @flag` and `%% @status` annotations, verify the response includes `flags` and `statuses` fields.

3. **GraphModel serialization helper** -- Unit test that Maps are correctly converted to plain objects.

### Manual Tests (Browser)

4. **Auto-renderer selection** -- Open live.html without `?renderer=` param, load a flowchart file, verify CUSTOM indicator appears. Load a non-flowchart file (if any), verify Mermaid is used.

5. **WebSocket graph:update** -- Edit a `.mmd` file externally, verify preview updates without page reload, verify custom renderer is used.

6. **Flags on custom SVG** -- Set a flag on a node, verify red badge appears on custom SVG node.

7. **Status colors** -- Add `%% @status NodeA ok` annotation, verify node turns green in custom SVG.

8. **Search** -- Press Ctrl+F, type a node name, verify matching nodes highlight in custom SVG.

9. **Collapse** -- Click a subgraph label, verify collapse works. Double-click a node, verify focus mode works.

10. **Export** -- Export SVG and PNG from custom renderer, verify both produce valid output.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mermaid-only rendering | Custom renderer default for flowcharts | Phase 12 (this phase) | Enables all v2.0 features (canvas interactions, ghost paths, heatmaps) |
| Raw text via WebSocket | Raw text + structured GraphModel via WebSocket | Phase 12 (this phase) | Browser skips HTTP roundtrip for graph data; enables future incremental updates |
| Manual ?renderer=custom toggle | Auto-detection by diagram type | Phase 12 (this phase) | Zero-config custom renderer; seamless fallback |

**Deprecated/outdated:**
- `?renderer=custom` manual toggle: Will still work as an override, but is no longer required for flowcharts.

## Open Questions

1. **Should collapse work differently with the custom renderer?**
   - What we know: Collapse currently uses server-side `.mmd` text manipulation (generates collapsed Mermaid source). With the custom renderer, collapse COULD work client-side by modifying the graph model directly (hide nodes, replace with summary node).
   - What's unclear: Whether to keep the server-side approach or move to client-side for Phase 12.
   - Recommendation: **Keep server-side collapse for Phase 12.** The existing approach works (collapse sends request to `/api/diagrams/:file?collapsed=[...]`, gets back modified Mermaid content). The custom renderer calls `fetchAndRender()` which re-fetches the graph model for the modified content. Client-side collapse optimization is a Phase 13+ improvement.

2. **Should the custom renderer handle classDef styles from the graph model?**
   - What we know: `GraphModel.classDefs` contains Mermaid CSS-like strings (e.g., `fill:#f9f,stroke:#333`). `GraphModel.classAssignments` maps node IDs to class names. The custom renderer currently ignores these and uses a fixed theme.
   - What's unclear: Whether users expect classDef colors to appear in the custom renderer.
   - Recommendation: **Defer to a later phase.** Status colors (ok/problem/in-progress/discarded) are the priority. ClassDef support requires parsing CSS property strings into SVG attributes, which is a separate concern. The fixed theme matches Mermaid's default well enough.

3. **How should the browser handle `graph:update` parse failures gracefully?**
   - What we know: If the server fails to parse a `.mmd` file (syntax error), `graph:update` is not sent but `file:changed` is. The browser in custom renderer mode would not get updated graph data.
   - What's unclear: The best UX for this scenario.
   - Recommendation: On `file:changed` without a corresponding `graph:update`, fall back to Mermaid rendering for that update. Mermaid will show its own error panel if the syntax is invalid. When a valid `graph:update` arrives later (after the user fixes the syntax), switch back to custom renderer.

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: All files in `src/server/`, `static/`, and `test/` read and analyzed
- Phase 11 research and 4 plan summaries: Complete understanding of what was built
- GraphModel types: `src/diagram/graph-types.ts` -- definitive type definitions
- WebSocket implementation: `src/server/websocket.ts` -- current message types and broadcast mechanism
- File watcher: `src/watcher/file-watcher.ts` + `src/server/server.ts` -- file change propagation pipeline
- DiagramDOM: `static/diagram-dom.js` -- current dual-renderer support and gaps
- All interaction modules: `static/annotations.js`, `static/search.js`, `static/collapse-ui.js`, `static/export.js` -- current Mermaid-specific code paths

### Secondary (MEDIUM confidence)
- Browser Canvas taint rules: Custom SVG with native `<text>` elements is Canvas-safe (no foreignObject), confirmed by MDN docs on Canvas security and SVG rendering

### Tertiary (LOW confidence)
- None -- this phase is entirely about wiring existing components together within our own codebase. No external library research needed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies; all components exist
- Architecture: HIGH -- clear gap analysis based on reading every relevant file; changes are small and well-scoped
- Pitfalls: HIGH -- identified from concrete code analysis (exact line numbers, function names, CSS selectors); all pitfalls are verifiable
- Interaction compatibility: HIGH -- every interaction module was read line-by-line; gaps are specific and fixable
- Testing: MEDIUM -- WebSocket integration tests are straightforward but browser-side interaction testing requires manual verification

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- all components are internal codebase, no external dependencies changing)
