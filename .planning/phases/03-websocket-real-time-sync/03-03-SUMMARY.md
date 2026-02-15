---
phase: 03-websocket-real-time-sync
plan: 03
subsystem: server
tags: [websocket, noserver, multi-project, namespace, routing]

# Dependency graph
requires:
  - phase: 03-websocket-real-time-sync
    plan: 01
    provides: "WebSocketManager class, FileWatcher class, ServerInstance composite"
  - phase: 03-websocket-real-time-sync
    plan: 02
    provides: "ws-client.js reconnecting WebSocket client, live.html WebSocket integration"
provides:
  - "WebSocketManager with noServer mode supporting per-project WebSocketServer namespaces"
  - "URL-based routing: /ws (default) and /ws/project-name (named projects)"
  - "ServerInstance.addProject(name, dir) for registering additional project directories"
  - "Namespace isolation: broadcasts to one project don't leak to others"
affects: [phase-4-ui multi-project-ui, phase-5-mcp multi-project-awareness]

# Tech tracking
tech-stack:
  added: []
  patterns: [noServer WebSocket mode, URL-path namespace routing, per-project WebSocketServer map]

key-files:
  created: []
  modified:
    - src/server/websocket.ts
    - src/server/server.ts
    - static/ws-client.js
    - static/live.html
    - test/server/server.test.ts

key-decisions:
  - "noServer mode with HTTP upgrade handler for multi-project URL routing"
  - "Map<string, WebSocketServer> keyed by project name for namespace isolation"
  - "WsMessage connected type gains project field for client namespace awareness"
  - "addProject() on ServerInstance for lazy project registration with per-project FileWatcher"

patterns-established:
  - "noServer WebSocket: httpServer.on('upgrade') routes to project-specific WebSocketServer via handleUpgrade"
  - "Namespace map: Map<string, WebSocketServer> with getOrCreateNamespace lazy initialization"
  - "broadcast(projectName, message) scoped to single namespace vs broadcastAll() across all"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 3 Plan 3: Multi-Project WebSocket Namespacing Summary

**noServer WebSocket routing with per-project namespaces via URL path (/ws/project-name) and namespace isolation verified by test**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T13:05:10Z
- **Completed:** 2026-02-15T13:08:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- WebSocketManager refactored to noServer mode with Map<string, WebSocketServer> for per-project namespaces
- HTTP upgrade events route by URL path: /ws connects to default project, /ws/project-name to named projects
- broadcast(projectName, message) isolates events to specific namespace; broadcastAll() crosses all
- ServerInstance gains addProject(name, dir) for registering additional project directories with their own FileWatcher
- Namespace isolation test verifies project-a broadcasts don't reach project-b clients
- All 62 tests pass (61 existing + 1 new namespace isolation test)

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor WebSocketManager to noServer mode with project namespacing** - `96de40f` (feat)
2. **Task 2: Update client and tests for namespace-aware WebSocket** - `6b30ed0` (feat)

## Files Created/Modified
- `src/server/websocket.ts` - WebSocketManager with noServer mode, per-project namespaces map, broadcast/broadcastAll/addProject/close
- `src/server/server.ts` - createHttpServer returns ServerInstance with addProject(), broadcasts scoped to 'default' project, watchers tracked in Map
- `static/ws-client.js` - Documentation comments for multi-project URL format
- `static/live.html` - Comment for future multi-project URL construction
- `test/server/server.test.ts` - Updated connected assertion with project field, added namespace isolation test, added waitForMessage/waitForOpen helpers

## Decisions Made
- **noServer mode:** Replaced `{ server, path: '/ws' }` constructor with noServer mode and manual `httpServer.on('upgrade')` handler. Required for URL-based routing to different WebSocketServer instances per project.
- **WsMessage connected type updated:** Added `project: string` field to the connected message. Breaking change for message shape, but backward-compatible at transport level (client still connects on /ws).
- **Lazy namespace creation via getOrCreateNamespace:** Namespaces are created on first connection, not on addProject() call. This means connecting to /ws/any-name auto-creates a namespace without explicit registration.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Multi-project WebSocket infrastructure complete for Phase 3
- All three Phase 3 plans (WS server, WS client, multi-project namespacing) are done
- Ready for Phase 4 (UI) -- client can switch project namespaces by changing WS URL
- Ready for Phase 5 (MCP) -- server can register multiple project directories via addProject()

## Self-Check: PASSED

- All 5 files verified present on disk
- Both task commits (96de40f, 6b30ed0) verified in git log

---
*Phase: 03-websocket-real-time-sync*
*Completed: 2026-02-15*
