---
phase: 13-canvas-interactions
plan: 02
subsystem: ui
tags: [context-menu, inline-edit, contenteditable, fsm-coordination, vanilla-js, iife]

# Dependency graph
requires:
  - phase: 13-canvas-interactions
    plan: 01
    provides: SmartBInteraction FSM, SmartBSelection, pan-zoom threshold
  - phase: 09-browser-ui-modularization
    provides: EventBus, DiagramDOM, IIFE module pattern, app-init.js
  - phase: 12-server-browser-integration
    provides: DiagramDOM.findEdgeElement, dual renderer support
provides:
  - "SmartBContextMenu for right-click context menus on nodes (5 actions) and edges (2 actions)"
  - "SmartBInlineEdit for double-click contenteditable overlay label editing"
  - "MmdEditor.duplicateNode() and MmdEditor.applyEdit() exposed in public API"
  - "FSM guards in collapse-ui.js preventing conflicts with editing and context-menu states"
  - "FSM-aware keyboard shortcuts in app-init.js syncing mode toggles with interaction state"
affects: [annotations, collapse-ui, diagram-editor, future-undo-redo]

# Tech tracking
tech-stack:
  added: []
  patterns: [context-menu-positioning, contenteditable-overlay, fsm-guard-pattern, blur-with-timeout]

key-files:
  created:
    - static/context-menu.js
    - static/inline-edit.js
  modified:
    - static/diagram-editor.js
    - static/app-init.js
    - static/live.html
    - static/collapse-ui.js

key-decisions:
  - "Flag action in context menu activates flag mode (toggleFlagMode) instead of directly showing popover — avoids modifying annotations.js (491 lines)"
  - "Inline edit uses blur-as-confirm with setTimeout(0) guard to prevent accidental commits when clicking menu items"
  - "Removed unused parseEdgeId function from diagram-editor.js to stay under 500-line limit (Rule 1 - dead code)"
  - "Collapse-ui FSM guards check editing/context-menu on click and editing/selected on dblclick — ensures proper event routing"

patterns-established:
  - "Context menu positioning with viewport clamping: Math.min(x, window.innerWidth - 200)"
  - "Contenteditable overlay pattern: position from getBoundingClientRect delta, style from getComputedStyle, focus+selectAll on create"
  - "FSM guard pattern in legacy modules: if (window.SmartBInteraction) { var st = SmartBInteraction.getState(); if (st === ...) return; }"
  - "Mode toggle FSM sync: after calling toggleX(), forceState based on resulting module state"

# Metrics
duration: 5min
completed: 2026-02-16
---

# Phase 13 Plan 02: Context Menu + Inline Edit Summary

**Right-click context menu with 5 node actions and 2 edge actions, double-click inline contenteditable label editing, FSM guards in collapse-ui and keyboard shortcuts**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-16T00:08:55Z
- **Completed:** 2026-02-16T00:13:40Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- Context menu on right-click shows Editar Texto, Deletar, Duplicar, Sinalizar, Nova Seta for nodes; Deletar, Sinalizar for edges
- Double-click inline editing via contenteditable overlay positioned at SVG text with Enter/Escape/blur handling
- `duplicateNode()` and `applyEdit()` exposed in MmdEditor public API for cross-module use
- FSM guards in collapse-ui.js prevent dblclick conflict with inline-edit, click conflict with context-menu
- Keyboard shortcuts (F, N, A) now check `isBlocking()` and sync FSM state after mode toggles
- Escape key now also deselects all and closes context menu

## Task Commits

Each task was committed atomically:

1. **Task 1: Create context-menu.js** - `31f8574` (feat)
2. **Task 2: Create inline-edit.js** - `7e80f95` (feat)
3. **Task 3: Wire everything into app integration** - `f91e1e3` (feat)

## Files Created/Modified
- `static/context-menu.js` - Right-click context menu IIFE with node/edge actions, self-injected CSS (238 lines)
- `static/inline-edit.js` - Double-click contenteditable overlay IIFE with Enter/Escape/blur handling (278 lines)
- `static/diagram-editor.js` - Added duplicateNode(), exposed applyEdit, removed unused parseEdgeId (485 lines)
- `static/app-init.js` - Init new modules, FSM-aware keyboard shortcuts, Escape enhancements (398 lines)
- `static/live.html` - Added context-menu.js + inline-edit.js script tags, new help overlay rows (158 lines)
- `static/collapse-ui.js` - FSM guards on click (editing/context-menu) and dblclick (editing/selected) handlers (320 lines)

## Decisions Made
- **Flag via toggleFlagMode, not showPopover:** The flag action in context menu activates flag mode rather than directly opening the flag popover. This avoids modifying annotations.js (491 lines, near limit) and reuses the existing flag workflow.
- **Blur-as-confirm with timeout guard:** Inline edit treats blur as confirm (natural UX when clicking elsewhere), but uses `setTimeout(0)` to prevent premature confirmation when the user clicks a context menu item that causes blur.
- **Dead code removal:** Removed unused `parseEdgeId` function from diagram-editor.js. It was never called anywhere in the codebase and removing it kept the file at 485 lines (under 500 limit).
- **Collapse-ui FSM guards differ by event type:** Click handler guards against `editing` and `context-menu` states; dblclick handler guards against `editing` and `selected` states. This ensures collapsed node expansion still works but normal nodes route to inline-edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/Dead Code] Removed unused parseEdgeId from diagram-editor.js**
- **Found during:** Task 3 (diagram-editor.js modifications)
- **Issue:** File was at 518 lines after adding duplicateNode + applyEdit. The `parseEdgeId` function (10 lines) was never called anywhere in the codebase — dead code that inflated line count.
- **Fix:** Removed the function entirely. `findEdgeEndpoints` handles all edge parsing needs.
- **Files modified:** static/diagram-editor.js
- **Verification:** `grep -r parseEdgeId` returns zero results; all 225 tests pass
- **Committed in:** f91e1e3 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 dead code removal)
**Impact on plan:** Necessary to maintain the 500-line file limit. No behavior change.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 13 canvas interaction features are now complete
- 4 new IIFE modules: interaction-state.js, selection.js, context-menu.js, inline-edit.js
- FSM coordinates all 8 interaction states across all modules
- annotations.js remains unmodified (491 lines) — future refactoring could extract it if needed
- All 225 existing tests pass, build succeeds

## Self-Check: PASSED

- All 6 source files verified to exist on disk
- All 3 task commits verified in git log (31f8574, 7e80f95, f91e1e3)
- SUMMARY.md exists at expected path
- All files under 500 lines
- 225 tests passing, build succeeds

---
*Phase: 13-canvas-interactions*
*Completed: 2026-02-16*
