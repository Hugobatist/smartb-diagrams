# Phase 18: Ghost Paths Functional - Research

**Researched:** 2026-02-19
**Domain:** Ghost path persistence as @ghost annotations, frontend parsing/rendering, UI management
**Confidence:** HIGH

## Summary

Phase 18 converts ghost paths from ephemeral in-memory storage (GhostPathStore) to file-persisted `@ghost` annotations inside .mmd files. This makes ghost paths survive server restarts, load automatically on page open, and be fully manageable (create, delete individual, clear all) from the browser UI. The work follows the same annotation pattern established for @flag, @status, @breakpoint, and @risk -- extending both the backend (annotations.ts) and frontend (annotations.js) parsers.

The primary risk is dual-parser synchronization: both parsers must agree on the `@ghost` format to avoid destroying each other's output during round-trips. The existing annotation system provides a proven template -- each annotation type uses a regex for parsing and a string template for serialization. Ghost paths follow the same pattern with format: `%% @ghost FROM TO "label"`.

**Primary recommendation:** Add @ghost as the 5th annotation type in the existing parse/inject pipeline. Backend: extend parseAllAnnotations + injectAnnotations in annotations.ts, add ghost CRUD methods to DiagramService, update MCP tools to persist via file instead of GhostPathStore. Frontend: extend parseAnnotations + injectAnnotations in annotations.js, load from file content on page open, manage via ghost-paths.js UI. GhostPathStore becomes a cache/adapter that reads from file on startup.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GHOST-01 | Ghost paths persist as `@ghost FROM TO "label"` annotations in .mmd files | annotations.ts has the ANNOTATION_START/END block pattern. Add GHOST_REGEX alongside existing FLAG_REGEX, STATUS_REGEX, BREAKPOINT_REGEX, RISK_REGEX. injectAnnotations already handles 4 types; add ghost as 5th. DiagramService.modifyAnnotation provides the read-modify-write pattern for atomic operations. |
| GHOST-02 | Both backend (annotations.ts) and frontend (annotations.js) parse/serialize @ghost | annotations.js mirrors annotations.ts exactly (same regexes, same block delimiters, same parse/inject functions). Add GHOST_REGEX to both. The frontend parseAnnotations must return ghosts, and injectAnnotations must serialize them. Cross-validation tests between parsers are essential. |
| GHOST-03 | Ghost paths load from file on page load and file switch | Currently, app-init.js (line 408-416) fetches ghost paths via REST API from in-memory store on page load. file-tree.js loadFile() (line 200-204) does the same on file switch. After Phase 18, ghost paths come from the file content itself -- the editor already has the content. Frontend parseAnnotations will extract @ghost lines directly from editor content during init and file load. No separate API call needed for loading. |
| GHOST-04 | UI button to clear all ghost paths for current file | ghost-paths.js already has a clearAllGhostPaths() function that DELETEs via REST. After Phase 18, this should modify the file content: strip @ghost lines from editor, save. Or call a new REST endpoint that modifies the file via DiagramService. The REST approach is cleaner (reuses write lock). |
| GHOST-05 | Individual ghost path deletion via context menu or list panel | Context menu already has "Ghost Path to..." for creation. Need to add delete capability in a ghost paths list panel (similar to annotations panel) with delete buttons per ghost path. The annotations-panel.js pattern can be reused. |
| GHOST-06 | Auto-show respects user's explicit hide preference (no forced visibility) | ghost-paths.js updateGhostPathsFn (line 294-315) currently forces `visible = true` when new paths arrive. Need to track whether the user explicitly toggled visibility off. Add an `explicitlyHidden` flag -- only auto-show when user hasn't explicitly hidden. |
| GHOST-07 | Keyboard shortcut (G key) for ghost path toggle | app-init.js keyboard handler (line 95-189) has shortcuts for f, n, a, h, b, etc. The G key is not currently bound. Add `if (e.key === 'g' && !e.ctrlKey)` alongside the h (heatmap) and b (breakpoint) handlers. |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. All changes use existing project infrastructure:

| Component | File | Purpose | Why It Works |
|-----------|------|---------|--------------|
| annotations.ts | src/diagram/annotations.ts | Parse/inject @ghost annotations | Already handles 4 annotation types with regex+block pattern |
| annotations.js | static/annotations.js | Frontend parse/inject @ghost | Mirrors backend parser exactly |
| DiagramService | src/diagram/service.ts | Ghost path CRUD via file persistence | Has modifyAnnotation read-modify-write pattern |
| ghost-paths.js | static/ghost-paths.js | Ghost path rendering + UI management | Existing module, needs update from API-based to file-based |
| ghost-path-routes.ts | src/server/ghost-path-routes.ts | REST endpoints for ghost CRUD | Existing endpoints, update to use DiagramService instead of GhostPathStore |
| tools.ts | src/mcp/tools.ts | MCP record_ghost_path + update_diagram | Currently uses GhostPathStore, switch to file persistence |

### Supporting

| Component | File | Purpose | When Used |
|-----------|------|---------|-----------|
| types.ts | src/diagram/types.ts | GhostPath type (already exists) | Type definition for ghost paths |
| context-menu.js | static/context-menu.js | Ghost path creation flow | Already implemented in Phase 15 |
| app-init.js | static/app-init.js | Keyboard shortcut + init wiring | Add G key shortcut |
| ws-handler.js | static/ws-handler.js | WebSocket ghost:update handler | Already handles ghost:update messages |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @ghost in annotation block | Sidecar .smartb/ files | Decided against in v2.1 requirements -- in-file is more consistent |
| File-based persistence | Keep in-memory GhostPathStore | Doesn't survive restarts (the whole point of Phase 18) |
| Ghost paths panel | Ghost paths in annotations panel | Separate panel is cleaner -- ghosts are conceptually different from flags |
| Parse from editor content | Separate API fetch | File content is already loaded -- no extra network call needed for read |

## Architecture Patterns

### Pattern 1: @ghost Annotation Format

**Format:** `%% @ghost FROM TO "label"`
**Regex:** `/^%%\s*@ghost\s+(\S+)\s+(\S+)\s+"([^"]*)"$/`
**Note:** Label is quoted like @flag and @risk. For ghost paths without labels, use empty string: `%% @ghost A B ""`

This mirrors the existing @risk pattern: `%% @risk NODE LEVEL "reason"` -> `%% @ghost FROM TO "label"`

### Pattern 2: AllAnnotations Extension

```typescript
// annotations.ts -- extend AllAnnotations interface
export interface AllAnnotations {
  flags: Map<string, Flag>;
  statuses: Map<string, NodeStatus>;
  breakpoints: Set<string>;
  risks: Map<string, RiskAnnotation>;
  ghosts: GhostPathAnnotation[];  // NEW -- ordered array, not map
}
```

Ghost paths use an array (not a Map) because:
1. Multiple ghost paths between the same FROM->TO pair are valid (different labels)
2. Order matters (rendering order)
3. No natural unique key (FROM+TO isn't unique with labels)

### Pattern 3: GhostPathAnnotation Type

```typescript
// New type for file-persisted ghost paths (no timestamp -- that's runtime-only)
export interface GhostPathAnnotation {
  fromNodeId: string;
  toNodeId: string;
  label: string;  // empty string when no label
}
```

This is distinct from the existing `GhostPath` type (which has `timestamp`) because file annotations don't store timestamps.

### Pattern 4: DiagramService Ghost Methods

Follow the exact pattern of setRisk/removeRisk:

```typescript
async addGhost(filePath, fromNodeId, toNodeId, label): Promise<void> {
  return this.modifyAnnotation(filePath, (data) => {
    data.ghosts.push({ fromNodeId, toNodeId, label });
  });
}

async removeGhost(filePath, fromNodeId, toNodeId, label): Promise<void> {
  return this.modifyAnnotation(filePath, (data) => {
    const idx = data.ghosts.findIndex(g =>
      g.fromNodeId === fromNodeId && g.toNodeId === toNodeId && g.label === label
    );
    if (idx !== -1) data.ghosts.splice(idx, 1);
  });
}

async clearGhosts(filePath): Promise<void> {
  return this.modifyAnnotation(filePath, (data) => {
    data.ghosts.length = 0;
  });
}
```

### Pattern 5: User Preference Tracking for Auto-Show

```javascript
var userExplicitlyHid = false;

function toggle() {
    visible = !visible;
    userExplicitlyHid = !visible;
    saveVisibility();
    updateButtonState();
    renderGhostPaths();
}

function updateGhostPathsFn(file, paths) {
    // Only auto-show if user hasn't explicitly hidden
    if (list.length > 0 && file === currentFile && !visible && !userExplicitlyHid) {
        visible = true;
        saveVisibility();
        updateButtonState();
    }
    renderGhostPaths();
}
```

### Anti-Patterns to Avoid

- **Separate ghost path file format:** Don't create a different serialization. Use the same annotation block.
- **Mixing GhostPathStore and file persistence:** After Phase 18, the file IS the source of truth.
- **Frontend fetching ghosts separately:** Parse from editor content on load.
- **Breaking existing @ghost-less files:** Zero ghost paths must work perfectly.

## Common Pitfalls

### Pitfall 1: Backend/Frontend Parser Desync
**What goes wrong:** Backend writes @ghost lines that the frontend can't parse, or vice versa.
**How to avoid:** Write cross-validation tests. Use identical regex patterns.

### Pitfall 2: Ghost Path Label with Quotes
**What goes wrong:** Labels with double quotes break regex match.
**How to avoid:** Escape with `''` replacement like @flag and @risk.

### Pitfall 3: GhostPathStore Out of Sync with File
**What goes wrong:** Memory store diverges from file content.
**How to avoid:** Make file the single source of truth. Read from file via DiagramService.

### Pitfall 4: Auto-Show Ignoring User Preference
**What goes wrong:** User hides ghost paths, WebSocket update re-shows them.
**How to avoid:** Track `userExplicitlyHid` flag.

### Pitfall 5: injectAnnotations Losing Ghosts
**What goes wrong:** Frontend save strips ghosts because injectAnnotations doesn't serialize them.
**How to avoid:** Add ghost serialization to frontend injectAnnotations.

### Pitfall 6: Empty Label Handling
**What goes wrong:** Ghost paths without labels don't persist.
**How to avoid:** Regex `"([^"]*)"` correctly matches `""`. Test explicitly.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- All findings verified by direct code reading:
  - `src/diagram/annotations.ts` -- parseAllAnnotations, injectAnnotations, AllAnnotations
  - `src/diagram/service.ts` -- DiagramService CRUD, modifyAnnotation
  - `src/diagram/types.ts` -- GhostPath, DiagramContent
  - `src/server/ghost-store.ts` -- Current in-memory GhostPathStore
  - `src/server/ghost-path-routes.ts` -- Current REST endpoints
  - `src/mcp/tools.ts` -- record_ghost_path, update_diagram
  - `static/annotations.js` -- Frontend parser
  - `static/ghost-paths.js` -- Frontend ghost path rendering
  - `static/context-menu.js` -- Ghost path creation flow
  - `static/app-init.js` -- Keyboard shortcuts, init
  - `static/ws-handler.js` -- ghost:update handler
  - `static/file-tree.js` -- File switch pattern
  - `test/diagram/annotations.test.ts` -- Annotation test patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All changes extend existing annotation infrastructure
- Architecture: HIGH -- @ghost follows identical pattern to other annotations
- Pitfalls: HIGH -- Dual-parser sync is main risk, mitigated by tests

**Research date:** 2026-02-19
**Valid until:** 2026-03-19
