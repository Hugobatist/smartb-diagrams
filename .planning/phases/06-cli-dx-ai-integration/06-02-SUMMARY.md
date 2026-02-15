---
phase: 06-cli-dx-ai-integration
plan: 02
subsystem: mcp
tags: [mcp, correction-context, flags, dx, error-messages]

# Dependency graph
requires:
  - phase: 05-mcp-server
    provides: MCP tool registration pattern, DiagramService flag/status APIs
provides:
  - get_correction_context MCP tool returning structured AI correction context
  - No-mmd-files warning in startServer for developer guidance
affects: [06-03, phase-7]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CorrectionContext JSON shape for AI agent flag-to-prompt pipeline"

key-files:
  created:
    - test/mcp/tools.test.ts
  modified:
    - src/mcp/schemas.ts
    - src/mcp/tools.ts
    - src/mcp/server.ts
    - src/server/server.ts

key-decisions:
  - "CorrectionContext includes full mermaid content, all flags, all statuses, and natural language instruction for AI self-correction"
  - "get_correction_context returns isError:true with descriptive message when nodeId has no flag (not an exception)"
  - "No-mmd-files check uses a temporary DiagramService instance in startServer, server does not refuse to start"

patterns-established:
  - "CorrectionContext shape: correction (nodeId, flagMessage) + diagramState (filePath, mermaidContent, allFlags, statuses) + instruction"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 6 Plan 2: Correction Context Tool and Error Messages Summary

**get_correction_context MCP tool returning structured flag+diagram+instruction JSON for AI self-correction, plus no-mmd-files warning in startServer**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T14:49:17Z
- **Completed:** 2026-02-15T14:51:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added 5th MCP tool `get_correction_context` that returns structured CorrectionContext JSON (flag message, full diagram state, all flags/statuses, natural language instruction)
- Returns `isError: true` with descriptive message when nodeId has no flag or file does not exist
- Added prominent warning when `smartb serve` runs in directory with no .mmd files, suggesting `smartb init`
- 4 new tests validating the correction context data pipeline via DiagramService

## Task Commits

Each task was committed atomically:

1. **Task 1: Add get_correction_context MCP tool with schema and tests** - `47219e6` (feat)
2. **Task 2: Add helpful error messages for no .mmd files and port conflicts** - `f89f9ff` (feat)

## Files Created/Modified
- `src/mcp/schemas.ts` - Added GetCorrectionContextInput schema (filePath + nodeId)
- `src/mcp/tools.ts` - Registered 5th tool get_correction_context with CorrectionContext response
- `src/mcp/server.ts` - Updated debug log from "4 tools" to "5 tools"
- `src/server/server.ts` - Added no-mmd-files warning check in startServer before listen
- `test/mcp/tools.test.ts` - 4 tests for correction context data pipeline

## Decisions Made
- CorrectionContext includes full mermaid content, all flags, all statuses, and a natural language instruction directing the AI to use update_diagram -- gives the AI everything it needs in a single tool call
- get_correction_context returns isError:true with descriptive message when nodeId has no flag, consistent with existing tool error patterns (05-02 decision)
- No-mmd-files check creates a temporary DiagramService in startServer; server still starts so MCP tools or manual file creation can populate the directory

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 MCP tools registered: update_diagram, read_flags, get_diagram_context, update_node_status, get_correction_context
- AI agents can now understand developer flags and course-correct via structured context
- Ready for plan 06-03 (remaining CLI/DX improvements)

## Self-Check: PASSED

All 5 files verified on disk. Both commit hashes (47219e6, f89f9ff) confirmed in git log.

---
*Phase: 06-cli-dx-ai-integration*
*Completed: 2026-02-15*
