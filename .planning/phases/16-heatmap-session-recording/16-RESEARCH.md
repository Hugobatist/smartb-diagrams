# Phase 16: Heatmap + Session Recording - Research

**Researched:** 2026-02-15
**Domain:** Annotation extension (@risk), JSONL session persistence, heatmap SVG overlay, timeline scrubber UI, diagram diff highlighting
**Confidence:** HIGH

## Summary

Phase 16 is the FINAL phase of Milestone v2.0. It adds three interconnected capabilities: (1) a `@risk` annotation parsed from `.mmd` files that colors nodes by risk level, (2) a session recording system where MCP tools (`start_session`, `record_step`, `end_session`) append events to JSONL files in `.smartb/sessions/`, and (3) a timeline scrubber UI that replays diagram evolution with diff highlighting (green/red/yellow for added/removed/modified nodes).

The phase builds directly on Phase 15's established patterns: annotation parsing extends with one more regex (`@risk`), MCP tools follow the exact same `registerTool` pattern (7 existing tools to model from), the ghost path store pattern informs the session store design, and the SVG post-processing pattern used by breakpoints/ghost paths applies to heatmap overlays and diff highlighting.

The heaviest new work is the `SessionStore` class (file-based JSONL persistence in `.smartb/sessions/`), the timeline scrubber UI (vanilla JS `<input type="range">` with `requestAnimationFrame` playback), and the diff computation algorithm (compare two sets of nodeIds/edgeIds/labels to classify changes). The heatmap overlay is lightweight: apply fill colors to existing SVG node shapes based on normalized visit frequency.

**Primary recommendation:** Split into four plans: (A) Backend -- @risk annotation, SessionStore with JSONL persistence, REST endpoints; (B) MCP tools -- start_session, record_step, end_session; (C) Frontend heatmap -- risk overlay, execution frequency heatmap mode, toggle button; (D) Frontend session replay -- timeline scrubber, playback controls, diff highlighting.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fs/promises` | built-in | JSONL append/read for session files | `appendFile` for single-event writes, `readFile` + line split for replay. No external dependency needed for simple JSONL. |
| Node.js `readline` | built-in | Stream-read JSONL files line by line | Memory-efficient for large session files. Built-in, zero deps. |
| @modelcontextprotocol/sdk | ^1.26.0 | MCP tool registration (3 new tools) | Already in use, v1 API with raw Zod shapes |
| zod | ^4.3.6 | Schema validation for MCP tool inputs | Already in use for all existing MCP schemas |
| ws | ^8.19.0 | WebSocket broadcast for session events and heatmap updates | Already the transport layer for all real-time sync |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.0.18 | Testing session store, annotation parsing, MCP tools | All new backend logic needs tests |
| crypto (built-in) | built-in | `crypto.randomUUID()` for session IDs | Node.js >= 19 has this built-in, project requires >= 22 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSONL flat files | SQLite (better-sqlite3) | SQLite adds binary dependency, heavier install. JSONL is append-only, git-friendly, zero deps. For <10K events per session, JSONL is sufficient. |
| Pure SVG fill color for heatmap | simpleheat (canvas overlay) | Prior research recommended simpleheat for radial gradient heatmaps. However, success criteria #2 says "colors nodes by execution frequency" -- this is per-node coloring, not radial blending. Simple SVG fill manipulation (like existing status colors in custom-renderer.js) is sufficient and avoids canvas-SVG coordinate synchronization complexity. |
| Custom timeline component | vis-timeline / TimelineJS | Adds 100KB+ dependency for a simple scrubber. An `<input type="range">` with `requestAnimationFrame` is all we need for frame-based replay at 1x/2x/4x. |
| JSON per-session file | JSONL per-session file | A single JSON array per session requires reading the whole file to append. JSONL allows `fs.appendFile()` per event -- zero parsing needed during recording, only during replay. |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure

```
src/
  diagram/
    annotations.ts      # MODIFY: add RISK_REGEX, parseRisks()
    types.ts            # MODIFY: add RiskLevel, RiskAnnotation, SessionEvent types
  session/
    session-store.ts    # NEW: JSONL-based session persistence (~180 lines)
    session-types.ts    # NEW: SessionEvent, SessionMeta, SessionSummary types (~50 lines)
  mcp/
    schemas.ts          # MODIFY: add StartSessionInput, RecordStepInput, EndSessionInput
    tools.ts            # MODIFY: add start_session, record_step, end_session tools
  server/
    websocket.ts        # MODIFY: add session:event, heatmap:update WsMessage types
    routes.ts           # MODIFY: add GET /api/sessions/:file, GET /api/sessions/:file/:id, GET /api/heatmap/:file
static/
  heatmap.js            # NEW: heatmap overlay module (risk + frequency) (~200 lines)
  heatmap.css           # NEW: heatmap toggle button, legend styles (~60 lines)
  session-player.js     # NEW: timeline scrubber, playback controls, diff highlighting (~250 lines)
  session-player.css    # NEW: scrubber bar, play/pause, speed controls styles (~80 lines)
```

### Pattern 1: @risk Annotation Extension

**What:** Add `%% @risk NodeId high|medium|low "reason"` as a new annotation type, parsed alongside `@flag`, `@status`, and `@breakpoint`.
**When to use:** Risk level is user-persisted data that belongs in the .mmd file.
**Example:**

```typescript
// In src/diagram/annotations.ts -- follows exact same pattern as FLAG_REGEX
const RISK_REGEX = /^%%\s*@risk\s+(\S+)\s+(high|medium|low)\s+"([^"]*)"$/;

export function parseRisks(content: string): Map<string, RiskAnnotation> {
  const risks = new Map<string, RiskAnnotation>();
  const lines = content.split('\n');
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === ANNOTATION_START) { inBlock = true; continue; }
    if (trimmed === ANNOTATION_END) { inBlock = false; continue; }
    if (!inBlock) continue;
    if (trimmed === '') continue;
    const match = RISK_REGEX.exec(trimmed);
    if (match) {
      risks.set(match[1]!, {
        nodeId: match[1]!,
        level: match[2]! as RiskLevel,
        reason: match[3]!,
      });
    }
  }
  return risks;
}
```

### Pattern 2: JSONL Session Store

**What:** Session events are persisted as JSONL files in `.smartb/sessions/`. Each session gets its own file (`{sessionId}.jsonl`). Events are appended one per line using `fs.appendFile()`. Replay reads the file line by line.
**When to use:** For all session recording -- MCP tools write events during AI reasoning, REST endpoints read for replay.
**Example:**

```typescript
// src/session/session-store.ts
import { appendFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class SessionStore {
  private sessionsDir: string;
  private activeSessions = new Map<string, SessionMeta>();

  constructor(projectRoot: string) {
    this.sessionsDir = join(projectRoot, '.smartb', 'sessions');
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  async startSession(diagramFile: string): Promise<string> {
    await this.ensureDir();
    const id = randomUUID();
    const meta: SessionMeta = { id, diagramFile, startedAt: Date.now() };
    this.activeSessions.set(id, meta);
    // Write session start event
    const event: SessionEvent = {
      ts: Date.now(),
      type: 'session:start',
      payload: { file: diagramFile },
    };
    await appendFile(this.filePath(id), JSON.stringify(event) + '\n', 'utf-8');
    return id;
  }

  async recordStep(sessionId: string, event: SessionEvent): Promise<void> {
    await appendFile(
      this.filePath(sessionId),
      JSON.stringify(event) + '\n',
      'utf-8',
    );
  }

  async endSession(sessionId: string): Promise<SessionSummary> {
    const events = await this.readSession(sessionId);
    this.activeSessions.delete(sessionId);
    const endEvent: SessionEvent = {
      ts: Date.now(),
      type: 'session:end',
      payload: {},
    };
    await appendFile(
      this.filePath(sessionId),
      JSON.stringify(endEvent) + '\n',
      'utf-8',
    );
    return this.computeSummary(events);
  }

  async readSession(sessionId: string): Promise<SessionEvent[]> {
    const content = await readFile(this.filePath(sessionId), 'utf-8');
    return content.trim().split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as SessionEvent);
  }

  async getHeatmapData(diagramFile: string): Promise<Record<string, number>> {
    const sessions = await this.listSessions(diagramFile);
    const counts: Record<string, number> = {};
    for (const sid of sessions) {
      const events = await this.readSession(sid);
      for (const e of events) {
        if (e.type === 'node:visited' && e.payload.nodeId) {
          const nid = e.payload.nodeId as string;
          counts[nid] = (counts[nid] ?? 0) + 1;
        }
      }
    }
    return counts;
  }

  private filePath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  private computeSummary(events: SessionEvent[]): SessionSummary {
    const visited = new Set<string>();
    let edgeCount = 0;
    for (const e of events) {
      if (e.type === 'node:visited' && e.payload.nodeId) {
        visited.add(e.payload.nodeId as string);
      }
      if (e.type === 'edge:traversed') edgeCount++;
    }
    return {
      sessionId: '',
      diagramFile: '',
      duration: events.length > 1
        ? events[events.length - 1]!.ts - events[0]!.ts
        : 0,
      totalEvents: events.length,
      nodesVisited: events.filter(e => e.type === 'node:visited').length,
      uniqueNodesVisited: visited.size,
      edgesTraversed: edgeCount,
    };
  }
}
```

### Pattern 3: Heatmap Overlay (SVG Node Coloring)

**What:** Heatmap mode colors nodes by execution frequency using SVG fill manipulation. Same post-processing pattern as `applyStatusColors()` in `custom-renderer.js`. No canvas overlay needed since we are coloring discrete nodes, not rendering radial gradients.
**When to use:** When user toggles heatmap mode, or when `heatmap:update` WebSocket message arrives.
**Example:**

```javascript
// static/heatmap.js
var RISK_COLORS = {
  high:   { fill: '#ef4444', opacity: 0.75 },  // red
  medium: { fill: '#eab308', opacity: 0.60 },  // yellow
  low:    { fill: '#22c55e', opacity: 0.50 },  // green
};

// Execution frequency heatmap: cold blue -> hot red
function intensityToColor(t) {
  // t is 0..1 (normalized frequency)
  var r = Math.round(66 + 189 * t);      // 66 (cold) -> 255 (hot)
  var g = Math.round(133 - 53 * t);      // 133 -> 80
  var b = Math.round(244 - 244 * t);     // 244 (cold blue) -> 0 (hot)
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function applyHeatmap(visitCounts) {
  var svg = DiagramDOM.getSVG();
  if (!svg) return;
  var max = Math.max.apply(null, Object.values(visitCounts).concat([1]));
  for (var nodeId in visitCounts) {
    if (!visitCounts.hasOwnProperty(nodeId)) continue;
    var nodeEl = DiagramDOM.findNodeElement(nodeId);
    if (!nodeEl) continue;
    var shape = nodeEl.querySelector('rect, polygon, circle, path, ellipse');
    if (!shape) continue;
    var intensity = visitCounts[nodeId] / max;
    shape.setAttribute('fill', intensityToColor(intensity));
    shape.setAttribute('fill-opacity', String(0.4 + intensity * 0.5));
  }
}
```

### Pattern 4: Timeline Scrubber UI

**What:** A vanilla JS `<input type="range">` scrubber with play/pause button and speed selector. `requestAnimationFrame` drives playback. Each frame applies a diagram snapshot at a point in time.
**When to use:** For session replay mode.
**Example:**

```javascript
// static/session-player.js -- timeline scrubber
var state = {
  events: [],
  currentIndex: 0,
  playing: false,
  speed: 1, // 1x, 2x, 4x
  animFrameId: null,
  lastFrameTime: 0,
};

function play() {
  state.playing = true;
  state.lastFrameTime = performance.now();
  state.animFrameId = requestAnimationFrame(tick);
}

function pause() {
  state.playing = false;
  if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
}

function tick(now) {
  if (!state.playing || state.currentIndex >= state.events.length - 1) {
    pause();
    return;
  }
  var elapsed = (now - state.lastFrameTime) * state.speed;
  var nextEvent = state.events[state.currentIndex + 1];
  var timeDelta = nextEvent.ts - state.events[state.currentIndex].ts;
  if (elapsed >= timeDelta) {
    state.currentIndex++;
    state.lastFrameTime = now;
    applyFrame(state.currentIndex);
    updateScrubber();
  }
  state.animFrameId = requestAnimationFrame(tick);
}

function seekTo(index) {
  state.currentIndex = Math.max(0, Math.min(index, state.events.length - 1));
  applyFrame(state.currentIndex);
  updateScrubber();
}
```

### Pattern 5: Diff Highlighting Between Frames

**What:** Compare two diagram states (sets of nodeIds, edgeIds, labels) and classify changes as added (green), removed (red), or modified (yellow). Apply CSS classes to SVG elements.
**When to use:** During session replay, between consecutive frames.
**Example:**

```javascript
// Diff computation
function computeDiff(prevState, currState) {
  var diff = { added: [], removed: [], modified: [] };
  // Added: in current but not in previous
  currState.nodeIds.forEach(function(nodeId) {
    if (!prevState.nodeIds.has(nodeId)) diff.added.push(nodeId);
  });
  // Removed: in previous but not in current
  prevState.nodeIds.forEach(function(nodeId) {
    if (!currState.nodeIds.has(nodeId)) diff.removed.push(nodeId);
  });
  // Modified: same nodeId but different status/label
  currState.nodeIds.forEach(function(nodeId) {
    if (prevState.nodeIds.has(nodeId)) {
      if (prevState.statuses[nodeId] !== currState.statuses[nodeId] ||
          prevState.labels[nodeId] !== currState.labels[nodeId]) {
        diff.modified.push(nodeId);
      }
    }
  });
  return diff;
}

// Apply diff highlights to SVG
function applyDiffHighlights(diff) {
  clearDiffHighlights();
  diff.added.forEach(function(id) { highlightNode(id, 'diff-added'); });
  diff.removed.forEach(function(id) { highlightNode(id, 'diff-removed'); });
  diff.modified.forEach(function(id) { highlightNode(id, 'diff-modified'); });
}
```

### Pattern 6: WebSocket Extensions for Session Events

**What:** Add new WebSocket message types for real-time session recording feedback and heatmap updates.
**When to use:** During active session recording, so the browser shows live progress.
**Example:**

```typescript
// src/server/websocket.ts -- extend WsMessage union type
export type WsMessage =
  // ... existing types ...
  // Phase 16: Session Recording + Heatmap
  | { type: 'session:event'; sessionId: string; event: Record<string, unknown> }
  | { type: 'heatmap:update'; file: string; data: Record<string, number> };
```

### Anti-Patterns to Avoid

- **Storing session data inside .mmd files:** Session events are high-frequency, ephemeral recording data. Putting them in annotation blocks would create massive files and slow parsing. Use `.smartb/sessions/` JSONL files.
- **Loading entire JSONL files into memory at startup:** Session files can grow large. Read on demand (when user opens replay), not at server start. Stream with readline for heatmap aggregation.
- **Canvas overlay for node coloring:** The success criteria says "colors nodes by execution frequency." This is per-node fill coloring, not a radial heat gradient. SVG fill manipulation is simpler, performs better, and stays within the existing pattern (same as `applyStatusColors()`).
- **Building a complex video-player-like UI:** The scrubber is a simple `<input type="range">` with play/pause. No drag handles, buffering indicators, or media stream APIs needed.
- **Recomputing heatmap on every frame during replay:** Compute heatmap from events up to the current frame index. Cache the cumulative counts; increment/decrement as scrubber moves forward/backward.
- **Using `setInterval` for playback:** Use `requestAnimationFrame` for smooth, battery-friendly, vsync-aligned updates. `setInterval` causes timer drift and is not paused when tab is hidden.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Annotation parsing for @risk | New parser architecture | Extend existing `annotations.ts` with one more regex | Consistency with @flag, @status, @breakpoint patterns |
| UUID generation | Custom ID generator | `crypto.randomUUID()` | Built into Node.js >= 19. Cryptographically random, standard format. |
| JSONL serialization | Custom binary format | `JSON.stringify(event) + '\n'` + `fs.appendFile()` | JSONL is human-readable, debuggable, git-diffable. One line per event, no array wrapping. |
| Session file reading | Full JSON array parse | `readFile` + `split('\n')` + `JSON.parse()` per line | Lines are independent, can skip corrupted lines, memory-efficient for streaming |
| Playback timing | `setInterval` or `setTimeout` chains | `requestAnimationFrame` with delta time calculation | Vsync-aligned, battery-efficient, pauses when tab hidden, precise timing |
| SVG diff visualization | DOM mutation observer / deep compare | Set comparison on nodeId/edgeId + string compare on labels/statuses | Diagram diffs are small (10-100 nodes). Set intersection/difference is O(n), fast enough. No need for tree diffing algorithms. |

**Key insight:** Almost every subsystem in Phase 16 extends an existing pattern. The only truly new concepts are: (1) JSONL file persistence (well-understood pattern), (2) timeline scrubber with rAF playback (standard media player pattern), and (3) set-based diff highlighting (trivial algorithm).

## Common Pitfalls

### Pitfall 1: Session Store Directory Not Created

**What goes wrong:** `fs.appendFile()` throws ENOENT because `.smartb/sessions/` directory does not exist.
**Why it happens:** The `.smartb/` directory is not created by `smartb init`. It is only needed when sessions are first recorded.
**How to avoid:** `SessionStore.ensureDir()` calls `mkdir(sessionsDir, { recursive: true })` before the first write. Call it in `startSession()`. The `recursive: true` flag is idempotent.
**Warning signs:** First `start_session` MCP tool call fails with "no such file or directory."

### Pitfall 2: Concurrent Session Writes Corrupting JSONL

**What goes wrong:** Two concurrent `record_step` calls write to the same JSONL file, producing interleaved lines.
**Why it happens:** `fs.appendFile` is not atomic. Two parallel appends can interleave bytes.
**How to avoid:** Use the same `withWriteLock` pattern from `DiagramService`. Add a per-session write lock in `SessionStore`. Each `appendFile` call is small (<1KB), so lock contention is minimal. Alternatively, use `fs.createWriteStream` with `{ flags: 'a' }` which serializes writes through the kernel buffer.
**Warning signs:** JSONL lines with truncated or merged JSON objects (parse errors during replay).

### Pitfall 3: Heatmap Colors Overriding Status Colors

**What goes wrong:** When both status colors (ok=green, problem=red) and heatmap frequency colors are active, they fight over the same `fill` attribute.
**Why it happens:** Both `applyStatusColors()` and `applyHeatmap()` set `fill` on the same SVG shape element.
**How to avoid:** Heatmap mode should be a separate toggle. When heatmap is active, it takes priority over status colors. When heatmap is off, status colors apply. Make this explicit in the UI: "Heatmap mode replaces status colors while active." Alternatively, apply heatmap as an SVG overlay `<rect>` with `mix-blend-mode` instead of modifying the fill directly.
**Warning signs:** User toggles heatmap off but node colors do not revert to status colors.

### Pitfall 4: Replay Scrubber Out of Sync with Diagram State

**What goes wrong:** Scrubber shows frame 50 but diagram displays state from frame 47. Or scrubbing backward does not undo additions.
**Why it happens:** Event replay is incremental (each event applies a delta). Scrubbing backward requires either re-applying from event 0, or maintaining snapshots at intervals.
**How to avoid:** For the initial implementation, always replay from event 0 to the target index when scrubbing backward. This is O(n) but n is small (<1000 events per session). For forward scrubbing, apply events incrementally. If performance becomes an issue later, add periodic snapshots (e.g., every 100 events).
**Warning signs:** Backward scrubbing produces a stale or incomplete diagram state.

### Pitfall 5: Large Session Files Blocking Server

**What goes wrong:** A long session produces 10K+ events. Loading the full JSONL for heatmap aggregation blocks the event loop.
**Why it happens:** `readFile()` + `JSON.parse()` per line is synchronous within the async operation. Very large files cause noticeable latency.
**How to avoid:** Use `readline.createInterface()` with `createReadStream()` for streaming reads. For heatmap aggregation, build counts incrementally as lines are read. For replay, load the full file (user-initiated, not server-critical). Cap sessions: if events exceed a configurable limit (default 10,000), auto-close the session.
**Warning signs:** GET /api/heatmap/:file takes >500ms for large session files.

### Pitfall 6: @risk Annotation Injection Breaking Other Annotations

**What goes wrong:** When `injectAnnotations()` is extended to include risk annotations, existing flags/statuses/breakpoints are dropped.
**Why it happens:** Same pattern as Pitfall 2 from Phase 15. `injectAnnotations()` must now handle 4 annotation types.
**How to avoid:** Extend `injectAnnotations()` signature to accept a `risks?: Map<string, RiskAnnotation>` parameter. Emit risk lines after breakpoint lines. Update ALL callers (DiagramService methods) to read and pass through risks when modifying other annotations.
**Warning signs:** Setting a risk via MCP causes breakpoints to disappear, or vice versa.

### Pitfall 7: Session Player DOM Conflicting with Preview Container

**What goes wrong:** The timeline scrubber bar at the bottom of the preview area overlaps the SVG diagram or interferes with pan/zoom.
**Why it happens:** The scrubber is positioned inside `#preview-container` which is also the pan/zoom target.
**How to avoid:** Position the session player bar OUTSIDE `#preview-container`, as a sibling below it within `.preview-panel`. Use CSS `flex-direction: column` so the scrubber bar is always at the bottom, not overlapping the SVG. Add `pointer-events: auto` to the scrubber controls.
**Warning signs:** Dragging the scrubber thumb triggers pan/zoom instead of seeking.

### Pitfall 8: Diff Highlighting for Removed Nodes

**What goes wrong:** Cannot highlight a "removed" node because it no longer exists in the current SVG.
**Why it happens:** When a node is removed between frames, its SVG element is gone from the DOM.
**How to avoid:** For removed nodes, render temporary "ghost" placeholders at the last known position, styled with red dashed borders and reduced opacity. Reuse the ghost path rendering pattern from `ghost-paths.js`. These placeholders fade after 2 seconds or when the next frame is applied.
**Warning signs:** Diff says "3 nodes removed" but user sees nothing visual.

## Code Examples

### SessionEvent Types

```typescript
// src/session/session-types.ts

export type SessionEventType =
  | 'session:start'
  | 'session:end'
  | 'node:visited'
  | 'edge:traversed'
  | 'status:changed'
  | 'flag:added'
  | 'flag:removed'
  | 'risk:set'
  | 'node:added'
  | 'node:removed'
  | 'edge:added'
  | 'edge:removed';

export interface SessionEvent {
  ts: number;  // Unix timestamp (ms)
  type: SessionEventType;
  payload: Record<string, unknown>;
}

export interface SessionMeta {
  id: string;
  diagramFile: string;
  startedAt: number;
}

export interface SessionSummary {
  sessionId: string;
  diagramFile: string;
  duration: number;      // ms
  totalEvents: number;
  nodesVisited: number;
  uniqueNodesVisited: number;
  edgesTraversed: number;
}
```

### MCP Tool Schemas for Session Recording

```typescript
// src/mcp/schemas.ts -- new schemas

export const StartSessionInput = {
  filePath: z
    .string()
    .describe('Relative path to the .mmd file to record session for'),
};

export const RecordStepInput = {
  sessionId: z
    .string()
    .describe('Session ID returned by start_session'),
  nodeId: z
    .string()
    .describe('Node ID the AI is currently processing'),
  action: z
    .string()
    .describe('Action being performed (e.g., "analyzing", "deciding", "revisiting")'),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe('Optional key-value metadata for this step'),
};

export const EndSessionInput = {
  sessionId: z
    .string()
    .describe('Session ID to end'),
};
```

### REST Endpoints for Session Data

```typescript
// In src/server/routes.ts (or extracted to session-routes.ts)

// GET /api/sessions/:file -- list sessions for a diagram
routes.push({
  method: 'GET',
  pattern: new RegExp('^/api/sessions/(?<file>.+)$'),
  handler: async (_req, res, params) => {
    const file = decodeURIComponent(params['file']!);
    const sessions = await sessionStore.listSessions(file);
    sendJson(res, { sessions });
  },
});

// GET /api/session/:id -- get full session events for replay
routes.push({
  method: 'GET',
  pattern: new RegExp('^/api/session/(?<id>[^/]+)$'),
  handler: async (_req, res, params) => {
    const id = params['id']!;
    const events = await sessionStore.readSession(id);
    sendJson(res, { events });
  },
});

// GET /api/heatmap/:file -- get aggregated visit counts
routes.push({
  method: 'GET',
  pattern: new RegExp('^/api/heatmap/(?<file>.+)$'),
  handler: async (_req, res, params) => {
    const file = decodeURIComponent(params['file']!);
    const data = await sessionStore.getHeatmapData(file);
    sendJson(res, data);
  },
});
```

### Risk Annotation in .mmd File

```
flowchart LR
    A["Parse Input"] --> B["Validate"]
    B --> C["API Call"]
    C --> D["Process Response"]

%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---
%% @status A ok
%% @status B in-progress
%% @risk C high "External API call - may fail or timeout"
%% @risk D medium "Complex parsing logic"
%% --- END ANNOTATIONS ---
```

### Heatmap Toggle Button in Topbar

```html
<!-- In live.html topbar, after Ghost button -->
<button class="btn" id="btnHeatmap" onclick="SmartBHeatmap.toggle()">
  Heatmap
</button>
```

### Session Player UI Structure

```html
<!-- In live.html, inside .preview-panel, after #preview-container -->
<div class="session-player hidden" id="sessionPlayer">
  <button class="sp-btn" id="spPlayPause" title="Play/Pause">Play</button>
  <input type="range" class="sp-scrubber" id="spScrubber" min="0" max="0" value="0">
  <span class="sp-time" id="spTime">0 / 0</span>
  <select class="sp-speed" id="spSpeed">
    <option value="1">1x</option>
    <option value="2">2x</option>
    <option value="4">4x</option>
  </select>
  <button class="sp-btn" id="spClose" title="Close replay">Close</button>
</div>
```

### Extended injectAnnotations with Risks

```typescript
// src/diagram/annotations.ts -- extend injectAnnotations
export function injectAnnotations(
  content: string,
  flags: Map<string, Flag>,
  statuses?: Map<string, NodeStatus>,
  breakpoints?: Set<string>,
  risks?: Map<string, RiskAnnotation>,
): string {
  const clean = stripAnnotations(content);
  const hasFlags = flags.size > 0;
  const hasStatuses = statuses !== undefined && statuses.size > 0;
  const hasBreakpoints = breakpoints !== undefined && breakpoints.size > 0;
  const hasRisks = risks !== undefined && risks.size > 0;

  if (!hasFlags && !hasStatuses && !hasBreakpoints && !hasRisks) return clean;

  const lines: string[] = ['', ANNOTATION_START];
  for (const [nodeId, flag] of flags) {
    const escapedMessage = flag.message.replace(/"/g, "''");
    lines.push(`%% @flag ${nodeId} "${escapedMessage}"`);
  }
  if (hasStatuses) {
    for (const [nodeId, status] of statuses!) {
      lines.push(`%% @status ${nodeId} ${status}`);
    }
  }
  if (hasBreakpoints) {
    for (const nodeId of breakpoints!) {
      lines.push(`%% @breakpoint ${nodeId}`);
    }
  }
  if (hasRisks) {
    for (const [nodeId, risk] of risks!) {
      const escapedReason = risk.reason.replace(/"/g, "''");
      lines.push(`%% @risk ${nodeId} ${risk.level} "${escapedReason}"`);
    }
  }
  lines.push(ANNOTATION_END);
  lines.push('');
  return clean.trimEnd() + '\n' + lines.join('\n');
}
```

### Diff Highlighting CSS

```css
/* session-player.css */
.diff-added rect,
.diff-added polygon,
.diff-added circle {
  stroke: #22c55e !important;
  stroke-width: 3 !important;
  stroke-dasharray: none;
}

.diff-removed {
  opacity: 0.4;
  outline: 2px dashed #ef4444;
}

.diff-modified rect,
.diff-modified polygon,
.diff-modified circle {
  stroke: #eab308 !important;
  stroke-width: 3 !important;
}

/* Removed node ghost placeholder */
.diff-removed-ghost {
  opacity: 0.3;
  fill: #ef4444;
  stroke: #ef4444;
  stroke-dasharray: 6,3;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON array per session file | JSONL (one event per line) | 2024+ standard for event logs | Append-only, no full parse needed, streaming-friendly |
| Canvas-based heatmaps (simpleheat) | SVG fill manipulation for discrete node coloring | Project-specific decision | Simpler for per-node coloring (our use case), avoids canvas-SVG coord sync |
| `setInterval` for animation | `requestAnimationFrame` with delta time | Web standard since 2015, universal best practice | Battery-efficient, vsync-aligned, pauses when tab hidden |
| Full DOM diff for diagram changes | Set-based nodeId/edgeId comparison | Project-specific design | Diagrams are small (10-100 nodes), set comparison is O(n) and sufficient |

**Deprecated/outdated:**
- None. All technologies used are current and stable.

## Open Questions

1. **Should session files be automatically cleaned up?**
   - What we know: Sessions are recorded to `.smartb/sessions/` as JSONL. Over time, many sessions accumulate.
   - What's unclear: Whether there should be automatic cleanup (e.g., keep last 50 sessions, delete after 30 days).
   - Recommendation: For v1, no automatic cleanup. Add a note to README that `.smartb/sessions/` can be safely deleted. Consider a `smartb cleanup` CLI command in a future phase.

2. **Should heatmap data be cached or computed on demand?**
   - What we know: `getHeatmapData()` must read all session JSONL files for a diagram and count node visits.
   - What's unclear: For many sessions, this could be slow.
   - Recommendation: Compute on demand for v1. If performance becomes an issue, add a `.smartb/cache/heatmap-{file}.json` cache that is invalidated when new sessions are added. The cache can be a simple JSON file with `{ data: counts, lastSessionId: "..." }`.

3. **How should the timeline scrubber handle diagram structure changes?**
   - What we know: Sessions record node:added, node:removed, edge:added, edge:removed events. Replaying these requires modifying the SVG.
   - What's unclear: The custom renderer takes a full GraphModel as input. How do we reconstruct intermediate states?
   - Recommendation: For each replay frame, maintain a running state object (`{ nodeIds: Set, edgeIds: Set, statuses: Map, labels: Map }`) built from events. Do NOT re-render the entire diagram on each frame. Instead, apply visual diffs (color changes, opacity, highlights) on the existing SVG. For structure changes (node add/remove), highlight them visually but do not re-layout. Full re-layout would be jarring and slow.

4. **Should `record_step` also broadcast via WebSocket?**
   - What we know: `record_ghost_path` from Phase 15 broadcasts via WebSocket. `record_step` is similar.
   - What's unclear: Whether broadcasting every step would flood the WebSocket with messages.
   - Recommendation: Yes, broadcast `session:event` messages. The browser uses them for live heatmap updates and the timeline position indicator. The message is small (~100 bytes). If needed, throttle to max 10 messages per second.

5. **Should @risk annotations also have an MCP tool for setting them?**
   - What we know: The success criteria mentions `@risk` annotation and MCP session tools, but does not explicitly list a `set_risk` MCP tool.
   - What's unclear: Whether the AI should set risk via a dedicated tool or by including `@risk` annotations in `update_diagram`.
   - Recommendation: Add a `set_risk_level` MCP tool for convenience (same pattern as `update_node_status`). The AI can also include `@risk` in raw `update_diagram` calls, but a dedicated tool is more discoverable.

6. **Should the session player be inside or outside the preview panel?**
   - What we know: The scrubber needs to be visually associated with the diagram but must not interfere with pan/zoom.
   - What's unclear: Best DOM placement.
   - Recommendation: Place the session player bar as a sibling of `#preview-container` inside `.preview-panel`, using flexbox column layout. The bar is outside the pan/zoom target. Use `position: sticky; bottom: 0` for the bar to always be visible.

## File Size Impact Analysis

Key files that Phase 16 will modify, with current line counts and growth estimates:

| File | Current Lines | Estimated Growth | Result | Action |
|------|--------------|------------------|--------|--------|
| `src/diagram/annotations.ts` | 213 | +50 (parseRisks, injectAnnotations extension) | ~263 | OK |
| `src/diagram/types.ts` | 71 | +15 (RiskLevel, RiskAnnotation) | ~86 | OK |
| `src/diagram/service.ts` | 257 | +60 (getRisks, setRisk, removeRisk) | ~317 | OK |
| `src/mcp/tools.ts` | 356 | +120 (3 new tools) | ~476 | NEAR LIMIT -- consider extracting session tools to `src/mcp/session-tools.ts` |
| `src/mcp/schemas.ts` | 80 | +30 (3 new schemas) | ~110 | OK |
| `src/server/routes.ts` | 471 | +80 (3 new endpoints) | ~551 | OVER LIMIT -- extract session routes to `src/server/session-routes.ts` |
| `src/server/websocket.ts` | 120 | +5 (2 new message types) | ~125 | OK |
| `static/annotations.js` | 495 | +25 (parseRisks in parseAnnotations) | ~520 | OVER LIMIT -- frontend risks parsing should go in `heatmap.js` |
| `static/app-init.js` | 457 | +40 (session:event handler, heatmap toggle) | ~497 | NEAR LIMIT -- keep additions minimal |

**Mitigation plan:**
- Extract session-related routes to `src/server/session-routes.ts` (called from routes.ts).
- Extract session MCP tools to `src/mcp/session-tools.ts` (called from tools.ts).
- Keep risk parsing in `heatmap.js` (frontend) rather than bloating `annotations.js`.
- Session player is a new file (`static/session-player.js`), no bloat concern.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/diagram/annotations.ts` -- annotation parsing pattern (flags, statuses, breakpoints, @risk extension point)
- Codebase analysis: `src/mcp/tools.ts`, `src/mcp/schemas.ts` -- MCP tool registration pattern (7 existing tools)
- Codebase analysis: `src/server/ghost-store.ts` -- in-memory ephemeral store pattern (informs session store design)
- Codebase analysis: `src/server/routes.ts` -- REST endpoint pattern and file-based operations
- Codebase analysis: `src/server/websocket.ts` -- WsMessage type union and broadcast pattern
- Codebase analysis: `src/diagram/service.ts` -- DiagramService CRUD methods with write locks
- Codebase analysis: `static/custom-renderer.js` -- `applyStatusColors()` SVG post-processing (heatmap follows same pattern)
- Codebase analysis: `static/breakpoints.js`, `static/ghost-paths.js` -- SVG overlay patterns for Phase 15
- Codebase analysis: `static/app-init.js` -- WebSocket message handling and module initialization
- Codebase analysis: `.planning/research/ARCHITECTURE.md` -- SessionStore design, heatmap data flow, MCP tool specs
- Codebase analysis: `.planning/research/STACK.md` -- JSONL event stream format, simpleheat vs SVG fill decision

### Secondary (MEDIUM confidence)
- [JSONL for Developers guide](https://jsonltools.com/jsonl-for-developers) -- JSONL format specification, Node.js `appendFile` pattern
- [Node.js JSONL best practices](https://www.bennadel.com/blog/3233-parsing-and-serializing-large-datasets-using-newline-delimited-json-in-node-js.htm) -- Streaming reads with `readline`
- [SVG filter heatmap technique](https://expensive.toys/blog/svg-filter-heat-map) -- `feComponentTransfer` for cold-blue-to-hot-red (alternative to direct fill)
- [Web Animations API scrubbing](https://danielcwilson.com/blog/2017/06/scrubbing/) -- `currentTime` + `requestAnimationFrame` scrubber pattern
- [Better Stack: How to append files in Node](https://betterstack.com/community/questions/how-to-append-file-in-node/) -- `fs.appendFile` vs `createWriteStream` comparison

### Tertiary (LOW confidence)
- None. All findings are from direct codebase analysis, official Node.js APIs, and verified web sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all patterns already established in codebase
- Architecture: HIGH - SessionStore follows GhostPathStore pattern, annotations follow existing regex parsing, MCP tools follow registerTool pattern
- Pitfalls: HIGH - identified from direct code analysis. File size limits are the main concern (routes.ts at 471 lines, annotations.js at 495 lines)
- Session recording: HIGH - JSONL append pattern is well-understood, Node.js built-in fs is sufficient
- Heatmap overlay: HIGH - SVG fill manipulation matches existing `applyStatusColors()` pattern exactly
- Timeline scrubber: MEDIUM - `requestAnimationFrame` playback is standard, but backward scrubbing strategy (replay from 0) needs validation for performance at high event counts

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- no fast-moving dependencies)
