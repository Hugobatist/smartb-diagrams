# Phase 13: Canvas Interactions - Research

**Researched:** 2026-02-15
**Domain:** SVG interaction, DOM event handling, UI state management
**Confidence:** HIGH

## Summary

Phase 13 adds direct manipulation to the custom SVG renderer built in Phases 10-12. The codebase already has a solid foundation: custom SVG nodes with `data-node-id` attributes, `DiagramDOM` for element lookups, `SmartBEventBus` for inter-module communication, `MmdEditor` for .mmd content manipulation (add/remove/edit nodes and edges), `ViewportTransform` for coordinate conversion, and `SmartBAnnotations` for the existing flag popover pattern. The task is to wire new interaction handlers (selection, context menu, inline edit) on top of these existing abstractions, coordinated by a finite state machine that prevents conflicting interactions.

The primary technical challenges are: (1) managing click/double-click/right-click disambiguation on SVG elements that are part of a pan-zoom container, (2) positioning HTML overlay elements (context menu, contenteditable div) correctly in graph coordinates at any zoom level, and (3) ensuring the new interaction modes don't break existing flag mode, add-node mode, add-edge mode, collapse-click, and search. The existing codebase already has informal mode management (flag mode disables panning, add-node mode disables flag mode) but no centralized state machine -- Phase 13 needs to formalize this.

**Primary recommendation:** Build a lightweight interaction state machine (`interaction-state.js`) as the central coordination module, a selection manager (`selection.js`) for selection state + visual indicators, a context menu module (`context-menu.js`), and an inline edit module (`inline-edit.js`). All new modules follow the existing IIFE pattern, use DiagramDOM and EventBus, and stay under 300 lines each.

## Standard Stack

### Core

No new external libraries needed. Everything is built with vanilla JS on existing abstractions.

| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| Vanilla JS + SVG DOM | Selection visual indicators, hit detection | Project constraint: no frameworks in static/ |
| `contextmenu` event | Right-click capture | Native DOM event, works on SVG elements |
| HTML `contenteditable` div overlay | Inline label editing | SVG `<text>` doesn't support contenteditable; HTML overlay positioned via ViewportTransform is the proven approach |
| CSS classes + SVG attributes | Selection visual indicator | Matches existing pattern (`.flagged`, `.search-match`) |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| DiagramDOM | Find SVG elements by node/edge/subgraph ID | All interactions that target diagram elements |
| SmartBEventBus | Inter-module communication | Selection changes, state transitions, edit completions |
| MmdEditor | .mmd content manipulation (removeNode, editNodeText, addEdge, etc.) | All edit actions triggered from context menu or keyboard |
| SmartBAnnotations | Flag operations from context menu | Context menu "Flag" action |
| ViewportTransform / SmartBPanZoom | Screen-to-graph coordinate conversion | Positioning inline edit overlay and context menu at correct zoom |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom FSM | XState library | XState is powerful but adds ~30KB dependency; our FSM has 6-8 states max -- a simple object literal with transition table suffices |
| HTML contenteditable overlay | SVG foreignObject | foreignObject has inconsistent browser support and complicates the SVG DOM; overlay div is simpler and proven |
| Custom context menu | vanilla-context-menu library | 3KB library but adds a dependency; our context menu has 5-6 fixed items -- simple DOM construction matches existing popover pattern |

**Installation:** None -- no new npm packages needed.

## Architecture Patterns

### Recommended Module Structure

```
static/
  interaction-state.js   # FSM: idle/selected/editing/context-menu/panning/flagging/add-node/add-edge
  selection.js           # Selection state, visual indicators (blue border, handles), keyboard actions
  context-menu.js        # Right-click context menu construction and positioning
  inline-edit.js         # Double-click contenteditable overlay for label editing
  [existing modules]     # Modified: pan-zoom.js, annotations.js, diagram-editor.js, collapse-ui.js, app-init.js
```

### Pattern 1: Interaction State Machine

**What:** A finite state machine that defines all valid UI states and transitions. Every interaction module queries the FSM before acting.

**When to use:** Always -- this is the coordination backbone.

**States and transitions:**

```
States:
  idle         - Default. Click selects, right-click opens menu, double-click edits, drag pans.
  selected     - A node/edge is selected. Click elsewhere deselects, Delete removes, right-click opens menu.
  editing      - Inline edit overlay is open. All other interactions blocked. Enter/Escape exits.
  context-menu - Context menu is open. Click outside or Escape closes. Menu actions may transition to editing.
  flagging     - Flag mode is active. Click shows flag popover. (Existing behavior.)
  add-node     - Add node mode. Click empty space shows popover. (Existing behavior.)
  add-edge     - Add edge mode. Click nodes to build edge. (Existing behavior.)
```

```javascript
// Transition table (simplified)
var TRANSITIONS = {
  idle:         { click_node: 'selected', right_click: 'context-menu', dbl_click: 'editing', flag_toggle: 'flagging', add_node_toggle: 'add-node', add_edge_toggle: 'add-edge' },
  selected:     { click_empty: 'idle', click_node: 'selected', right_click: 'context-menu', dbl_click: 'editing', escape: 'idle', delete: 'idle', flag_toggle: 'flagging' },
  editing:      { confirm: 'idle', escape: 'idle' },
  'context-menu': { action: 'idle', close: 'idle', edit_action: 'editing' },
  flagging:     { flag_toggle: 'idle', click_node: 'flagging' },  // existing behavior
  'add-node':   { add_node_toggle: 'idle', escape: 'idle' },      // existing behavior
  'add-edge':   { add_edge_toggle: 'idle', escape: 'idle' },      // existing behavior
};
```

**Example:**
```javascript
// interaction-state.js
(function() {
  'use strict';
  var currentState = 'idle';
  var selectedId = null;
  var selectedType = null; // 'node' | 'edge' | 'subgraph'

  function transition(event, payload) {
    var stateConfig = TRANSITIONS[currentState];
    if (!stateConfig || !stateConfig[event]) return false;
    var nextState = stateConfig[event];
    var prevState = currentState;
    currentState = nextState;
    SmartBEventBus.emit('interaction:transition', {
      from: prevState, to: nextState, event: event, payload: payload
    });
    return true;
  }

  function getState() { return currentState; }
  function getSelection() { return { id: selectedId, type: selectedType }; }

  window.SmartBInteraction = {
    getState: getState,
    getSelection: getSelection,
    transition: transition,
    // ... more API
  };
})();
```

### Pattern 2: Selection Visual Indicators via SVG

**What:** When a node is selected, render a blue border and corner handles using SVG elements injected into the diagram SVG.

**When to use:** On node click when FSM transitions to `selected` state.

**Key considerations:**
- SVG is re-rendered on every file change / WebSocket update (the entire SVG DOM is replaced by `custom-renderer.js`)
- Selection indicators must be re-applied after each render (subscribe to `diagram:rendered` event, same pattern as flags and search highlights)
- Use `DiagramDOM.findNodeElement(nodeId)` + `getBBox()` to position the selection overlay
- Selection border: SVG `<rect>` with stroke `#6366f1`, fill `none`, positioned around the node's bounding box
- Corner handles: 4 small SVG `<rect>` elements (8x8px) at each corner of the selection rect

**Example:**
```javascript
function showSelectionIndicator(nodeId) {
  clearSelectionIndicator();
  var el = DiagramDOM.findNodeElement(nodeId);
  if (!el) return;
  var bbox = el.getBBox();
  var svg = DiagramDOM.getSVG();
  var g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'selection-indicator');
  // Blue border rect
  var rect = document.createElementNS(NS, 'rect');
  rect.setAttribute('x', bbox.x - 4);
  rect.setAttribute('y', bbox.y - 4);
  rect.setAttribute('width', bbox.width + 8);
  rect.setAttribute('height', bbox.height + 8);
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', '#6366f1');
  rect.setAttribute('stroke-width', '2');
  rect.setAttribute('stroke-dasharray', '6,3');
  rect.setAttribute('rx', '4');
  g.appendChild(rect);
  // Corner handles (top-left, top-right, bottom-left, bottom-right)
  var corners = [
    [bbox.x - 4, bbox.y - 4],
    [bbox.x + bbox.width - 4, bbox.y - 4],
    [bbox.x - 4, bbox.y + bbox.height - 4],
    [bbox.x + bbox.width - 4, bbox.y + bbox.height - 4]
  ];
  for (var i = 0; i < corners.length; i++) {
    var handle = document.createElementNS(NS, 'rect');
    handle.setAttribute('x', corners[i][0]);
    handle.setAttribute('y', corners[i][1]);
    handle.setAttribute('width', '8');
    handle.setAttribute('height', '8');
    handle.setAttribute('fill', '#6366f1');
    handle.setAttribute('rx', '2');
    g.appendChild(handle);
  }
  svg.appendChild(g);
}
```

### Pattern 3: Context Menu as HTML Overlay

**What:** A positioned HTML `<div>` with menu items, shown on right-click. Follows the exact same pattern as the existing flag popover in `annotations.js`.

**When to use:** On `contextmenu` event when FSM allows it.

**Key considerations:**
- Use `e.clientX` / `e.clientY` for positioning (screen coordinates, not graph coordinates -- same as flag popover)
- Prevent default browser context menu with `e.preventDefault()`
- Items: Edit Label, Delete, Duplicate, Flag, Connect (for nodes); Delete (for edges)
- Close on Escape, outside click, or action selection
- Each action delegates to existing `MmdEditor` functions or `SmartBAnnotations`

### Pattern 4: Inline Edit via HTML Overlay

**What:** A `contenteditable` HTML `<div>` positioned over the SVG `<text>` element at the correct zoom-adjusted position.

**When to use:** On double-click when FSM transitions to `editing` state.

**Key considerations:**
- Get the `<text>` element's screen position using `getBoundingClientRect()` (already accounts for CSS transforms including pan-zoom)
- Create an absolutely-positioned HTML div with `contenteditable="true"`, styled to match SVG text (font-family, font-size, font-weight, color)
- On Enter (without Shift): confirm edit, call `MmdEditor.editNodeText()` to update .mmd, transition FSM to idle
- On Escape: cancel edit, discard changes, transition FSM to idle
- On blur: treat as confirm
- The overlay div goes in the `#preview-container` or `document.body`, not inside the SVG

### Anti-Patterns to Avoid

- **Don't cache SVG element references across renders.** The entire SVG is replaced on each render. Always use `DiagramDOM.findNodeElement()` to re-query. This is explicitly documented in `diagram-dom.js`.
- **Don't try to make SVG elements contenteditable.** `contenteditable` is an HTML-only attribute. Use an HTML overlay positioned via `getBoundingClientRect()`.
- **Don't add interaction listeners directly to SVG elements.** SVG elements are replaced on re-render. Attach listeners to stable parent containers (`#preview-container`) and use event delegation with `DiagramDOM.extractNodeId()`.
- **Don't use `foreignObject` for inline editing.** It has inconsistent browser support and complicates the SVG DOM structure.
- **Don't build the state machine inside app-init.js.** Extract it into its own module to keep app-init.js under 500 lines and maintain separation of concerns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Node identification from click target | DOM walk-up logic | `DiagramDOM.extractNodeId(e.target)` | Already handles both Mermaid and custom SVG; duplicating this would diverge |
| .mmd content editing | Text manipulation regexes | `MmdEditor.editNodeText()`, `MmdEditor.removeNode()`, `MmdEditor.addNode()`, `MmdEditor.addEdge()` | Already handles edge cases (escaping, annotations stripping, re-injection) |
| Flag operations | Direct annotation manipulation | `SmartBAnnotations.toggleFlagMode()`, flag popover | Existing flag system with save, event emission, badge updates |
| Coordinate conversion | Manual transform math | `ViewportTransform.screenToGraph()` / `getBoundingClientRect()` | Already handles zoom, pan, and transform state |
| File save after edit | Direct fetch POST | `MmdEditor.applyEdit()` pipeline | Strips annotations, applies edit, re-injects, saves, re-renders |

**Key insight:** Phase 13 is primarily an interaction layer. Almost all edit operations already exist in `MmdEditor` and `SmartBAnnotations`. The new code wires user gestures (click, right-click, double-click, keyboard) to existing operations via the FSM.

## Common Pitfalls

### Pitfall 1: Click vs Double-Click Disambiguation

**What goes wrong:** Single-click handler fires before double-click, causing selection on every double-click before the edit overlay opens.
**Why it happens:** DOM fires `click` before `dblclick`. A 200ms delay timer is a common workaround but adds perceived latency.
**How to avoid:** Accept that selection fires first -- the double-click handler checks if a node is already selected and opens the edit overlay. The brief selection flash (one frame) is acceptable UX. Alternatively, use `detail` property of the click event (`e.detail === 2` means double-click) to detect double-clicks in the single click handler.
**Warning signs:** Users report "flicker" when double-clicking to edit.

### Pitfall 2: SVG Re-Render Destroys Selection State

**What goes wrong:** When the file changes (WebSocket update from AI or filesystem watcher), the entire SVG is replaced, losing all selection indicators and inline edit overlays.
**Why it happens:** `custom-renderer.js render()` calls `preview.textContent = ''` then inserts new SVG.
**How to avoid:** Subscribe to `diagram:rendered` event. If a node was selected, re-apply the selection indicator on the new SVG (if the node still exists). If inline editing was active, either cancel the edit (safe) or commit the current edit before re-render (better UX).
**Warning signs:** Selection disappears after any file change.

### Pitfall 3: Pan-Zoom vs Click Event Conflict

**What goes wrong:** Panning starts on mousedown, but so does node selection. A tiny mouse movement during a "click" is interpreted as a pan.
**Why it happens:** `pan-zoom.js` listens for `mousedown` on `#preview-container` -- the same element where node clicks propagate.
**How to avoid:** Two strategies: (a) Pan-zoom.js already checks `SmartBAnnotations.getState().flagMode` and `MmdEditor.getState().mode` before panning -- extend this to check `SmartBInteraction.getState()`. If state is `selected` and click target is a node, don't pan. (b) Use a movement threshold (e.g., 3px) in pan-zoom.js -- only start panning after the mouse moves more than the threshold from mousedown position.
**Warning signs:** Clicking a node starts panning instead of selecting.

### Pitfall 4: Context Menu Positioning at Extreme Zoom

**What goes wrong:** Context menu appears in the wrong position or off-screen when the diagram is zoomed very far in/out.
**Why it happens:** Using SVG/graph coordinates instead of screen coordinates for positioning.
**How to avoid:** Always use `e.clientX` / `e.clientY` (screen coordinates) for context menu and inline edit overlay positioning, just like the existing flag popover does. The flag popover (`annotations.js showPopover()`) already handles edge clamping: `Math.min(clientX + 12, window.innerWidth - 380)`.
**Warning signs:** Menu appears far from the right-clicked node at high zoom levels.

### Pitfall 5: Inline Edit Overlay Misalignment

**What goes wrong:** The contenteditable div doesn't align with the SVG text element, especially at non-1x zoom.
**Why it happens:** Mixing SVG coordinate space with HTML coordinate space without accounting for the CSS transform on the `#preview` element.
**How to avoid:** Use `textElement.getBoundingClientRect()` which returns screen-space coordinates that already account for all CSS transforms. Position the overlay using these screen coordinates relative to `#preview-container`'s `getBoundingClientRect()`.
**Warning signs:** Edit overlay is offset from the node text at different zoom levels.

### Pitfall 6: Keyboard Shortcut Conflicts

**What goes wrong:** Delete key intended for removing a selected node also triggers other behaviors (e.g., deleting text in the editor panel if focused).
**Why it happens:** The keydown handler doesn't check which element has focus.
**How to avoid:** Always check `e.target` -- if it's a `<textarea>`, `<input>`, or `[contenteditable]` element, don't handle diagram keyboard shortcuts. The existing keyboard handler in `app-init.js` already does this for the editor textarea: `if (e.target === editor) return;`. Extend this pattern to also check for contenteditable elements.
**Warning signs:** Pressing Delete while editing text in the editor panel deletes the selected diagram node.

## Code Examples

### Click Handler with FSM Integration

```javascript
// In selection.js -- delegated click handler on preview-container
function handleClick(e) {
  var state = SmartBInteraction.getState();
  // Don't handle if in a modal state
  if (state === 'editing' || state === 'flagging' || state === 'add-node' || state === 'add-edge') return;
  // Don't handle zoom controls or popovers
  if (e.target.closest('.zoom-controls') || e.target.closest('.flag-popover') || e.target.closest('.context-menu') || e.target.closest('.editor-popover')) return;

  var nodeInfo = DiagramDOM.extractNodeId(e.target);

  if (nodeInfo && nodeInfo.type === 'node') {
    e.stopPropagation(); // Prevent pan-zoom from starting
    selectNode(nodeInfo.id);
    SmartBInteraction.transition('click_node', { id: nodeInfo.id, type: 'node' });
  } else if (!nodeInfo) {
    // Clicked empty space
    deselectAll();
    SmartBInteraction.transition('click_empty');
  }
}
```

### Right-Click Context Menu

```javascript
// In context-menu.js
container.addEventListener('contextmenu', function(e) {
  var state = SmartBInteraction.getState();
  if (state === 'editing') return; // Don't open menu while editing

  var nodeInfo = DiagramDOM.extractNodeId(e.target);
  if (!nodeInfo) return; // Only show menu on diagram elements

  e.preventDefault();
  SmartBInteraction.transition('right_click', nodeInfo);
  showContextMenu(e.clientX, e.clientY, nodeInfo);
});

function showContextMenu(x, y, nodeInfo) {
  closeContextMenu();
  var menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 250) + 'px';

  var items = [];
  if (nodeInfo.type === 'node') {
    items = [
      { label: 'Edit Label', icon: 'pencil', action: 'edit' },
      { label: 'Delete', icon: 'trash', action: 'delete' },
      { label: 'Duplicate', icon: 'copy', action: 'duplicate' },
      { label: 'Flag', icon: 'flag', action: 'flag' },
      { label: 'Connect', icon: 'arrow', action: 'connect' },
    ];
  } else if (nodeInfo.type === 'edge') {
    items = [
      { label: 'Delete', icon: 'trash', action: 'delete' },
      { label: 'Flag', icon: 'flag', action: 'flag' },
    ];
  }
  // Build menu DOM...
}
```

### Inline Edit Overlay Positioning

```javascript
// In inline-edit.js
function openInlineEdit(nodeId) {
  var el = DiagramDOM.findNodeElement(nodeId);
  if (!el) return;
  var textEl = el.querySelector('text');
  if (!textEl) return;

  // Get screen-space position (accounts for CSS transforms)
  var textRect = textEl.getBoundingClientRect();
  var containerRect = document.getElementById('preview-container').getBoundingClientRect();

  var overlay = document.createElement('div');
  overlay.className = 'inline-edit-overlay';
  overlay.contentEditable = 'true';
  overlay.textContent = textEl.textContent;

  // Position relative to container
  overlay.style.position = 'absolute';
  overlay.style.left = (textRect.left - containerRect.left) + 'px';
  overlay.style.top = (textRect.top - containerRect.top) + 'px';
  overlay.style.minWidth = textRect.width + 'px';
  overlay.style.fontSize = window.getComputedStyle(textEl).fontSize;
  // ... more styling to match SVG text appearance

  document.getElementById('preview-container').appendChild(overlay);
  overlay.focus();

  // Select all text for easy replacement
  var range = document.createRange();
  range.selectNodeContents(overlay);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
```

### Node Duplication (New Operation for MmdEditor)

```javascript
// Addition to diagram-editor.js
function duplicateNode(content, nodeId) {
  var newId = generateNodeId(content);
  var label = getNodeText(content, nodeId);
  return addNode(content, newId, label + ' (copy)');
}
```

## Integration Points with Existing Modules

### Modules That Need Modification

| Module | Change | Reason |
|--------|--------|--------|
| `pan-zoom.js` | Check `SmartBInteraction.getState()` before starting pan | Prevent pan when selecting/interacting with nodes |
| `annotations.js` | Delegate flag mode toggle through FSM | FSM coordinates mode exclusivity |
| `diagram-editor.js` | Add `duplicateNode()`, delegate mode toggles through FSM | New context menu action; FSM coordination |
| `collapse-ui.js` | Check FSM state before handling click | Don't collapse when selecting |
| `app-init.js` | Initialize FSM and new modules, add keyboard shortcuts (Delete/Backspace for remove, Escape for deselect) | Orchestration |
| `live.html` | Add 4 new `<script>` tags in correct load order | New modules |

### New EventBus Events

| Event | Emitter | Consumer(s) | Payload |
|-------|---------|-------------|---------|
| `interaction:transition` | interaction-state.js | All modules | `{ from, to, event, payload }` |
| `selection:changed` | selection.js | context-menu.js, inline-edit.js, app-init.js | `{ nodeId, type }` or `null` |
| `edit:started` | inline-edit.js | pan-zoom.js, annotations.js | `{ nodeId }` |
| `edit:completed` | inline-edit.js | selection.js, app-init.js | `{ nodeId, oldLabel, newLabel }` |
| `edit:cancelled` | inline-edit.js | selection.js | `{ nodeId }` |

### Script Load Order in live.html

```html
<!-- After viewport-transform.js, before dagre-layout.js -->
<script src="interaction-state.js"></script>
<script src="selection.js"></script>
<script src="context-menu.js"></script>
<script src="inline-edit.js"></script>
```

These must load after `event-bus.js`, `diagram-dom.js`, and `annotations.js` (which they depend on) but before `app-init.js` (which initializes them).

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| prompt() for label editing | contenteditable HTML overlay | Inline editing feels native, no browser dialog interruption |
| Browser default context menu | Custom HTML context menu with diagram-specific actions | Domain-specific actions (Flag, Connect, Duplicate) are one click away |
| Ad-hoc mode booleans (flagMode, editorState.mode) | Centralized FSM with transition table | Prevents impossible states, makes conflicts explicit and eliminable |
| No selection state | Explicit selection with visual feedback | Foundation for copy/paste/undo (Phase 14) |

## Open Questions

1. **Should edges be selectable?**
   - What we know: The success criteria mention "clicking a node selects it" but edges appear in context menu descriptions. The existing `DiagramDOM.extractNodeId()` already returns `{ type: 'edge', id }` for edge clicks.
   - What's unclear: Whether edges need the same visual selection indicator (blue border + handles).
   - Recommendation: Support edge selection for context menu (right-click) and deletion, but don't show corner handles. Edges get a highlight color (thicker stroke, blue) instead.

2. **Multi-selection (Ctrl+Click)?**
   - What we know: Phase 14 mentions copy/paste/duplicate which benefit from multi-selection. Phase 13 success criteria only mention single node selection.
   - What's unclear: Whether to build multi-selection infrastructure now or defer.
   - Recommendation: Defer multi-selection to Phase 14. Build single-selection now with data structures that can extend to multi-selection (e.g., use a Set of selected IDs even though it starts with 0-1 items).

3. **How to handle selection during live AI updates?**
   - What we know: When AI modifies the .mmd file, the server sends `graph:update` via WebSocket, and the entire SVG is re-rendered.
   - What's unclear: Should the selected node remain selected after re-render if it still exists?
   - Recommendation: Yes. On `diagram:rendered`, if a node was selected, check if it still exists in the new SVG and re-apply selection. If the node was deleted by the AI update, deselect and transition to idle.

4. **Duplicate node: position in the .mmd file?**
   - What we know: `MmdEditor.addNode()` adds to the insertion point (before styles/annotations). The new node won't have edges.
   - What's unclear: Whether duplicating should also duplicate connected edges.
   - Recommendation: Start simple -- duplicate creates a new node with the same label + " (copy)" but no edges. This matches the behavior of most diagram tools and avoids complex edge duplication logic.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `static/diagram-dom.js`, `static/pan-zoom.js`, `static/annotations.js`, `static/diagram-editor.js`, `static/collapse-ui.js`, `static/app-init.js`, `static/custom-renderer.js`, `static/svg-renderer.js`, `static/viewport-transform.js`, `static/event-bus.js`
- Codebase analysis: `src/diagram/graph-types.ts`, `src/diagram/graph-serializer.ts`, `src/diagram/graph-parser.ts`, `src/server/routes.ts`, `src/server/websocket.ts`
- Phase 12 completion summary: `.planning/phases/12-server-browser-integration/12-03-SUMMARY.md`

### Secondary (MEDIUM confidence)
- [W3C SVG WG issue #332](https://github.com/w3c/svgwg/issues/332) - contenteditable not supported on SVG text elements (confirms need for HTML overlay)
- [JavaScript text editor for SVG (Medium)](https://medium.com/codex/javascript-text-editor-for-svg-6881f670d432) - Transparent textarea/div overlay approach for SVG text editing
- [Modeling UI State Using FSM](https://xiaoyunyang.github.io/post/modeling-ui-state-using-a-finite-state-machine/) - FSM pattern for UI state management
- [SVG Interactive Tutorial](https://svg-tutorial.com/svg/interaction) - SVG event handling patterns

### Tertiary (LOW confidence)
- [vanilla-context-menu](https://www.cssscript.com/vanilla-context-menu/) - Reference for context menu positioning patterns (not using the library itself)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; all patterns use existing codebase abstractions
- Architecture: HIGH - FSM pattern is well-understood; existing module pattern (IIFE + window globals + EventBus) is proven in this codebase
- Pitfalls: HIGH - All pitfalls identified from direct codebase analysis of existing interaction conflicts (pan vs click, SVG re-render, coordinate systems)

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- no external dependency changes expected)
