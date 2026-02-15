# Phase 4: Interactive Browser UI - Research

**Researched:** 2026-02-15
**Domain:** Browser-side diagram interaction (pan/zoom, keyboard shortcuts, flag annotations, SVG/PNG export, file tree navigation)
**Confidence:** HIGH

## Summary

Phase 4 covers six requirements: UI-02 (pan/zoom/fit), UI-03 (keyboard shortcuts), UI-05 (flag mode), UI-06 (flag panel), UI-08 (SVG/PNG export), and UI-09 (file tree sidebar). **The critical finding of this research is that all six requirements are already substantially implemented in the existing codebase.** The `live.html` file (1387 lines) together with `annotations.js` (421 lines), `annotations.css` (358 lines), `diagram-editor.js` (403 lines), and `ws-client.js` (71 lines) already deliver:

- Pan (mouse drag), zoom (scroll wheel with cursor-origin scaling), fit-to-view, zoom buttons (`+`/`-`/`Fit`), zoom percentage display
- Keyboard shortcuts: `F` (flag mode), `Esc` (cancel), `Ctrl+E` (toggle editor), `Ctrl+B` (toggle sidebar), `Ctrl+S` (save), `Ctrl+0` (fit), `Ctrl+/-` (zoom), `?` (help overlay), `N` (add node), `A` (add edge)
- Flag mode: crosshair cursor, click-to-flag nodes/edges/subgraphs, popover with message textarea, flag persistence to `%% @flag` annotations in .mmd files, badge indicators on flagged SVG nodes
- Flag panel: right sidebar listing all flags with click-to-navigate (blink animation on target node)
- SVG export (via `svg.outerHTML` Blob download) and PNG export (via Canvas `drawImage` + `toBlob`)
- File tree sidebar with folder collapse/expand, file selection, rename, delete, create new file/folder, drag-and-drop .mmd import

The one requirement item **not yet implemented** is `Ctrl+F` (search/find nodes), which is listed in UI-03. The existing keyboard shortcut set is comprehensive but missing this specific binding.

**Primary recommendation:** Phase 4 work should focus on (1) extracting testable concerns from the monolithic `live.html` inline scripts, (2) fixing the known PNG export issue with `foreignObject`, (3) adding the missing `Ctrl+F` search feature, and (4) writing integration/E2E verification that the existing features work correctly. This is a **refinement and hardening** phase, not a greenfield implementation phase.

## Standard Stack

### Core (Already Installed -- No New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Mermaid.js | ^11 (CDN) | Client-side diagram rendering | Already loaded via `cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js`. Powers all rendering. |
| Browser-native APIs | N/A | Canvas, XMLSerializer, Blob, URL.createObjectURL | Used for SVG/PNG export. No library needed. |
| Browser-native WebSocket | N/A | Real-time file updates | Already connected via `ws-client.js`. |
| DOM API | N/A | All UI interaction | createElement, classList, event listeners. No framework. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | - | - | Phase 4 requires zero new npm dependencies. All work is in static browser JS files. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `<style>` in live.html | Separate .css file for live.html styles | Would require another HTTP request but would separate concerns. Current approach is fine for a single-page tool. |
| Manual SVG-to-Canvas PNG export | `html-to-image` or `dom-to-image` library | These handle foreignObject better but add dependencies. The `htmlLabels: false` workaround is simpler. |
| Vanilla JS DOM manipulation | React/Preact/Svelte for UI | Massive overkill for a single-page dev tool with no component reuse. The existing ~2600 lines of vanilla JS are straightforward and maintainable. Prior decision pattern is "no build step for browser code." |
| `var` declarations in ws-client.js | `let`/`const` | Prior decision [03-02] explicitly chose `var` for broadest browser compatibility with no build step. Maintain this convention in ws-client.js only. |

**Installation:**
```bash
# No new dependencies needed for Phase 4
```

## Architecture Patterns

### Existing File Structure (Static Assets)
```
static/
  live.html          # Main SPA -- HTML + inline CSS + inline JS (~1387 lines)
  annotations.js     # Flag/status annotation system (IIFE, window.SmartBAnnotations)
  annotations.css    # Flag mode styles, popover, panel, editor modes
  diagram-editor.js  # Node/edge CRUD editor (IIFE, window.MmdEditor)
  ws-client.js       # Reconnecting WebSocket client (global function)
```

### Pattern 1: IIFE Module with Window Export
**What:** Each JS file uses an IIFE that exposes a namespace object on `window`.
**When to use:** All new browser-side code.
**Example:**
```javascript
// Source: existing static/annotations.js pattern
(function () {
    'use strict';
    // private state
    const state = { /* ... */ };
    // private functions
    function doSomething() { /* ... */ }
    // public API
    window.ModuleName = {
        init, doSomething, getState: () => state,
    };
})();
```

### Pattern 2: Hook-Based Initialization
**What:** Browser modules accept a hooks object during `init()` to avoid tight coupling to global state.
**When to use:** When a module needs access to shared state (editor element, current file, render function).
**Example:**
```javascript
// Source: existing live.html init pattern
const _initHooks = {
    getEditor: () => document.getElementById('editor'),
    getCurrentFile: () => currentFile,
    getLastContent: () => lastContent,
    setLastContent: (v) => { lastContent = v; },
    saveFile: saveCurrentFile,
    renderDiagram: render,
};
SmartBAnnotations.init(_initHooks);
MmdEditor.init(_initHooks);
```

### Pattern 3: DOM-Only Error/Content Display (XSS-Safe)
**What:** Use `document.createElement()` + `textContent` instead of `innerHTML` with user data.
**When to use:** Any time user-provided strings (file names, flag messages, error messages) are displayed.
**Prior decision:** [02-02] Error panel built entirely with DOM methods for XSS safety.
**Example:**
```javascript
// Source: existing live.html buildErrorPanel function
const title = document.createElement('span');
title.textContent = 'Mermaid Syntax Error'; // textContent, not innerHTML
header.appendChild(title);
```

### Anti-Patterns to Avoid
- **innerHTML with user data:** Never use `innerHTML` for user-controlled strings. Always use `textContent` or `createElement`. The codebase already follows this in `buildErrorPanel` and `escapeHtml` helper.
- **Global state sprawl:** The inline `<script>` in `live.html` uses ~15 module-level variables (`currentFile`, `zoom`, `panX`, `panY`, `autoSync`, etc.). New features should use the IIFE pattern to avoid adding more globals.
- **Breaking existing keyboard shortcut guard:** The keydown handler checks `if (e.target === editor) return;` and `if (e.target.closest('.flag-popover')) return;` to prevent shortcuts from firing during text input. Any new shortcuts must respect this guard.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG rendering | Custom SVG manipulation | Mermaid.js `mermaid.render()` | Mermaid handles layout, node shapes, edge routing, subgraph nesting. Already in use. |
| Mermaid syntax parsing | Custom regex parser | Mermaid's built-in parser via `@mermaid-js/parser` | Used in `validator.ts` on the server side. Browser-side validation happens naturally when `mermaid.render()` throws. |
| WebSocket reconnection | Custom reconnect logic | `createReconnectingWebSocket()` in `ws-client.js` | Already implemented with exponential backoff + jitter. Works reliably. |
| PNG scaling for Retina | Manual DPI detection | `canvas.width = img.width * 2; ctx.scale(2, 2)` | Already implemented in `exportPNG()`. The 2x scale handles standard Retina displays. |

**Key insight:** Phase 4 is a refinement phase. The existing code already solves the hard problems (SVG node identification for click-to-flag, annotation persistence round-trip, zoom-toward-cursor math). The planner should not create tasks that rebuild these from scratch.

## Common Pitfalls

### Pitfall 1: PNG Export with foreignObject (Canvas Taint)
**What goes wrong:** When Mermaid renders with `htmlLabels: true` (the default since v9.2), it uses `<foreignObject>` elements containing HTML `<div>` tags inside the SVG. When this SVG is drawn onto a Canvas via `drawImage()`, the Canvas becomes "tainted" by CORS policy -- `canvas.toBlob()` and `canvas.toDataURL()` throw a SecurityError.
**Why it happens:** Browser security prevents extracting pixel data from a Canvas that contains cross-origin or HTML content rendered through foreignObject.
**How to avoid:** Two approaches:
  1. **Re-render with `htmlLabels: false` for export only:** Call `mermaid.render()` a second time with `flowchart: { htmlLabels: false }` to produce an SVG using native `<text>` elements instead of foreignObject. Use this SVG for PNG export.
  2. **Use SVG serialization directly:** For SVG export, the current approach (`svg.outerHTML` as Blob) works fine regardless of foreignObject -- SVG export does not hit Canvas taint. Only PNG is affected.
**Warning signs:** PNG export works in development but produces blank/broken images or throws errors in production. Test PNG export explicitly.

### Pitfall 2: Keyboard Shortcuts Firing During Text Input
**What goes wrong:** Pressing `F` while typing in the editor textarea or a flag message textarea triggers flag mode instead of typing the letter F.
**Why it happens:** Keyboard event listeners are registered on `document` and intercept all keystrokes.
**How to avoid:** The existing code already guards against this with `if (e.target === editor) return;` and `if (e.target.closest('.flag-popover')) return;`. Any new shortcuts (like `Ctrl+F`) must extend this guard to include all text input contexts.
**Warning signs:** Users report that typing in the editor or popover triggers unexpected mode changes.

### Pitfall 3: Zoom State Lost on Re-render
**What goes wrong:** When a file change arrives via WebSocket and triggers re-render, the zoom/pan state resets to default, disorienting the user.
**Why it happens:** `mermaid.render()` replaces the SVG entirely. The existing code calls `zoomFit()` after render via `requestAnimationFrame(() => zoomFit())`, which resets zoom.
**How to avoid:** For auto-sync updates (not initial load), preserve the current `zoom`, `panX`, `panY` values and re-apply them after render instead of calling `zoomFit()`. This would require differentiating between "initial render" and "live update re-render."
**Warning signs:** Users complain about losing their zoom position when files auto-update.

### Pitfall 4: SVG Node ID Extraction Brittleness
**What goes wrong:** Flag mode and editor click-to-identify rely on parsing Mermaid's internal SVG element IDs (e.g., `flowchart-NodeId-123`, `subGraph0-SubName-456`). These ID patterns are undocumented internal details of Mermaid.js.
**Why it happens:** Mermaid's SVG output format is not a stable public API. The regex patterns (`/^flowchart-(.+)-\d+$/`, `/^subGraph\d+-(.+)-\d+$/`) in `extractNodeId()` could break with Mermaid version updates.
**How to avoid:** Pin the Mermaid CDN version in `live.html` (currently `mermaid@11`). When upgrading, test node click identification thoroughly. The `extractNodeId` function in `annotations.js` is the single chokepoint to update.
**Warning signs:** After a Mermaid update, clicking nodes in flag mode does nothing or returns wrong IDs.

### Pitfall 5: File Tree innerHTML Injection
**What goes wrong:** The `renderNodes()` function in `live.html` builds HTML strings via template literals and injects them via `container.innerHTML`. File names and folder names from the filesystem are interpolated directly into HTML without escaping.
**Why it happens:** The file tree rendering predates the XSS-safety discipline established in [02-02].
**How to avoid:** Either (a) sanitize file/folder names with `escapeHtml()` before interpolating into HTML strings, or (b) rewrite `renderTree()` to use `document.createElement()` like `buildErrorPanel()`. Option (a) is lower effort since the function already exists.
**Warning signs:** A .mmd file with a crafted filename containing `<script>` or HTML entities could execute arbitrary JavaScript.

## Code Examples

Verified patterns from the existing codebase:

### Pan/Zoom (Already Implemented)
```javascript
// Source: static/live.html lines 836-908
// Mouse wheel zoom toward cursor with trackpad-friendly clamping
container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const clamped = Math.max(-60, Math.min(60, e.deltaY));
    const factor = 1 - clamped * 0.002;
    const newZoom = Math.min(Math.max(zoom * factor, 0.1), 5);
    // Zoom toward cursor position
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    panX = mx - (mx - panX) * (newZoom / zoom);
    panY = my - (my - panY) * (newZoom / zoom);
    zoom = newZoom;
    applyTransform();
}, { passive: false });
```

### Flag Annotation Persistence (Already Implemented)
```javascript
// Source: static/annotations.js lines 68-81
// Serialize flags back into .mmd content as %% @flag comments
function injectAnnotations(content, flags, statuses) {
    const clean = stripAnnotations(content);
    const statusMap = statuses || state.statuses;
    if (flags.size === 0 && statusMap.size === 0) return clean;
    const lines = ['', ANNOTATION_START];
    for (const [nodeId, { message }] of flags) {
        lines.push(`%% @flag ${nodeId} "${message.replace(/"/g, "''")}"`);
    }
    for (const [nodeId, statusValue] of statusMap) {
        lines.push(`%% @status ${nodeId} ${statusValue}`);
    }
    lines.push(ANNOTATION_END);
    return clean + '\n' + lines.join('\n');
}
```

### SVG Export (Already Implemented)
```javascript
// Source: static/live.html lines 1125-1131
function exportSVG() {
    const svg = document.querySelector('#preview svg');
    if (!svg) return toast('Nada para exportar');
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    download(blob, currentFile.replace('.mmd', '.svg'));
}
```

### PNG Export (Already Implemented -- Has foreignObject Issue)
```javascript
// Source: static/live.html lines 1132-1148
function exportPNG() {
    const svg = document.querySelector('#preview svg');
    if (!svg) return toast('Nada para exportar');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const data = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(blob => download(blob, currentFile.replace('.mmd', '.png')), 'image/png');
    };
    // This will fail silently if SVG contains foreignObject (canvas taint)
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
}
```

### File Tree Rendering (Already Implemented -- XSS Risk)
```javascript
// Source: static/live.html lines 993-1026
// Uses innerHTML with unescaped file names -- needs sanitization
function renderNodes(nodes, depth) {
    return nodes.map(n => {
        if (n.type === 'folder') {
            // ... template literal with n.name interpolated directly
            return `<div class="tree-folder-name">${prettyFolder(n.name)}</div>`;
            // prettyFolder does NOT escape HTML
        }
        // ...
    }).join('');
}
```

### Proper PNG Export Fix Pattern
```javascript
// Re-render with htmlLabels:false for clean Canvas export
async function exportPNGSafe() {
    const svg = document.querySelector('#preview svg');
    if (!svg) return toast('Nada para exportar');
    // Get current mermaid source
    const editor = document.getElementById('editor');
    const code = editor.value;
    const cleanCode = window.SmartBAnnotations
        ? SmartBAnnotations.getCleanContent(code)
        : code;
    // Re-render with htmlLabels:false for Canvas-safe SVG
    const { svg: safeSvg } = await mermaid.render(
        'export-' + Date.now(),
        cleanCode.trim(),
        // Note: mermaid.render does not accept per-call config;
        // must temporarily change global config or use a separate init
    );
    // Actually, mermaid.render() does not support per-render config overrides.
    // The practical approach is to inline the foreignObject content as plain SVG text
    // or use mermaid-cli server-side for PNG generation.
    // Simplest browser-side fix: temporarily re-initialize with htmlLabels:false,
    // render for export, then re-initialize back to htmlLabels:true.
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mermaid `htmlLabels: true` (default) | Still the default in Mermaid 11 | Since v9.2 (2022) | foreignObject used for text labels -- breaks Canvas PNG export |
| `mermaid.initialize()` + auto-start | `mermaid.initialize({ startOnLoad: false })` + manual `mermaid.render()` | Mermaid v10+ best practice | Gives full control over when rendering happens. Already used in codebase. |
| `svg.innerHTML` for export | `new XMLSerializer().serializeToString(svg)` | Modern browsers | Handles namespaces correctly. Already used in `exportPNG()`. |
| Polling-based file sync | WebSocket push via `createReconnectingWebSocket()` | Phase 3 (just completed) | File changes arrive in ~50ms instead of 2s polling. Already working. |

**Deprecated/outdated:**
- None relevant. The existing codebase uses current Mermaid v11 patterns.

## Feature Audit: Requirements vs. Implementation

| Requirement | Status | What Exists | Gap |
|------------|--------|-------------|-----|
| **UI-02**: Pan, zoom, fit-to-view | DONE | Mouse drag pan, scroll wheel zoom (cursor-origin), fit-to-view button, zoom buttons (+/-/Fit), zoom percentage label, `Ctrl+0` fit, `Ctrl+/-` zoom | None |
| **UI-03**: Keyboard shortcuts (F, Esc, Ctrl+F) | PARTIAL | `F` (flag mode), `Esc` (cancel popover + editor mode), `N` (add node), `A` (add edge), `?` (help), `Ctrl+E/B/S/0/+/-/Enter` all work | **Missing: `Ctrl+F` search/find nodes** |
| **UI-05**: Flag mode click-to-annotate | DONE | Crosshair cursor, click node opens popover, textarea for message, flags persisted as `%% @flag` in .mmd, red pulsing border on flagged nodes, red badge circles | None |
| **UI-06**: Flag panel with navigation | DONE | Right sidebar panel listing all flags, click-to-navigate with blink animation, flag count badge in topbar | None |
| **UI-08**: Export SVG and PNG | PARTIAL | SVG export works correctly. PNG export uses Canvas `drawImage` which fails silently when SVG contains foreignObject (default Mermaid htmlLabels:true) | **PNG export broken with default config** |
| **UI-09**: File tree sidebar | DONE | Folder tree with collapse/expand, file selection loads diagram, rename/delete, create new file/folder, localStorage persistence of collapsed state | **XSS risk in file name rendering (minor)** |

## Open Questions

1. **Ctrl+F Search Scope**
   - What we know: UI-03 specifies `Ctrl+F=search`. The codebase has no search implementation.
   - What's unclear: Should search find nodes by label text in the current diagram? Or search across all .mmd files? Or search the Mermaid source text?
   - Recommendation: Implement as "search nodes in current diagram" -- highlight matching nodes in the SVG and scroll/pan to the first match. This is most useful for the "AI observability" use case where developers need to find specific reasoning steps.

2. **PNG Export Strategy**
   - What we know: The current `exportPNG()` uses Canvas `drawImage()` which fails with foreignObject. Two fixes exist: (a) re-render with `htmlLabels: false` temporarily, (b) accept that PNG export produces slightly different text rendering.
   - What's unclear: Does Mermaid v11 support per-render config overrides? (Based on docs: no, `mermaid.render()` uses the global config.)
   - Recommendation: For PNG export, temporarily call `mermaid.initialize()` with `htmlLabels: false`, render the export SVG, then re-initialize with `htmlLabels: true`. The visual difference in text rendering is acceptable for export. Add error handling with user-facing toast if Canvas is tainted.

3. **Zoom Preservation During Auto-Sync**
   - What we know: The current code calls `zoomFit()` after every render, including live WebSocket updates. This resets the user's zoom/pan position.
   - What's unclear: Is this actually a problem users have noticed, or is `zoomFit()` the desired behavior for live updates?
   - Recommendation: For initial load and file navigation, use `zoomFit()`. For WebSocket live updates of the same file, preserve current zoom/pan state. This is a simple conditional check.

## Sources

### Primary (HIGH confidence)
- `/mermaid-js/mermaid` via Context7 -- `mermaid.render()` API, `securityLevel` config, `htmlLabels` option, click events
- Existing codebase (`static/live.html`, `static/annotations.js`, `static/annotations.css`, `static/diagram-editor.js`, `static/ws-client.js`) -- direct code review of all ~2600 lines

### Secondary (MEDIUM confidence)
- [Mermaid foreignObject issue #2688](https://github.com/mermaid-js/mermaid/issues/2688) -- foreignObject vs standard SVG text
- [MDN: CORS-enabled images in Canvas](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image) -- Canvas taint security model
- [Mermaid SVG export issue #6395](https://github.com/mermaid-js/mermaid/issues/6395) -- SVG not supported in PNG converter

### Tertiary (LOW confidence)
- None -- all critical claims verified against code or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies needed; all existing code reviewed
- Architecture: HIGH -- existing patterns are clear and consistent; no architectural changes needed
- Pitfalls: HIGH -- PNG export issue verified against Mermaid docs and browser security model; XSS risk verified by code review
- Feature audit: HIGH -- every requirement checked against existing code line by line

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- no fast-moving dependencies)
