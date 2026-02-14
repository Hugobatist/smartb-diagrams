---
phase: 02-http-server
plan: 01
subsystem: api
tags: [http, node-http, cors, rest-api, cli, detect-port, open, static-file-serving]

# Dependency graph
requires:
  - phase: 01-project-bootstrap-diagram-core
    provides: DiagramService, resolveProjectPath, getStaticDir, logger, CLI scaffolding
provides:
  - HTTP server with CORS, port fallback, browser open, graceful shutdown
  - Static file serving with MIME type detection
  - Route handlers for live.html endpoints (tree.json, .mmd GET, /save, /delete, /mkdir, /move)
  - REST API endpoints (GET /api/diagrams, GET /api/diagrams/:file)
  - CLI serve subcommand with --port, --dir, --no-open options
affects: [02-http-server, 03-websocket, 04-ui, 05-mcp]

# Tech tracking
tech-stack:
  added: [detect-port, open]
  patterns: [thin-router-on-node-http, cors-as-response-helper, regex-route-matching, flat-to-tree-file-listing]

key-files:
  created:
    - src/server/server.ts
    - src/server/static.ts
    - src/server/routes.ts
  modified:
    - src/cli.ts
    - package.json

key-decisions:
  - "Node.js built-in http.createServer with thin router instead of framework -- 8 routes do not justify Fastify overhead"
  - "Route matching via RegExp array with named groups for URL parameters"
  - "Two separate file roots: getStaticDir() for HTML/JS/CSS assets, project dir for .mmd files"
  - "Dynamic import of server module in CLI serve action for lazy loading"

patterns-established:
  - "Route registration: registerRoutes() returns Route[] array matched sequentially by method + regex pattern"
  - "CORS helper: setCorsHeaders() called on every response, OPTIONS preflight returns 204"
  - "JSON helpers: sendJson() and readJsonBody() for consistent request/response handling"
  - "Path security: resolveProjectPath() used on all user-supplied file paths"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 2 Plan 1: HTTP Server and Routes Summary

**Node.js HTTP server with thin router, 8 route handlers for live.html + REST API, CLI serve subcommand with detect-port fallback and browser auto-open**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T18:46:17Z
- **Completed:** 2026-02-14T18:49:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- HTTP server infrastructure with CORS, port fallback via detect-port, browser auto-open via open, graceful SIGINT shutdown
- All 8 route handlers functional: tree.json, .mmd GET, /save, /delete, /mkdir, /move, /api/diagrams, /api/diagrams/:file
- CLI `serve` subcommand with --port, --dir, --no-open options (lazy-loaded via dynamic import)
- Static file serving with MIME type detection for HTML, JS, CSS, JSON, SVG, PNG, MMD
- buildFileTree utility converting flat file paths to nested tree structure for live.html sidebar

## Task Commits

Each task was committed atomically:

1. **Task 1: HTTP server infrastructure and CLI serve command** - `d26d232` (feat)
2. **Task 2: Route handlers for live.html endpoints and REST API** - `162f9bb` (feat)

## Files Created/Modified
- `src/server/server.ts` - HTTP server with startServer(), sendJson(), readJsonBody(), CORS, port fallback, browser open, graceful shutdown
- `src/server/static.ts` - Static file serving with MIME_TYPES map and serveStaticFile()
- `src/server/routes.ts` - registerRoutes() with 8 endpoint handlers and buildFileTree() utility
- `src/cli.ts` - Added serve subcommand with --port, --dir, --no-open options
- `package.json` - Added detect-port and open as runtime dependencies

## Decisions Made
- Used Node.js built-in http.createServer with thin router (8 routes do not justify a framework)
- Route matching via sequential RegExp array with named groups for URL parameters
- Two separate file roots: getStaticDir() for static assets, project dir for diagram files
- Dynamic import of server module in CLI action handler for lazy loading
- .mmd route registered last to avoid matching /api/diagrams/*.mmd URLs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HTTP server fully functional, ready for Phase 2 Plan 2 (if any further HTTP work)
- WebSocket layer (Phase 3) can hook into the existing http.createServer instance
- REST API endpoints ready for MCP integration (Phase 5)
- All 53 existing tests pass with no regressions

## Self-Check: PASSED

All files verified:
- src/server/server.ts: FOUND
- src/server/static.ts: FOUND
- src/server/routes.ts: FOUND
- 02-01-SUMMARY.md: FOUND
- Commit d26d232: FOUND
- Commit 162f9bb: FOUND

---
*Phase: 02-http-server*
*Completed: 2026-02-14*
