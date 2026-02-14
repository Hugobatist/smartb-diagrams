# Stack Research

**Domain:** AI observability developer tooling (MCP server + HTTP server + VS Code extension + CLI)
**Researched:** 2026-02-14
**Confidence:** HIGH

---

## Decision: MCP SDK v1.x Now, Migrate to v2 When Stable

The MCP TypeScript SDK is mid-transition. The v2 monorepo (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`, etc.) is on the main branch but pre-alpha. The stable release is `@modelcontextprotocol/sdk` v1.26.0. A stable v2 is anticipated Q1 2026 but not yet shipped as of 2026-02-14.

**Recommendation:** Start with `@modelcontextprotocol/sdk` v1.x (stable, production-ready, 25K+ dependents). The v1 API surface for MCP servers is mature and unlikely to see breaking changes. When v2 goes stable, migration is straightforward -- the core `McpServer` class and tool/resource registration patterns remain the same; only package names and transport imports change.

**Risk if we wait for v2:** Unknown timeline slip. v1 has 6+ months of continued support after v2 ships.
**Risk if we start with v1:** Minor migration cost (import path changes). Acceptable.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **Node.js** | 22.x LTS | Runtime | Active LTS until 2027-04-30. Node 24.x is also Active LTS but 22.x has broader ecosystem compat. Stable native `fetch`, `WebSocket` client API (stable since v22.4.0). | HIGH |
| **TypeScript** | 5.9.x | Language | Latest stable release. TS 6.0 beta just dropped (2026-02-11) but too new for production. 5.9 has excellent Node16/NodeNext module resolution. TS 7 (Go-based) is still preview. | HIGH |
| **@modelcontextprotocol/sdk** | 1.26.0 | MCP server framework | Official Anthropic SDK. Provides `McpServer` class, stdio transport, tool/resource/prompt registration with Zod schemas. Used by Claude Code, Cursor, and all major MCP clients. | HIGH |
| **zod** | 3.25.x (v3, v4-compatible) | Schema validation | Required peer dependency of MCP SDK v1.x. MCP SDK v1 uses zod v3 internally. Zod 4.3.x is out but MCP v1 still expects v3 imports. Use `zod@^3.25` for v1 compat. When migrating to MCP SDK v2, switch to `zod@^4.3`. | HIGH |
| **ws** | 8.19.x | WebSocket server | The standard Node.js WebSocket server library (25K+ dependents). Zero dependencies, blazing fast, battle-tested. Node.js has native WebSocket *client* but no native *server* -- ws fills this gap. | HIGH |
| **mermaid** | 11.12.x | Diagram rendering (browser) | Official Mermaid.js library for browser-side rendering. Use client-side only via CDN or bundled into webview. `mermaid.render()` is the programmatic API. Do NOT attempt server-side Mermaid rendering (requires headless browser). | HIGH |
| **commander** | 14.0.x | CLI argument parsing | De facto standard for Node.js CLIs. Clean subcommand support (`smartb-diagrams init`, `serve`, `status`). TypeScript types included. Requires Node >= 20. | HIGH |
| **esbuild** | 0.27.x | Bundler | Used for both: (1) bundling the npm package/CLI, (2) bundling VS Code extension. Sub-second builds. Native TypeScript support (strips types, no type-checking). | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| **chokidar** | 5.x | File watching | Watch `.mmd` files for changes to trigger WebSocket updates. ESM-only in v5, requires Node >= 20. Proven in 30M+ repos. | HIGH |
| **open** | 10.x | Open browser | `smartb-diagrams serve` should auto-open browser. Cross-platform `open(url)`. | MEDIUM |
| **picocolors** | 1.x | Terminal colors | Lightweight (no dependencies) terminal color output for CLI. Smaller than chalk. | MEDIUM |
| **tsup** | 8.5.x | Build orchestration | Wraps esbuild with sensible defaults for library/CLI builds. Handles CJS/ESM dual output, dts generation, shims. Use for building the npm package. | HIGH |
| **vitest** | 4.0.x | Testing | Fast, Vite-powered test runner. Native TypeScript, ESM support. Use for unit + integration tests. | HIGH |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **tsup** | Build CLI + MCP server bundle | `tsup src/index.ts --format esm --dts` for the npm package |
| **esbuild** | Build VS Code extension | VS Code extensions need separate esbuild config (CommonJS output for extension host, ESM for webview) |
| **vitest** | Test runner | Config: `vitest.config.ts` with `environment: 'node'` |
| **@modelcontextprotocol/inspector** | MCP server testing | Official MCP Inspector for testing tool/resource registration without a real client |
| **TypeScript** | Type checking | Run `tsc --noEmit` separately from build (esbuild/tsup don't type-check) |

### VS Code Extension Stack

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **@types/vscode** | ^1.96.0 | VS Code API types | Match your minimum VS Code engine version | HIGH |
| **esbuild** | 0.27.x | Extension bundler | Official VS Code recommendation. Use `yo code` generator with esbuild option. | HIGH |
| **Webview API** (built-in) | -- | Side panel UI | No framework needed for diagram display. Load Mermaid.js in webview, receive diagram updates via `postMessage`. Vanilla JS is sufficient for a diagram viewer. | HIGH |

---

## Installation

```bash
# Core dependencies
npm install @modelcontextprotocol/sdk zod@^3.25 ws commander

# Supporting
npm install chokidar open picocolors

# Dev dependencies
npm install -D typescript@~5.9 tsup vitest esbuild @types/node @types/ws

# VS Code extension dev (separate package or workspace)
npm install -D @types/vscode @vscode/vsce
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `ws` | `socket.io` | Never for this project. Socket.io adds protocol overhead, rooms/namespaces complexity, and a client library requirement. We need raw WebSocket for simple diagram push. |
| `ws` | Node.js native WebSocket | When Node.js ships a native WebSocket *server* (not yet as of Node 24.x). Native client exists but no server. |
| `commander` | `yargs` | If you need complex option parsing with lots of flags. Commander is cleaner for subcommand-style CLIs like ours. |
| `commander` | `oclif` | If building a large CLI framework with plugins. Overkill for 3-4 subcommands. |
| `tsup` | Raw `esbuild` | If you need maximum control or tsup's defaults don't fit. For the VS Code extension build, use raw esbuild directly (VS Code has specific bundling requirements). |
| `tsup` | `unbuild` / `tshy` | unbuild for library publishing to JSR. tshy for dual CJS/ESM. Neither adds value over tsup for our CLI use case. |
| `chokidar` | `node:fs.watch` | Never. `fs.watch` has platform-inconsistent behavior, no recursive watching on all platforms, and no debouncing. chokidar exists because `fs.watch` is broken. |
| `vitest` | `jest` | If team already uses Jest. Vitest is faster, has native ESM/TS, and better DX. No reason to choose Jest for a greenfield project. |
| Vanilla JS webview | React in webview | If the VS Code side panel needs complex state management (forms, lists, interactions). For a diagram viewer with annotation overlays, vanilla JS + Mermaid is sufficient. Revisit if UI complexity grows. |
| `picocolors` | `chalk` | If you need full 256-color/truecolor support. picocolors covers our needs (status messages, errors) at 1/10th the size. |
| Mermaid CDN in browser | Server-side Mermaid rendering | Never for real-time use. SSR Mermaid requires headless Chromium (Puppeteer), adds 200MB+ dependency, 500ms+ per render. Browser-side rendering is instant. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Express.js** | Heavyweight for our needs. We serve static files + WebSocket + a few JSON endpoints. Node's built-in `http` module handles this in ~50 lines. Express adds 30+ transitive dependencies for zero benefit here. | `node:http` (built-in) + `ws` |
| **Socket.io** | Adds custom protocol on top of WebSocket. Requires Socket.io client library in browser. Our use case is simple: server pushes diagram JSON to browser. Raw WebSocket is simpler and faster. | `ws` |
| **Fastify / Hono / Koa** | Same rationale as Express. We have 3-4 routes total. A framework adds dependency weight and abstraction we don't need. | `node:http` built-in |
| **React/Vue/Svelte in VS Code webview** | For a diagram viewer, a JS framework adds build complexity (bundling framework into webview), increases load time, and is unnecessary. Mermaid already renders to SVG; we just need to display it and overlay annotations. | Vanilla JS + Mermaid.js CDN in webview |
| **@mermaid-js/mermaid-cli** for server-side rendering | Requires Puppeteer (headless Chromium). Adds ~200MB to install, 500ms+ per render. For real-time diagramming, render in the browser where Mermaid is designed to run. | Mermaid.js client-side rendering in browser/webview |
| **Zod v4** (with MCP SDK v1.x) | MCP SDK v1 expects Zod v3 imports (`from 'zod'`). Zod v4 changes the import to `from 'zod/v4'`. Mixing causes type incompatibilities with MCP tool schemas. | `zod@^3.25` until MCP SDK v2 migration |
| **tsx** for production runtime | `tsx` is for development (run TS files directly). Ship compiled JS via tsup/esbuild. Global CLI must run without requiring tsx as a runtime dependency. | Compile with tsup, ship JS |
| **Primus** | Abandoned/unmaintained WebSocket wrapper. Last meaningful update years ago. | `ws` |
| **Webpack** | Slow, complex config. esbuild does the same job 100x faster with less config. VS Code officially recommends esbuild for extension bundling. | `esbuild` (direct) or `tsup` (wrapper) |

---

## Architecture-Relevant Stack Decisions

### Single Process Design

The tool runs as ONE Node.js process that is simultaneously:
1. An **MCP server** (stdio transport -- Claude Code/Cursor spawn it as a child process)
2. An **HTTP server** (serves diagram viewer UI on `localhost:PORT`)
3. A **WebSocket server** (pushes real-time diagram updates to browser)
4. A **file watcher** (monitors `.mmd` files for external changes)

This is achievable because:
- MCP stdio transport reads from `process.stdin` / writes to `process.stdout` (non-blocking)
- HTTP + WebSocket servers share the same `http.Server` instance (ws attaches to it)
- File watcher runs as async event emitter
- All are event-driven, non-blocking -- fits Node.js single-thread model perfectly

```
Claude Code ──stdio──> [MCP Server]
                            |
                        [Core Logic] ──> read/write .mmd files
                            |
Browser    <──WebSocket──> [HTTP + WS Server]
                            |
Filesystem <──chokidar──> [File Watcher]
```

### MCP Transport: Stdio for IDE Integration

Claude Code and Cursor connect to MCP servers via **stdio transport** (spawn as child process). This is the standard local integration pattern. The HTTP Streamable transport is for remote/hosted MCP servers -- not our use case.

Configuration in `~/.claude.json` or `.mcp.json`:
```json
{
  "mcpServers": {
    "smartb-diagrams": {
      "type": "stdio",
      "command": "smartb-diagrams",
      "args": ["serve"]
    }
  }
}
```

### Mermaid Rendering: Browser-Only

Mermaid.js is designed for browser environments. It requires DOM APIs (`SVGTextElement.getBBox()`) to compute layout. Server-side rendering requires headless Chromium, which violates our constraints (minimal deps, <100ms latency).

Strategy:
- Server stores/manages `.mmd` text files
- Browser/webview loads Mermaid.js and renders SVG client-side
- WebSocket pushes updated `.mmd` content; browser re-renders instantly
- VS Code webview loads Mermaid.js from CDN or bundled asset

### npm Global Package Structure

```
smartb-diagrams/
  package.json          # bin: { "smartb-diagrams": "./dist/cli.js" }
  dist/
    cli.js              # Entry point (#!/usr/bin/env node)
    server.js           # MCP + HTTP + WS server
    public/             # Static assets (HTML, bundled Mermaid viewer JS)
  src/
    cli.ts              # Commander setup
    server.ts           # Core server logic
    mcp/                # MCP tool/resource handlers
    http/               # HTTP routes + static serving
    ws/                 # WebSocket handler
    watcher.ts          # chokidar file watcher
```

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@modelcontextprotocol/sdk@1.26.x` | `zod@^3.25` | v1 SDK requires Zod v3. Do NOT use Zod v4 with MCP SDK v1. |
| `@modelcontextprotocol/sdk@1.26.x` | `node >= 18` | SDK supports Node 18+, but we target Node 22 LTS for other deps. |
| `chokidar@5.x` | `node >= 20` | v5 is ESM-only, requires Node 20+. |
| `commander@14.x` | `node >= 20` | v14 dropped Node 18 support. |
| `tsup@8.5.x` | `typescript@~5.9`, `esbuild@0.27.x` | tsup 8.x uses esbuild internally. |
| `mermaid@11.12.x` | Browser only | Do not import in Node.js server code. Load via CDN or bundle for webview. |
| `ws@8.19.x` | `node >= 18` | No external dependencies. |
| `vitest@4.0.x` | `typescript@~5.9`, `node >= 22` | Vitest 4.x requires Node 22+. |

---

## Stack Patterns by Variant

**If MCP SDK v2 ships stable before development starts:**
- Switch to `@modelcontextprotocol/server` + `zod@^4.3`
- Use `StdioServerTransport` from `@modelcontextprotocol/server/server/stdio`
- Everything else remains the same

**If VS Code side panel needs rich interactivity beyond diagram display:**
- Add Preact (3KB) to webview, bundled via esbuild
- Still avoid React (too heavy for a webview panel)
- Mermaid.js remains the rendering engine regardless

**If the project needs to support Windows natively:**
- MCP stdio transport works, but `npx` commands need `cmd /c` wrapper
- chokidar v5 handles Windows paths correctly
- Test file path handling with `node:path` (not string concatenation)

---

## Package.json Key Fields

```json
{
  "name": "smartb-diagrams",
  "type": "module",
  "bin": {
    "smartb-diagrams": "./dist/cli.js"
  },
  "engines": {
    "node": ">=22"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  }
}
```

---

## Sources

- `/modelcontextprotocol/typescript-sdk` (Context7) -- MCP server API, transport options, McpServer class, tool/resource registration. **HIGH confidence.**
- `/mermaid-js/mermaid` (Context7) -- Mermaid.render() API, browser-only rendering, v11 documentation. **HIGH confidence.**
- `/microsoft/vscode-docs` (Context7) -- Webview panel API, message passing, serialization. **HIGH confidence.**
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) -- v1 vs v2 status, monorepo structure, transport docs. **HIGH confidence.**
- [MCP Official Docs - Build Server](https://modelcontextprotocol.io/docs/develop/build-server) -- Stdio transport setup, project configuration. **HIGH confidence.**
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) -- How Claude Code connects to MCP servers, stdio config. **HIGH confidence.**
- [Node.js Releases](https://nodejs.org/en/about/previous-releases) -- LTS schedule, v22 Active LTS. **HIGH confidence.**
- [ws npm](https://www.npmjs.com/package/ws) -- v8.19.0, WebSocket server for Node.js. **HIGH confidence.**
- [commander npm](https://www.npmjs.com/package/commander) -- v14.0.3, CLI parsing. **HIGH confidence.**
- [tsup npm](https://www.npmjs.com/package/tsup) -- v8.5.1, TypeScript bundler. **HIGH confidence.**
- [Zod v4 Release Notes](https://zod.dev/v4) -- v4.3.6 current, v3 compat notes. **HIGH confidence.**
- [mermaid npm](https://www.npmjs.com/package/mermaid) -- v11.12.2, latest stable. **HIGH confidence.**
- [esbuild npm](https://www.npmjs.com/package/esbuild) -- v0.27.3, latest. **HIGH confidence.**
- [chokidar npm](https://www.npmjs.com/package/chokidar) -- v5.x, ESM-only, Node >= 20. **HIGH confidence.**
- [vitest npm](https://www.npmjs.com/package/vitest) -- v4.0.18, latest. **HIGH confidence.**
- [VS Code Extension Bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) -- esbuild recommended for extensions. **HIGH confidence.**
- [TypeScript npm](https://www.npmjs.com/package/typescript) -- v5.9.3 stable, v6.0 beta. **HIGH confidence.**
- [Mermaid SSR Issue #3650](https://github.com/mermaid-js/mermaid/issues/3650) -- Confirms browser requirement for rendering, JSDOM insufficient. **HIGH confidence.**

---
*Stack research for: SmartB Diagrams -- AI observability developer tooling*
*Researched: 2026-02-14*
