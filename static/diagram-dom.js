/**
 * DiagramDOM — abstraction layer for Mermaid SVG DOM queries.
 * Consolidates SVG element lookups duplicated across annotations.js,
 * collapse-ui.js, search.js, and diagram-editor.js.
 *
 * IMPORTANT: Never cache SVG element references — Mermaid's render()
 * replaces the entire SVG via innerHTML, invalidating all references.
 *
 * Usage:
 *   DiagramDOM.getSVG();
 *   DiagramDOM.findNodeElement('myNode');
 *   DiagramDOM.extractNodeId(clickedElement);
 */
(function() {
    'use strict';

    var NODE_RE = /^flowchart-(.+)-\d+$/;
    var SUBGRAPH_RE = /^subGraph\d+-(.+)-\d+$/;
    var EDGE_RE = /^L-(.+)$/;

    var DiagramDOM = {
        /**
         * Returns the current Mermaid SVG element, or null.
         */
        getSVG: function() {
            return document.querySelector('#preview svg');
        },

        /**
         * Finds the SVG element for a given node ID.
         * Iterates [id] elements matching /^flowchart-(.+)-\d+$/.
         */
        findNodeElement: function(nodeId) {
            var svg = this.getSVG();
            if (!svg) return null;
            var elements = svg.querySelectorAll('[id]');
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var id = el.getAttribute('id');
                var match = id ? id.match(NODE_RE) : null;
                if (match && match[1] === nodeId) return el;
            }
            return null;
        },

        /**
         * Finds the SVG element for a given subgraph ID.
         * Matches /^subGraph\d+-(.+)-\d+$/.
         */
        findSubgraphElement: function(subgraphId) {
            var svg = this.getSVG();
            if (!svg) return null;
            var elements = svg.querySelectorAll('[id]');
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var id = el.getAttribute('id');
                var match = id ? id.match(SUBGRAPH_RE) : null;
                if (match && match[1] === subgraphId) return el;
            }
            return null;
        },

        /**
         * Walks up the DOM from an element to find node/edge/subgraph identity.
         * Consolidates duplicated logic from annotations.js, collapse-ui.js,
         * search.js, and diagram-editor.js.
         *
         * Returns: { type: 'node'|'edge'|'subgraph', id: string } or null.
         */
        extractNodeId: function(element) {
            var el = element;
            while (el && el !== document.body) {
                var id = el.getAttribute ? el.getAttribute('id') : null;
                if (id) {
                    var nodeMatch = id.match(NODE_RE);
                    if (nodeMatch) return { type: 'node', id: nodeMatch[1] };
                    var edgeMatch = id.match(EDGE_RE);
                    if (edgeMatch) return { type: 'edge', id: 'L-' + edgeMatch[1] };
                    var subMatch = id.match(SUBGRAPH_RE);
                    if (subMatch) return { type: 'subgraph', id: subMatch[1] };
                }
                el = el.parentElement;
            }
            return null;
        },

        /**
         * Returns getBBox() of the found node element, or null.
         */
        getNodeBBox: function(nodeId) {
            var el = this.findNodeElement(nodeId);
            if (!el || !el.getBBox) return null;
            return el.getBBox();
        },

        /**
         * Returns the .nodeLabel textContent within a node, or null.
         */
        getNodeLabel: function(nodeId) {
            var el = this.findNodeElement(nodeId);
            if (!el) return null;
            var label = el.querySelector('.nodeLabel');
            return label ? label.textContent : null;
        },

        /**
         * Returns all .nodeLabel elements from the SVG.
         */
        getAllNodeLabels: function() {
            var svg = this.getSVG();
            if (!svg) return [];
            return Array.from(svg.querySelectorAll('.nodeLabel'));
        },

        /**
         * Walks up to find .node or .cluster parent element.
         */
        findMatchParent: function(element) {
            var current = element;
            while (current && current.tagName !== 'svg') {
                if (current.classList &&
                    (current.classList.contains('node') || current.classList.contains('cluster'))) {
                    return current;
                }
                current = current.parentElement;
            }
            return null;
        },

        /**
         * Adds/removes outline styling on a node.
         */
        highlightNode: function(nodeId, on) {
            var el = this.findNodeElement(nodeId);
            if (!el) return;
            el.style.outline = on ? '3px solid #6366f1' : '';
            el.style.outlineOffset = on ? '4px' : '';
        },

        /**
         * Returns SVG viewBox baseVal, or null.
         */
        getViewBox: function() {
            var svg = this.getSVG();
            if (!svg) return null;
            return (svg.viewBox && svg.viewBox.baseVal) ? svg.viewBox.baseVal : null;
        }
    };

    window.DiagramDOM = DiagramDOM;
})();
