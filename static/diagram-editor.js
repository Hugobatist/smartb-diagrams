/**
 * SmartCode -- Visual Diagram Editor
 * Manipulates .mmd content: add/remove/edit nodes and edges.
 * Dependencies: diagram-dom.js (DiagramDOM), event-bus.js (SmartCodeEventBus),
 *   command-history.js (SmartCodeCommandHistory), editor-popovers.js (SmartCodeEditorPopovers)
 */
(function () {
    'use strict';

    /** Find insertion point: before first `style` line, or before annotations, or at end */
    function findInsertionLine(lines) {
        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            if (t.startsWith('style ') || t.startsWith('%% ---')) return i;
        }
        return lines.length;
    }

    /** Add a node definition to .mmd content */
    function addNode(content, nodeId, label) {
        var lines = content.split('\n');
        var idx = findInsertionLine(lines);
        var newLine = '    ' + nodeId + '["' + label + '"]';
        lines.splice(idx, 0, '', newLine);
        return lines.join('\n');
    }

    /** Add an edge between two nodes */
    function addEdge(content, fromId, toId, label) {
        var lines = content.split('\n');
        var idx = findInsertionLine(lines);
        var edgeLine = label
            ? '    ' + fromId + ' -->|"' + label + '"| ' + toId
            : '    ' + fromId + ' --> ' + toId;
        lines.splice(idx, 0, edgeLine);
        return lines.join('\n');
    }

    /** Remove a node and all its edges/styles from .mmd content */
    function removeNode(content, nodeId) {
        var lines = content.split('\n');
        var escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match: node definitions, edges referencing it, style directives
        var nodeDefRe = new RegExp('^\\s*' + escaped + '[\\s\\[\\(\\{\\>"]');
        var edgeFromRe = new RegExp('\\b' + escaped + '\\s*(-->|---|-.->|==>)');
        var edgeToRe = new RegExp('(-->|---|-.->|==>)\\s*(\\|[^|]*\\|\\s*)?' + escaped + '\\b');
        var styleRe = new RegExp('^\\s*style\\s+' + escaped + '\\b');

        var result = lines.filter(function(line) {
            var t = line.trim();
            if (!t) return true;
            if (nodeDefRe.test(t)) return false;
            if (edgeFromRe.test(t)) return false;
            if (edgeToRe.test(t)) return false;
            if (styleRe.test(t)) return false;
            return true;
        });
        return result.join('\n');
    }

    /** Remove a specific edge line (from --> to) */
    function removeEdge(content, fromId, toId) {
        var lines = content.split('\n');
        var escFrom = fromId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var escTo = toId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('\\b' + escFrom + '\\s*(-->|---|-.->|==>)(\\s*\\|[^|]*\\|)?\\s*' + escTo + '\\b');
        var result = lines.filter(function(line) { return !re.test(line.trim()); });
        return result.join('\n');
    }

    /** Edit a node's label text */
    function editNodeText(content, nodeId, newText) {
        var lines = content.split('\n');
        var escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match patterns: ID["text"], ID[text], ID("text"), ID(text), ID{"text"}, etc
        var re = new RegExp('(' + escaped + '\\s*[\\[\\(\\{\\>]+\\"?)([^"\\]\\)\\}]*?)(\\"?[\\]\\)\\}]+)');
        for (var i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
                lines[i] = lines[i].replace(re, '$1' + newText + '$3');
                break;
            }
        }
        return lines.join('\n');
    }

    /** Extract current label text for a node */
    function getNodeText(content, nodeId) {
        var escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp(escaped + '\\s*[\\[\\(\\{\\>]+"?([^"\\]\\)\\}]*)"?[\\]\\)\\}]+');
        var m = content.match(re);
        return m ? m[1] : nodeId;
    }

    /** Duplicate a node with a new ID and "(copy)" appended to label */
    function duplicateNode(content, nodeId) {
        var newId = generateNodeId(content);
        var label = getNodeText(content, nodeId);
        return addNode(content, newId, label + ' (copy)');
    }

    /**
     * Find edge source and target from content.
     * If edgeId contains "-->", "---", "-.->", or "==>", it encodes from/to.
     * Otherwise returns all edges found in content (for iteration).
     */
    function findEdgeEndpoints(edgeId, content) {
        var lines = content.split('\n');
        var edgePatterns = [];
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].trim().match(/^(\S+)\s*(-->|---|-.->|==>)(\s*\|[^|]*\|)?\s*(\S+)/);
            if (m) {
                var from = m[1].replace(/[\["'\(\{].*$/, '');
                var to = m[4].replace(/[\["'\(\{].*$/, '');
                edgePatterns.push({ from: from, to: to, line: lines[i].trim() });
            }
        }
        // Filter by edgeId if it encodes a specific from-to pair (e.g., "A-B" or "L-A-B")
        if (edgeId) {
            var cleanId = edgeId.replace(/^L-/, '');
            var filtered = edgePatterns.filter(function(ep) {
                return cleanId === ep.from + '-' + ep.to || cleanId === ep.to + '-' + ep.from;
            });
            if (filtered.length > 0) return filtered;
        }
        return edgePatterns;
    }

    /** Get all node IDs from content */
    function getAllNodeIds(content) {
        var ids = new Set();
        var lines = content.split('\n');
        var reserved = ['subgraph', 'style', 'class', 'click', 'flowchart', 'graph', 'end'];
        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            // Node definitions: ID["text"] or ID[text] etc
            var defMatch = t.match(/^\s*([A-Za-z_]\w*)\s*[\[\(\{>]/);
            if (defMatch && reserved.indexOf(defMatch[1]) === -1) {
                ids.add(defMatch[1]);
            }
            // Nodes in edges
            var edgeMatch = t.match(/^\s*([A-Za-z_]\w*)\s*(-->|---|-.->|==>)/);
            if (edgeMatch) ids.add(edgeMatch[1]);
            var edgeTo = t.match(/(-->|---|-.->|==>)\s*(?:\|[^|]*\|\s*)?([A-Za-z_]\w*)/);
            if (edgeTo) ids.add(edgeTo[2]);
        }
        return Array.from(ids);
    }

    /** Generate a unique node ID */
    function generateNodeId(content) {
        var existing = getAllNodeIds(content);
        var i = 1;
        while (existing.indexOf('N' + i) !== -1) i++;
        return 'N' + i;
    }

    var editorState = {
        mode: null,         // null | 'addNode' | 'addEdge'
        edgeSource: null,   // node ID when in addEdge and source is selected
        pendingAction: null, // { type: 'connectFrom'|'connectTo', nodeId }
    };

    var editorHooks = {
        getEditor: function() { return document.getElementById('editor'); },
        getLastContent: function() { return window.lastContent || ''; },
        setLastContent: function(v) { window.lastContent = v; },
        saveFile: null,
        renderDiagram: null,
    };

    function setMode(mode) {
        editorState.mode = mode;
        editorState.edgeSource = null;
        document.body.classList.remove('mode-addNode', 'mode-addEdge');
        if (mode) document.body.classList.add('mode-' + mode);

        // Update button states
        var btnNode = document.getElementById('btnAddNode');
        var btnEdge = document.getElementById('btnAddEdge');
        if (btnNode) btnNode.classList.toggle('active', mode === 'addNode');
        if (btnEdge) btnEdge.classList.toggle('active', mode === 'addEdge');

        // Disable flag mode if entering edit mode
        if (mode && window.SmartCodeAnnotations) {
            var s = SmartCodeAnnotations.getState();
            if (s.flagMode) SmartCodeAnnotations.toggleFlagMode();
        }

        if (window.toast) {
            var msgs = {
                addNode: 'Node Mode -- click on empty space in the diagram',
                addEdge: 'Edge Mode -- click on the SOURCE node',
            };
            window.toast(msgs[mode] || 'Edit mode disabled');
        }
    }

    function toggleAddNode() { setMode(editorState.mode === 'addNode' ? null : 'addNode'); }
    function toggleAddEdge() { setMode(editorState.mode === 'addEdge' ? null : 'addEdge'); }

    function handleClick(e) {
        if (!editorState.mode) return;
        if (e.target.closest('.zoom-controls') || e.target.closest('.flag-popover') || e.target.closest('.editor-popover')) return;

        // Use DiagramDOM.extractNodeId instead of SmartCodeAnnotations.extractNodeId
        var nodeInfo = DiagramDOM.extractNodeId(e.target);

        if (editorState.mode === 'addNode') {
            if (nodeInfo) return; // Clicked an existing node, ignore
            e.preventDefault();
            e.stopPropagation();
            if (window.SmartCodeEditorPopovers) {
                SmartCodeEditorPopovers.showAddNodePopover(e.clientX, e.clientY);
            }
        }

        if (editorState.mode === 'addEdge') {
            if (!nodeInfo || nodeInfo.type === 'edge') return;
            e.preventDefault();
            e.stopPropagation();
            if (!editorState.edgeSource) {
                editorState.edgeSource = nodeInfo.id;
                DiagramDOM.highlightNode(nodeInfo.id, true);
                if (window.toast) window.toast('Source: ' + nodeInfo.id + ' -- now click the TARGET');
            } else {
                var from = editorState.edgeSource;
                var to = nodeInfo.id;
                if (from === to) return;
                if (window.SmartCodeEditorPopovers) {
                    SmartCodeEditorPopovers.showAddEdgePopover(e.clientX, e.clientY, from, to);
                }
            }
        }
    }

    function doRemoveNode(nodeId) {
        applyEdit(function(c) { return removeNode(c, nodeId); });
        if (window.SmartCodeAnnotations) {
            SmartCodeAnnotations.getState().flags.delete(nodeId);
            SmartCodeAnnotations.renderPanel();
            SmartCodeAnnotations.updateBadge();
        }
    }

    function doRemoveEdge(fromId, toId) {
        applyEdit(function(c) { return removeEdge(c, fromId, toId); });
    }

    function doEditNodeText(nodeId) {
        var editor = editorHooks.getEditor();
        var currentText = getNodeText(editor.value, nodeId);
        SmartCodeModal.prompt({
            title: 'Edit Node: ' + nodeId,
            placeholder: 'Node text',
            defaultValue: currentText,
            onConfirm: function(newText) {
                if (newText === currentText) return;
                applyEdit(function(c) { return editNodeText(c, nodeId, newText); });
            },
        });
    }

    function startConnectFrom(nodeId) {
        if (window.SmartCodeAnnotations) SmartCodeAnnotations.closePopover();
        setMode('addEdge');
        editorState.edgeSource = nodeId;
        DiagramDOM.highlightNode(nodeId, true);
        if (window.toast) window.toast('Source: ' + nodeId + ' -- click the TARGET');
    }

    /** Undo the last edit via SmartCodeCommandHistory */
    async function undo() {
        if (!window.SmartCodeCommandHistory || !SmartCodeCommandHistory.canUndo()) {
            if (window.toast) window.toast('Nothing to undo');
            return;
        }
        var content = SmartCodeCommandHistory.undo();
        var editor = editorHooks.getEditor();
        if (!editor || content === null) return;
        editor.value = content;
        editorHooks.setLastContent(content);
        if (editorHooks.saveFile) await editorHooks.saveFile();
        if (editorHooks.renderDiagram) await editorHooks.renderDiagram(content);
        if (window.toast) window.toast('Undone (' + SmartCodeCommandHistory.getUndoCount() + ' remaining)');
    }

    /** Redo the last undone edit via SmartCodeCommandHistory */
    async function redo() {
        if (!window.SmartCodeCommandHistory || !SmartCodeCommandHistory.canRedo()) {
            if (window.toast) window.toast('Nothing to redo');
            return;
        }
        var content = SmartCodeCommandHistory.redo();
        var editor = editorHooks.getEditor();
        if (!editor || content === null) return;
        editor.value = content;
        editorHooks.setLastContent(content);
        if (editorHooks.saveFile) await editorHooks.saveFile();
        if (editorHooks.renderDiagram) await editorHooks.renderDiagram(content);
        if (window.toast) window.toast('Redone (' + SmartCodeCommandHistory.getRedoCount() + ' remaining)');
    }

    async function applyEdit(editFn) {
        var editor = editorHooks.getEditor();
        if (!editor) return;

        // Capture BEFORE state for command history
        var beforeContent = editor.value;

        // Strip annotations, apply edit, re-inject annotations
        var annotations = window.SmartCodeAnnotations;
        var content = editor.value;
        var flags = new Map();
        if (annotations) {
            flags = annotations.getState().flags;
            content = annotations.stripAnnotations(content);
        }
        content = editFn(content);
        if (annotations) content = annotations.injectAnnotations(content, flags);
        editor.value = content;
        editorHooks.setLastContent(content);

        // Push command to history AFTER edit is applied
        if (window.SmartCodeCommandHistory) {
            SmartCodeCommandHistory.execute({
                before: beforeContent,
                after: content,
                description: 'edit',
            });
        }

        if (editorHooks.saveFile) await editorHooks.saveFile();
        if (editorHooks.renderDiagram) await editorHooks.renderDiagram(content);

        // Emit diagram:edited event via event bus
        if (window.SmartCodeEventBus) {
            SmartCodeEventBus.emit('diagram:edited', { source: 'diagram-editor' });
        }
    }

    function init(options) {
        if (options) Object.assign(editorHooks, options);
        var container = document.getElementById('preview-container');
        if (container) container.addEventListener('click', handleClick);

        // Subscribe to event bus: re-init after diagram render if needed
        if (window.SmartCodeEventBus) {
            SmartCodeEventBus.on('diagram:rendered', function() {
                // Clear edge source highlight after re-render (SVG is replaced)
                editorState.edgeSource = null;
            });
        }
    }

    window.MmdEditor = {
        init: init, setMode: setMode, undo: undo, redo: redo,
        toggleAddNode: toggleAddNode, toggleAddEdge: toggleAddEdge,
        addNode: addNode, addEdge: addEdge, removeNode: removeNode,
        removeEdge: removeEdge, editNodeText: editNodeText, getNodeText: getNodeText,
        getAllNodeIds: getAllNodeIds, generateNodeId: generateNodeId,
        findEdgeEndpoints: findEdgeEndpoints, duplicateNode: duplicateNode,
        doRemoveNode: doRemoveNode, doRemoveEdge: doRemoveEdge,
        doEditNodeText: doEditNodeText, startConnectFrom: startConnectFrom,
        applyEdit: applyEdit,
        getState: function() { return editorState; },
        closeEditorPopover: function() { if (window.SmartCodeEditorPopovers) SmartCodeEditorPopovers.closePopover(); },
    };
})();
