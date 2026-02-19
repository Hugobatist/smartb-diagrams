# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Developers can see what their AI is thinking and intervene surgically before it finishes
**Current focus:** v2.1 milestone SHIPPED

## Current Position

Phase: 20 of 20 (Polish) -- COMPLETE
Plan: 1 of 1 in current phase -- COMPLETE
Status: v2.1 milestone shipped
Last activity: 2026-02-19 — Completed Phase 20 (Polish: CSS split, keyboard fix, PNG ghost export, type exports)

Progress: [##########] 100% (7/7 plans across 4 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 7 (v2.1) | 56 (lifetime: 23 v1.0 + 26 v2.0 + 7 v2.1)
- Average duration: ~4min (v2.1)
- Total execution time: ~28min (v2.1)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 17. Critical Fixes + Write Safety | 2/2 | 7min | 3.5min |
| 18. Ghost Paths Functional | 2/2 | ~8min | ~4min |
| 19. Heatmap Practical | 2/2 | ~9min | ~4.5min |
| 20. Polish | 1/1 | ~4min | ~4min |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.1]: Ghost paths will persist as @ghost annotations in .mmd files (not .smartb/ sidecar)
- [v2.1]: Both parsers (backend annotations.ts + frontend annotations.js) must be updated atomically for @ghost
- [v2.1]: Heatmap auto-tracking via browser clicks (PointerEvent delegation on #preview)
- [v2.1]: Phase 18 (ghost paths) is highest risk due to dual-parser destruction potential
- [17-01]: writeDiagramPreserving uses read-merge-write pattern to unconditionally preserve flags/breakpoints
- [17-01]: writeRaw provides raw write under lock for /save (no annotation processing)
- [17-01]: allowEmpty for modal prompt is opt-in (default false) to protect existing callers
- [17-02]: DiagramContent extended with breakpoints/risks to match parseAllAnnotations output
- [17-02]: FileWatcher ready-gate pattern: discoverMmdFiles resolves before first handleEvent
- [17-02]: closeAllWatchers iterates all watchers (default + named projects) for leak-free shutdown
- [18]: GhostPathAnnotation type (no timestamp) distinct from GhostPath (has timestamp) — annotations are lightweight
- [18]: Ghost paths use array (not Map) — multiple paths between same FROM->TO are valid
- [18]: GhostPathStore replaced entirely by DiagramService ghost CRUD (file-persisted, not in-memory)
- [18]: writeDiagramPreserving ghosts parameter: replace if provided, else preserve existing (merge semantics)
- [18]: userExplicitlyHid flag in ghost-paths.js prevents auto-show from overriding user's toggle-off choice
- [18]: resetUserHide() called on file switch so auto-show works fresh for each file
- [19]: Click data is ephemeral in-memory (HeatmapStore), session JSONL provides persistent data
- [19]: Batch flush interval is 2 seconds to balance responsiveness and request volume
- [19]: record_step broadcasts heatmap:update with single-node delta for real-time visualization
- [19]: ws-handler uses key count heuristic (<=3 keys = merge, >3 = replace) for delta detection
- [19]: Mode toggle only appears when data exists in at least one mode
- [20]: CSS split: main.css sidebar/context-menu/MCP styles extracted to sidebar.css (QUAL-01)
- [20]: isTypingContext() guard blocks single-key shortcuts in INPUT/TEXTAREA/SELECT/contenteditable (QUAL-02)
- [20]: copyGhostPathsToExport() clones .ghost-path SVG elements + #ghost-arrow marker into export SVG (QUAL-03)
- [20]: Public API now exports RiskLevel, RiskAnnotation, GhostPath, GhostPathAnnotation from types.ts (QUAL-04)

### Pending Todos

None -- v2.1 milestone complete.

### Blockers/Concerns

- None currently

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed Phase 20 (Polish) — v2.1 milestone shipped
Resume file: None
Next: v2.2 planning (deferred features: pattern memory, diagram contracts, parser unification)
