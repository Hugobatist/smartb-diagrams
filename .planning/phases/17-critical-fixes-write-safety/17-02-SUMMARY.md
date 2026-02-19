---
phase: 17-critical-fixes-write-safety
plan: 02
subsystem: mcp, watcher, server
tags: [mcp, get-diagram-context, file-watcher, knownFiles, shutdown, breakpoints, risks, ghost-paths]

# Dependency graph
requires:
  - phase: 17-critical-fixes-write-safety
    provides: writeDiagramPreserving, writeRaw, annotation preservation foundation
provides:
  - Complete get_diagram_context response with breakpoints, risks, and ghostPaths
  - DiagramContent type with breakpoints and risks fields
  - FileWatcher pre-populated knownFiles for correct first-event classification
  - closeAllWatchers for proper resource cleanup on shutdown
affects: [18-ghost-paths-functional, 20-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [ready-gate pattern for async initialization before event processing]

key-files:
  created:
    - test/mcp/context-completeness.test.ts
    - test/watcher/file-watcher.test.ts
  modified:
    - src/diagram/types.ts
    - src/diagram/service.ts
    - src/mcp/tools.ts
    - src/watcher/file-watcher.ts
    - src/server/server.ts
    - src/mcp/server.ts

key-decisions:
  - "DiagramContent extended with breakpoints (Set<string>) and risks (Map<string, RiskAnnotation>) to match parseAllAnnotations output"
  - "FileWatcher uses ready-gate pattern: discoverMmdFiles resolves before first handleEvent processes"
  - "closeAllWatchers iterates all watchers (default + named projects) rather than closing only the default watcher"

patterns-established:
  - "Ready-gate: async initialization gates event handling to ensure correct state before first event"
  - "closeAllWatchers pattern: centralized cleanup for all watcher instances via watchers Map"

requirements-completed: [MCP-02, MCP-03, SAFE-02, SAFE-03]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 17 Plan 02: MCP Context Completeness + FileWatcher Reliability Summary

**Complete get_diagram_context with breakpoints/risks/ghostPaths, FileWatcher ready-gate for correct first-event classification, and closeAllWatchers for leak-free shutdown**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T16:39:11Z
- **Completed:** 2026-02-19T16:43:08Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- get_diagram_context now returns complete state: breakpoints, risks, and ghostPaths alongside existing flags, statuses, and validation
- DiagramContent type extended with breakpoints (Set<string>) and risks (Map<string, RiskAnnotation>) fields
- FileWatcher pre-populates knownFiles from discoverMmdFiles at construction, ensuring existing files trigger onFileChanged (not onFileAdded) on first modification
- closeAllWatchers added to ServerInstance and used by both HTTP and MCP server shutdown paths
- 8 new tests cover context completeness (5) and FileWatcher initialization (3)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend DiagramContent and get_diagram_context** - `110622f` (feat)
2. **Task 2: Pre-populate FileWatcher knownFiles and add closeAllWatchers** - `a79acbe` (feat)
3. **Task 3: Add tests for context completeness and FileWatcher initialization** - `4f41a21` (test)

## Files Created/Modified
- `src/diagram/types.ts` - Added breakpoints and risks fields to DiagramContent interface
- `src/diagram/service.ts` - readDiagram now destructures breakpoints and risks from parseAllAnnotations
- `src/mcp/tools.ts` - get_diagram_context includes breakpoints, risks, and ghostPaths in response JSON
- `src/watcher/file-watcher.ts` - Pre-populates knownFiles via discoverMmdFiles, ready gate, whenReady() method
- `src/server/server.ts` - ServerInstance.closeAllWatchers(), startServer uses it in shutdown
- `src/mcp/server.ts` - startMcpServer uses closeAllWatchers in shutdown
- `test/mcp/context-completeness.test.ts` - 5 tests for get_diagram_context completeness
- `test/watcher/file-watcher.test.ts` - 3 tests for FileWatcher initialization behavior

## Decisions Made
- Extended DiagramContent with breakpoints and risks to provide a single type for all annotation data
- Used ready-gate pattern: discoverMmdFiles promise gates handleEvent so knownFiles is always populated before any classification runs
- closeAllWatchers iterates the watchers Map (all projects), not just the default fileWatcher, ensuring named project watchers are also cleaned up

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 17 (Critical Fixes + Write Safety) is fully complete: both plans shipped
- Phase 18 (Ghost Paths Functional) can safely rely on complete get_diagram_context responses including ghostPaths
- FileWatcher reliability improvements benefit all file-watching scenarios in Phase 18+

## Self-Check: PASSED

All 8 files found, all 3 commits verified, all 7 content patterns confirmed.

---
*Phase: 17-critical-fixes-write-safety*
*Completed: 2026-02-19*
