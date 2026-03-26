/**
 * SmartCode MCP Sessions -- sidebar view showing AI sessions and their diagrams.
 * Fetches data from GET /api/mcp-sessions and renders grouped by session.
 * Supports renaming sessions via PATCH /api/mcp-sessions/:id.
 *
 * Dependencies: file-tree.js (SmartCodeFileTree), renderer.js (SmartCodeRenderer), modal.js (SmartCodeModal)
 *
 * Note: innerHTML usage is safe here -- all dynamic values pass through
 * SmartCodeRenderer.escapeHtml() before interpolation, preventing XSS.
 * This follows the same pattern established in file-tree.js.
 */
(function() {
    'use strict';

    var viewMode = 'files'; // 'files' | 'sessions'
    var sessionsData = [];

    function bUrl(path) { return (window.SmartCodeBaseUrl || '') + path; }

    function escapeHtml(str) {
        return SmartCodeRenderer.escapeHtml(str);
    }

    function prettyName(fname) {
        var base = fname.includes('/') ? fname.split('/').pop() : fname;
        return base.replace('.mmd', '').replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }

    function timeAgo(ts) {
        var diff = Date.now() - ts;
        var secs = Math.floor(diff / 1000);
        if (secs < 60) return secs + 's ago';
        var mins = Math.floor(secs / 60);
        if (mins < 60) return mins + 'min ago';
        var hours = Math.floor(mins / 60);
        if (hours < 24) return hours + 'h ago';
        return Math.floor(hours / 24) + 'd ago';
    }

    // ── Fetch sessions from API ──

    function fetchSessions() {
        return fetch(bUrl('/api/mcp-sessions'))
            .then(function(r) { return r.ok ? r.json() : { sessions: [] }; })
            .then(function(data) {
                sessionsData = data.sessions || [];
                if (viewMode === 'sessions') renderSessionsView();
                return sessionsData;
            })
            .catch(function() {
                sessionsData = [];
                if (viewMode === 'sessions') renderSessionsView();
                return [];
            });
    }

    // ── Rename session via API ──

    function renameSession(sessionId, newLabel) {
        return fetch(bUrl('/api/mcp-sessions/' + encodeURIComponent(sessionId)), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: newLabel }),
        })
            .then(function(r) { return r.json(); })
            .then(function() { return fetchSessions(); });
    }

    // ── Render sessions view ──
    // Safe: all dynamic values are escaped via escapeHtml before interpolation (same as file-tree.js)

    function renderSessionsView() {
        var container = document.getElementById('fileTree');
        if (!container) return;

        if (sessionsData.length === 0) {
            container.innerHTML =
                '<div class="mcp-sessions-empty">' +
                    '<div class="mcp-sessions-empty-icon">' + (window.SmartCodeIcons ? SmartCodeIcons.eye : '') + '</div>' +
                    '<div>No active AI sessions</div>' +
                    '<div style="font-size:11px;margin-top:4px;color:var(--text-tertiary)">Start an MCP session with Claude to see diagrams grouped here</div>' +
                '</div>';
            return;
        }

        // Sort sessions by startedAt desc (most recent first)
        var sorted = sessionsData.slice().sort(function(a, b) { return b.startedAt - a.startedAt; });

        var html = '';
        sorted.forEach(function(session) {
            var shortId = session.sessionId.substring(0, 8);
            var ago = timeAgo(session.startedAt);
            var diagrams = session.diagrams || [];

            html += '<div class="mcp-session-card">';
            html += '<div class="mcp-session-header">';
            html += '<span class="mcp-session-dot active"></span>';
            html += '<span class="mcp-session-label">' + escapeHtml(session.label || 'Session ' + shortId) + '</span>';
            html += '<button class="mcp-session-rename-btn" data-action="rename-session" data-session-id="' + escapeHtml(session.sessionId) + '" data-current-label="' + escapeHtml(session.label || '') + '" title="Rename session">';
            html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
            html += '</button>';
            html += '<span class="mcp-session-time">' + escapeHtml(ago) + '</span>';
            html += '</div>';

            if (diagrams.length === 0) {
                html += '<div class="mcp-session-nofiles">No diagrams yet</div>';
            } else {
                diagrams.forEach(function(d) {
                    var isCurrentFile = d.filePath === (window.SmartCodeFileTree ? SmartCodeFileTree.getCurrentFile() : '');
                    html += '<div class="mcp-session-file ' + (isCurrentFile ? 'active' : '') + '" data-action="load-session-file" data-path="' + escapeHtml(d.filePath) + '">';
                    html += '<span class="mcp-session-file-icon">' + (window.SmartCodeIcons ? SmartCodeIcons.file : '') + '</span>';
                    html += '<span class="mcp-session-file-name">' + escapeHtml(prettyName(d.filePath)) + '</span>';
                    html += '</div>';
                });
            }
            html += '</div>';
        });

        // Safe: all dynamic values pass through escapeHtml() above
        container.innerHTML = html;
    }

    // ── View mode switching ──

    function setViewMode(mode) {
        viewMode = mode;

        // Update tab styling
        var tabFiles = document.getElementById('tabFiles');
        var tabSessions = document.getElementById('tabSessions');
        if (tabFiles) tabFiles.classList.toggle('active', mode === 'files');
        if (tabSessions) tabSessions.classList.toggle('active', mode === 'sessions');

        if (mode === 'sessions') {
            fetchSessions();
        } else {
            SmartCodeFileTree.refreshFileList();
        }
    }

    function getViewMode() { return viewMode; }

    // ── Event delegation ──

    function handleClick(e) {
        // Rename session
        var renameBtn = e.target.closest('[data-action="rename-session"]');
        if (renameBtn) {
            e.stopPropagation();
            var sessionId = renameBtn.getAttribute('data-session-id');
            var currentLabel = renameBtn.getAttribute('data-current-label');
            if (window.SmartCodeModal) {
                SmartCodeModal.prompt({
                    title: 'Rename Session',
                    placeholder: 'Session name',
                    defaultValue: currentLabel || '',
                    onConfirm: function(val) {
                        renameSession(sessionId, val);
                    },
                });
            }
            return;
        }

        // Load session file
        var target = e.target.closest('[data-action="load-session-file"]');
        if (!target) return;
        var path = target.getAttribute('data-path');
        if (path && window.SmartCodeFileTree) {
            SmartCodeFileTree.loadFile(path);
            // Re-render to update active state
            if (viewMode === 'sessions') {
                setTimeout(renderSessionsView, 50);
            }
        }
    }

    // ── Init ──

    function init() {
        var container = document.getElementById('fileTree');
        if (container) {
            container.addEventListener('click', handleClick);
        }
    }

    function refresh() {
        if (viewMode === 'sessions') {
            fetchSessions();
        }
    }

    // ── Public API ──
    window.SmartCodeMcpSessions = {
        init: init,
        refresh: refresh,
        fetchSessions: fetchSessions,
        setViewMode: setViewMode,
        getViewMode: getViewMode,
        renderSessionsView: renderSessionsView,
    };
})();
