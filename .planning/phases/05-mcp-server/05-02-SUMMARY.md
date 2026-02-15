---
phase: 05-mcp-server
plan: 02
subsystem: mcp
tags: [mcp, tools, resources, diagram-service, uri-template]

# Dependency graph
requires:
  - phase: 05-mcp-server
    plan: 01
    provides: "MCP server skeleton, Zod schemas, DiagramService with status methods"
  - phase: 01-project-bootstrap-diagram-core
    provides: "DiagramService, annotation parsing, diagram types"
provides:
  - "4 MCP tool registrations (update_diagram, read_flags, get_diagram_context, update_node_status)"
  - "2 MCP resource registrations (diagram-list at smartb://diagrams, diagram-content template)"
  - "registerTools() and registerResources() wiring functions"
  - "Fully functional MCP server with complete AI tool integration surface"
affects: [05-03, 06-cli-dx]

# Tech tracking
tech-stack:
  added: []
  patterns: ["registerTool with raw Zod shapes + try/catch isError pattern", "ResourceTemplate with list callback for enumerable resources", "smartb:// URI scheme for MCP resource addressing"]

key-files:
  created:
    - src/mcp/tools.ts
    - src/mcp/resources.ts
  modified:
    - src/mcp/server.ts

key-decisions:
  - "Tools return isError:true with plain message text on failure, never stack traces (AI agent safety)"
  - "diagram-content resource uses decodeURIComponent on filePath template variable for special character support"
  - "Resources return empty contents array on error (MCP resources have no isError mechanism)"

patterns-established:
  - "MCP tool handler pattern: try/catch wrapping DiagramService call with isError:true on failure"
  - "Fixed resource vs template resource: diagram-list is static URI, diagram-content uses ResourceTemplate"
  - "smartb:// URI scheme: smartb://diagrams for list, smartb://diagrams/{filePath} for individual content"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 5 Plan 2: MCP Tools and Resources Summary

**4 MCP tools (update_diagram, read_flags, get_diagram_context, update_node_status) and 2 resources (diagram-list, diagram-content) registered on MCP server via DiagramService**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T14:19:01Z
- **Completed:** 2026-02-15T14:20:57Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Registered 4 MCP tools backed by DiagramService methods for full diagram CRUD + flag reading + status updates
- Registered 2 MCP resources: fixed diagram-list for discovery and template diagram-content for individual file access
- Wired both registerTools() and registerResources() into createMcpServer() -- MCP server is now fully functional
- All tool handlers use consistent try/catch + isError:true error pattern without leaking stack traces

## Task Commits

Each task was committed atomically:

1. **Task 1: Register 4 MCP tools with DiagramService-backed handlers** - `b94b3da` (feat)
2. **Task 2: Register 2 MCP resources for diagram discovery** - `9ee48ca` (feat)

## Files Created/Modified
- `src/mcp/tools.ts` - 4 tool registrations: update_diagram, read_flags, get_diagram_context, update_node_status
- `src/mcp/resources.ts` - 2 resource registrations: diagram-list (fixed URI), diagram-content (URI template)
- `src/mcp/server.ts` - Imports and calls registerTools() and registerResources() in createMcpServer()

## Decisions Made
- Tools return `isError: true` with plain error message text on failure -- never includes stack traces to avoid leaking implementation details to AI agents
- diagram-content resource applies `decodeURIComponent()` on the filePath template variable since file paths with special characters are URL-encoded in the URI
- Resources return empty `contents` array on error since MCP resources don't have an `isError` mechanism (unlike tools)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP server has complete tool and resource surface -- AI tools can discover, read, modify diagrams and manage flags/statuses
- Ready for plan 05-03 (integration testing and end-to-end verification)
- Server can be started via `smartb mcp --dir <path>` and responds to all MCP protocol requests

## Self-Check: PASSED

All 3 created/modified files verified present. Both task commits (b94b3da, 9ee48ca) verified in git log.

---
*Phase: 05-mcp-server*
*Completed: 2026-02-15*
