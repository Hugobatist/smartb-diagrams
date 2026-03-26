/**
 * SmartCode Node Drag -- drag selected nodes to reposition them on the canvas.
 * Moves nodes visually by updating SVG transform. Positions reset on re-render
 * (layout is still computed by dagre). This provides immediate visual feedback.
 *
 * Dependencies:
 *   - interaction-state.js (SmartCodeInteraction)
 *   - selection.js (SmartCodeSelection)
 *   - diagram-dom.js (DiagramDOM)
 *   - pan-zoom.js (SmartCodePanZoom)
 *
 * Usage:
 *   SmartCodeNodeDrag.init();
 */
(function() {
    'use strict';

    var DRAG_THRESHOLD = 5; // px before drag starts (prevents false drags on click)

    // ── Internal State ──
    var isDragging = false;
    var dragStarted = false;
    var dragNodeId = null;
    var dragNodeEl = null;
    var startMouseX = 0;
    var startMouseY = 0;
    var startNodeX = 0;
    var startNodeY = 0;
    var currentOffsetX = 0;
    var currentOffsetY = 0;

    // Track position overrides so they survive re-selection (but not re-render)
    var positionOverrides = new Map(); // nodeId -> { dx, dy }

    // ── Coordinate Conversion ──

    /**
     * Convert screen coordinates to SVG/graph coordinates,
     * accounting for current zoom and pan.
     */
    function screenToGraph(screenX, screenY) {
        var pan = window.SmartCodePanZoom ? SmartCodePanZoom.getPan() : { panX: 0, panY: 0, zoom: 1 };
        return {
            x: (screenX - pan.panX) / pan.zoom,
            y: (screenY - pan.panY) / pan.zoom
        };
    }

    // ── Get Node's Current Transform ──

    function getNodeTransform(el) {
        var transform = el.getAttribute('transform') || '';
        var match = transform.match(/translate\(\s*([-\d.]+)\s*,?\s*([-\d.]+)\s*\)/);
        if (match) {
            return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
        }
        return { x: 0, y: 0 };
    }

    function setNodeTransform(el, x, y) {
        el.setAttribute('transform', 'translate(' + x + ',' + y + ')');
    }

    // ── Update Connected Edges ──

    function updateConnectedEdges(nodeId, dx, dy) {
        var svg = DiagramDOM.getSVG();
        if (!svg) return;

        // Find edges connected to this node
        // Custom renderer: edges have data-source and data-target attributes
        var edges = svg.querySelectorAll(
            '[data-source="' + nodeId + '"], [data-target="' + nodeId + '"]'
        );

        for (var i = 0; i < edges.length; i++) {
            var edge = edges[i];
            var path = edge.querySelector('path');
            if (!path) continue;

            var source = edge.getAttribute('data-source');
            var target = edge.getAttribute('data-target');

            // Get the path data and adjust endpoints
            var d = path.getAttribute('d');
            if (!d) continue;

            // Simple approach: translate the edge endpoint that corresponds to the moved node
            if (source === nodeId && target === nodeId) {
                // Self-loop: translate entire edge
                if (!edge._originalTransform) edge._originalTransform = edge.getAttribute('transform') || '';
                edge.setAttribute('transform', (edge._originalTransform + ' translate(' + dx + ',' + dy + ')').trim());
            } else if (source === nodeId) {
                // Move start point of the path
                adjustPathStart(path, dx, dy);
            } else if (target === nodeId) {
                // Move end point of the path
                adjustPathEnd(path, dx, dy);
            }
        }

        // Also handle Mermaid edges (they use different structure)
        // Mermaid edges are harder to identify - skip for now, they'll update on re-render
    }

    function adjustPathStart(path, dx, dy) {
        if (!path._originalD) path._originalD = path.getAttribute('d');
        var d = path._originalD;
        // Parse first M command and adjust it
        var adjusted = d.replace(/^M\s*([-\d.]+)\s*,?\s*([-\d.]+)/, function(match, x, y) {
            return 'M' + (parseFloat(x) + dx) + ',' + (parseFloat(y) + dy);
        });
        path.setAttribute('d', adjusted);
    }

    function adjustPathEnd(path, dx, dy) {
        if (!path._originalD) path._originalD = path.getAttribute('d');
        var d = path._originalD;
        // Find last coordinate pair and adjust it
        // For bezier curves (C/Q), adjust the last control point and endpoint
        var parts = d.split(/(?=[MLCQZ])/);
        if (parts.length > 0) {
            var lastPart = parts[parts.length - 1];
            if (lastPart && lastPart.trim().startsWith('L')) {
                parts[parts.length - 1] = lastPart.replace(/([-\d.]+)\s*,?\s*([-\d.]+)\s*$/, function(match, x, y) {
                    return (parseFloat(x) + dx) + ',' + (parseFloat(y) + dy);
                });
            }
            path.setAttribute('d', parts.join(''));
        }
    }

    // ── Event Handlers ──

    function handleMouseDown(e) {
        if (e.button !== 0) return;

        // Only drag when a node is selected
        if (!window.SmartCodeInteraction) return;
        var fsmState = SmartCodeInteraction.getState();
        if (fsmState !== 'selected') return;

        var sel = window.SmartCodeSelection ? SmartCodeSelection.getSelected() : null;
        if (!sel || sel.type !== 'node') return;

        // Check if click is on the selected node
        var clickedNode = DiagramDOM.extractNodeId(e.target);
        if (!clickedNode || clickedNode.id !== sel.id) return;

        // Start potential drag
        isDragging = true;
        dragStarted = false;
        dragNodeId = sel.id;
        dragNodeEl = DiagramDOM.findNodeElement(sel.id);
        startMouseX = e.clientX;
        startMouseY = e.clientY;

        if (dragNodeEl) {
            var currentTransform = getNodeTransform(dragNodeEl);
            startNodeX = currentTransform.x;
            startNodeY = currentTransform.y;
        }

        currentOffsetX = 0;
        currentOffsetY = 0;

        e.preventDefault();
        e.stopPropagation();
    }

    function handleMouseMove(e) {
        if (!isDragging || !dragNodeEl) return;

        var dx = e.clientX - startMouseX;
        var dy = e.clientY - startMouseY;

        if (!dragStarted) {
            if (Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
            dragStarted = true;
            // Notify FSM
            if (window.SmartCodeInteraction) SmartCodeInteraction.transition('drag_start');
            document.body.style.cursor = 'grabbing';

            // Store original edge paths for connected edges
            storeOriginalEdgePaths(dragNodeId);
        }

        // Convert screen delta to graph delta (account for zoom)
        var pan = window.SmartCodePanZoom ? SmartCodePanZoom.getPan() : { zoom: 1 };
        var graphDx = dx / pan.zoom;
        var graphDy = dy / pan.zoom;

        // Move the node
        setNodeTransform(dragNodeEl, startNodeX + graphDx, startNodeY + graphDy);
        currentOffsetX = graphDx;
        currentOffsetY = graphDy;

        // Update connected edges
        updateConnectedEdges(dragNodeId, graphDx, graphDy);

        e.preventDefault();
    }

    function handleMouseUp(e) {
        if (!isDragging) return;

        if (dragStarted) {
            // Store the position override
            var existing = positionOverrides.get(dragNodeId) || { dx: 0, dy: 0 };
            positionOverrides.set(dragNodeId, {
                dx: existing.dx + currentOffsetX,
                dy: existing.dy + currentOffsetY
            });

            // Clean up _originalD and _originalTransform from edge elements
            cleanupEdgeCustomProps(dragNodeId);

            // Notify FSM
            if (window.SmartCodeInteraction) SmartCodeInteraction.transition('drag_end');
            document.body.style.cursor = '';

            if (window.toast) {
                window.toast('Node repositioned (visual only, resets on re-render)');
            }
        }

        isDragging = false;
        dragStarted = false;
        dragNodeId = null;
        dragNodeEl = null;
    }

    /** Remove custom properties (_originalD, _originalTransform) from edge elements */
    function cleanupEdgeCustomProps(nodeId) {
        var svg = DiagramDOM.getSVG();
        if (!svg) return;
        var edges = svg.querySelectorAll(
            '[data-source="' + nodeId + '"], [data-target="' + nodeId + '"]'
        );
        for (var i = 0; i < edges.length; i++) {
            var edge = edges[i];
            delete edge._originalTransform;
            var pathEl = edge.querySelector('path');
            if (pathEl) delete pathEl._originalD;
        }
    }

    function storeOriginalEdgePaths(nodeId) {
        var svg = DiagramDOM.getSVG();
        if (!svg) return;
        var edges = svg.querySelectorAll(
            '[data-source="' + nodeId + '"], [data-target="' + nodeId + '"]'
        );
        for (var i = 0; i < edges.length; i++) {
            var path = edges[i].querySelector('path');
            if (path && !path._originalD) {
                path._originalD = path.getAttribute('d');
            }
        }
    }

    // ── Re-apply positions after render (for the current session) ──

    function reapplyPositions() {
        // Position overrides are visual-only and reset on diagram re-render.
        // Clear the overrides since dagre has re-computed the layout.
        positionOverrides.clear();
    }

    // ── Init ──

    function init() {
        var container = document.getElementById('preview-container');
        if (!container) return;

        // Use capture phase to intercept before pan-zoom
        container.addEventListener('mousedown', handleMouseDown, true);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Clear position overrides on re-render
        if (window.SmartCodeEventBus) {
            SmartCodeEventBus.on('diagram:rendered', reapplyPositions);
        }
    }

    // ── Public API ──
    window.SmartCodeNodeDrag = {
        init: init,
        isDragging: function() { return dragStarted; },
        getPositionOverrides: function() { return positionOverrides; },
    };
})();
