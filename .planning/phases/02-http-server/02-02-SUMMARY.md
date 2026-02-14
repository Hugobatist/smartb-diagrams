---
phase: 02-http-server
plan: 02
subsystem: ui
tags: [mermaid-classdef, status-colors, error-display, integration-testing, cors, http-server]

# Dependency graph
requires:
  - phase: 02-http-server
    plan: 01
    provides: HTTP server with routes, static serving, REST API endpoints, DiagramService integration
  - phase: 01-project-bootstrap-diagram-core
    provides: DiagramService, annotations parsing, getStaticDir, resolveProjectPath
provides:
  - Color-coded node status visualization via Mermaid classDef injection (ok, problem, in-progress, discarded)
  - Status annotation parsing (@status) alongside existing @flag annotations in annotations.js
  - Structured Mermaid syntax error panel with line numbers and code snippet
  - createHttpServer() export for testable server instantiation
  - 7 server integration tests covering all endpoints
affects: [03-websocket, 04-ui, 05-mcp]

# Tech tracking
tech-stack:
  added: []
  patterns: [classdef-injection-before-render, dom-based-error-panel, createHttpServer-for-testing]

key-files:
  created:
    - test/server/server.test.ts
  modified:
    - static/annotations.js
    - static/live.html
    - src/server/server.ts
    - src/utils/paths.ts

key-decisions:
  - "Status class injection appended after clean Mermaid content, before render -- classDef + class directives"
  - "Error panel built entirely with DOM methods (createElement + textContent) for XSS safety -- no innerHTML with user content"
  - "Extracted createHttpServer() from startServer() for integration test reuse -- listen on port 0"
  - "getStaticDir() dev fallback: checks src/static then ../../static from import.meta.dirname for dev/test compatibility"

patterns-established:
  - "Status annotation format: %% @status nodeId statusValue (where statusValue is ok|problem|in-progress|discarded)"
  - "classDef color mapping: ok=#22c55e, problem=#ef4444, inProgress=#eab308, discarded=#9ca3af"
  - "parseAnnotations returns { flags, statuses } object instead of bare flags Map"
  - "Integration test pattern: createHttpServer(fixturesDir), listen on port 0, server.address().port"

# Metrics
duration: 5min
completed: 2026-02-14
---

# Phase 2 Plan 2: Status Colors, Error Display, and Server Integration Tests Summary

**Mermaid classDef injection for color-coded node status (ok/problem/in-progress/discarded), structured error panel with line numbers and code snippets, plus 7 HTTP server integration tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T18:51:54Z
- **Completed:** 2026-02-14T18:57:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Status annotation system (`%% @status nodeId statusValue`) parsed alongside flags, with getStatusMap/setStatus/removeStatus API
- classDef injection inserts color definitions and class assignments into Mermaid content before rendering (green=ok, red=problem, yellow=in-progress, gray=discarded)
- Structured error panel with SVG icon, line number badge, error message, and highlighted code snippet showing surrounding context
- 7 server integration tests covering: static serving, tree.json, REST API list/get/404, CORS headers, OPTIONS preflight
- createHttpServer() export enabling testable server creation without port detection or browser open

## Task Commits

Each task was committed atomically:

1. **Task 1: Status color classDef injection and enhanced error display** - `5d29746` (feat)
2. **Task 2: Server integration tests** - `a789c01` (feat)

## Files Created/Modified
- `static/annotations.js` - Added STATUS_REGEX, statuses Map in state, parseAnnotations returns {flags, statuses}, getStatusMap/setStatus/removeStatus API, serialization of @status entries
- `static/live.html` - Added injectStatusStyles(), buildErrorPanel(), createErrorIcon(), escapeHtml(); render() now injects classDef before mermaid.render and shows structured error on failure
- `src/server/server.ts` - Extracted createHandler() and createHttpServer() from startServer() for testability; startServer() now delegates to createHttpServer()
- `src/utils/paths.ts` - getStaticDir() now checks both prod (../static) and dev (../../static) paths for correct resolution in both environments
- `test/server/server.test.ts` - 7 integration tests using node:http request helper, createHttpServer on port 0

## Decisions Made
- Status classDefs appended after clean content (not prepended) to avoid interfering with diagram type declaration on first line
- Error panel built entirely with DOM createElement + textContent for XSS safety; no innerHTML with user-provided content
- Extracted createHttpServer() returning raw http.Server for test control over port and lifecycle
- Fixed getStaticDir() with existsSync fallback to support both dev (vitest) and prod (dist/) environments

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted createHttpServer() for test server creation**
- **Found during:** Task 2 (Server integration tests)
- **Issue:** startServer() coupled port detection, browser open, and SIGINT handling -- no way to get an http.Server instance for testing
- **Fix:** Extracted createHandler() and createHttpServer() from startServer(); startServer() now delegates to createHttpServer()
- **Files modified:** src/server/server.ts
- **Verification:** All existing tests pass, build succeeds, startServer behavior unchanged
- **Committed in:** a789c01 (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed getStaticDir() for dev/test environment**
- **Found during:** Task 2 (Server integration tests)
- **Issue:** getStaticDir() resolved to src/static/ in dev (vitest runs from source), but static files live at <root>/static/; caused GET / to return 404 in tests
- **Fix:** Added existsSync check with dev fallback path (../../static from src/utils/)
- **Files modified:** src/utils/paths.ts
- **Verification:** GET / test passes returning live.html; all 60 tests pass
- **Committed in:** a789c01 (Task 2 commit)

**3. [Rule 1 - Bug] Updated parseAnnotations return type from Map to {flags, statuses}**
- **Found during:** Task 1 (Status annotation support)
- **Issue:** live.html syncFile() assigned parseAnnotations() result directly to state.flags (expected Map), but new return type is {flags, statuses}
- **Fix:** Updated syncFile() to destructure: `incoming.flags` and `incoming.statuses`
- **Files modified:** static/live.html
- **Verification:** Build succeeds, no runtime errors
- **Committed in:** 5d29746 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and testability. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 (HTTP Server) fully complete -- all server endpoints, static serving, status colors, error display, and integration tests
- WebSocket layer (Phase 3) can hook into createHttpServer() or the existing http.createServer instance
- Status color system ready for UI controls in Phase 4
- All 60 tests pass with no regressions

## Self-Check: PASSED

All files verified:
- static/annotations.js: FOUND
- static/live.html: FOUND
- src/server/server.ts: FOUND
- src/utils/paths.ts: FOUND
- test/server/server.test.ts: FOUND
- 02-02-SUMMARY.md: FOUND
- Commit 5d29746: FOUND
- Commit a789c01: FOUND
- Tests: 60 passed (53 existing + 7 new)

---
*Phase: 02-http-server*
*Completed: 2026-02-14*
