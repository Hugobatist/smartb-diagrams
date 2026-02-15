# Phase 7: VS Code Extension - Research

**Researched:** 2026-02-15
**Domain:** VS Code Extension API (WebviewViewProvider, StatusBar, Marketplace publishing)
**Confidence:** HIGH

## Summary

Building a VS Code extension for SmartB Diagrams requires a sidebar `WebviewViewProvider` that renders Mermaid diagrams and connects to the existing SmartB server via WebSocket. The VS Code extension API is mature and well-documented. The core challenge is architectural: the WebSocket client should live in the **extension host** (Node.js side) rather than inside the webview, because (a) webview CSP restrictions make remote WebSocket flaky, (b) the extension host can manage connection lifecycle across webview dispose/recreate cycles, and (c) the extension host can update the status bar indicator based on connection state. Data flows from WebSocket to extension host to webview via `postMessage`.

Mermaid.js must be **bundled locally** into the extension (not loaded from CDN) because VS Code webview Content Security Policy blocks dynamic chunk loading from external origins. The existing browser UI code in `static/` (annotations.js, ws-client.js) provides reusable logic but must be adapted for the webview context where `document` access is sandboxed and communication goes through `acquireVsCodeApi().postMessage()`.

**Primary recommendation:** Create the extension as a separate directory (`vscode-extension/`) within the same repository, using esbuild for fast bundling of both the extension host code and the webview scripts. Use `WebviewViewProvider` for the sidebar panel, manage WebSocket in the extension host, relay diagram updates to the webview via postMessage, and bundle mermaid.js locally.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@types/vscode` | ^1.96.0 | VS Code Extension API types | Required for TypeScript extension development |
| `esbuild` | ^0.24.x | Bundle extension + webview code | Official VS Code recommendation, sub-second builds |
| `mermaid` | ^11.12.x | Diagram rendering in webview | Same version as browser UI (CDN mermaid@11) |
| `ws` | ^8.19.x | WebSocket client in extension host | Already a project dependency, Node.js WebSocket |
| `@vscode/vsce` | ^3.7.x | Package and publish extension | Official VS Code extension packaging tool |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vscode/test-electron` | ^2.x | Integration testing | Testing extension in real VS Code instance |
| `generator-code` | latest | Scaffold initial project | One-time scaffolding only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| esbuild | webpack | Webpack is more flexible but 50x slower; esbuild is officially recommended |
| mermaid (full) | @mermaid-js/tiny | Tiny version is ~50% smaller but lacks some diagram types; use full for feature parity |
| ws (extension host) | WebSocket in webview | Direct webview WS works for localhost but breaks on remote/Codespaces and complicates state management |
| Separate repo | Monorepo directory | Separate repo adds CI complexity; subdirectory within smartb-diagrams is simpler for shared types |

**Installation (extension devDependencies):**
```bash
npm install --save-dev @types/vscode esbuild @vscode/vsce @vscode/test-electron
npm install --save mermaid ws
```

## Architecture Patterns

### Recommended Project Structure
```
vscode-extension/
  package.json          # Extension manifest (separate from main package.json)
  tsconfig.json         # Extension-specific TS config
  esbuild.mjs           # Build script for extension + webview bundles
  src/
    extension.ts        # activate(), register providers
    diagram-provider.ts # WebviewViewProvider implementation
    ws-client.ts        # WebSocket client connecting to SmartB server
    status-bar.ts       # StatusBarItem management
  media/
    webview.js          # Bundled webview script (output from esbuild)
    webview.css         # Webview styles
    mermaid.min.js      # Bundled mermaid (output from esbuild)
    icon.svg            # Activity bar icon
  README.md             # Marketplace description
  CHANGELOG.md          # Version history
```

### Pattern 1: Extension Host as WebSocket Proxy
**What:** The extension host (Node.js process) owns the WebSocket connection to the SmartB server. When diagram data arrives, it relays to the webview via `webviewView.webview.postMessage()`. When the webview needs to send a flag, it posts a message to the extension host, which makes an HTTP request to the SmartB server's `/save` endpoint.
**When to use:** Always -- this is the correct architecture for VS Code extensions.
**Example:**
```typescript
// Source: https://code.visualstudio.com/api/extension-guides/webview
// Extension host side (ws-client.ts)
import WebSocket from 'ws';

export class SmartBWsClient {
  private ws: WebSocket | null = null;
  private onMessage: (msg: unknown) => void;
  private onStatus: (status: string) => void;

  constructor(
    private serverUrl: string,
    onMessage: (msg: unknown) => void,
    onStatus: (status: string) => void,
  ) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  connect(): void {
    this.ws = new WebSocket(this.serverUrl);
    this.ws.on('open', () => this.onStatus('connected'));
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      this.onMessage(msg);
    });
    this.ws.on('close', () => {
      this.onStatus('disconnected');
      setTimeout(() => this.connect(), 2000);
    });
  }

  close(): void {
    this.ws?.close();
  }
}
```

### Pattern 2: WebviewViewProvider with State Persistence
**What:** Implement `vscode.WebviewViewProvider` for sidebar rendering. Use `getState()`/`setState()` inside the webview script to persist the current diagram file path and view state across hide/show cycles.
**When to use:** For the main sidebar panel (VSC-01, VSC-05).
**Example:**
```typescript
// Source: https://code.visualstudio.com/api/extension-guides/webview
// diagram-provider.ts
import * as vscode from 'vscode';

export class DiagramViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'smartb.diagramView';
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => {
      // Handle flag requests from webview
      if (msg.type === 'addFlag') {
        this.handleAddFlag(msg.nodeId, msg.message);
      }
    });
  }

  /** Send diagram update to webview */
  postDiagramUpdate(file: string, content: string): void {
    this.view?.webview.postMessage({
      type: 'diagram:update', file, content,
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.js'),
    );
    const mermaidUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'mermaid.min.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.css'),
    );
    // NOTE: 'unsafe-inline' in style-src is required because mermaid
    // generates SVG with inline style attributes that cannot use nonces.
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <div id="diagram"></div>
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
```

### Pattern 3: Status Bar Indicator
**What:** A `StatusBarItem` showing connection state (connected/disconnected/reconnecting) with click-to-reconnect.
**When to use:** For VSC-07.
**Example:**
```typescript
// Source: https://code.visualstudio.com/api/extension-capabilities/extending-workbench
import * as vscode from 'vscode';

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      'smartb.connectionStatus',
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.name = 'SmartB Connection';
    this.item.command = 'smartb.reconnect';
    this.setStatus('disconnected');
    this.item.show();
  }

  setStatus(status: 'connected' | 'disconnected' | 'reconnecting'): void {
    switch (status) {
      case 'connected':
        this.item.text = '$(check) SmartB';
        this.item.tooltip = 'SmartB: Connected';
        this.item.backgroundColor = undefined;
        break;
      case 'disconnected':
        this.item.text = '$(error) SmartB';
        this.item.tooltip = 'SmartB: Disconnected (click to reconnect)';
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground',
        );
        break;
      case 'reconnecting':
        this.item.text = '$(sync~spin) SmartB';
        this.item.tooltip = 'SmartB: Reconnecting...';
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground',
        );
        break;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
```

### Anti-Patterns to Avoid
- **WebSocket in webview directly:** Breaks on Remote SSH, Codespaces, and has CSP complications. Always proxy through extension host.
- **Loading mermaid from CDN:** VS Code webview CSP blocks dynamic chunk loading. Mermaid does dynamic imports internally, which fail with default CSP. Bundle locally instead.
- **Using `retainContextWhenHidden: true`:** High memory cost. Use `getState()`/`setState()` for lightweight persistence instead. Only use retainContextWhenHidden if re-rendering is extremely expensive.
- **Polling for diagram changes:** The existing SmartB server uses WebSocket push. Use that, not polling.
- **Sharing node_modules with main project:** The extension has its own dependency tree. Keep package.json separate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mermaid rendering | Custom SVG generation | `mermaid.render()` | Complex parser, 30+ diagram types, CSS injection |
| WebSocket reconnection | Custom retry logic | Exponential backoff pattern from ws-client.js | Edge cases (jitter, max delay, connection guard) |
| Extension packaging | Manual zip + manifest | `@vscode/vsce package` | Handles VSIX format, dependency bundling, validation |
| CSP nonce generation | Simple counter | Crypto-random 32-char nonce | Security requirement for script validation |
| Webview URI conversion | Manual path construction | `webview.asWebviewUri()` | Handles vscode-webview:// scheme, remote contexts |
| Status bar theming | Custom colors | `ThemeColor('statusBarItem.*Background')` | Respects user theme settings |

**Key insight:** VS Code provides purpose-built APIs for nearly every UI concern. Using raw DOM manipulation or custom networking bypasses security and compatibility guarantees.

## Common Pitfalls

### Pitfall 1: Mermaid Dynamic Chunk Loading in Webview
**What goes wrong:** Mermaid v11 uses dynamic `import()` internally for lazy-loaded diagram types. In VS Code webviews, the CSP blocks these dynamic imports because the chunk URLs resolve to `vscode-webview://` origins that don't match the CSP `script-src`.
**Why it happens:** Mermaid's ESM build splits into chunks. The webview's restrictive CSP only allows scripts with the correct nonce.
**How to avoid:** Bundle mermaid into a single file using esbuild with `bundle: true` and `format: 'iife'`. This eliminates dynamic imports by inlining all chunks. Alternatively, use the pre-built `mermaid.min.js` from the CDN distribution (which is already a single IIFE bundle) and serve it as a local media file.
**Warning signs:** Console errors like "Refused to load script" or "Failed to fetch dynamically imported module" in the webview developer tools.

### Pitfall 2: Webview Disposal and Reconnection
**What goes wrong:** When the sidebar panel is hidden and re-shown, `resolveWebviewView` is called again. If the extension doesn't properly manage WebSocket lifecycle, multiple connections accumulate or the webview shows stale data.
**Why it happens:** VS Code destroys and recreates the webview content when the sidebar panel visibility changes (unless `retainContextWhenHidden` is set).
**How to avoid:** Keep the WebSocket connection in the extension host (survives webview lifecycle). On `resolveWebviewView`, re-send the current diagram state to the new webview. Track the `view` reference and null it in `onDidDispose`.
**Warning signs:** Multiple WebSocket connections in server logs, or blank panel after reopening sidebar.

### Pitfall 3: CSP Blocking Inline Styles from Mermaid
**What goes wrong:** Mermaid renders SVG with inline `style` attributes. VS Code webview CSP may block these, causing unstyled diagrams.
**Why it happens:** The default CSP `style-src` directive may not allow `'unsafe-inline'`.
**How to avoid:** Include `'unsafe-inline'` in the `style-src` CSP directive. This is necessary because mermaid generates inline styles dynamically and cannot be refactored to use nonces.
**Warning signs:** Diagrams render but look broken/unstyled. Console shows "Refused to apply inline style" errors.

### Pitfall 4: Extension Size and Marketplace Limits
**What goes wrong:** Bundling the full mermaid library (~2MB minified) plus the extension code can make the VSIX package large.
**Why it happens:** Mermaid has many diagram type parsers and rendering engines.
**How to avoid:** Use esbuild tree-shaking aggressively. Consider `@mermaid-js/tiny` if only flowchart diagrams are needed (SmartB currently uses flowcharts). Run `vsce ls` before publishing to audit included files. Use `.vscodeignore` to exclude test files, source maps, and dev config.
**Warning signs:** `vsce package` warns about large file size (>5MB is a yellow flag, >20MB is a problem).

### Pitfall 5: Server Discovery (Port/Host Configuration)
**What goes wrong:** The extension can't find the SmartB server because the port isn't 3333, or the server isn't running.
**Why it happens:** SmartB server uses port fallback (`detect-port`), so the actual port may differ from the default.
**How to avoid:** Add extension settings for `smartb.serverUrl` (default: `ws://localhost:3333/ws`). Try to auto-detect by hitting `http://localhost:3333/api/status`. Show a clear error message if server is unreachable with a link to start it.
**Warning signs:** Status bar shows "Disconnected" permanently. User confused about how to start the server.

## Code Examples

Verified patterns from official sources:

### Content Security Policy for Webview with Mermaid
```typescript
// Source: https://code.visualstudio.com/api/extension-guides/webview
// CSP must allow:
// - 'nonce-${nonce}' for scripts (mermaid + webview.js)
// - 'unsafe-inline' for styles (mermaid generates inline styles)
// - data: for img-src (mermaid may use data URIs)
const csp = [
  `default-src 'none'`,
  `style-src ${webview.cspSource} 'unsafe-inline'`,
  `script-src 'nonce-${nonce}'`,
  `img-src ${webview.cspSource} data:`,
  `font-src ${webview.cspSource}`,
].join('; ');
```

### Webview Script Using getState/setState
```javascript
// Source: https://code.visualstudio.com/api/extension-guides/webview
// Inside media/webview.js (runs in webview context)
(function () {
  const vscode = acquireVsCodeApi();

  // Restore previous state
  const state = vscode.getState() || { currentFile: '', scrollTop: 0 };

  // Listen for messages from extension host
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'diagram:update':
        renderDiagram(msg.content);
        vscode.setState({ ...state, currentFile: msg.file });
        break;
      case 'connection:status':
        updateStatusIndicator(msg.status);
        break;
    }
  });

  // Send flag action to extension host
  function addFlag(nodeId, message) {
    vscode.postMessage({
      type: 'addFlag',
      nodeId,
      message,
    });
  }

  async function renderDiagram(content) {
    // Uses locally bundled mermaid
    const { svg } = await mermaid.render('diagram-' + Date.now(), content);
    document.getElementById('diagram').textContent = '';
    // mermaid.render returns sanitized SVG, safe to insert into DOM
    const container = document.getElementById('diagram');
    container.insertAdjacentHTML('afterbegin', svg);
  }
})();
```

### Extension package.json Contributes Section
```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "smartb-explorer",
          "title": "SmartB Diagrams",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "smartb-explorer": [
        {
          "type": "webview",
          "id": "smartb.diagramView",
          "name": "Diagram"
        }
      ]
    },
    "configuration": {
      "title": "SmartB Diagrams",
      "properties": {
        "smartb.serverUrl": {
          "type": "string",
          "default": "ws://localhost:3333/ws",
          "description": "WebSocket URL of the SmartB server"
        },
        "smartb.autoConnect": {
          "type": "boolean",
          "default": true,
          "description": "Automatically connect to SmartB server on startup"
        }
      }
    },
    "commands": [
      {
        "command": "smartb.reconnect",
        "title": "SmartB: Reconnect to Server"
      },
      {
        "command": "smartb.openBrowser",
        "title": "SmartB: Open in Browser"
      }
    ]
  },
  "activationEvents": [
    "onView:smartb.diagramView"
  ]
}
```

### esbuild Configuration for Extension + Webview
```javascript
// esbuild.mjs
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

// Bundle 1: Extension host code (Node.js, CommonJS for VS Code)
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],  // VS Code API provided at runtime
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: !isWatch,
};

// Bundle 2: Webview script (browser, IIFE)
const webviewConfig = {
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'media/webview.js',
  format: 'iife',
  platform: 'browser',
  sourcemap: true,
  minify: !isWatch,
};

if (isWatch) {
  const ctx1 = await esbuild.context(extensionConfig);
  const ctx2 = await esbuild.context(webviewConfig);
  await ctx1.watch();
  await ctx2.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(extensionConfig);
  await esbuild.build(webviewConfig);
  console.log('Build complete');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vsce` (npm package) | `@vscode/vsce` (scoped package) | 2023 | Old `vsce` package name is deprecated; use `@vscode/vsce` |
| webpack for extensions | esbuild for extensions | VS Code docs updated ~2023 | esbuild is now the recommended bundler in official docs |
| `createWebviewPanel` for sidebar | `WebviewViewProvider` for sidebar | VS Code 1.51 (2020) | `WebviewViewProvider` is purpose-built for sidebar/panel views |
| Manual activation events | Implied activation (since 1.74) | VS Code 1.74 (2022) | Extensions contributing views no longer need explicit `onView:*` activation events |
| `tooltip` (string only) | `tooltip` supports MarkdownString | VS Code 1.58 (2021) | Rich tooltips with icons and command links in status bar |

**Deprecated/outdated:**
- `vsce` npm package: Renamed to `@vscode/vsce`. The old name still works but is deprecated.
- `window.parent.postMessage()`: Replaced by `acquireVsCodeApi().postMessage()` for webview-to-extension communication.
- `onWebviewPanel` activation event: Still works but not needed for `WebviewViewProvider` since VS Code 1.74.

## Open Questions

1. **Separate repo vs. subdirectory for the extension?**
   - What we know: Both patterns are common. The main project is an npm package (`smartb-diagrams`). VS Code extensions have their own `package.json` with `engines.vscode`.
   - What's unclear: Whether the user wants the extension published independently or co-versioned with the main package.
   - Recommendation: Use a `vscode-extension/` subdirectory within the same repo. Simpler for shared types and coordinated releases. The extension's `package.json` is independent from the root `package.json`.

2. **Full mermaid vs. @mermaid-js/tiny in the webview?**
   - What we know: SmartB currently only uses flowchart diagrams. Full mermaid is ~2MB minified. Tiny is ~50% smaller but excludes Mindmap and Architecture diagrams.
   - What's unclear: Whether users might use non-flowchart diagram types in the future.
   - Recommendation: Start with the pre-built `mermaid.min.js` from the CDN distribution (download and bundle as local file). It is already a single IIFE bundle, avoiding the dynamic import problem. Switch to `@mermaid-js/tiny` only if VSIX size becomes a marketplace concern.

3. **Flag interaction scope in the webview?**
   - What we know: The browser UI has a full flag system with popover dialogs, click-to-flag, and panel listing. The webview sidebar has limited screen real estate.
   - What's unclear: How much of the flag UI should be replicated vs. simplified.
   - Recommendation: Implement simplified flag mode: clicking a node shows a minimal inline input (not a popover), flags are sent to the extension host which saves them via HTTP to the SmartB server. The full flag panel with listing can be a collapsible section at the bottom of the webview.

4. **Extension engine version target?**
   - What we know: Current VS Code stable is 1.96+. WebviewViewProvider has been available since 1.51.
   - What's unclear: Minimum version the user wants to support.
   - Recommendation: Target `"engines": { "vscode": "^1.85.0" }` (roughly 1 year old), balancing modern API access with broad compatibility.

## Sources

### Primary (HIGH confidence)
- [/microsoft/vscode-docs] Context7 - WebviewViewProvider, webview state persistence, activation events, status bar items, CSP, message passing
- [VS Code Extension API - Webviews](https://code.visualstudio.com/api/extension-guides/webview) - Official webview guide
- [VS Code Extension API - Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) - vsce packaging and marketplace
- [VS Code Extension API - Bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) - esbuild/webpack configuration
- [VS Code Extension Samples - webview-view-sample](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts) - Official WebviewViewProvider reference implementation

### Secondary (MEDIUM confidence)
- [VS Code WebSocket in Webview Discussion](https://github.com/microsoft/vscode-discussions/discussions/693) - CSP + WebSocket in webview, verified with official docs
- [Mermaid CSP Issues in VS Code](https://github.com/RooCodeInc/Roo-Code/issues/3680) - Dynamic chunk loading conflicts, verified pattern
- [@vscode/vsce npm](https://www.npmjs.com/package/@vscode/vsce) - Version 3.7.1, verified on npm
- [@mermaid-js/tiny npm](https://www.npmjs.com/package/@mermaid-js/tiny) - Lightweight mermaid alternative, verified on npm

### Tertiary (LOW confidence)
- [VS Code Marketplace paid extensions 2025](https://markaicode.com/sell-vs-code-extensions-2025/) - Market context (not critical for implementation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - VS Code extension API is very well documented, Context7 provided verified patterns
- Architecture: HIGH - WebSocket proxy pattern is well-established, multiple sources confirm the extension host approach
- Pitfalls: HIGH - CSP/mermaid issues documented in real extension issues (Roo-Code #3680, vscode #145093)
- Marketplace publishing: MEDIUM - Process is documented but specific marketplace review timelines are unclear

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable domain, VS Code API changes slowly)
