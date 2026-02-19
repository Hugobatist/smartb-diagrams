# Phase 17: Critical Fixes + Write Safety - Research

**Researched:** 2026-02-19
**Domain:** MCP tool annotation preservation, write serialization, filesystem watcher initialization
**Confidence:** HIGH

## Summary

Phase 17 addresses seven concrete bugs and safety gaps discovered during the v2.0 audit. The issues divide cleanly into three categories: (1) MCP tools that destroy or omit developer data, (2) a /save endpoint that bypasses the write lock, and (3) a FileWatcher that misclassifies the first event for pre-existing files. All seven fixes are narrowly scoped, affect well-understood code paths, and require zero new dependencies.

The most impactful bug is MCP-01: `update_diagram` currently passes `undefined` for flags and breakpoints, which means calling it on a file that already has `@flag` or `@breakpoint` annotations silently destroys them. The fix requires a read-before-write pattern -- read existing annotations, merge the new data on top, then write back. The infrastructure for this pattern already exists in `DiagramService.modifyAnnotation()`.

**Primary recommendation:** Use the existing `modifyAnnotation` read-modify-write pattern for `update_diagram`, extend `DiagramContent` and `readDiagram` to include breakpoints and risks, route `/save` through `DiagramService.writeDiagram`, pre-populate `knownFiles` from `discoverMmdFiles` in the FileWatcher constructor, and track all watchers in a `Map` that gets cleaned up on shutdown.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MCP-01 | `update_diagram` preserves existing flags and breakpoints instead of destroying them | `update_diagram` tool handler (tools.ts:63-133) currently calls `service.writeDiagram(filePath, content, undefined, statusMap, undefined, riskMap)` -- passing `undefined` for flags and breakpoints. The `_writeDiagramInternal` method (service.ts:128-145) treats `undefined` flags as "no flags" which causes `injectAnnotations` to only emit the statuses/risks provided, destroying any pre-existing flags/breakpoints. Fix: read existing annotations first via `readAllAnnotations`, merge new data on top, write back with all annotation types. The `modifyAnnotation` helper (service.ts:66-77) provides the exact pattern. |
| MCP-02 | `get_diagram_context` returns ghost paths, breakpoints, and risk annotations | The `get_diagram_context` tool handler (tools.ts:177-210) calls `service.readDiagram()` which returns a `DiagramContent` that only contains `flags` and `statuses`. The handler's response object (tools.ts:180-193) only includes `flags`, `statuses`, and `validation`. Must add breakpoints, risks, and ghost paths to the response. Breakpoints/risks come from `parseAllAnnotations()`. Ghost paths come from the `ghostStore` (in-memory, not yet persisted). |
| MCP-03 | `DiagramContent` type includes breakpoints and risks fields | `DiagramContent` in types.ts:28-41 currently has `flags`, `statuses`, `validation`, `filePath`, `raw`, `mermaidContent`. Must add `breakpoints: Set<string>` and `risks: Map<string, RiskAnnotation>`. Also update `readDiagram()` in service.ts:83-96 to populate these from `parseAllAnnotations()`. |
| MCP-04 | Modal prompt allows empty/optional input (fixes ghost path creation from UI) | In `modal.js:103-106`, the `doConfirm` function checks `if (!val) return;` which blocks empty string submission. The ghost path label is optional per the MCP schema (schemas.ts:109-112, `label: z.string().optional()`), but the UI modal requires a non-empty value. Fix: allow the modal to submit with empty/blank input for prompts that need optional input. Either add an `allowEmpty` option to `SmartBModal.prompt()` or change the ghost path flow in context-menu.js to use a different approach. |
| SAFE-01 | `/save` endpoint routes through DiagramService write lock | The `/save` handler in file-routes.ts:39-59 calls `writeFile()` directly, bypassing the `DiagramService.withWriteLock()` mechanism. If an MCP tool is writing to the same file concurrently, both writes can interleave and corrupt the file. Fix: route through `service.writeDiagram()` (which acquires the write lock) or expose a `writeRaw()` method on DiagramService that acquires the lock without annotation injection. |
| SAFE-02 | FileWatcher pre-populates `knownFiles` on startup | FileWatcher (file-watcher.ts:54) starts with `knownFiles = new Set<string>()`. The first `fs.watch` event for any pre-existing file will fail the `knownFiles.has(relative)` check and fire `onFileAdded` instead of `onFileChanged`. Fix: populate `knownFiles` from `discoverMmdFiles()` during construction or via an explicit `init()` method. |
| SAFE-03 | Additional project watchers are closed on server shutdown | In server.ts:209, `watchers` is a local `Map` inside `createHttpServer()`. The cleanup in `startServer()` (server.ts:306-321) only calls `fileWatcher.close()` on the default watcher. Named project watchers added via `addProject()` are never closed. Fix: expose all watchers for cleanup, or add a `closeAllWatchers()` method on `ServerInstance`. |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. All fixes use existing project infrastructure:

| Component | File | Purpose | Why It Works |
|-----------|------|---------|--------------|
| DiagramService | src/diagram/service.ts | All .mmd file operations with write lock | Already has `withWriteLock()`, `readAllAnnotations()`, `modifyAnnotation()` |
| annotations.ts | src/diagram/annotations.ts | Parse/inject all annotation types in one pass | `parseAllAnnotations()` returns flags, statuses, breakpoints, risks |
| types.ts | src/diagram/types.ts | Domain type definitions | Central type authority for the project |
| FileWatcher | src/watcher/file-watcher.ts | Filesystem event classification | Owns `knownFiles` set and event routing |
| discoverMmdFiles | src/project/discovery.ts | Recursive .mmd file enumeration | Already used by `service.listFiles()` |

### Supporting

| Component | File | Purpose | When Used |
|-----------|------|---------|-----------|
| GhostPathStore | src/server/ghost-store.ts | In-memory ghost path storage | `get_diagram_context` needs to include ghost paths from store |
| modal.js | static/modal.js | UI prompt/confirm modals | MCP-04 fix for empty input |
| context-menu.js | static/context-menu.js | Ghost path creation flow | Consumer of modal.js prompt |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Read-modify-write in tool handler | Add merge logic to `writeDiagram` | Would complicate the core service for a tool-specific concern. Keep merge in tool handler. |
| `allowEmpty` option on modal | Separate `SmartBModal.optionalPrompt()` | Extra API surface. A boolean option is simpler and keeps API minimal. |
| Async init for FileWatcher | Sync `readdirSync` in constructor | `discoverMmdFiles` is async (uses `readdir`). Need either sync fallback or async factory pattern. |

## Architecture Patterns

### Pattern 1: Read-Modify-Write for MCP Annotation Preservation (MCP-01)

**What:** Before writing, read all existing annotations, merge new data on top, write the merged result.
**When to use:** Any MCP tool that writes content to a .mmd file where other annotation types may already exist.
**Why:** The existing `modifyAnnotation` helper in DiagramService does exactly this pattern for individual annotation operations (setFlag, setStatus, etc.). The `update_diagram` tool needs the same approach.

**Current code (broken):**
```typescript
// tools.ts:80 -- passes undefined for flags and breakpoints
await service.writeDiagram(filePath, content, undefined, statusMap, undefined, riskMap);
```

**Fixed approach:**
```typescript
// Read existing annotations from the file (if it exists)
let existingFlags = new Map();
let existingBreakpoints = new Set();
let existingRisks = new Map();
try {
  const existing = await service.readAllAnnotations(filePath);
  existingFlags = existing.flags;
  existingBreakpoints = existing.breakpoints;
  if (!riskMap) existingRisks = existing.risks;
} catch { /* file doesn't exist yet -- use empty defaults */ }

// Merge: new statuses/risks override, existing flags/breakpoints preserved
await service.writeDiagram(
  filePath, content,
  existingFlags,       // preserve existing flags
  statusMap ?? existingStatuses,
  existingBreakpoints, // preserve existing breakpoints
  riskMap ?? existingRisks,
);
```

**Critical detail:** `readAllAnnotations` is currently a `private` method on DiagramService. Either make it package-accessible or create a public method that returns the needed data. The cleanest approach is to add a new method like `updateDiagramPreserving()` that encapsulates the read-merge-write pattern under the write lock.

### Pattern 2: Type Extension for DiagramContent (MCP-03)

**What:** Add `breakpoints` and `risks` fields to the `DiagramContent` interface and populate them in `readDiagram()`.
**When to use:** When the return type of a service method needs to expose additional parsed data.

```typescript
// types.ts -- extend DiagramContent
export interface DiagramContent {
  raw: string;
  mermaidContent: string;
  flags: Map<string, Flag>;
  statuses: Map<string, NodeStatus>;
  breakpoints: Set<string>;             // NEW
  risks: Map<string, RiskAnnotation>;   // NEW
  validation: ValidationResult;
  filePath: string;
}
```

```typescript
// service.ts -- update readDiagram()
async readDiagram(filePath: string): Promise<DiagramContent> {
  const resolved = this.resolvePath(filePath);
  const raw = await readFile(resolved, 'utf-8');
  const { mermaidContent, diagramType } = parseDiagramContent(raw);
  const { flags, statuses, breakpoints, risks } = parseAllAnnotations(raw);
  const validation = validateMermaidSyntax(mermaidContent);
  if (diagramType && !validation.diagramType) {
    validation.diagramType = diagramType;
  }
  return { raw, mermaidContent, flags, statuses, breakpoints, risks, validation, filePath };
}
```

### Pattern 3: Write Lock Routing for /save (SAFE-01)

**What:** Route the `/save` HTTP endpoint through DiagramService to serialize with MCP writes.
**When to use:** Any endpoint that writes to .mmd files must go through the write lock.

**Option A: Add `writeRaw()` to DiagramService**
```typescript
// New method on DiagramService
async writeRaw(filePath: string, content: string): Promise<void> {
  return this.withWriteLock(filePath, async () => {
    const resolved = this.resolvePath(filePath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, 'utf-8');
  });
}
```

**Option B: Use existing `writeDiagram()` without annotation args**
```typescript
// In file-routes.ts /save handler
await service.writeDiagram(body.filename, body.content);
```

Option A is cleaner because `/save` receives raw content that may already contain annotations and should not be re-processed. Option B would strip and re-inject annotations, potentially altering the file unexpectedly.

### Pattern 4: Async FileWatcher Initialization (SAFE-02)

**What:** Pre-populate `knownFiles` before `fs.watch` starts receiving events.
**When to use:** FileWatcher constructor.

**Challenge:** `discoverMmdFiles()` is async, but the FileWatcher constructor is synchronous.

**Approach: Async factory + ready gate**
```typescript
export class FileWatcher {
  private knownFiles = new Set<string>();
  private readyPromise: Promise<void>;

  constructor(projectDir: string, ...) {
    // Start discovery immediately, gate event handling on completion
    this.readyPromise = this.populateKnownFiles(projectDir);
    this.watcher = watch(projectDir, { recursive: true }, (_, filename) => {
      // ... same as before but handleEvent waits for ready
    });
  }

  private async populateKnownFiles(projectDir: string): Promise<void> {
    const files = await discoverMmdFiles(projectDir);
    for (const f of files) {
      this.knownFiles.add(f);
    }
  }

  private handleEvent(relative: string): void {
    // Gate on readyPromise to avoid race
    this.readyPromise.then(() => {
      // ... existing logic
    });
  }
}
```

**Simpler alternative: Use `readdirSync` for a synchronous approach.** Since this runs once at startup and the project directory is local, the sync penalty is negligible. However, `discoverMmdFiles` uses async `readdir` with `recursive: true`. Creating a sync equivalent would duplicate code. The async factory pattern is preferable.

### Pattern 5: Watcher Cleanup on Shutdown (SAFE-03)

**What:** Track all FileWatcher instances and close them during shutdown.
**When to use:** Server shutdown handler.

```typescript
// In createHttpServer, expose a closeAll function
const instance: ServerInstance = {
  httpServer, wsManager, fileWatcher, ghostStore,
  breakpointContinueSignals, sessionStore, addProject,
  closeAllWatchers: async () => {
    for (const w of watchers.values()) {
      await w.close();
    }
    watchers.clear();
  },
};
```

Then in `startServer()` and `startMcpServer()`, call `closeAllWatchers()` during shutdown.

### Anti-Patterns to Avoid

- **Writing without the lock:** Never call `writeFile()` directly on .mmd files outside DiagramService. The /save bug (SAFE-01) is exactly this anti-pattern.
- **Partial annotation writes:** Never pass `undefined` for annotation types when writing to a file that may have existing annotations. Either read-merge-write or pass all annotation types explicitly.
- **Synchronous constructors with async init:** Don't block the event loop. Use an async factory or a ready gate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File write serialization | Custom mutex/semaphore | Existing `withWriteLock()` in DiagramService | Already tested, handles error cases, cleans up |
| Annotation parsing | New regex per tool | Existing `parseAllAnnotations()` | Single-pass parser already handles all 4 annotation types |
| File discovery | `readdirSync` + manual filter | Existing `discoverMmdFiles()` | Handles excluded dirs, async, returns sorted paths |

**Key insight:** All seven fixes use patterns and infrastructure that already exist in the codebase. No new abstractions are needed -- only wiring existing pieces together correctly.

## Common Pitfalls

### Pitfall 1: Annotation Loss During update_diagram Merge

**What goes wrong:** When merging new annotations with existing ones, the merge logic might overwrite instead of preserving. For example, if the MCP call provides `nodeStatuses` but the file already has statuses, the new map should replace the old one (since it's intentional) but flags/breakpoints should be preserved.
**Why it happens:** Ambiguity about which fields are "additive" vs "replacement".
**How to avoid:** Clear rules: `content` always replaces the Mermaid diagram content. `nodeStatuses` replaces all statuses (the AI sends the full desired state). `riskLevels` replaces all risks. `flags` and `breakpoints` are NEVER touched by `update_diagram` -- they are developer-owned.
**Warning signs:** Tests that check "flags preserved" should also check "statuses replaced" and "risks replaced" to ensure the distinction is clear.

### Pitfall 2: Ghost Path Data Source Confusion

**What goes wrong:** Ghost paths for `get_diagram_context` come from the in-memory `GhostPathStore`, not from annotations in the file. Currently ghost paths are not persisted in .mmd files (that's Phase 18). Mixing up the data source would cause incorrect results.
**Why it happens:** Other annotation types (flags, statuses, breakpoints, risks) are all file-persisted, but ghost paths are memory-only.
**How to avoid:** In Phase 17, `get_diagram_context` fetches ghost paths from `ghostStore.get(filePath)`. In Phase 18, it will switch to reading `@ghost` annotations from the file. Keep these paths separate.
**Warning signs:** If ghost paths appear in the response only after MCP-created sessions but not after manual creation via REST, the data source is wrong.

### Pitfall 3: Modal allowEmpty Breaks Other Callers

**What goes wrong:** Adding an `allowEmpty` option to `SmartBModal.prompt()` works for ghost paths, but other prompt callers (rename, flag message, risk reason) should still require non-empty input.
**Why it happens:** Global change to shared component.
**How to avoid:** Make `allowEmpty` opt-in (default `false`). Only the ghost path creation flow in `context-menu.js` passes `allowEmpty: true`. All other callers remain unchanged.
**Warning signs:** Empty flag messages or empty risk reasons getting saved.

### Pitfall 4: FileWatcher Race During Startup

**What goes wrong:** `fs.watch` starts immediately in the constructor and may fire events before `discoverMmdFiles()` completes, causing the first few events to still be classified as "add".
**Why it happens:** Async population of `knownFiles` races with sync `fs.watch` events.
**How to avoid:** Buffer events or gate `handleEvent` on the `readyPromise`. Events received before discovery completes should be queued and processed after.
**Warning signs:** Intermittent test failures where the first event after startup is sometimes "add" and sometimes "change" depending on timing.

### Pitfall 5: /save Write Lock Deadlock

**What goes wrong:** If `/save` is routed through `DiagramService.writeDiagram()` and the annotation injection logic encounters an error (e.g., invalid content), the write lock might not be released.
**Why it happens:** The `withWriteLock` implementation uses `.then(fn, fn)` which handles both success and failure, so deadlock is unlikely. But if `fn` throws synchronously before returning a Promise, it could bypass the chain.
**How to avoid:** Use `writeRaw()` for /save (skips annotation injection entirely) instead of `writeDiagram()`. The /save endpoint receives already-formatted content from the editor that may include annotation blocks.
**Warning signs:** Subsequent writes to the same file hang indefinitely after a failed /save.

### Pitfall 6: Watcher Cleanup Missing in MCP Server Mode

**What goes wrong:** The MCP server mode (`startMcpServer` in mcp/server.ts) creates watchers via `createHttpServer()` but the cleanup in `httpCleanup` (mcp/server.ts:111-122) only closes `fileWatcher` (the default). Named project watchers added via `addProject` leak.
**Why it happens:** `createHttpServer` returns only the default `fileWatcher`, not the watchers Map.
**How to avoid:** Add `closeAllWatchers()` to `ServerInstance` and call it in all shutdown paths.
**Warning signs:** `fs.watch` handle leaks in long-running MCP sessions with multiple projects.

## Code Examples

### Example 1: update_diagram with Annotation Preservation

```typescript
// In tools.ts update_diagram handler
// Step 1: Read existing annotations (if file exists)
let preservedFlags = new Map<string, Flag>();
let preservedBreakpoints = new Set<string>();
let preservedStatuses = new Map<string, NodeStatus>();
let preservedRisks = new Map<string, RiskAnnotation>();

try {
  const data = await service.readAllAnnotations(filePath); // needs to be public
  preservedFlags = data.flags;
  preservedBreakpoints = data.breakpoints;
  preservedStatuses = data.statuses;
  preservedRisks = data.risks;
} catch {
  // File doesn't exist yet -- empty defaults are fine
}

// Step 2: Merge -- new data overrides where provided, existing preserved otherwise
const finalStatuses = statusMap ?? preservedStatuses;
const finalRisks = riskMap ?? preservedRisks;

// Step 3: Write with ALL annotation types
await service.writeDiagram(
  filePath, content,
  preservedFlags,      // always preserve developer flags
  finalStatuses,
  preservedBreakpoints, // always preserve developer breakpoints
  finalRisks,
);
```

### Example 2: Extended get_diagram_context Response

```typescript
// In tools.ts get_diagram_context handler
const diagram = await service.readDiagram(filePath);
const ghostPaths = options?.ghostStore?.get(filePath) ?? [];

const context = {
  filePath: diagram.filePath,
  mermaidContent: diagram.mermaidContent,
  flags: Array.from(diagram.flags.values()).map(f => ({
    nodeId: f.nodeId,
    message: f.message,
  })),
  statuses: Object.fromEntries(diagram.statuses),
  breakpoints: Array.from(diagram.breakpoints),       // NEW
  risks: Array.from(diagram.risks.values()).map(r => ({ // NEW
    nodeId: r.nodeId,
    level: r.level,
    reason: r.reason,
  })),
  ghostPaths: ghostPaths.map(gp => ({                  // NEW
    fromNodeId: gp.fromNodeId,
    toNodeId: gp.toNodeId,
    label: gp.label,
  })),
  validation: {
    valid: diagram.validation.valid,
    errors: diagram.validation.errors,
    diagramType: diagram.validation.diagramType,
  },
};
```

### Example 3: Modal with allowEmpty Option

```javascript
// modal.js -- modified doConfirm in showPrompt
function doConfirm() {
    var val = input.value.trim();
    if (!val && !opts.allowEmpty) return;  // respect allowEmpty flag
    close();
    if (onConfirm) onConfirm(val);
}
```

```javascript
// context-menu.js -- ghost path prompt
SmartBModal.prompt({
    title: 'Ghost Path: ' + from + ' -> ' + to,
    placeholder: 'Reason (optional)',
    allowEmpty: true,  // ghost path label is optional
    onConfirm: function(label) {
        if (window.SmartBGhostPaths) SmartBGhostPaths.createGhostPath(from, to, label || undefined);
    },
});
```

### Example 4: FileWatcher with Pre-populated knownFiles

```typescript
export class FileWatcher {
  private knownFiles = new Set<string>();
  private ready: Promise<void>;

  constructor(projectDir: string, onChanged, onAdded, onRemoved) {
    // Pre-populate known files asynchronously
    this.ready = discoverMmdFiles(projectDir).then(files => {
      for (const f of files) this.knownFiles.add(f);
    }).catch(() => { /* startup discovery failed -- treat all as new */ });

    this.watcher = watch(projectDir, { recursive: true }, (_eventType, filename) => {
      // ... filter and debounce as before
      this.debounceTimers.set(relative, setTimeout(() => {
        this.debounceTimers.delete(relative);
        this.ready.then(() => this.handleEvent(relative));
      }, FileWatcher.DEBOUNCE_MS));
    });
  }
}
```

### Example 5: writeRaw for /save Safety

```typescript
// DiagramService -- new method
async writeRaw(filePath: string, content: string): Promise<void> {
  return this.withWriteLock(filePath, async () => {
    const resolved = this.resolvePath(filePath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, 'utf-8');
  });
}
```

```typescript
// file-routes.ts /save handler
await service.writeRaw(body.filename, body.content);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `writeDiagram()` with undefined flags | Read-modify-write with annotation preservation | Phase 17 (this phase) | Prevents silent annotation destruction |
| `/save` bypasses write lock | All .mmd writes go through DiagramService | Phase 17 (this phase) | Prevents concurrent write corruption |
| Empty `knownFiles` at startup | Pre-populated from file discovery | Phase 17 (this phase) | Correct event classification from first event |
| Ghost paths memory-only | Memory-only for Phase 17; file-persisted in Phase 18 | Phase 18 (next) | No change in Phase 17 -- just include in context response |

**Deprecated/outdated:**
- Direct `writeFile()` calls for .mmd files outside DiagramService: Should be considered a bug after Phase 17.

## Open Questions

1. **Should `update_diagram` preserve existing statuses when new `nodeStatuses` are not provided?**
   - What we know: Currently, `nodeStatuses` is optional. When omitted, no statuses are written. The question is whether omitting it should preserve existing statuses or clear them.
   - What's unclear: Intent semantics. Is "no nodeStatuses" == "don't change statuses" or "clear all statuses"?
   - Recommendation: Treat `undefined` as "preserve existing". Only an explicitly empty object `{}` should clear. This matches user expectations and prevents accidental data loss.

2. **Should `readAllAnnotations` become a public method on DiagramService?**
   - What we know: Currently private. The `update_diagram` handler needs annotation data before writing.
   - What's unclear: Whether exposing it breaks encapsulation or if a higher-level method is better.
   - Recommendation: Add a new public method `writeDiagramPreserving()` that encapsulates the read-merge-write under the write lock. This keeps `readAllAnnotations` private and provides a clean API for the use case.

3. **How should the `get_diagram_context` tool access the `ghostStore`?**
   - What we know: The tool handler has access to `options?.ghostStore` via the dependency injection pattern used by all tools.
   - What's unclear: Nothing -- the pattern is already established. Just need to use it.
   - Recommendation: Access `options?.ghostStore?.get(filePath)` in the handler, same as `record_ghost_path` does.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- All findings verified by direct code reading:
  - `src/diagram/service.ts` -- DiagramService write lock, readAllAnnotations, modifyAnnotation
  - `src/diagram/annotations.ts` -- parseAllAnnotations, injectAnnotations
  - `src/diagram/types.ts` -- DiagramContent, Flag, NodeStatus, RiskAnnotation
  - `src/mcp/tools.ts` -- update_diagram, get_diagram_context tool handlers
  - `src/mcp/schemas.ts` -- Zod input schemas
  - `src/server/file-routes.ts` -- /save endpoint (writeFile bypass)
  - `src/server/server.ts` -- createHttpServer, watchers Map, addProject
  - `src/watcher/file-watcher.ts` -- FileWatcher, knownFiles, handleEvent
  - `src/project/discovery.ts` -- discoverMmdFiles
  - `static/modal.js` -- SmartBModal.prompt, doConfirm empty check
  - `static/context-menu.js` -- Ghost path creation flow, SmartBModal usage
  - `test/mcp/tool-handlers.test.ts` -- Test patterns for MCP tool handlers

### Secondary (MEDIUM confidence)
- **Node.js fs.watch** -- Recursive mode is confirmed supported on macOS and Windows with Node >= 22 (as stated in file-watcher.ts comments, verified by project's Node >= 22 requirement)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All fixes use existing codebase infrastructure, no new dependencies
- Architecture: HIGH -- Patterns (read-modify-write, write lock, async factory) are well-established
- Pitfalls: HIGH -- All pitfalls identified by direct code analysis of actual bugs

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable domain, no external dependency changes)
