/**
 * SmartB Breakpoints -- visual breakpoint indicators on SVG nodes,
 * notification bar for breakpoint:hit events, REST toggle/continue/remove.
 *
 * Dependencies:
 *   - diagram-dom.js (DiagramDOM)
 *   - event-bus.js (SmartBEventBus)
 *   - file-tree.js (SmartBFileTree) — for currentFile
 *
 * Usage:
 *   SmartBBreakpoints.init();
 *   SmartBBreakpoints.updateBreakpoints(breakpointSet);
 *   SmartBBreakpoints.toggleBreakpoint(nodeId);
 *   SmartBBreakpoints.showNotification(nodeId);
 *   SmartBBreakpoints.hideNotification();
 */
(function() {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';

    // ── Module State ──
    var breakpoints = new Set();
    var activeNotification = null;

    // ── Helpers ──

    function getCurrentFile() {
        if (window.SmartBFileTree) return SmartBFileTree.getCurrentFile();
        return window.currentFile || '';
    }

    // ── Breakpoint Indicators on SVG ──

    function applyBreakpointIndicators() {
        var svg = DiagramDOM.getSVG();
        if (!svg) return;

        // Remove existing indicators
        svg.querySelectorAll('.breakpoint-indicator').forEach(function(el) { el.remove(); });

        if (breakpoints.size === 0) return;

        breakpoints.forEach(function(nodeId) {
            var nodeEl = DiagramDOM.findNodeElement(nodeId);
            if (!nodeEl) return;
            var bbox = nodeEl.getBBox ? nodeEl.getBBox() : null;
            if (!bbox) return;

            // Account for transform="translate(x,y)" on custom renderer nodes
            var tx = 0, ty = 0;
            var transform = nodeEl.getAttribute('transform');
            if (transform) {
                var m = transform.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
                if (m) { tx = parseFloat(m[1]); ty = parseFloat(m[2]); }
            }

            var circle = document.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('cx', tx + bbox.x - 4);
            circle.setAttribute('cy', ty + bbox.y + bbox.height / 2);
            circle.setAttribute('r', '6');
            circle.setAttribute('fill', '#ef4444');
            circle.setAttribute('class', 'breakpoint-indicator');
            svg.appendChild(circle);
        });
    }

    // ── Update breakpoints from annotations ──

    function updateBreakpoints(breakpointSet) {
        breakpoints = breakpointSet instanceof Set ? breakpointSet : new Set(breakpointSet);
        applyBreakpointIndicators();
    }

    // ── Notification Bar ──

    function showNotification(nodeId) {
        hideNotification();

        var container = document.getElementById('preview-container');
        if (!container) return;

        var bar = document.createElement('div');
        bar.className = 'breakpoint-notification';

        var msgSpan = document.createElement('span');
        msgSpan.textContent = 'Breakpoint hit on ';
        var nameSpan = document.createElement('span');
        nameSpan.className = 'bp-node-name';
        nameSpan.textContent = nodeId;
        msgSpan.appendChild(nameSpan);
        bar.appendChild(msgSpan);

        var spacer = document.createElement('span');
        spacer.style.flex = '1';
        bar.appendChild(spacer);

        var btnContinue = document.createElement('button');
        btnContinue.className = 'btn-breakpoint-action primary';
        btnContinue.textContent = 'Continue';
        btnContinue.addEventListener('click', function() { continueBreakpoint(nodeId); });
        bar.appendChild(btnContinue);

        var btnRemove = document.createElement('button');
        btnRemove.className = 'btn-breakpoint-action';
        btnRemove.textContent = 'Remove Breakpoint';
        btnRemove.addEventListener('click', function() { removeBreakpoint(nodeId); });
        bar.appendChild(btnRemove);

        container.insertBefore(bar, container.firstChild);
        activeNotification = bar;
    }

    function hideNotification() {
        if (activeNotification && activeNotification.parentNode) {
            activeNotification.parentNode.removeChild(activeNotification);
        }
        activeNotification = null;
    }

    // ── REST Integration ──

    function toggleBreakpoint(nodeId) {
        var file = getCurrentFile();
        if (!file) return;
        var action = breakpoints.has(nodeId) ? 'remove' : 'set';
        fetch((window.SmartBBaseUrl || '') + '/api/breakpoints/' + encodeURIComponent(file), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId: nodeId, action: action })
        }).then(function(resp) {
            if (!resp.ok) return;
            if (action === 'set') {
                breakpoints.add(nodeId);
            } else {
                breakpoints.delete(nodeId);
            }
            applyBreakpointIndicators();
        }).catch(function(err) {
            console.warn('Failed to toggle breakpoint:', err.message);
        });
    }

    function continueBreakpoint(nodeId) {
        var file = getCurrentFile();
        if (!file) return;
        fetch((window.SmartBBaseUrl || '') + '/api/breakpoints/' + encodeURIComponent(file) + '/continue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId: nodeId })
        }).catch(function(err) {
            console.warn('Failed to continue breakpoint:', err.message);
        });
        hideNotification();
    }

    function removeBreakpoint(nodeId) {
        var file = getCurrentFile();
        if (!file) return;
        fetch((window.SmartBBaseUrl || '') + '/api/breakpoints/' + encodeURIComponent(file), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId: nodeId, action: 'remove' })
        }).then(function(resp) {
            if (!resp.ok) return;
            breakpoints.delete(nodeId);
            applyBreakpointIndicators();
        }).catch(function(err) {
            console.warn('Failed to remove breakpoint:', err.message);
        });
        hideNotification();
    }

    // ── Init ──

    function init() {
        // Re-apply indicators after each diagram render
        if (window.SmartBEventBus) {
            SmartBEventBus.on('diagram:rendered', applyBreakpointIndicators);
        }
        // Apply indicators if SVG already exists
        applyBreakpointIndicators();
    }

    // ── Public API ──
    window.SmartBBreakpoints = {
        init: init,
        updateBreakpoints: updateBreakpoints,
        applyBreakpointIndicators: applyBreakpointIndicators,
        toggleBreakpoint: toggleBreakpoint,
        showNotification: showNotification,
        hideNotification: hideNotification,
        continueBreakpoint: continueBreakpoint,
        removeBreakpoint: removeBreakpoint,
        getBreakpoints: function() { return breakpoints; },
    };
})();
