---
phase: 14-undo-redo-edit-actions
plan: 01
subsystem: ui
tags: [command-pattern, undo-redo, vanilla-js, iife-modules]

# Dependency graph
requires:
  - phase: 13-canvas-interactions
    provides: "diagram-editor.js with applyEdit gateway, selection, context menu, inline edit"
provides:
  - "SmartBCommandHistory: execute/undo/redo API with MAX_HISTORY=100 and history:changed events"
  - "SmartBEditorPopovers: showAddNodePopover/showAddEdgePopover/closePopover extracted module"
  - "MmdEditor.redo() public API for keyboard shortcut wiring"
  - "diagram-editor.js refactored under 350 lines (well within 500-line limit)"
affects: [14-02, 14-03, app-init, keyboard-shortcuts]

# Tech tracking
tech-stack:
  added: []
  patterns: [command-pattern-undo-redo, content-snapshot-before-after, module-extraction-for-line-limits]

key-files:
  created:
    - "static/command-history.js"
    - "static/editor-popovers.js"
  modified:
    - "static/diagram-editor.js"
    - "static/live.html"

key-decisions:
  - "Content-snapshot command pattern (before/after full editor content) over fine-grained operation commands"
  - "MAX_HISTORY=100 (doubled from old MAX_UNDO=50)"
  - "Redo stack clears on new edit (standard editor behavior)"
  - "history:changed event emitted via SmartBEventBus for future UI indicator integration"
  - "Popover extraction to editor-popovers.js to keep diagram-editor.js under 500 lines"
  - "editor-popovers.js accesses MmdEditor via window.MmdEditor (script load order enforces availability)"

patterns-established:
  - "Command pattern: {before, after, description} objects pushed to SmartBCommandHistory.execute()"
  - "Module extraction pattern: large IIFE modules split by extracting UI components to separate files"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Phase 14 Plan 01: Command History + Popover Extraction Summary

**Command pattern undo/redo with capped stacks (MAX=100) replacing primitive undoStack, popover functions extracted to separate module**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T00:34:44Z
- **Completed:** 2026-02-16T00:37:46Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- SmartBCommandHistory module with execute/undo/redo/canUndo/canRedo/clear API, MAX_HISTORY=100, emits history:changed events
- SmartBEditorPopovers module with showAddNodePopover/showAddEdgePopover/closePopover extracted from diagram-editor.js
- diagram-editor.js refactored from 485 to 350 lines: old undoStack completely removed, applyEdit() pushes commands to SmartBCommandHistory, new undo() and redo() functions delegate to SmartBCommandHistory
- MmdEditor.redo exposed in public API, MmdEditor.closeEditorPopover delegates to SmartBEditorPopovers
- live.html updated with 2 new script tags and help overlay rows for Ctrl+Z / Ctrl+Shift+Z

## Task Commits

Each task was committed atomically:

1. **Task 1: Create command-history.js and editor-popovers.js modules** - `013588c` (feat)
2. **Task 2: Refactor diagram-editor.js to use command history and delegate popovers** - `794f4ae` (feat)

## Files Created/Modified
- `static/command-history.js` - Command pattern undo/redo stack management (89 lines)
- `static/editor-popovers.js` - Add-node and add-edge popover UI extracted from diagram-editor.js (181 lines)
- `static/diagram-editor.js` - Refactored to use SmartBCommandHistory and delegate popovers (350 lines, down from 485)
- `static/live.html` - Added script tags for command-history.js and editor-popovers.js, added help rows for undo/redo shortcuts

## Decisions Made
- Content-snapshot command pattern chosen over fine-grained operation commands -- simpler since applyEdit() already handles the annotation stripping/re-injection pipeline
- MAX_HISTORY doubled to 100 from old MAX_UNDO=50 -- .mmd files are small, 100 snapshots costs under 1MB
- history:changed event emitted for future UI integration (undo/redo button states)
- Popover extraction necessary to keep diagram-editor.js under 500 lines after adding redo logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SmartBCommandHistory is ready for keyboard shortcut wiring in app-init.js (Plan 02/03)
- MmdEditor.redo() is exposed and ready for Ctrl+Shift+Z binding
- history:changed event is ready for future UI indicators
- All 225 tests pass, build succeeds

## Self-Check: PASSED

- [x] static/command-history.js exists
- [x] static/editor-popovers.js exists
- [x] static/diagram-editor.js exists (350 lines)
- [x] static/live.html exists (updated)
- [x] Commit 013588c exists (Task 1)
- [x] Commit 794f4ae exists (Task 2)

---
*Phase: 14-undo-redo-edit-actions*
*Completed: 2026-02-16*
