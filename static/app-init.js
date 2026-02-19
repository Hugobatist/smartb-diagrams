/**
 * SmartCode App Init -- bootstrap, WebSocket, keyboard shortcuts, module init.
 * Last script loaded -- wires everything together.
 */
(function() {
    'use strict';

    // ── CSS Token Reader ──
    function getToken(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    window.getToken = getToken;

    // ── Renderer type from query params ──
    var params = new URLSearchParams(window.location.search);
    var paramRenderer = params.get('renderer'); // null if not set
    var effectiveRendererType = paramRenderer || 'mermaid'; // updated dynamically

    // ── Auto-select renderer based on diagram type ──
    function selectRendererType(diagramType) {
        if (paramRenderer) return paramRenderer;
        if (diagramType === 'flowchart' || diagramType === 'graph') return 'custom';
        return 'mermaid';
    }

    // ── Dynamic renderer indicator in status bar ──
    function updateRendererIndicator() {
        var existing = document.querySelector('.renderer-indicator');
        if (existing) existing.remove();
        if (effectiveRendererType === 'custom') {
            var indicator = document.createElement('span');
            indicator.className = 'renderer-indicator';
            indicator.style.cssText = 'font-size:10px;color:#3b82f6;margin-left:8px;font-weight:600;';
            indicator.textContent = 'CUSTOM';
            var statusEl = document.querySelector('.topbar .status');
            if (statusEl) statusEl.appendChild(indicator);
        }
    }

    // ── Detect diagram type from mermaid source ──
    function detectDiagramType(text) {
        if (!text) return null;
        var first = text.trim().split(/\s/)[0].toLowerCase();
        if (first === 'flowchart' || first === 'graph') return first;
        return first;
    }

    // ── Render with type (custom or mermaid) ──
    async function renderWithType(text) {
        var diagramType = detectDiagramType(text);
        if (diagramType) {
            effectiveRendererType = selectRendererType(diagramType);
            updateRendererIndicator();
        }

        if (effectiveRendererType === 'custom') {
            try {
                var currentFile = SmartCodeFileTree.getCurrentFile();
                await SmartCodeCustomRenderer.fetchAndRender(currentFile);
            } catch (e) {
                console.warn('Custom renderer failed, falling back to Mermaid:', e.message);
                await SmartCodeRenderer.render(text);
            }
        } else {
            await SmartCodeRenderer.render(text);
        }
    }

    window.render = renderWithType;

    // ── Toast ──
    function toast(msg) {
        var el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(function() { el.classList.remove('show'); }, 2000);
    }

    // ── Help ──
    function showHelp() {
        document.getElementById('helpOverlay').classList.toggle('show');
    }

    // ── Typing context detection (QUAL-02) ──
    // Returns true when the active element is an input field, textarea, select,
    // or contenteditable -- single-key shortcuts must not fire in these contexts.
    function isTypingContext(target) {
        if (!target) return false;
        var tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (target.isContentEditable) return true;
        return false;
    }

    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', function(e) {
        var target = e.target;
        var editor = document.getElementById('editor');
        if (target === editor) return;

        // Modifier shortcuts (Ctrl/Cmd+key) always work, even in typing contexts
        var hasModifier = e.ctrlKey || e.metaKey;

        // Escape always works (close overlays, exit modes)
        if (e.key === 'Escape') {
            SmartCodeAnnotations.closePopover(); MmdEditor.closeEditorPopover(); MmdEditor.setMode(null); SmartCodeSearch.close();
            if (window.SmartCodeSelection) SmartCodeSelection.deselectAll();
            if (window.SmartCodeContextMenu) SmartCodeContextMenu.close();
            if (window.SmartCodeInlineEdit) SmartCodeInlineEdit.cancel();
            if (window.SmartCodeInteraction && SmartCodeInteraction.getState() !== 'idle') {
                SmartCodeInteraction.forceState('idle');
            }
            return;
        }

        // Block single-key shortcuts when typing in inputs/textareas/contenteditable
        var typing = isTypingContext(target);

        // Modifier shortcuts work regardless of typing context
        if (e.key === 'f' && hasModifier) { e.preventDefault(); SmartCodeSearch.open(); return; }
        if ((e.key === 'z' || e.key === 'Z') && hasModifier && e.shiftKey) { e.preventDefault(); MmdEditor.redo(); return; }
        if (e.key === 'y' && hasModifier) { e.preventDefault(); MmdEditor.redo(); return; }
        if (e.key === 'z' && hasModifier && !e.shiftKey) { e.preventDefault(); MmdEditor.undo(); return; }
        if (e.key === 'e' && hasModifier) {
            e.preventDefault();
            document.getElementById('toggleEditor').click();
            return;
        }
        if (e.key === 'b' && hasModifier) {
            e.preventDefault();
            document.getElementById('toggleSidebar').click();
            return;
        }
        if ((e.key === '=' || e.key === '+') && hasModifier) { e.preventDefault(); zoomIn(); return; }
        if (e.key === '-' && hasModifier) { e.preventDefault(); zoomOut(); return; }
        if (e.key === '0' && hasModifier) { e.preventDefault(); zoomFit(); return; }
        if (e.key === 'c' && hasModifier && !e.shiftKey) {
            if (window.SmartCodeClipboard && SmartCodeClipboard.copy()) {
                e.preventDefault();
                if (window.toast) toast('Node copied');
            }
            return;
        }
        if (e.key === 'v' && hasModifier && !e.shiftKey) {
            if (window.SmartCodeClipboard && SmartCodeClipboard.hasContent()) {
                e.preventDefault();
                SmartCodeClipboard.paste();
                if (window.toast) toast('Node pasted');
            }
            return;
        }
        if (e.key === 'd' && hasModifier) {
            e.preventDefault();
            if (window.SmartCodeClipboard && SmartCodeClipboard.duplicate()) {
                if (window.toast) toast('Node duplicated');
            }
            return;
        }

        // Everything below is single-key shortcuts -- block when typing
        if (typing) return;

        if (target.closest('.flag-popover')) return;
        if (target.closest('.search-bar')) return;

        if (e.key === 'f') {
            if (window.SmartCodeInteraction && SmartCodeInteraction.isBlocking()) return;
            SmartCodeAnnotations.toggleFlagMode();
            if (window.SmartCodeInteraction) SmartCodeInteraction.forceState(SmartCodeAnnotations.getState().flagMode ? 'flagging' : 'idle');
            return;
        }
        if (e.key === 'n') {
            if (window.SmartCodeInteraction && SmartCodeInteraction.isBlocking()) return;
            MmdEditor.toggleAddNode();
            if (window.SmartCodeInteraction) SmartCodeInteraction.forceState(MmdEditor.getState().mode === 'addNode' ? 'add-node' : 'idle');
            return;
        }
        if (e.key === 'a') {
            if (window.SmartCodeInteraction && SmartCodeInteraction.isBlocking()) return;
            MmdEditor.toggleAddEdge();
            if (window.SmartCodeInteraction) SmartCodeInteraction.forceState(MmdEditor.getState().mode === 'addEdge' ? 'add-edge' : 'idle');
            return;
        }
        if (e.key === '?') { showHelp(); return; }
        if (e.key === ' ' && window.SmartCodeSessionPlayer && SmartCodeSessionPlayer.isVisible()) {
            e.preventDefault();
            SmartCodeSessionPlayer.isPlaying() ? SmartCodeSessionPlayer.pause() : SmartCodeSessionPlayer.play();
            return;
        }
        if (e.key === 'ArrowLeft' && window.SmartCodeSessionPlayer && SmartCodeSessionPlayer.isVisible()) {
            e.preventDefault(); SmartCodeSessionPlayer.seekTo(SmartCodeSessionPlayer.getIndex() - 1); return;
        }
        if (e.key === 'ArrowRight' && window.SmartCodeSessionPlayer && SmartCodeSessionPlayer.isVisible()) {
            e.preventDefault(); SmartCodeSessionPlayer.seekTo(SmartCodeSessionPlayer.getIndex() + 1); return;
        }
        if (e.key === 'g' && !e.altKey) {
            if (window.SmartCodeGhostPaths) SmartCodeGhostPaths.toggle();
            return;
        }
        if (e.key === 'h' && !e.altKey) {
            if (window.SmartCodeHeatmap) SmartCodeHeatmap.toggle();
            return;
        }
        if (e.key === 'b' && !e.altKey) {
            if (window.SmartCodeBreakpoints && window.SmartCodeSelection) {
                var sel = SmartCodeSelection.getSelected();
                if (sel && sel.type === 'node') {
                    SmartCodeBreakpoints.toggleBreakpoint(sel.id);
                }
            }
            return;
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveCurrentFile();
        }
    });

    // ── Init Hooks for annotations, editor, search, collapse ──
    var _initHooks = {
        getEditor: function() { return document.getElementById('editor'); },
        getCurrentFile: function() { return SmartCodeFileTree.getCurrentFile(); },
        getLastContent: function() { return SmartCodeFileTree.getLastContent(); },
        setLastContent: function(v) { SmartCodeFileTree.setLastContent(v); },
        saveFile: function() { SmartCodeFileTree.saveCurrentFile(); },
        renderDiagram: renderWithType,
        getPan: function() { return SmartCodePanZoom.getPan(); },
        setPan: function(px, py) { SmartCodePanZoom.setPan(px, py); },
    };

    // ── Set sidebar action button icons (safe: SmartCodeIcons are static SVG strings) ──
    var _nf = document.getElementById('btnNewFolder');
    if (_nf) _nf.innerHTML = SmartCodeIcons.folder;
    var _nd = document.getElementById('btnNewFile');
    if (_nd) _nd.innerHTML = SmartCodeIcons.file;
    var _sv = document.getElementById('btnSaveFile');
    if (_sv) _sv.innerHTML = SmartCodeIcons.save;

    // ── Inject toolbar icons from data-icon attributes ──
    // Safe: SmartCodeIcons contains only static SVG strings from icons.js (trusted source)
    document.querySelectorAll('.toolbar-icon[data-icon]').forEach(function(span) {
        var iconName = span.getAttribute('data-icon');
        if (iconName && SmartCodeIcons[iconName]) {
            span.innerHTML = SmartCodeIcons[iconName];
        }
    });

    SmartCodeAnnotations.init(_initHooks);
    MmdEditor.init(_initHooks);
    SmartCodeSearch.init(_initHooks);

    // ── Init Phase 13: Canvas Interaction Modules ──
    if (window.SmartCodeSelection) SmartCodeSelection.init();
    if (window.SmartCodeNodeDrag) SmartCodeNodeDrag.init();
    if (window.SmartCodeContextMenu) SmartCodeContextMenu.init();
    if (window.SmartCodeInlineEdit) SmartCodeInlineEdit.init();

    // ── Init Phase 15: Breakpoints & Ghost Paths ──
    if (window.SmartCodeBreakpoints) SmartCodeBreakpoints.init();
    if (window.SmartCodeGhostPaths) SmartCodeGhostPaths.init();

    // ── Init Phase 16: Heatmap & Session Player ──
    if (window.SmartCodeHeatmap) SmartCodeHeatmap.init();
    if (window.SmartCodeInteractionTracker) SmartCodeInteractionTracker.init();
    if (window.SmartCodeSessionPlayer) SmartCodeSessionPlayer.init();

    // ── Init MCP Sessions view ──
    if (window.SmartCodeMcpSessions) SmartCodeMcpSessions.init();

    // ── Init Collapse UI ──
    if (window.SmartCodeCollapseUI) {
        SmartCodeCollapseUI.init({
            onToggle: async function(collapsedIds) {
                try {
                    var toggleParams = new URLSearchParams();
                    if (collapsedIds.length > 0) {
                        toggleParams.set('collapsed', JSON.stringify(collapsedIds));
                    }
                    var currentFile = SmartCodeFileTree.getCurrentFile();
                    var url = baseUrl('/api/diagrams/' + encodeURIComponent(currentFile) + '?' + toggleParams.toString());
                    var resp = await fetch(url);
                    if (!resp.ok) return;
                    var data = await resp.json();
                    if (data.collapse) {
                        SmartCodeCollapseUI.setConfig(data.collapse.config);
                        SmartCodeCollapseUI.setAutoCollapsed(data.collapse.autoCollapsed || []);
                    }
                    if (data.mermaidContent) {
                        await renderWithType(data.mermaidContent);
                    }
                } catch (e) { console.warn('[SmartCode] Collapse toggle error:', e); }
            }
        });

        SmartCodeCollapseUI.initFocusMode({
            onFocusChange: async function(event) {
                try {
                    var currentFile = SmartCodeFileTree.getCurrentFile();
                    if (event.action === 'focus') {
                        var focusParams = new URLSearchParams({ focus: event.nodeId });
                        var collapsed = SmartCodeCollapseUI.getCollapsed();
                        if (collapsed.length > 0) {
                            focusParams.set('collapsed', JSON.stringify(collapsed));
                        }
                        var resp = await fetch(baseUrl('/api/diagrams/' + encodeURIComponent(currentFile) + '?' + focusParams.toString()));
                        if (!resp.ok) return;
                        var data = await resp.json();
                        if (data.collapse) {
                            SmartCodeCollapseUI.setBreadcrumbs(data.collapse.breadcrumbs, data.collapse.focusedSubgraph);
                            SmartCodeCollapseUI.setAutoCollapsed(data.collapse.autoCollapsed || []);
                            if (data.collapse.manualCollapsed) {
                                SmartCodeCollapseUI.setCollapsed(data.collapse.manualCollapsed);
                            }
                        }
                        if (data.mermaidContent) {
                            await renderWithType(data.mermaidContent);
                            document.getElementById('preview').classList.add('diagram-focus-mode');
                        }
                    } else if (event.action === 'navigate') {
                        var navParams = new URLSearchParams({ breadcrumb: event.breadcrumbId });
                        var navResp = await fetch(baseUrl('/api/diagrams/' + encodeURIComponent(currentFile) + '?' + navParams.toString()));
                        if (!navResp.ok) return;
                        var navData = await navResp.json();
                        if (navData.collapse) {
                            SmartCodeCollapseUI.setBreadcrumbs(navData.collapse.breadcrumbs, navData.collapse.focusedSubgraph);
                            SmartCodeCollapseUI.setAutoCollapsed(navData.collapse.autoCollapsed || []);
                        }
                        if (navData.mermaidContent) {
                            await renderWithType(navData.mermaidContent);
                        }
                    } else if (event.action === 'exit') {
                        var exitResp = await fetch(baseUrl('/api/diagrams/' + encodeURIComponent(currentFile)));
                        if (!exitResp.ok) return;
                        var exitData = await exitResp.json();
                        SmartCodeCollapseUI.setBreadcrumbs([], null);
                        SmartCodeCollapseUI.setAutoCollapsed(exitData.collapse ? exitData.collapse.autoCollapsed || [] : []);
                        if (exitData.mermaidContent) {
                            await renderWithType(exitData.mermaidContent);
                            document.getElementById('preview').classList.remove('diagram-focus-mode');
                        }
                    }
                } catch (e) { console.warn('[SmartCode] Focus mode error:', e); }
            }
        });
    }

    // ── Helper: resolve URL with workspace base ──
    function baseUrl(path) {
        return (window.SmartCodeBaseUrl || '') + path;
    }
    window.SmartCodeUrl = baseUrl;

    // ── WebSocket context for ws-handler ──
    var wsCtx = {
        getRendererType: function() { return effectiveRendererType; },
        setRendererType: function(type) { effectiveRendererType = type; },
        selectRendererType: selectRendererType,
        updateRendererIndicator: updateRendererIndicator,
        renderWithType: renderWithType,
    };

    function buildWsUrl(baseUrlStr) {
        var wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        if (baseUrlStr) {
            var host = baseUrlStr.replace(/^https?:\/\//, '');
            return wsProtocol + '//' + host + '/ws';
        }
        return wsProtocol + '//' + location.host + '/ws';
    }

    // ── Active WS connection ──
    var activeWs = null;

    function reconnectWebSocket(newBaseUrl) {
        if (activeWs) activeWs.close();
        var wsUrl = buildWsUrl(newBaseUrl);
        activeWs = createReconnectingWebSocket(wsUrl,
            function(msg) { SmartCodeWsHandler.handleMessage(msg, wsCtx); },
            function(status) { SmartCodeWsHandler.handleStatus(status); }
        );
    }

    window.SmartCodeWsReconnect = reconnectWebSocket;

    // ── Bootstrap: load initial file, connect WebSocket ──
    (async function() {
        var hint = document.getElementById('fitHint');
        hint.classList.add('show');
        setTimeout(function() { hint.classList.remove('show'); }, 4000);

        var currentFile = SmartCodeFileTree.getCurrentFile();
        var editor = document.getElementById('editor');

        try {
            var resp = await fetch(baseUrl('/' + currentFile));
            if (resp.ok) {
                var text = await resp.text();
                editor.value = text;
                SmartCodeFileTree.setLastContent(text);
                await renderWithType(text);
            }
        } catch (e) { console.warn('[SmartCode] Initial file load error:', e); }

        if (!SmartCodeFileTree.getLastContent() && editor.value.trim()) {
            await renderWithType(editor.value);
        }

        if (currentFile) {
            try {
                var apiResp = await fetch(baseUrl('/api/diagrams/' + encodeURIComponent(currentFile)));
                if (apiResp.ok) {
                    var data = await apiResp.json();
                    if (data.validation && data.validation.diagramType) {
                        effectiveRendererType = selectRendererType(data.validation.diagramType);
                        if (effectiveRendererType === 'custom') {
                            await SmartCodeCustomRenderer.fetchAndRender(currentFile);
                        }
                        updateRendererIndicator();
                    }
                    if (window.SmartCodeCollapseUI && data.collapse) {
                        SmartCodeCollapseUI.setConfig(data.collapse.config);
                        if (data.collapse.autoCollapsed && data.collapse.autoCollapsed.length > 0) {
                            SmartCodeCollapseUI.setAutoCollapsed(data.collapse.autoCollapsed);
                            if (data.mermaidContent) await renderWithType(data.mermaidContent);
                        }
                    }
                }
            } catch (e) { /* keep Mermaid as fallback */ }

            if (window.SmartCodeGhostPaths) {
                try {
                    var gpResp = await fetch(baseUrl('/api/ghost-paths/' + encodeURIComponent(currentFile)));
                    if (gpResp.ok) {
                        var gpData = await gpResp.json();
                        SmartCodeGhostPaths.updateGhostPaths(currentFile, gpData.ghostPaths || []);
                    }
                } catch (e) {}
            }

            if (window.SmartCodeHeatmap) {
                fetch(baseUrl('/api/heatmap/' + encodeURIComponent(currentFile)))
                    .then(function(r) { return r.ok ? r.json() : null; })
                    .then(function(data) { if (data) SmartCodeHeatmap.updateVisitCounts(data); })
                    .catch(function() {});
            }

            if (window.SmartCodeSessionPlayer) SmartCodeSessionPlayer.fetchSessionList(currentFile);
        }

        // WebSocket real-time sync
        var wsUrl = buildWsUrl(window.SmartCodeBaseUrl);
        activeWs = createReconnectingWebSocket(wsUrl,
            function(msg) { SmartCodeWsHandler.handleMessage(msg, wsCtx); },
            function(status) { SmartCodeWsHandler.handleStatus(status); }
        );

        updateRendererIndicator();
    })();

    SmartCodeFileTree.refreshFileList();

    var resizeTimer = null;
    window.addEventListener('resize', function() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() { zoomFit(); }, 150);
    });

    // ── Drag & Drop .mmd files ──
    document.addEventListener('dragover', function(e) { e.preventDefault(); });
    document.addEventListener('drop', async function(e) {
        e.preventDefault();
        var file = e.dataTransfer.files[0];
        if (!file || !file.name.endsWith('.mmd')) { toast('Only .mmd files'); return; }
        var text = await file.text();
        var editor = document.getElementById('editor');
        editor.value = text;
        SmartCodeFileTree.setLastContent(text);
        SmartCodeFileTree.setCurrentFile(file.name);
        document.getElementById('currentFileName').textContent = file.name;
        SmartCodeFileTree.refreshFileList();
        renderWithType(text);
    });

    // ── Public API ──
    window.SmartCodeApp = {
        toast: toast,
        showHelp: showHelp,
        get rendererType() { return effectiveRendererType; },
        getRendererType: function() { return effectiveRendererType; },
    };
    window.toast = toast;
    window.showHelp = showHelp;
})();
