# Architecture Research

**Domain:** AI observability developer tooling (MCP server + HTTP/WS server + VS Code extension)
**Researched:** 2026-02-14
**Confidence:** HIGH (MCP SDK, VS Code API, Node.js patterns all verified against official docs)

## Standard Architecture

### System Overview

```
                        SINGLE NODE.JS PROCESS
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
  │  │  MCP Server  │  │  HTTP Server │  │  File Watcher │  │
  │  │ (stdio xport)│  │  (port 3333) │  │  (chokidar)   │  │
  │  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘  │
  │         │                 │                  │           │
  │  ┌──────┴─────────────────┴──────────────────┴────────┐  │
  │  │              Shared Diagram Service                 │  │
  │  │  (read/write .mmd, parse flags, manage state)      │  │
  │  └──────────────────────┬─────────────────────────────┘  │
  │                         │                                │
  │         ┌───────────────┼───────────────┐                │
  │         │               │               │                │
  │  ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐        │
  │  │ .mmd Files  │ │  WebSocket  │ │  REST API   │        │
  │  │ (filesystem)│ │  (ws lib)   │ │  (endpoints)│        │
  │  └─────────────┘ └──────┬──────┘ └─────────────┘        │
  │                         │                                │
  └─────────────────────────┼────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
  ┌─────┴──────┐                         ┌──────┴──────┐
  │  Browser   │                         │  VS Code    │
  │ (live.html)│                         │  Extension  │
  └────────────┘                         └─────────────┘
```

External connections:

```
  AI Tool (Cursor/Claude Code)
        │
        │  spawns process, communicates via stdin/stdout
        │
  ┌─────┴──────┐
  │ MCP Server │ ← the same Node.js process that also runs HTTP+WS
  └────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **MCP Server** | Receives AI tool requests via stdio (JSON-RPC). Exposes tools (update_diagram, read_flags, get_context) and resources (diagram content). | AI Tool (stdin/stdout), Diagram Service |
| **HTTP Server** | Serves static assets (live.html, CSS, JS). Provides REST endpoints for file operations (/save, /delete, /tree.json). | Browser, VS Code Extension |
| **WebSocket Server** | Pushes real-time diagram updates to connected clients. Receives flag submissions from browser/extension. | Browser, VS Code Extension |
| **File Watcher** | Monitors .mmd files for changes using chokidar. Triggers WebSocket broadcasts on file change. | Diagram Service, WebSocket Server |
| **Diagram Service** | Core business logic. Reads/writes .mmd files. Parses and injects `%% @flag` annotations. Manages diagram state. Single source of truth. | All internal components |
| **Browser Client** | Renders Mermaid diagrams. Flag UI. Developer interaction. Connects via WebSocket for live updates. | HTTP Server, WebSocket Server |
| **VS Code Extension** | Webview panel in sidebar. Renders same diagram. Communicates via WebSocket to the running server. | HTTP Server, WebSocket Server |

## Recommended Project Structure

```
smartb-diagrams/
├── packages/
│   ├── core/                   # Shared business logic (no I/O dependencies)
│   │   ├── src/
│   │   │   ├── diagram.ts      # .mmd read/write/parse operations
│   │   │   ├── flags.ts        # Flag annotation parsing/injection
│   │   │   ├── types.ts        # Shared TypeScript types
│   │   │   └── index.ts        # Public API
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── server/                 # The main process (MCP + HTTP + WS + file watcher)
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point + CLI arg parsing
│   │   │   ├── mcp/
│   │   │   │   ├── server.ts   # McpServer setup, tool/resource registration
│   │   │   │   └── tools.ts    # Tool implementations (update_diagram, etc.)
│   │   │   ├── http/
│   │   │   │   ├── server.ts   # HTTP server setup (native http module)
│   │   │   │   └── routes.ts   # REST endpoint handlers
│   │   │   ├── ws/
│   │   │   │   └── server.ts   # WebSocket server + broadcast logic
│   │   │   ├── watcher.ts      # Chokidar file watcher
│   │   │   └── state.ts        # In-memory state (connected clients, active diagrams)
│   │   ├── static/             # Embedded static assets (bundled into package)
│   │   │   ├── live.html       # Main browser UI
│   │   │   ├── app.js          # Bundled client JS (annotations + editor + mermaid)
│   │   │   └── app.css         # Bundled styles
│   │   ├── package.json        # bin: { "smartb": "./dist/index.js" }
│   │   └── tsconfig.json
│   │
│   └── vscode/                 # VS Code extension (separate package)
│       ├── src/
│       │   ├── extension.ts    # activate/deactivate, register commands
│       │   ├── sidebar.ts      # WebviewViewProvider for sidebar panel
│       │   └── client.ts       # WebSocket client to connect to server
│       ├── webview/            # HTML/JS for the sidebar webview
│       │   └── index.html
│       ├── package.json        # VS Code extension manifest
│       └── tsconfig.json
│
├── package.json                # Workspace root (npm workspaces)
├── tsconfig.base.json          # Shared TS config
└── esbuild.config.ts           # Build configuration
```

### Structure Rationale

- **packages/core/:** Pure logic with no I/O side effects. Can be tested independently. Shared between server and potentially the VS Code extension. Contains diagram parsing, flag management, type definitions. No dependency on Node.js `fs`, `http`, or MCP SDK.
- **packages/server/:** The deployable artifact. Entry point for `npx smartb-diagrams` or `smartb` global command. Contains all I/O: file system access, network servers, MCP transport. The `static/` directory embeds pre-built browser assets so a single `npm install -g` gives everything needed.
- **packages/vscode/:** Separate VS Code extension. Connects to the already-running server via WebSocket. Does not embed the server -- the extension expects the server to be running (either manually or auto-started). Published to VS Code Marketplace independently.
- **npm workspaces:** Monorepo approach keeps packages co-located but independently publishable. `core` is a dependency of `server`. `vscode` depends on nothing internally (communicates via WebSocket).

## Architectural Patterns

### Pattern 1: Single Process, Multiple Transports

**What:** One Node.js process hosts the MCP server (stdio transport) alongside an HTTP server and WebSocket server on the same event loop. The MCP server communicates via stdin/stdout with the AI tool, while HTTP+WS serves the browser and VS Code extension.

**When to use:** When the tool is spawned by an AI tool as a child process (which is how MCP stdio works). The AI tool spawns `node dist/index.js`, the process reads/writes JSON-RPC on stdio for MCP, and simultaneously listens on a TCP port for HTTP/WS.

**Trade-offs:**
- Pro: Single install, single process, simple deployment (`npx smartb-diagrams`)
- Pro: Shared in-memory state between MCP and HTTP/WS (no IPC needed)
- Con: Must never write to stdout from non-MCP code (corrupts JSON-RPC)
- Con: If the HTTP port is already taken, need graceful fallback

**Example:**
```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

// Shared state
const diagramService = new DiagramService(process.cwd());

// 1. MCP Server on stdio
const mcpServer = new McpServer({ name: 'smartb-diagrams', version: '1.0.0' });
mcpServer.registerTool('update_diagram', { /* ... */ }, async (params) => {
  await diagramService.writeDiagram(params.file, params.content);
  return { content: [{ type: 'text', text: 'Diagram updated' }] };
});
const transport = new StdioServerTransport();
await mcpServer.connect(transport);

// 2. HTTP + WS on port 3333
const httpServer = createServer(handleHttpRequest);
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', (ws) => { /* subscribe to diagram changes */ });
httpServer.listen(3333);

// 3. File watcher bridges the two
chokidar.watch('**/*.mmd').on('change', (path) => {
  const content = diagramService.readDiagram(path);
  broadcast(wss, { type: 'diagram:update', path, content });
});
```

### Pattern 2: File-as-Protocol (Diagram Service Pattern)

**What:** The `.mmd` file is the single source of truth and the communication protocol between AI and developer. The AI writes Mermaid syntax to the file. The developer writes `%% @flag` annotations to the same file. Both sides read the same file. The Diagram Service is the mediator that understands both the Mermaid content and the annotation format.

**When to use:** When you need bidirectional communication between an AI tool and a human without a real-time connection between them. The file system acts as a shared message bus.

**Trade-offs:**
- Pro: Works even when the browser is closed (flags persist in files)
- Pro: Git-friendly (flags are just comments in the .mmd file)
- Pro: AI tools naturally work with files, so no special protocol needed
- Con: File I/O latency (mitigated by in-memory caching + file watcher)
- Con: Concurrent write conflicts possible (mitigated by last-write-wins + annotation merge)

**Example:**
```typescript
// .mmd file acts as the protocol
// AI writes:
flowchart LR
    A["Load data"] --> B["Process"]
    B --> C["Save results"]

// Developer adds flag (via browser UI):
flowchart LR
    A["Load data"] --> B["Process"]
    B --> C["Save results"]

%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---
%% @flag B "This step is too slow, consider batching"
%% --- END ANNOTATIONS ---

// AI reads the flag via MCP tool:
const flags = diagramService.getFlags('my-diagram.mmd');
// → [{ nodeId: 'B', message: 'This step is too slow, consider batching' }]
```

### Pattern 3: WebSocket Push with File Watcher

**What:** Chokidar watches `.mmd` files. On any change, the new content is read and broadcast to all connected WebSocket clients. This replaces the current 2-second polling with <50ms push latency.

**When to use:** Always -- this is the core real-time mechanism.

**Trade-offs:**
- Pro: Sub-50ms latency vs 2000ms polling
- Pro: No wasted HTTP requests when nothing changes
- Pro: Bidirectional -- browser can also push flags back via WS
- Con: Requires WebSocket client in browser (trivial)
- Con: chokidar adds ~200KB to install size (acceptable)

**Example:**
```typescript
import chokidar from 'chokidar';

const watcher = chokidar.watch('**/*.mmd', {
  cwd: projectRoot,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
});

watcher.on('change', async (relativePath) => {
  const content = await fs.readFile(path.join(projectRoot, relativePath), 'utf-8');
  broadcast({ type: 'file:changed', path: relativePath, content });
});

watcher.on('add', (relativePath) => {
  broadcast({ type: 'file:added', path: relativePath });
});

watcher.on('unlink', (relativePath) => {
  broadcast({ type: 'file:removed', path: relativePath });
});
```

## Data Flow

### Primary Flow: AI Updates Diagram, Developer Sees It

```
AI Tool (Cursor/Claude Code)
    │
    │  MCP tool call: update_diagram({ file: "plan.mmd", content: "..." })
    ↓
MCP Server (stdio JSON-RPC)
    │
    │  diagramService.writeDiagram("plan.mmd", content)
    ↓
Diagram Service
    │
    │  fs.writeFile("plan.mmd", content)
    ↓
File System (.mmd file on disk)
    │
    │  chokidar detects change
    ↓
File Watcher
    │
    │  reads file, broadcasts via WebSocket
    ↓
WebSocket Server
    │
    │  ws.send({ type: "file:changed", path, content })
    ↓
Browser / VS Code Extension
    │
    │  mermaid.render(content) → SVG displayed
    ↓
Developer sees updated diagram (<100ms total)
```

### Secondary Flow: Developer Flags a Problem

```
Developer clicks node in browser
    │
    │  Flag mode active, popover appears
    ↓
Browser UI (annotations.js)
    │
    │  WebSocket: { type: "flag:set", file: "plan.mmd", nodeId: "B", message: "..." }
    ↓
WebSocket Server
    │
    │  diagramService.setFlag("plan.mmd", "B", "...")
    ↓
Diagram Service
    │
    │  Injects %% @flag B "..." into .mmd file
    │  fs.writeFile("plan.mmd", updatedContent)
    ↓
File System (.mmd updated with flag annotation)
    │
    │  (File watcher sees change → broadcasts to other clients)
    ↓
AI Tool reads flags on next iteration
    │
    │  MCP tool call: read_flags({ file: "plan.mmd" })
    │  → returns [{ nodeId: "B", message: "..." }]
    ↓
AI adjusts its approach based on developer feedback
```

### Tertiary Flow: VS Code Extension

```
VS Code Extension activates
    │
    │  Checks if smartb-diagrams server is running on port 3333
    │  If not, optionally spawns it via child_process
    ↓
WebSocket Client (in extension)
    │
    │  Connects to ws://localhost:3333
    │  Subscribes to file changes
    ↓
Webview Panel (sidebar)
    │
    │  Extension posts diagram content to webview via postMessage()
    │  Webview renders with Mermaid.js
    ↓
Developer sees diagram in VS Code sidebar
    │
    │  Clicks flag → webview posts message to extension
    │  Extension sends flag via WebSocket to server
    ↓
Same flag flow as browser
```

### Key Data Flows Summary

1. **AI-to-Display:** MCP tool call → file write → chokidar → WebSocket broadcast → render. Target: <100ms.
2. **Developer-to-AI:** Click flag → WebSocket → file write with annotation → AI reads via MCP resource/tool. Async, next-read latency.
3. **File tree sync:** chokidar watches `**/*.mmd` → broadcasts add/remove/change → sidebar updates in browser and VS Code.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 developer, 1 project | Single process on localhost, all defaults. This is the primary use case. |
| 1 developer, 3-5 projects | Each project gets its own server instance (different port or same port different workspace root). The server is stateless per invocation -- just point it at a directory. |
| Team of 5-10 (future) | Still local-first. Each dev runs their own instance. Diagram files committed to git. Flags visible to all via git. No shared server needed. |
| Scaling beyond local | Out of scope per project constraints. If ever needed: the server could accept Streamable HTTP transport instead of stdio, enabling remote MCP clients. The architecture already supports this via the MCP SDK's transport abstraction. |

### Scaling Priorities

1. **First bottleneck: File watcher overhead with many .mmd files (100+).** Fix: Use chokidar's `ignored` option to scope watching to a specific `diagrams/` directory. Add debouncing (50ms stabilityThreshold).
2. **Second bottleneck: Large diagrams causing slow Mermaid rendering.** Fix: Client-side concern. Use incremental rendering (diff-based SVG updates) or virtual scrolling for very large diagrams. Architectural support: send diagram hash with WebSocket updates so client can skip re-render if unchanged.

## Anti-Patterns

### Anti-Pattern 1: Writing to stdout from HTTP/WS Code

**What people do:** Use `console.log()` for debugging in the server code.
**Why it's wrong:** When the process is spawned by an AI tool, stdout is the MCP transport. Any non-JSON-RPC data on stdout corrupts the protocol and breaks the connection. This is the most common MCP server bug.
**Do this instead:** Use `console.error()` for all logging (stderr is safe). Or use a structured logger that writes to stderr/file. Configure this at the entry point so it is impossible to accidentally log to stdout.

### Anti-Pattern 2: Embedding the Server Inside the VS Code Extension

**What people do:** Bundle the full HTTP+WS+MCP server inside the VS Code extension, running it in the Extension Host process.
**Why it's wrong:** The Extension Host has memory limits and lifecycle constraints. MCP stdio transport requires a standalone process (AI tools spawn it as a child process). The extension cannot serve as both an MCP server (spawned by Cursor) and a VS Code extension simultaneously.
**Do this instead:** The VS Code extension is a WebSocket client that connects to the independently running server. The extension can optionally auto-start the server if it detects the server is not running.

### Anti-Pattern 3: Polling for File Changes

**What people do:** Use `setInterval` + `fetch` to check for file changes (as in the current prototype with 2s polling).
**Why it's wrong:** Wastes resources, adds minimum 2s latency, misses rapid changes. With 10 open files, that is 5 HTTP requests per second doing nothing most of the time.
**Do this instead:** Use chokidar for file watching + WebSocket for push notifications. Zero wasted requests, <50ms latency.

### Anti-Pattern 4: Separate Processes for MCP and HTTP

**What people do:** Run the MCP server as one process and the HTTP/WS server as another, using IPC to communicate.
**Why it's wrong:** Doubles deployment complexity. Requires process orchestration. State synchronization between processes is error-prone. Two things to install, two things to debug.
**Do this instead:** Single Node.js process. MCP on stdio, HTTP+WS on a TCP port. Shared in-memory state via the Diagram Service. One `npx` command starts everything.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| AI Tool (Cursor/Claude Code) | MCP stdio transport. AI tool spawns the process and communicates via stdin/stdout JSON-RPC. | Configuration in AI tool's MCP settings (e.g., `claude_desktop_config.json` or Cursor's MCP config). The `command` is `npx smartb-diagrams` or the global `smartb` binary. |
| VS Code | Extension connects via WebSocket to `ws://localhost:3333`. Extension published to VS Code Marketplace separately. | Extension discovers the server port from a well-known location or user configuration. |
| Browser | Standard HTTP for page load, WebSocket for live updates. No authentication (localhost only). | User navigates to `http://localhost:3333`. |
| npm Registry | Global package published as `smartb-diagrams`. Users install via `npm install -g smartb-diagrams`. | `package.json` `bin` field maps `smartb` to the compiled entry point. Shebang (`#!/usr/bin/env node`) at top of built file. |
| VS Code Marketplace | Extension published via `vsce` CLI tool. Auto-updates handled by VS Code. | Separate publish pipeline from the npm package. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MCP Server <-> Diagram Service | Direct function calls (same process) | MCP tools call DiagramService methods directly. No serialization overhead. |
| HTTP Server <-> Diagram Service | Direct function calls (same process) | REST handlers call DiagramService for file operations. |
| WebSocket Server <-> File Watcher | Event emitter pattern | File watcher emits events, WS server subscribes and broadcasts. Use Node.js EventEmitter. |
| Browser <-> WebSocket Server | WebSocket protocol (JSON messages) | Message types: `file:changed`, `file:added`, `file:removed`, `flag:set`, `flag:remove`. |
| VS Code Extension <-> Server | WebSocket protocol (same JSON messages as browser) | Extension is just another WebSocket client. Same protocol as browser. |
| VS Code Extension <-> Webview | `postMessage()` / `onDidReceiveMessage` | VS Code API sandboxing requires message passing between extension host and webview iframe. |

## Build Order (Dependency Chain)

The architecture implies a specific build sequence because components depend on each other:

```
Phase 1: Core + Server Foundation
    packages/core (types, diagram parsing, flag logic)
    packages/server/src/index.ts (entry point, CLI)
    packages/server/src/http/ (static file serving)
    → Deliverable: `npx smartb-diagrams` serves live.html

Phase 2: File Watching + WebSocket
    packages/server/src/watcher.ts (chokidar)
    packages/server/src/ws/ (WebSocket server)
    Browser client updated from polling to WebSocket
    → Deliverable: <100ms live diagram updates

Phase 3: MCP Integration
    packages/server/src/mcp/ (McpServer, tools, resources)
    Requires Phase 1 (Diagram Service) to be stable
    → Deliverable: AI tools can update diagrams and read flags via MCP

Phase 4: VS Code Extension
    packages/vscode/ (WebviewViewProvider, WS client)
    Requires Phase 2 (WebSocket server) to be running
    → Deliverable: Diagram visible in VS Code sidebar

Phase 5: Polish + Distribution
    npm global package setup (bin, shebang, esbuild bundle)
    VS Code Marketplace publishing
    → Deliverable: `npm install -g smartb-diagrams` + VS Code extension installable
```

**Phase ordering rationale:**
- Core must come first because every other component depends on diagram parsing and flag logic.
- HTTP server before WebSocket because you need to serve the browser UI before adding real-time updates to it.
- WebSocket before MCP because MCP tool calls trigger file writes that need to propagate via WebSocket -- you need the push infrastructure working first.
- VS Code extension last because it is a pure consumer of the WebSocket server -- it adds no new server-side capability.
- Distribution last because bundling and publishing require all code to be stable.

## End-to-End Flag System Architecture

The flag system is the core differentiator. Here is how it works across all components:

```
Developer in Browser                    .mmd File                           AI Tool
─────────────────                    ─────────────                       ─────────

1. Press F (flag mode)
2. Click node "B"
3. Type "Too slow,
   consider batching"
4. Click "Flag"
        │
        ↓
5. Browser sends WS:
   { type: "flag:set",
     file: "plan.mmd",
     nodeId: "B",
     message: "Too slow..." }
        │
        ↓
6. Server receives WS      7. Server writes:
   message, calls              flowchart LR
   diagramService                A --> B --> C
   .setFlag()
                               %% --- ANNOTATIONS ---
                               %% @flag B "Too slow..."
                               %% --- END ANNOTATIONS ---
                                        │
                                        ↓
                               8. chokidar detects change
                                        │
                                        ↓
                               9. WS broadcasts to all     10. AI calls MCP:
                                  clients (including           read_flags("plan.mmd")
                                  VS Code extension)              │
                                        │                         ↓
                                        ↓              11. Server reads .mmd,
                               Browser/VSCode shows        parses %% @flag lines
                               red badge on node B              │
                                                                ↓
                                                       12. Returns:
                                                           [{ nodeId: "B",
                                                              message: "Too slow..." }]
                                                                │
                                                                ↓
                                                       13. AI adjusts approach
                                                           based on flag feedback
```

## Sources

- [MCP TypeScript SDK (official)](https://github.com/modelcontextprotocol/typescript-sdk) -- HIGH confidence. Verified server setup, tool registration, stdio transport via Context7.
- [MCP Build Server Tutorial (official)](https://modelcontextprotocol.io/docs/develop/build-server) -- HIGH confidence. Official project structure, package.json configuration, TypeScript setup.
- [MCP Transport Comparison](https://mcpcat.io/guides/comparing-stdio-sse-streamablehttp/) -- MEDIUM confidence. Explains stdio vs SSE vs StreamableHTTP trade-offs.
- [VS Code Webview API (official)](https://code.visualstudio.com/api/extension-guides/webview) -- HIGH confidence. Verified postMessage communication pattern, WebviewViewProvider for sidebar panels via Context7.
- [VS Code Extension Architecture](https://abdulkadersafi.com/blog/building-vs-code-extensions-in-2026-the-complete-modern-guide) -- MEDIUM confidence. Extension Host isolation, lifecycle management.
- [chokidar (official)](https://github.com/paulmillr/chokidar) -- HIGH confidence. File watching patterns, awaitWriteFinish option, glob support.
- [ws WebSocket library](https://www.npmjs.com/package/ws) -- HIGH confidence. Standard Node.js WebSocket server, compatible with native http module.
- [esbuild (official)](https://esbuild.github.io/api/) -- HIGH confidence. Bundle configuration, platform settings, banner for shebang.
- [FastMCP custom HTTP routes](https://github.com/punkpeye/fastmcp) -- MEDIUM confidence. Pattern for combining MCP server with custom HTTP endpoints in same process.
- [Live Reloading from Scratch in Node.js](https://www.alexander-morse.com/blog/live-reloading-from-scratch-in-nodejs/) -- MEDIUM confidence. chokidar + ws live reload pattern.
- [One MCP Server, Two Transports (Microsoft)](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/one-mcp-server-two-transports-stdio-and-http/4443915) -- MEDIUM confidence. Dual-transport architecture pattern.

---
*Architecture research for: SmartB Diagrams -- AI observability developer tooling*
*Researched: 2026-02-14*
