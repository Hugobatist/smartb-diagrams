---
phase: 13-canvas-interactions
plan: 01
subsystem: ui
tags: [fsm, svg-selection, pan-zoom, keyboard-shortcuts, vanilla-js, iife]

# Dependency graph
requires:
  - phase: 09-browser-ui-modularization
    provides: EventBus, DiagramDOM, pan-zoom.js, app-init.js IIFE module pattern
  - phase: 12-server-browser-integration
    provides: DiagramDOM.findEdgeElement, dual renderer support (custom/mermaid)
provides:
  - "SmartBInteraction FSM with 8 states for UI interaction coordination"
  - "SmartBSelection for node/edge selection with visual SVG indicators"
  - "Pan-zoom movement threshold (3px) preventing false pans on click"
  - "Keyboard shortcuts: Delete/Backspace removes selected, Escape deselects"
affects: [13-02, context-menu, inline-edit, annotations, collapse-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [finite-state-machine, svg-selection-indicators, movement-threshold-gating]

key-files:
  created:
    - static/interaction-state.js
    - static/selection.js
  modified:
    - static/pan-zoom.js
    - static/live.html
    - static/app-init.js

key-decisions:
  - "Object literal transition table FSM over XState library — 8 states max, no need for 30KB dependency"
  - "SVG overlay group for selection indicators — re-created on each render via diagram:rendered event"
  - "No corner handles for edge selection — edges get CSS class highlight (.selected-edge) only"
  - "PAN_THRESHOLD = 3px — balances click detection vs pan responsiveness"
  - "Click handler uses DiagramDOM.extractNodeId directly — no timer for click/dblclick disambiguation"

patterns-established:
  - "FSM coordination: all interaction modules query SmartBInteraction before acting"
  - "Selection re-application: subscribe to diagram:rendered, re-create indicators if element still exists"
  - "Movement threshold gating: panStarted flag delays pan transform until threshold exceeded"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Phase 13 Plan 01: Interaction FSM + Node Selection Summary

**Lightweight FSM with 8 states coordinating all UI modes, plus node/edge selection with blue dashed SVG indicators and keyboard shortcuts (Delete/Escape)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T00:03:15Z
- **Completed:** 2026-02-16T00:06:40Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Finite state machine (`interaction-state.js`, 154 lines) providing centralized coordination for 8 UI states with typed transitions
- Node selection shows blue dashed border (#6366f1) + 4 corner handles; edge selection shows blue highlight via CSS class
- Pan-zoom movement threshold (3px) eliminates false pans on intended node clicks
- Selection persists across SVG re-renders via `diagram:rendered` EventBus subscription
- Delete/Backspace removes selected node via MmdEditor, Escape deselects

## Task Commits

Each task was committed atomically:

1. **Task 1: Create interaction-state.js FSM** - `95dc8ea` (feat)
2. **Task 2: Create selection.js with visual indicators** - `4faf702` (feat)
3. **Task 3: Update pan-zoom.js + live.html + app-init.js integration** - `f0c6698` (feat)

## Files Created/Modified
- `static/interaction-state.js` - FSM with 8 states, transition table, SmartBInteraction API (154 lines)
- `static/selection.js` - Node/edge selection, SVG indicators, keyboard shortcuts, reapply on re-render (300 lines)
- `static/pan-zoom.js` - Added PAN_THRESHOLD, panStarted flag, FSM state checking, FSM transitions (167 lines)
- `static/live.html` - Added interaction-state.js and selection.js script tags in correct load order (152 lines)
- `static/app-init.js` - Added SmartBSelection.init() call (370 lines)

## Decisions Made
- **Object literal FSM over library**: 8 states is simple enough for a lookup table; XState would add 30KB for no benefit
- **No click/dblclick timer**: Accepted that selection fires first on double-click; FSM transitions handle the `selected -> editing` flow naturally
- **Edge selection with CSS only**: Edges don't get corner handles (per research recommendation); `.selected-edge` class applies blue stroke highlight
- **Selection indicators as SVG group**: `<g class="selection-indicator">` appended to SVG, pointer-events: none so it doesn't interfere with clicks
- **3px movement threshold**: Small enough to not feel laggy, large enough to prevent accidental pans on imprecise clicks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added live.html script tags and app-init.js initialization**
- **Found during:** Task 3 (pan-zoom.js integration)
- **Issue:** New modules (interaction-state.js, selection.js) would not load or initialize without script tags in live.html and SmartBSelection.init() call in app-init.js
- **Fix:** Added 2 script tags to live.html after search.js, added init call in app-init.js after SmartBSearch.init()
- **Files modified:** static/live.html, static/app-init.js
- **Verification:** npm run build succeeds, all 225 tests pass
- **Committed in:** f0c6698 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential integration step — modules are useless without being loaded and initialized. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FSM backbone ready for context-menu.js and inline-edit.js (Plan 02)
- SmartBInteraction.transition() API enables all future interaction modules to coordinate
- Selection state (SmartBSelection.getSelected()) available for context menu and inline edit to query
- Existing modules (annotations.js, diagram-editor.js, collapse-ui.js) can progressively adopt FSM in Plan 02

---
*Phase: 13-canvas-interactions*
*Completed: 2026-02-16*
