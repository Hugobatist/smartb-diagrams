# Plan 12-02 Summary: Auto-renderer Selection, graph:update WS Handler, Status Colors

**Status**: COMPLETE
**Date**: 2026-02-15

---

## Changes Made

### Task 1: Auto-renderer selection and graph:update WebSocket handler

**`static/app-init.js`** (351 lines, was 304)

1. **Replaced static `rendererType` with dynamic `effectiveRendererType`:**
   - `paramRenderer` captures the raw URL param (null if unset)
   - `effectiveRendererType` starts as `paramRenderer || 'mermaid'` and is updated dynamically based on diagram type

2. **Added `selectRendererType(diagramType)` helper:**
   - If `paramRenderer` is set (user override via `?renderer=`), returns it unconditionally
   - If diagramType is `'flowchart'` or `'graph'`, returns `'custom'`
   - Otherwise returns `'mermaid'`

3. **Added `updateRendererIndicator()` helper:**
   - Removes any existing `.renderer-indicator` element
   - If `effectiveRendererType === 'custom'`, creates and appends a CUSTOM badge to the status bar
   - Replaces the old static indicator block that only checked at load time

4. **Updated `renderWithType`** to use `effectiveRendererType` instead of `rendererType`

5. **Added `graph:update` case to WebSocket handler** (before `file:changed`):
   - Checks `msg.file` matches current file
   - Calls `selectRendererType(msg.graph.diagramType)` to update effective renderer
   - If custom, calls `SmartBCustomRenderer.render(msg.graph)` directly (no HTTP roundtrip)
   - Calls `updateRendererIndicator()` to reflect the change

6. **Updated `file:changed` handler:**
   - Editor text update and `setLastContent` always happen
   - `renderWithType(finalText)` only executes when `effectiveRendererType !== 'custom'` (custom renderer gets data from `graph:update` instead)

7. **Added auto-detection on initial load:**
   - Merged into the existing `/api/diagrams/` fetch (no extra HTTP call)
   - Checks `data.validation.diagramType` to set `effectiveRendererType`
   - If custom, calls `SmartBCustomRenderer.fetchAndRender(currentFile)`
   - Calls `updateRendererIndicator()` after detection

8. **Updated SmartBApp public API:**
   - `rendererType` property still present for backward compatibility
   - Added `getRendererType()` method that returns current `effectiveRendererType`

### Task 2: Custom renderer status color post-processing

**`static/custom-renderer.js`** (142 lines, was 92)

1. **Added `STATUS_COLORS` map** near the top of the IIFE:
   - `ok`: green (#22c55e fill, #16a34a stroke, white text)
   - `problem`: red (#ef4444 fill, #dc2626 stroke, white text)
   - `in-progress`: yellow (#eab308 fill, #ca8a04 stroke, black text)
   - `discarded`: gray (#9ca3af fill, #6b7280 stroke, white text)
   - Colors match the classDef colors used in renderer.js `injectStatusStyles`

2. **Added `applyStatusColors(graphModel)` function:**
   - Exits early if no statuses in graphModel
   - Iterates `graphModel.statuses` map
   - Finds SVG nodes by `[data-node-id]` attribute
   - Locates shape elements (rect, circle, polygon, path, ellipse) including nested in child `<g>`
   - Applies `fill` and `stroke` to shape, `fill` to text

3. **Called `applyStatusColors(graphModel)` in `render()`** after `applyFlagsToSVG()` and before collapse overlays

4. **Added `lastGraphModel` variable** set at the top of `render()` for re-application

5. **Exposed `getLastGraphModel()`** in public API

---

## Verification

- `npm run build` -- PASS (tsup builds successfully, static assets copied)
- `npm test` -- 225 tests pass (17 test files, 0 failures)
- `static/app-init.js` -- 351 lines (under 500 limit)
- `static/custom-renderer.js` -- 142 lines (under 500 limit)

---

## Key Integration Points

- **`app-init.js` -> `custom-renderer.js`**: `SmartBCustomRenderer.render(msg.graph)` called directly from `graph:update` handler (no HTTP roundtrip)
- **`graph:update` + `file:changed` dual routing**: Custom renderer ignores `file:changed` render; Mermaid renderer ignores `graph:update`
- **Auto-detection on load**: Flowchart/graph diagrams auto-select custom renderer without requiring `?renderer=custom` URL param
- **User override preserved**: `?renderer=mermaid` or `?renderer=custom` still works as explicit override
