/**
 * SmartCode WebSocket Handler -- Processes incoming WebSocket messages.
 * Extracted from app-init.js. Exposed as window.SmartCodeWsHandler.
 * Dependencies: file-tree.js, editor-panel.js, annotations.js,
 *               custom-renderer.js, breakpoints.js, ghost-paths.js,
 *               heatmap.js, session-player.js
 */
(function() {
    'use strict';

    /**
     * Handle incoming WebSocket messages.
     * @param {object} msg - Parsed WebSocket message
     * @param {object} ctx - Context object with:
     *   - getRendererType: function returning current renderer type
     *   - setRendererType: function(type) to update renderer type
     *   - selectRendererType: function(diagramType) to auto-select renderer
     *   - updateRendererIndicator: function to update UI indicator
     *   - renderWithType: async function(text) to render diagram
     */
    function handleMessage(msg, ctx) {
        switch (msg.type) {
            case 'graph:update':
                if (msg.file === SmartCodeFileTree.getCurrentFile()) {
                    ctx.setRendererType(ctx.selectRendererType(msg.graph.diagramType));
                    if (ctx.getRendererType() === 'custom') {
                        SmartCodeCustomRenderer.render(msg.graph).catch(function(e) {
                            console.warn('Custom renderer failed on graph:update, keeping current render:', e.message);
                        });
                    }
                    ctx.updateRendererIndicator();
                }
                break;
            case 'file:changed':
                if (!SmartCodeEditorPanel.isAutoSync()) return;
                if (msg.file === SmartCodeFileTree.getCurrentFile()) {
                    var wsText = msg.content;
                    if (wsText !== SmartCodeFileTree.getLastContent()) {
                        var finalText = wsText;
                        if (window.SmartCodeAnnotations && SmartCodeAnnotations.getState().flags.size > 0) {
                            finalText = SmartCodeAnnotations.mergeIncomingContent(wsText);
                        } else if (window.SmartCodeAnnotations) {
                            var incoming = SmartCodeAnnotations.parseAnnotations(wsText);
                            SmartCodeAnnotations.getState().flags = incoming.flags;
                            SmartCodeAnnotations.getState().statuses = incoming.statuses;
                            SmartCodeAnnotations.getState().breakpoints = incoming.breakpoints;
                            SmartCodeAnnotations.getState().risks = incoming.risks;
                            SmartCodeAnnotations.getState().ghosts = incoming.ghosts || [];
                            if (window.SmartCodeBreakpoints) SmartCodeBreakpoints.updateBreakpoints(incoming.breakpoints);
                            if (window.SmartCodeHeatmap) SmartCodeHeatmap.updateRisks(incoming.risks);
                            if (window.SmartCodeGhostPaths) SmartCodeGhostPaths.updateGhostPaths(msg.file, incoming.ghosts || []);
                            SmartCodeAnnotations.renderPanel();
                            SmartCodeAnnotations.updateBadge();
                        }
                        SmartCodeFileTree.setLastContent(finalText);
                        document.getElementById('editor').value = finalText;
                        if (ctx.getRendererType() !== 'custom') {
                            ctx.renderWithType(finalText);
                        }
                    }
                }
                break;
            case 'breakpoint:hit':
                if (window.SmartCodeBreakpoints) SmartCodeBreakpoints.showNotification(msg.nodeId);
                break;
            case 'breakpoint:continue':
                if (window.SmartCodeBreakpoints) SmartCodeBreakpoints.hideNotification();
                break;
            case 'ghost:update':
                if (window.SmartCodeGhostPaths) SmartCodeGhostPaths.updateGhostPaths(msg.file, msg.ghostPaths);
                break;
            case 'heatmap:update':
                if (window.SmartCodeHeatmap) {
                    // Check if this is a full refresh or incremental delta
                    // Small deltas (1-3 keys) from record_step or click tracking: merge
                    // Full refreshes (many keys) from file switch: replace
                    var dataKeys = msg.data ? Object.keys(msg.data) : [];
                    if (dataKeys.length <= 3) {
                        SmartCodeHeatmap.mergeVisitCounts(msg.data);
                    } else {
                        SmartCodeHeatmap.updateVisitCounts(msg.data);
                    }
                }
                break;
            case 'session:event':
                if (window.SmartCodeSessionPlayer) SmartCodeSessionPlayer.handleSessionEvent(msg.sessionId, msg.event);
                break;
            case 'mcp-session:updated':
                if (window.SmartCodeMcpSessions) SmartCodeMcpSessions.refresh();
                break;
            case 'file:added':
            case 'file:removed':
            case 'tree:updated':
                SmartCodeFileTree.refreshFileList();
                break;
        }
    }

    function handleStatus(status) {
        var dot = document.getElementById('statusDot');
        var statusText = document.getElementById('statusText');
        switch (status) {
            case 'connected':
                dot.className = 'status-dot';
                statusText.textContent = 'Local Server';
                statusText.title = 'Connected to SmartCode server via WebSocket.';
                break;
            case 'disconnected':
                dot.className = 'status-dot paused';
                statusText.textContent = 'Disconnected';
                statusText.title = 'No connection to SmartCode server. Run: smartcode serve';
                break;
            case 'reconnecting':
                dot.className = 'status-dot paused';
                statusText.textContent = 'Reconnecting...';
                statusText.title = 'Attempting to reconnect to SmartCode server...';
                break;
        }
    }

    window.SmartCodeWsHandler = {
        handleMessage: handleMessage,
        handleStatus: handleStatus,
    };
})();
