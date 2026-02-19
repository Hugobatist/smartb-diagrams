---
phase: 17-critical-fixes-write-safety
plan: 01
subsystem: mcp, api, ui
tags: [mcp, write-safety, annotation-preservation, write-lock, modal]

# Dependency graph
requires:
  - phase: 15-mcp-breakpoints-ghost-paths
    provides: DiagramService write lock, MCP tools, ghost path UI
provides:
  - writeDiagramPreserving() method for safe MCP writes that preserve developer annotations
  - writeRaw() method for write-locked raw file writes
  - allowEmpty option for modal prompt (opt-in empty input support)
affects: [18-ghost-paths-functional, 20-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [read-merge-write under lock for annotation preservation]

key-files:
  created:
    - test/mcp/annotation-preservation.test.ts
  modified:
    - src/diagram/service.ts
    - src/mcp/tools.ts
    - src/server/file-routes.ts
    - static/modal.js
    - static/context-menu.js

key-decisions:
  - "writeDiagramPreserving reads existing flags/breakpoints before every MCP write, preserving developer-owned annotations unconditionally"
  - "writeRaw provides raw file write under lock for /save endpoint without annotation processing"
  - "allowEmpty is opt-in (default false) so existing prompt callers are not affected"

patterns-established:
  - "Read-merge-write pattern: always read existing annotations before writing MCP updates to avoid data loss"
  - "Developer-owned vs MCP-owned annotations: flags and breakpoints are never touched by MCP tools"

requirements-completed: [MCP-01, MCP-04, SAFE-01]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 17 Plan 01: Write Safety Summary

**Safe update_diagram with annotation preservation via read-merge-write under lock, write-locked /save endpoint, and opt-in empty-input modal for ghost paths**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T16:33:27Z
- **Completed:** 2026-02-19T16:36:40Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- update_diagram now preserves developer-owned flags and breakpoints across MCP writes via writeDiagramPreserving()
- /save endpoint serializes through DiagramService write lock via writeRaw(), preventing concurrent write corruption
- Ghost path modal prompt accepts empty/blank label input with opt-in allowEmpty option
- 7 new tests validate annotation preservation, status replacement, and writeRaw behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Add writeDiagramPreserving() and writeRaw() to DiagramService, update handlers** - `57d8cdb` (feat)
2. **Task 2: Add allowEmpty option to modal prompt and update ghost path flow** - `e8e7d62` (fix)
3. **Task 3: Add tests for annotation preservation and write lock routing** - `ef813bc` (test)

## Files Created/Modified
- `src/diagram/service.ts` - Added writeDiagramPreserving() and writeRaw() methods
- `src/mcp/tools.ts` - update_diagram handler now calls writeDiagramPreserving
- `src/server/file-routes.ts` - /save endpoint routes through service.writeRaw()
- `static/modal.js` - showPrompt doConfirm respects opts.allowEmpty
- `static/context-menu.js` - Ghost path prompt passes allowEmpty: true
- `test/mcp/annotation-preservation.test.ts` - 7 tests for annotation preservation

## Decisions Made
- Used read-merge-write pattern inside writeDiagramPreserving: reads existing file annotations, merges caller-provided statuses/risks, unconditionally preserves flags and breakpoints
- writeRaw does not process annotations at all -- writes content as-is under lock, suitable for /save which receives pre-formatted editor content
- allowEmpty is opt-in (default false) to avoid breaking existing prompt callers (flag, risk, rename, new file)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Write safety foundation complete for all MCP tool updates and /save endpoint
- Phase 17 Plan 02 (if any remaining write safety concerns) can build on this
- Phase 18 (Ghost Paths Functional) can safely use update_diagram knowing flags/breakpoints are preserved

## Self-Check: PASSED

All 7 files found, all 3 commits verified, all 6 content patterns confirmed.

---
*Phase: 17-critical-fixes-write-safety*
*Completed: 2026-02-19*
