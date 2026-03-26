/**
 * SmartCode Workspace Switcher -- dropdown to switch between multiple
 * SmartCode server instances running on different ports.
 *
 * Reads the workspace registry via GET /api/workspaces and renders
 * a dropdown in the topbar. When the user switches workspace, sets
 * window.SmartCodeBaseUrl and triggers WS reconnect + file tree reload.
 *
 * Dependencies: ws-client.js (createReconnectingWebSocket), file-tree.js
 * Loaded before app-init.js.
 */
(function() {
    'use strict';

    var POLL_INTERVAL = 10000; // 10s
    var LS_KEY = 'smartcode-workspace-selection';

    // ── State ──
    var workspaces = [];
    var currentWorkspace = null;  // { name, dir, port, pid }
    var pollTimer = null;

    // ── Global base URL: empty string = current server (relative URLs) ──
    window.SmartCodeBaseUrl = '';

    // ── Helpers ──

    function getLocalPort() {
        return parseInt(location.port, 10) || (location.protocol === 'https:' ? 443 : 80);
    }

    function loadSelection() {
        try {
            var stored = localStorage.getItem(LS_KEY);
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return null;
    }

    function saveSelection(ws) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ port: ws.port, dir: ws.dir }));
        } catch (e) {}
    }

    // ── Fetch workspace list ──

    function fetchWorkspaces() {
        // Always fetch from the server we're connected to (current origin)
        fetch('/api/workspaces')
            .then(function(resp) { return resp.ok ? resp.json() : []; })
            .then(function(data) {
                if (!Array.isArray(data)) return;
                workspaces = data;
                reconcileSelection();
                renderDropdown();
            })
            .catch(function() {
                // Server might be down; keep last known list
            });
    }

    function reconcileSelection() {
        var localPort = getLocalPort();

        // If no current workspace, default to the server we're connected to.
        // Don't auto-restore a different port from localStorage — the user
        // navigated to this port intentionally; cross-port restore causes
        // 404s because the file tree shows local files but requests go elsewhere.
        if (!currentWorkspace) {
            var local = workspaces.find(function(w) { return w.port === localPort; });
            if (local) {
                currentWorkspace = local;
                saveSelection(local);
                return;
            }
        }

        // Default: select the workspace running on this server's port
        if (!currentWorkspace) {
            currentWorkspace = workspaces.find(function(w) { return w.port === localPort; }) || workspaces[0] || null;
        }

        // Validate current selection still exists
        if (currentWorkspace) {
            var still = workspaces.find(function(w) { return w.port === currentWorkspace.port; });
            if (!still) {
                // Workspace disappeared; fall back to local
                currentWorkspace = workspaces.find(function(w) { return w.port === localPort; }) || workspaces[0] || null;
                if (currentWorkspace) applyBaseUrl(currentWorkspace);
            }
        }
    }

    // ── Apply base URL and trigger reconnection ──

    function applyBaseUrl(ws) {
        var localPort = getLocalPort();
        if (ws.port === localPort) {
            window.SmartCodeBaseUrl = '';
        } else {
            window.SmartCodeBaseUrl = 'http://localhost:' + ws.port;
        }
    }

    function switchWorkspace(ws) {
        if (currentWorkspace && currentWorkspace.port === ws.port) return;
        currentWorkspace = ws;
        saveSelection(ws);
        applyBaseUrl(ws);

        // Reconnect WebSocket to the new server
        if (window.SmartCodeWsReconnect) {
            window.SmartCodeWsReconnect(window.SmartCodeBaseUrl);
        }

        // Reload file tree from new server
        if (window.SmartCodeFileTree) {
            SmartCodeFileTree.refreshFileList();
        }

        renderDropdown();

        if (window.toast) toast('Workspace: ' + ws.name);
    }

    // ── Dropdown UI ──

    function renderDropdown() {
        var container = document.getElementById('workspaceSwitcher');
        if (!container) return;

        // No workspaces at all — hide
        if (workspaces.length === 0) {
            container.textContent = '';
            return;
        }

        container.textContent = '';
        var select = document.createElement('select');
        select.className = 'workspace-select';
        select.title = 'Switch workspace';

        for (var i = 0; i < workspaces.length; i++) {
            var ws = workspaces[i];
            var opt = document.createElement('option');
            opt.value = String(ws.port);
            opt.textContent = ws.name;
            if (currentWorkspace && ws.port === currentWorkspace.port) {
                opt.selected = true;
            }
            select.appendChild(opt);
        }

        select.addEventListener('change', function() {
            var port = parseInt(select.value, 10);
            var ws = workspaces.find(function(w) { return w.port === port; });
            if (ws) switchWorkspace(ws);
        });

        container.appendChild(select);
    }

    // ── Init ──

    function init() {
        fetchWorkspaces();
        pollTimer = setInterval(fetchWorkspaces, POLL_INTERVAL);

        // Pause polling when tab is hidden, resume when visible
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            } else {
                if (!pollTimer) {
                    fetchWorkspaces();
                    pollTimer = setInterval(fetchWorkspaces, POLL_INTERVAL);
                }
            }
        });
    }

    function destroy() {
        if (pollTimer) clearInterval(pollTimer);
    }

    // Start on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── Public API ──
    window.SmartCodeWorkspaceSwitcher = {
        init: init,
        destroy: destroy,
        getWorkspaces: function() { return workspaces; },
        getCurrent: function() { return currentWorkspace; },
        switchTo: switchWorkspace,
    };
})();
