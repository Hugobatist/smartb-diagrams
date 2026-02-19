# Phase 19 Research: Heatmap Practical

## Problem Statement

The current heatmap only shows data from MCP session recordings (JSONL files). Users must:
1. Set up an MCP session via `start_session`
2. Have an AI call `record_step` for each node visit
3. Call `end_session` to trigger heatmap broadcast

This is too much friction. Users clicking nodes in the browser should automatically feed the heatmap. Real-time updates should happen during sessions, not only at end.

## Current Architecture

### Backend (Session-based heatmap)
- **SessionStore** (`src/session/session-store.ts`): Persists events as JSONL in `.smartb/sessions/`. `getHeatmapData()` aggregates `node:visited` events across all sessions for a file.
- **session-routes.ts**: `GET /api/heatmap/:file` reads from SessionStore.
- **session-tools.ts**: `record_step` writes `node:visited` event, broadcasts `session:event`. `end_session` broadcasts `heatmap:update`.
- **websocket.ts**: Has `heatmap:update` message type already defined.

### Frontend (Heatmap visualization)
- **heatmap.js**: Manages risk/frequency dual mode. `updateVisitCounts(counts)` applies frequency colors. `updateRisks(risksMap)` applies risk colors. Auto-detects mode based on data availability.
- **selection.js**: Handles node click events, emits `selection:changed` via EventBus.
- **app-init.js**: Fetches `/api/heatmap/:file` on initial load. Has 'H' keyboard shortcut.
- **ws-handler.js**: Handles `heatmap:update` messages, calls `SmartBHeatmap.updateVisitCounts`.
- **file-tree.js**: On file switch, fetches `/api/heatmap/:encoded`. Already wired.

## Gap Analysis

### HEAT-01: Automatic click tracking (no MCP session required)
**Gap**: No client-side click tracking exists. Clicks are handled by selection.js but not counted. No backend endpoint to receive browser-originated click counts.
**Solution**: New `interaction-tracker.js` batches click events, flushes to `POST /api/heatmap/:file/increment`. Backend stores in-memory Map per file. GET endpoint merges session + click data.

### HEAT-02: Real-time updates during session recording
**Gap**: `record_step` broadcasts `session:event` but NOT `heatmap:update`. Heatmap only updates on `end_session`.
**Solution**: After `record_step` writes event, also broadcast `heatmap:update` with incremental counts. The session's active visit counts can be tracked in-memory.

### HEAT-03: Mode toggle UI
**Gap**: No visible UI control for switching modes. Mode auto-selects based on data availability. User has no manual control.
**Solution**: Add a cycle button or dropdown near the heatmap legend/button. Clicking cycles between "risk" and "frequency" modes.

### HEAT-04: File-switch re-fetch
**Gap**: Already partially handled in file-tree.js `loadFile()` -- it fetches `/api/heatmap/:encoded`. But the data only comes from sessions. Need to include click counts.
**Solution**: Merge click counts into GET endpoint response. Frontend already re-fetches on switch -- just need the endpoint to return complete data.

### HEAT-05: Empty state guidance
**Gap**: When heatmap has no data, nothing is shown. No indication of how to populate it.
**Solution**: Show an empty state message in the legend area when toggled on but no data exists.

## Design Decisions

1. **In-memory click store**: Click counts stored server-side in a Map per file. Not persisted to disk (ephemeral across restarts). This keeps it lightweight. Session data persists via JSONL.
2. **Batch flush interval**: 2 seconds. Collects clicks client-side, sends one POST with all accumulated counts.
3. **GET /api/heatmap/:file response shape**: Returns `{ frequency: Record<string, number>, risks: Array<{nodeId, level, reason}> }` to support both modes.
4. **Mode toggle**: Cycle button added to the heatmap legend that toggles between "Risk" and "Frequency" labels. Simple, no dropdown complexity.
5. **WebSocket incremental updates**: record_step broadcasts heatmap:update with just the delta (nodeId -> count). Frontend merges into existing counts.

## Risk Assessment

- **Low risk**: All changes are additive. No existing functionality is modified destructively.
- **Click batching race**: Mitigated by simple Map merge on server -- concurrent POSTs just add counts.
- **Memory**: Click counts are small (nodeId -> number). Even 1000 files with 100 nodes each = trivial memory.

## File Impact

### New Files
- `static/interaction-tracker.js` -- Client-side click batching
- `src/server/heatmap-routes.ts` -- Heatmap REST endpoints (refactored from session-routes)
- `test/server/heatmap-routes.test.ts` -- Tests for new endpoints

### Modified Files
- `src/server/session-routes.ts` -- Extract heatmap endpoint to heatmap-routes.ts
- `src/server/routes.ts` -- Register new heatmap routes
- `src/mcp/session-tools.ts` -- Broadcast heatmap:update on record_step
- `static/heatmap.js` -- Mode toggle UI, empty state, merged data format
- `static/selection.js` -- Emit click event for tracking
- `static/live.html` -- Add interaction-tracker.js script tag
- `static/app-init.js` -- Initialize interaction tracker, update heatmap fetch
- `static/ws-handler.js` -- Handle incremental heatmap updates
- `static/file-tree.js` -- Update heatmap fetch for new response shape
- `static/heatmap.css` -- Mode toggle and empty state styles
