/**
 * SmartB Diagrams — Node Search (Ctrl+F)
 * Find and highlight matching nodes in the current SVG diagram.
 * Exposed as window.SmartBSearch
 */
(function () {
    'use strict';

    var state = {
        isOpen: false,
        query: '',
        matches: [],
        currentIndex: -1,
    };

    var hooks = {
        getEditor: function () { return document.getElementById('editor'); },
        getPan: function () { return { panX: 0, panY: 0, zoom: 1 }; },
        setPan: function () {},
    };

    var barEl = null;
    var inputEl = null;
    var countEl = null;
    var debounceId = null;

    // ── DOM-safe Search Bar Builder ──

    function buildSearchBar() {
        var bar = document.createElement('div');
        bar.className = 'search-bar';

        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Buscar nodo...';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');

        var count = document.createElement('span');
        count.className = 'match-count';
        count.textContent = '';

        var btnPrev = document.createElement('button');
        btnPrev.className = 'search-nav-btn';
        btnPrev.textContent = '\u25B2'; // up arrow
        btnPrev.title = 'Anterior (Shift+Enter)';
        btnPrev.addEventListener('click', function () { navigatePrev(); });

        var btnNext = document.createElement('button');
        btnNext.className = 'search-nav-btn';
        btnNext.textContent = '\u25BC'; // down arrow
        btnNext.title = 'Proximo (Enter)';
        btnNext.addEventListener('click', function () { navigateNext(); });

        var btnClose = document.createElement('button');
        btnClose.className = 'search-close-btn';
        btnClose.textContent = '\u2715'; // X
        btnClose.title = 'Fechar (Esc)';
        btnClose.addEventListener('click', function () { close(); });

        bar.appendChild(input);
        bar.appendChild(count);
        bar.appendChild(btnPrev);
        bar.appendChild(btnNext);
        bar.appendChild(btnClose);

        input.addEventListener('input', function () {
            clearTimeout(debounceId);
            var val = input.value;
            debounceId = setTimeout(function () { search(val); }, 150);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                navigatePrev();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                navigateNext();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        });

        barEl = bar;
        inputEl = input;
        countEl = count;

        return bar;
    }

    // ── Open / Close ──

    function open() {
        if (state.isOpen) {
            // Already open — just refocus
            if (inputEl) { inputEl.focus(); inputEl.select(); }
            return;
        }
        state.isOpen = true;

        var container = document.getElementById('preview-container');
        if (!container) return;

        if (!barEl) buildSearchBar();
        container.appendChild(barEl);
        inputEl.value = state.query || '';
        inputEl.focus();
        if (state.query) inputEl.select();
    }

    function close() {
        if (!state.isOpen) return;
        state.isOpen = false;
        state.query = '';
        state.matches = [];
        state.currentIndex = -1;

        clearHighlights();
        if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl);
    }

    // ── Search Logic ──

    function search(query) {
        state.query = query;
        state.matches = [];
        state.currentIndex = -1;
        clearHighlights();

        if (!query || !query.trim()) {
            updateCount();
            return;
        }

        var lowerQuery = query.toLowerCase();
        var svg = document.querySelector('#preview svg');
        if (!svg) { updateCount(); return; }

        // Find all nodeLabel elements (Mermaid flowchart labels)
        var labels = svg.querySelectorAll('.nodeLabel');
        var seen = new Set();

        for (var i = 0; i < labels.length; i++) {
            var label = labels[i];
            var text = (label.textContent || '').toLowerCase();
            if (text.indexOf(lowerQuery) === -1) continue;

            // Find the parent .node or .cluster group
            var parent = findMatchParent(label);
            if (!parent) continue;

            // Deduplicate by element reference
            var parentId = parent.getAttribute('id') || ('__match_' + i);
            if (seen.has(parentId)) continue;
            seen.add(parentId);

            state.matches.push(parent);
        }

        highlightMatches();
        updateCount();

        // Auto-navigate to first match
        if (state.matches.length > 0) {
            state.currentIndex = 0;
            setActiveMatch(0);
            scrollToMatch(0);
        }
    }

    function findMatchParent(el) {
        var current = el;
        while (current && current.tagName !== 'svg') {
            if (current.classList) {
                if (current.classList.contains('node') || current.classList.contains('cluster')) {
                    return current;
                }
            }
            current = current.parentElement;
        }
        return null;
    }

    // ── Highlighting ──

    function highlightMatches() {
        for (var i = 0; i < state.matches.length; i++) {
            state.matches[i].classList.add('search-match');
        }
    }

    function clearHighlights() {
        var svg = document.querySelector('#preview svg');
        if (!svg) return;
        var matched = svg.querySelectorAll('.search-match, .search-match-active');
        for (var i = 0; i < matched.length; i++) {
            matched[i].classList.remove('search-match', 'search-match-active');
        }
    }

    function setActiveMatch(index) {
        // Clear previous active
        var svg = document.querySelector('#preview svg');
        if (!svg) return;
        var prev = svg.querySelectorAll('.search-match-active');
        for (var i = 0; i < prev.length; i++) {
            prev[i].classList.remove('search-match-active');
        }
        // Set new active
        if (index >= 0 && index < state.matches.length) {
            state.matches[index].classList.add('search-match-active');
        }
    }

    // ── Navigation ──

    function navigateNext() {
        if (state.matches.length === 0) return;
        state.currentIndex = (state.currentIndex + 1) % state.matches.length;
        setActiveMatch(state.currentIndex);
        scrollToMatch(state.currentIndex);
        updateCount();
    }

    function navigatePrev() {
        if (state.matches.length === 0) return;
        state.currentIndex = (state.currentIndex - 1 + state.matches.length) % state.matches.length;
        setActiveMatch(state.currentIndex);
        scrollToMatch(state.currentIndex);
        updateCount();
    }

    // ── Pan to Match ──

    function scrollToMatch(index) {
        if (index < 0 || index >= state.matches.length) return;
        var matchEl = state.matches[index];
        if (!matchEl) return;

        var container = document.getElementById('preview-container');
        if (!container) return;

        var panState = hooks.getPan();
        var currentZoom = panState.zoom;

        // Get the match element's bounding rect
        var matchRect = matchEl.getBoundingClientRect();
        var containerRect = container.getBoundingClientRect();

        // Calculate the center of the match element relative to the container
        var matchCenterX = matchRect.left + matchRect.width / 2 - containerRect.left;
        var matchCenterY = matchRect.top + matchRect.height / 2 - containerRect.top;

        // Calculate new pan to center the match in the container
        var containerCenterX = containerRect.width / 2;
        var containerCenterY = containerRect.height / 2;

        var newPanX = panState.panX + (containerCenterX - matchCenterX);
        var newPanY = panState.panY + (containerCenterY - matchCenterY);

        hooks.setPan(newPanX, newPanY);
    }

    // ── Count Display ──

    function updateCount() {
        if (!countEl) return;
        if (state.matches.length === 0) {
            countEl.textContent = state.query ? 'Nenhum' : '';
            countEl.classList.toggle('no-match', !!state.query);
        } else {
            countEl.textContent = (state.currentIndex + 1) + ' de ' + state.matches.length;
            countEl.classList.remove('no-match');
        }
    }

    // ── Init ──

    function init(options) {
        if (options) {
            if (options.getPan) hooks.getPan = options.getPan;
            if (options.setPan) hooks.setPan = options.setPan;
        }
    }

    // ── Public API ──

    window.SmartBSearch = {
        init: init,
        open: open,
        close: close,
        getState: function () { return state; },
    };
})();
