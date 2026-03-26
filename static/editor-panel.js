/**
 * SmartCode Editor Panel -- editor textarea events, panel toggles, resize handle.
 * Extracted from live.html (Phase 9 Plan 03).
 *
 * Dependencies: renderer.js (render), pan-zoom.js (zoomFit)
 * Dependents: app-init.js
 *
 * Usage:
 *   SmartCodeEditorPanel.isAutoSync();
 *   SmartCodeEditorPanel.setAutoSync(v);
 *   SmartCodeEditorPanel.toggleEditor();
 *   SmartCodeEditorPanel.toggleSidebar();
 */
(function() {
    'use strict';

    // ── State ──
    var autoSync = true;
    var debounceTimer = null;

    // Keep window.autoSync in sync for cross-module access
    window.autoSync = autoSync;

    // ── Editor textarea events ──
    var editor = document.getElementById('editor');

    editor.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() { render(editor.value); }, 500);
    });

    editor.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            var start = editor.selectionStart;
            editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(editor.selectionEnd);
            editor.selectionStart = editor.selectionEnd = start + 4;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            render(editor.value);
        }
    });

    // ── Auto-sync toggle ──
    var syncBtn = document.getElementById('toggleAutoSync');

    function updateSyncUI() {
        syncBtn.classList.toggle('active', autoSync);
        syncBtn.textContent = autoSync ? 'Auto-Sync ON' : 'Auto-Sync OFF';
    }

    syncBtn.addEventListener('click', function() {
        autoSync = !autoSync;
        window.autoSync = autoSync;
        updateSyncUI();
    });
    updateSyncUI();

    // ── Toggle panels ──
    function toggleEditor() {
        var panel = document.getElementById('editorPanel');
        var handle = document.getElementById('resizeHandle');
        panel.classList.toggle('hidden');
        handle.style.display = panel.classList.contains('hidden') ? 'none' : '';
        setTimeout(zoomFit, 100);
    }

    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('hidden');
        setTimeout(zoomFit, 100);
    }

    document.getElementById('toggleEditor').addEventListener('click', toggleEditor);
    document.getElementById('toggleSidebar').addEventListener('click', toggleSidebar);

    // ── Resize handle ──
    var resizeHandle = document.getElementById('resizeHandle');
    var isResizing = false;

    resizeHandle.addEventListener('mousedown', function(e) {
        isResizing = true;
        resizeHandle.classList.add('active');
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', function() {
            isResizing = false;
            resizeHandle.classList.remove('active');
            document.removeEventListener('mousemove', onResize);
        }, { once: true });
    });

    function onResize(e) {
        if (!isResizing) return;
        var sidebar = document.getElementById('sidebar');
        var sidebarWidth = sidebar.classList.contains('hidden') ? 0 : sidebar.offsetWidth;
        var newWidth = e.clientX - sidebarWidth;
        document.getElementById('editorPanel').style.width = Math.max(200, Math.min(newWidth, window.innerWidth * 0.7)) + 'px';
    }

    // ── Public API ──
    window.SmartCodeEditorPanel = {
        isAutoSync: function() { return autoSync; },
        setAutoSync: function(v) { autoSync = v; window.autoSync = v; updateSyncUI(); },
        toggleEditor: toggleEditor,
        toggleSidebar: toggleSidebar,
    };
})();
