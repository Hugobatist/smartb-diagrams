---
phase: 16-heatmap-session-recording
plan: 01
subsystem: api
tags: [risk-annotations, session-recording, jsonl, heatmap, websocket, rest]

requires:
  - phase: 15-ai-breakpoints-ghost-paths
    provides: "Three-annotation preservation pattern (flags, statuses, breakpoints), GhostPathStore pattern, ServerInstance interface"
provides:
  - "@risk annotation types (RiskLevel, RiskAnnotation) and CRUD in DiagramService"
  - "parseRisks() and RISK_REGEX in annotations.ts"
  - "Four-annotation preservation across all write operations"
  - "SessionStore class with JSONL persistence in .smartb/sessions/"
  - "SessionEvent, SessionMeta, SessionSummary types"
  - "3 REST endpoints: /api/sessions/:file, /api/session/:id, /api/heatmap/:file"
  - "2 WebSocket message types: session:event, heatmap:update"
affects: [16-02 MCP tools, 16-03 frontend heatmap, 16-04 session replay]

tech-stack:
  added: []
  patterns: [four-annotation-preservation, jsonl-session-persistence, per-session-write-locks]

key-files:
  created:
    - src/session/session-types.ts
    - src/session/session-store.ts
    - src/server/session-routes.ts
  modified:
    - src/diagram/types.ts
    - src/diagram/annotations.ts
    - src/diagram/service.ts
    - src/server/websocket.ts
    - src/server/routes.ts
    - src/server/server.ts

key-decisions:
  - "Four-annotation preservation: extended three-annotation pattern from Phase 15 to include risks in all write operations"
  - "Per-session write locks in SessionStore: same pattern as DiagramService per-file locks"
  - "JSONL format for session persistence: one JSON object per line, append-only, simple to read/write"
  - "SessionStore exposed on ServerInstance: same pattern as ghostStore and breakpointContinueSignals"

patterns-established:
  - "Four-annotation round-trip: every write operation reads flags, statuses, breakpoints, and risks then re-injects all"
  - "Route module extraction: registerSessionRoutes in separate file to manage routes.ts line count"
  - "Session JSONL: each session is a .jsonl file in .smartb/sessions/ with append-only writes"

duration: 4min
completed: 2026-02-16
---

# Phase 16 Plan 01: Backend Infrastructure Summary

**@risk annotation CRUD, JSONL SessionStore with heatmap aggregation, 3 REST endpoints, and 2 WebSocket message types**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T01:39:42Z
- **Completed:** 2026-02-16T01:43:59Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- @risk annotations (high/medium/low with reason string) parse from .mmd files and survive round-trip injection
- All 4 annotation types (flags, statuses, breakpoints, risks) preserved by every write operation in DiagramService
- SessionStore persists events as JSONL files in .smartb/sessions/ with per-session write locks
- Three REST endpoints serve session lists, individual session events, and heatmap aggregation data
- Two new WebSocket message types (session:event, heatmap:update) defined for real-time broadcasting

## Task Commits

Each task was committed atomically:

1. **Task 1: @risk annotation types, parsing, and DiagramService CRUD** - `3c4f870` (feat)
2. **Task 2: SessionStore, session types, REST endpoints, and WebSocket message types** - `33af2c1` (feat)

## Files Created/Modified
- `src/diagram/types.ts` - Added RiskLevel type and RiskAnnotation interface
- `src/diagram/annotations.ts` - Added RISK_REGEX, parseRisks(), extended injectAnnotations() with risks param
- `src/diagram/service.ts` - Added getRisks/setRisk/removeRisk CRUD, updated all write ops for 4-annotation preservation
- `src/session/session-types.ts` - SessionEventType, SessionEvent, SessionMeta, SessionSummary types
- `src/session/session-store.ts` - SessionStore class with JSONL persistence, write locks, heatmap aggregation
- `src/server/websocket.ts` - Added session:event and heatmap:update WsMessage types
- `src/server/session-routes.ts` - 3 REST endpoints for sessions and heatmap data
- `src/server/routes.ts` - Wired registerSessionRoutes, updated registerRoutes signature
- `src/server/server.ts` - SessionStore instantiation, exposed on ServerInstance

## Decisions Made
- Extended three-annotation preservation to four-annotation preservation (flags, statuses, breakpoints, risks) -- consistent pattern from Phase 15
- Per-session write locks in SessionStore using same pattern as DiagramService per-file locks
- JSONL format for session persistence: append-only, one JSON per line, simple to read/write
- SessionStore exposed on ServerInstance following same pattern as ghostStore and breakpointContinueSignals
- Route module extraction: registerSessionRoutes in separate session-routes.ts to keep routes.ts under 500 lines

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SessionStore and risk CRUD ready for MCP tool registration (Plan 02)
- WebSocket message types ready for frontend integration (Plans 03-04)
- REST endpoints ready for frontend heatmap and session replay modules
- All 238 tests passing, all files under 500-line limit

---
*Phase: 16-heatmap-session-recording*
*Completed: 2026-02-16*
