---
phase: 09-foundation-refactoring
plan: 01
subsystem: ui
tags: [vanilla-js, iife, event-bus, dom-abstraction, css-extraction, mermaid]

# Dependency graph
requires:
  - phase: 08-scalability-large-diagrams
    provides: Complete v1.0 live.html with all inline features
provides:
  - SmartBEventBus pub/sub module (event-bus.js)
  - DiagramDOM SVG abstraction layer (diagram-dom.js)
  - Extracted main.css (all CSS previously inline in live.html)
  - live.html reduced from 1757 to 1190 lines
affects: [09-02, 09-03, 09-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [EventTarget-based pub/sub, DiagramDOM abstraction, CSS-first extraction]

key-files:
  created:
    - static/event-bus.js
    - static/diagram-dom.js
    - static/main.css
  modified:
    - static/live.html

key-decisions:
  - "Used WeakMap in EventBus to track wrapped handlers for reliable off() support"
  - "DiagramDOM always re-queries SVG elements, never caches (Mermaid replaces SVG on render)"
  - "main.css placed as first stylesheet to preserve CSS cascade order"

patterns-established:
  - "EventBus pattern: SmartBEventBus.on/off/emit/once for inter-module communication"
  - "DiagramDOM pattern: always re-query SVG, never cache element references"
  - "CSS extraction: external CSS files loaded before feature-specific overrides"

# Metrics
duration: 4min
completed: 2026-02-15
---

# Phase 9 Plan 1: Foundation Modules Summary

**EventBus pub/sub, DiagramDOM SVG abstraction, and 569-line CSS extraction from live.html using IIFE pattern**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-15T21:03:11Z
- **Completed:** 2026-02-15T21:07:40Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created SmartBEventBus with on/off/emit/once using native EventTarget API (57 lines)
- Created DiagramDOM abstraction consolidating duplicated SVG queries from 4 modules (151 lines)
- Extracted 569 lines of inline CSS from live.html to main.css
- Reduced live.html from 1757 to 1190 lines (32% reduction)
- All 131 existing tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create event-bus.js and diagram-dom.js** - `2b93035` (feat)
2. **Task 2: Extract inline CSS and update live.html** - `22661bd` (feat)

## Files Created/Modified
- `static/event-bus.js` - Pub/sub event bus using EventTarget API with WeakMap handler tracking
- `static/diagram-dom.js` - SVG abstraction layer with findNodeElement, extractNodeId, getNodeBBox, etc.
- `static/main.css` - All CSS previously inline in live.html (569 lines)
- `static/live.html` - HTML shell now loading external CSS and infrastructure scripts

## Decisions Made
- Used WeakMap to store wrapped handlers in EventBus, enabling reliable off() for the same handler reference
- DiagramDOM uses compiled regex constants (NODE_RE, SUBGRAPH_RE, EDGE_RE) for performance
- main.css placed as first `<link>` tag to preserve cascade order (was inline `<style>` before annotations.css)
- event-bus.js and diagram-dom.js script tags placed before inline JS block (synchronous, no async/defer)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EventBus and DiagramDOM are available as window.SmartBEventBus and window.DiagramDOM
- Future plans (09-02, 09-03, 09-04) can now extract inline JS modules and wire them through the event bus
- Existing modules (annotations.js, collapse-ui.js, search.js, diagram-editor.js) can be migrated to use DiagramDOM instead of duplicating SVG queries

---
*Phase: 09-foundation-refactoring*
*Completed: 2026-02-15*
