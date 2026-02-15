# Plan 12-01 Summary: graph:update WsMessage + serializeGraphModel + Watcher Integration

**Status**: COMPLETE
**Date**: 2026-02-15

---

## Changes Made

### Task 1: WsMessage type + serializeGraphModel helper

1. **`src/server/websocket.ts`** (116 lines)
   - Added `graph:update` variant to the `WsMessage` union type:
     ```typescript
     | { type: 'graph:update'; file: string; graph: Record<string, unknown> }
     ```

2. **`src/diagram/graph-serializer.ts`** (211 lines)
   - Added `serializeGraphModel()` function at the end of the file
   - Converts all Map fields of GraphModel to plain objects for JSON transmission
   - Includes `flags` and `statuses` (which were missing from the inline version in routes.ts)

3. **`src/server/routes.ts`** (379 lines)
   - Imported `serializeGraphModel` from `../diagram/graph-serializer.js`
   - Replaced inline `Object.fromEntries` construction in GET `/api/graph/:file` with single `serializeGraphModel(graph)` call
   - Now includes `flags` and `statuses` in the response (previously missing)

4. **`src/index.ts`** (46 lines)
   - Exported `serializeGraphModel` alongside `serializeGraphToMermaid`

### Task 2: Watcher wiring + integration tests

1. **`src/server/server.ts`** (311 lines)
   - Imported `serializeGraphModel`
   - Default project FileWatcher `onFileChanged` callback now broadcasts `graph:update` after `file:changed`
   - `addProject` FileWatcher callback follows the same pattern
   - Parse failures are silently caught (browser falls back to raw Mermaid via `file:changed`)

2. **`test/server/server.test.ts`** (330 lines)
   - Added `collectMessages()` helper for gathering multiple WS messages
   - Added 4 new integration tests:
     - WebSocket receives both `file:changed` and `graph:update` on broadcast
     - `graph:update` message has correct structure (diagramType, nodes, edges, flags, statuses)
     - GET `/api/graph/:file` returns serialized graph with flags and statuses (using `with-flags.mmd` fixture)
     - GET `/api/graph/:file` returns 404 for missing file

---

## Verification

- `npm run typecheck` -- PASS
- `npm test` -- 225 tests pass (17 test files, +4 new tests)
- All modified files under 500 lines
