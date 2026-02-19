# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Developers can see what their AI is thinking and intervene surgically before it finishes
**Current focus:** Phase 19 - Heatmap Practical

## Current Position

Phase: 19 of 20 (Heatmap Practical)
Plan: 1 of 2 in current phase
Status: Ready
Last activity: 2026-02-19 — Completed Phase 18 (Ghost Paths Functional: @ghost annotations, dual-parser sync, CRUD, UI toggle preference)

Progress: [######░░░░] 57% (4/7 plans across 4 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 4 (v2.1) | 53 (lifetime: 23 v1.0 + 26 v2.0 + 4 v2.1)
- Average duration: ~4min (v2.1)
- Total execution time: ~15min (v2.1)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 17. Critical Fixes + Write Safety | 2/2 | 7min | 3.5min |
| 18. Ghost Paths Functional | 2/2 | ~8min | ~4min |
| 19. Heatmap Practical | 0/2 | - | - |
| 20. Polish | 0/1 | - | - |

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

### Pending Todos

None yet.

### Blockers/Concerns

- None currently — dual annotation parser sync risk (Phase 18) was resolved successfully

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed Phase 18 (Ghost Paths Functional) — all 7 GHOST requirements done
Resume file: None
Next: Phase 19 (Heatmap Practical) — plan and execute 19-01, 19-02
