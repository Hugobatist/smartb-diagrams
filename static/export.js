/**
 * SmartCode Export -- SVG and PNG export of current diagram.
 * Extracted from live.html (Phase 9 Plan 02).
 *
 * Dependencies: mermaid (CDN), renderer.js (SmartCodeRenderer.MERMAID_CONFIG)
 * Dependents: none (triggered by UI buttons)
 *
 * Usage:
 *   SmartCodeExport.exportSVG();
 *   SmartCodeExport.exportPNG();
 */
(function() {
    'use strict';

    // ── Download helper ──
    function download(blob, name) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
        if (window.toast) toast('Exported: ' + name);
    }

    // ── Ghost path cloning for export (QUAL-03) ──
    // Copies visible ghost path SVG elements from the live SVG into the export SVG
    // so PNG exports include ghost paths.
    function copyGhostPathsToExport(exportSvg) {
        if (!window.SmartCodeGhostPaths || !SmartCodeGhostPaths.isVisible()) return;

        var liveSvg = document.querySelector('#preview svg');
        if (!liveSvg) return;

        var ghostEls = liveSvg.querySelectorAll('.ghost-path');
        if (ghostEls.length === 0) return;

        // Clone the ghost-arrow marker definition if present
        var ghostMarker = liveSvg.querySelector('#ghost-arrow');
        if (ghostMarker) {
            var exportDefs = exportSvg.querySelector('defs');
            if (!exportDefs) {
                exportDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                exportSvg.insertBefore(exportDefs, exportSvg.firstChild);
            }
            // Only add if not already present
            if (!exportDefs.querySelector('#ghost-arrow')) {
                exportDefs.appendChild(ghostMarker.cloneNode(true));
            }
        }

        // Clone each ghost path group into the export SVG
        for (var i = 0; i < ghostEls.length; i++) {
            exportSvg.appendChild(ghostEls[i].cloneNode(true));
        }
    }

    // ── SVG Export ──
    function exportSVG() {
        var svg = document.querySelector('#preview svg');
        if (!svg) return window.toast && toast('Nothing to export');
        var blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
        var currentFile = (window.SmartCodeFileTree && SmartCodeFileTree.getCurrentFile()) || 'export';
        download(blob, currentFile.replace('.mmd', '.svg'));
    }

    // ── PNG Export ──
    // Uses SmartCodeRenderer.MERMAID_CONFIG to avoid triplicating the config object.
    // Re-initializes mermaid with htmlLabels:false to avoid foreignObject Canvas taint,
    // then restores original config after rendering.
    async function exportPNG() {
        var currentSvg = document.querySelector('#preview svg');
        if (!currentSvg) return window.toast && toast('Nothing to export');

        // Custom SVG: direct PNG export without mermaid re-render
        if (window.DiagramDOM && DiagramDOM.getRendererType() === 'custom') {
            var currentFile = (window.SmartCodeFileTree && SmartCodeFileTree.getCurrentFile()) || 'export';
            var clone = currentSvg.cloneNode(true);
            copyGhostPathsToExport(clone);
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            var data = new XMLSerializer().serializeToString(clone);
            var img = new Image();
            img.onload = function() {
                canvas.width = img.width * 2;
                canvas.height = img.height * 2;
                ctx.scale(2, 2);
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(function(blob) {
                    download(blob, currentFile.replace('.mmd', '.png'));
                }, 'image/png');
            };
            img.onerror = function() {
                if (window.toast) toast('Error exporting PNG -- try SVG');
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
            return;
        }

        var baseConfig = window.SmartCodeRenderer && SmartCodeRenderer.MERMAID_CONFIG;
        if (!baseConfig) {
            if (window.toast) toast('Error: renderer not loaded');
            return;
        }

        var currentFile = (window.SmartCodeFileTree && SmartCodeFileTree.getCurrentFile()) || 'export';

        try {
            // Get current diagram source code (same pipeline as render())
            var editor = document.getElementById('editor');
            var code = editor.value;
            var cleanCode = window.SmartCodeAnnotations
                ? SmartCodeAnnotations.getCleanContent(code)
                : code;
            var styledCode = window.injectStatusStyles
                ? injectStatusStyles(cleanCode)
                : cleanCode;

            // Build export config: clone base config with htmlLabels:false
            var exportConfig = JSON.parse(JSON.stringify(baseConfig));
            exportConfig.flowchart.htmlLabels = false;

            // Temporarily re-initialize mermaid for Canvas-safe rendering
            mermaid.initialize(exportConfig);

            // Render a Canvas-safe SVG (no foreignObject)
            var result = await mermaid.render('export-png-' + Date.now(), styledCode.trim());
            var exportSvgStr = result.svg;

            // Restore original mermaid config
            mermaid.initialize(baseConfig);

            // Parse export SVG to get dimensions
            var tempDiv = document.createElement('div');
            tempDiv.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
            document.body.appendChild(tempDiv);
            // Safe: SVG from mermaid.render(), not user input
            tempDiv.textContent = '';
            tempDiv.insertAdjacentHTML('afterbegin', exportSvgStr);
            var exportSvg = tempDiv.querySelector('svg');

            // Copy ghost paths into the export SVG (QUAL-03)
            copyGhostPathsToExport(exportSvg);

            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            var data = new XMLSerializer().serializeToString(exportSvg);

            document.body.removeChild(tempDiv);

            var img = new Image();
            img.onload = function() {
                try {
                    canvas.width = img.width * 2;
                    canvas.height = img.height * 2;
                    ctx.scale(2, 2);
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(function(blob) {
                        download(blob, currentFile.replace('.mmd', '.png'));
                    }, 'image/png');
                } catch (taintErr) {
                    if (window.toast) toast('Error exporting PNG -- try SVG');
                }
            };
            img.onerror = function() {
                if (window.toast) toast('Error exporting PNG -- try SVG');
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
        } catch (e) {
            // Restore original config on error
            if (baseConfig) mermaid.initialize(baseConfig);
            if (window.toast) toast('Error exporting PNG -- try SVG');
        }
    }

    // ── Public API ──
    window.SmartCodeExport = { exportSVG: exportSVG, exportPNG: exportPNG };

    // Backward compat -- onclick handlers in HTML call these directly
    window.exportSVG = exportSVG;
    window.exportPNG = exportPNG;
})();
