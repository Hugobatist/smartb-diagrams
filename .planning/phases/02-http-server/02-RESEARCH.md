# Phase 2: HTTP Server - Research

**Researched:** 2026-02-14
**Domain:** Node.js HTTP server, REST API, static file serving, CLI subcommands, browser UI rendering
**Confidence:** HIGH

## Summary

Phase 2 requires building an HTTP server that serves the existing `live.html` browser UI, exposes REST endpoints for diagram file listing and content retrieval, and integrates with the CLI via a `smartb serve` subcommand. The existing static assets (`live.html`, `annotations.js`, `annotations.css`, `diagram-editor.js`) already implement a full browser-based Mermaid diagram viewer with editor, flag system, and file tree -- they just need an HTTP server to serve them and REST endpoints to back their `fetch()` calls.

The key architectural decision is whether to use Node.js built-in `http` module or a framework like Fastify. Given the project's established pattern of preferring Node.js built-ins over external packages (fs.glob over fast-glob, regex validator over @mermaid-js/parser), and the fact that this is a simple dev server (not a production API), **use Node.js built-in `http.createServer`** with a thin routing layer. The server needs only ~6 routes and static file serving -- this does not justify a framework dependency.

**Primary recommendation:** Use Node.js built-in `http.createServer` with a hand-written router (~100 lines), `detect-port` for graceful port fallback, and `open` for cross-platform browser opening. Add Commander subcommand `serve` with `--port` and `--dir` options.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:http` | built-in (Node 22+) | HTTP server | Zero dependencies, sufficient for dev server with ~6 routes |
| `node:fs/promises` | built-in | Read/write .mmd files | Already used in Phase 1 DiagramService |
| `node:path` | built-in | Path resolution and MIME type detection | Already used in Phase 1 paths utility |
| `commander` | ^14.0.3 | CLI `serve` subcommand | Already a dependency from Phase 1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `detect-port` | ^2.1.0 | Find available port when default (3333) is occupied | Always -- port fallback is a core requirement (HTTP-04) |
| `open` | ^11.0.0 | Open browser at server URL cross-platform | On `smartb serve` startup (ESM-only, matches project's ESM setup) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:http` | Fastify + @fastify/static + @fastify/cors | 3 extra deps, better DX for large APIs, but overkill for ~6 routes. Fastify has known tsup/ESM friction (autoload issues). Phase 3 will add WebSocket which Fastify also needs a plugin for. |
| `detect-port` | Hand-rolled `net.createServer` port probing | ~15 lines of code, but detect-port handles edge cases (race conditions, random available port selection). Worth the small dependency. |
| `open` | Platform-specific child process spawning | 3 lines + platform switch (`open` on macOS, `xdg-open` on Linux, `start` on Windows). The `open` package handles WSL, snap sandboxing, and other edge cases across all platforms. |

**Installation:**
```bash
npm install detect-port open
```

Note: `detect-port` supports both CJS and ESM. `open` is pure ESM (v10+), which matches the project's `"type": "module"` configuration.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── cli.ts                  # Existing -- add `serve` subcommand
├── server/
│   ├── server.ts           # createServer, routing, CORS middleware
│   ├── routes.ts           # Route handlers for REST API endpoints
│   └── static.ts           # Static file serving utility
├── diagram/                # Existing (Phase 1)
│   ├── service.ts
│   ├── types.ts
│   ├── parser.ts
│   ├── annotations.ts
│   └── validator.ts
├── project/                # Existing (Phase 1)
│   ├── manager.ts
│   └── discovery.ts
├── utils/                  # Existing
│   ├── paths.ts            # Add getStaticDir (already exists)
│   └── logger.ts
└── index.ts                # Existing barrel export
```

### Pattern 1: Thin Router on node:http
**What:** A simple routing function that maps `method + pathname` to handler functions, avoiding a framework.
**When to use:** When you have fewer than ~20 routes and don't need middleware chains, schema validation, or plugin systems.
**Example:**
```typescript
// Source: Node.js http.createServer docs + common pattern
import { createServer, IncomingMessage, ServerResponse } from 'node:http';

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const routes: Route[] = [];

function addRoute(method: string, path: string, handler: Handler): void {
  // Convert /api/diagrams/:file to regex
  const pattern = new RegExp(
    '^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'
  );
  routes.push({ method, pattern, handler });
}

function createRouter(fallback: Handler): Handler {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const match = routes.find(
      r => r.method === req.method && r.pattern.test(url.pathname)
    );
    if (match) {
      await match.handler(req, res);
    } else {
      await fallback(req, res);
    }
  };
}
```

### Pattern 2: CORS as Response Header Helper
**What:** Instead of a middleware plugin, add CORS headers via a simple helper function called in each response.
**When to use:** When CORS policy is uniform (allow all origins for local dev server).
**Example:**
```typescript
// Source: MDN CORS documentation + standard pattern
function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Handle OPTIONS preflight
if (req.method === 'OPTIONS') {
  setCorsHeaders(res);
  res.writeHead(204);
  res.end();
  return;
}
```

### Pattern 3: Static File Serving with MIME Types
**What:** Serve files from the `dist/static/` directory with correct Content-Type headers.
**When to use:** For serving HTML, JS, CSS, and other static assets.
**Example:**
```typescript
// Source: Node.js fs/path docs + standard pattern
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mmd': 'text/plain; charset=utf-8',
};

async function serveStaticFile(
  res: ServerResponse,
  filePath: string
): Promise<boolean> {
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}
```

### Pattern 4: Commander Subcommand with Options
**What:** Add `serve` as a Commander subcommand with `--port` and `--dir` options.
**When to use:** When extending existing CLI with new commands.
**Example:**
```typescript
// Source: Commander.js docs - subcommands
import { Command } from 'commander';

program
  .command('serve')
  .description('Start the diagram viewer server')
  .option('-p, --port <number>', 'port number', '3333')
  .option('-d, --dir <path>', 'project directory', '.')
  .option('--no-open', 'do not open browser automatically')
  .action(async (options) => {
    const { startServer } = await import('./server/server.js');
    await startServer({
      port: parseInt(options.port, 10),
      dir: options.dir,
      openBrowser: options.open,
    });
  });
```

### Pattern 5: Port Fallback with detect-port
**What:** Try the preferred port, fall back to next available if occupied.
**When to use:** Always, since default port 3333 may be in use.
**Example:**
```typescript
// Source: detect-port npm docs
import { detect } from 'detect-port';

const preferredPort = 3333;
const actualPort = await detect(preferredPort);
if (actualPort !== preferredPort) {
  log.warn(`Port ${preferredPort} in use, using ${actualPort}`);
}
server.listen(actualPort);
```

### Anti-Patterns to Avoid
- **Express.js for a dev server:** Express is CJS-first, has security middleware baggage, and adds unnecessary weight for ~6 routes. Node.js built-in http is cleaner for this use case.
- **Bundling static assets as string literals:** The project already copies `static/` to `dist/static/` via tsup's onSuccess hook. Don't inline HTML/JS/CSS as template strings -- just serve the files.
- **Blocking the event loop with sync file reads:** Use `fs/promises` (async) for all file I/O in the server. The DiagramService already does this correctly.
- **Hardcoding localhost/127.0.0.1:** Listen on `0.0.0.0` or let Node default, but display the localhost URL to the user. This allows network access during development.

## Existing Code to Leverage

### DiagramService (Phase 1)
The server routes should use `DiagramService` for all diagram operations. It already provides:
- `listFiles()` -- returns relative paths to all .mmd files
- `readDiagram(filePath)` -- parses content, flags, validation
- `writeDiagram(filePath, content, flags)` -- writes with annotation injection
- `validate(filePath)` -- returns ValidationResult
- Path traversal protection via `resolveProjectPath()`

### Static Assets (already exist)
The `static/` directory contains the complete browser UI:
- `live.html` -- Full Mermaid viewer with editor, sidebar, zoom, flags
- `annotations.js` -- Flag system (click-to-flag, persist as `%% @flag`)
- `annotations.css` -- Flag UI styling
- `diagram-editor.js` -- Visual node/edge editor

### Expected Endpoints from live.html
The existing `live.html` makes these fetch calls that the server must serve:

| Client Fetch | Method | Server Must Provide |
|---|---|---|
| `fetch(currentFile + '?t=...')` | GET | Serve .mmd file content from project dir |
| `fetch('tree.json?t=...')` | GET | Return JSON tree structure of .mmd files |
| `fetch('/save', { method: 'POST', body: {filename, content} })` | POST | Write .mmd file to project dir |
| `fetch('/delete', { method: 'POST', body: {filename} })` | POST | Delete .mmd file |
| `fetch('/mkdir', { method: 'POST', body: {folder} })` | POST | Create directory in project |
| `fetch('/move', { method: 'POST', body: {from, to} })` | POST | Rename/move .mmd file |

**Important:** The UI also loads static assets (`annotations.js`, `annotations.css`, `diagram-editor.js`) as relative URLs from the same origin. The server must serve these from `dist/static/`.

### REST API Design for Phase 2

Phase 2 requirements (HTTP-02, HTTP-03) call for REST endpoints. The existing `live.html` uses informal endpoint names (`/save`, `/delete`). For Phase 2, we should:

1. **Keep the existing informal endpoints working** -- live.html depends on them
2. **Add proper REST endpoints** for programmatic use:
   - `GET /api/diagrams` -- list available .mmd files (HTTP-02)
   - `GET /api/diagrams/:file` -- get diagram content as JSON with mermaidContent, flags, validation (HTTP-03)

This dual approach maintains backward compatibility with the existing UI while satisfying the REST requirement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Port availability detection | net.createServer probe loop | `detect-port` | Race conditions, random port selection, edge cases on different OS |
| Cross-platform browser opening | Platform-specific process spawning | `open` | WSL detection, snap sandboxing, fallback chains, tested on all platforms |
| MIME type detection | Exhaustive extension-to-type map | Small built-in map (~10 entries) | This server only serves known file types (.html, .js, .css, .json, .mmd, .svg, .png). No need for a full MIME library. |
| JSON body parsing | Manual buffer collection | Small `readBody()` helper | Only 4 POST endpoints, a 10-line helper is fine |

**Key insight:** The server's complexity is low enough that a framework adds more cognitive overhead than it saves. But port detection and browser opening have genuine cross-platform edge cases that justify small dependencies.

## Common Pitfalls

### Pitfall 1: Static Asset Path Resolution After npm install -g
**What goes wrong:** `__dirname` or `import.meta.dirname` resolves to the wrong location when the package is installed globally, causing 404s for static assets.
**Why it happens:** Global install copies to a different directory tree. Relative paths from source code don't match production layout.
**How to avoid:** Use `import.meta.dirname` (available in Node 22+) which points to the compiled file's actual location. The existing `getStaticDir()` in `src/utils/paths.ts` already does this correctly: `path.join(import.meta.dirname, '..', 'static')`.
**Warning signs:** Static files work in dev (`npm run dev`) but 404 after `npm install -g .`.

### Pitfall 2: Serving .mmd Files from Wrong Root
**What goes wrong:** The server serves .mmd files from the package's `dist/` directory instead of the user's project directory (cwd or --dir flag).
**Why it happens:** Confusing two file roots: static assets come from the package install location, but diagram files come from the user's working directory.
**How to avoid:** Use two separate roots:
- **Static root:** `getStaticDir()` -- for HTML/JS/CSS assets
- **Project root:** `process.cwd()` or `--dir` option -- for .mmd files
**Warning signs:** Diagrams that exist on disk don't appear in the file listing.

### Pitfall 3: Forgetting CORS Preflight (OPTIONS)
**What goes wrong:** Browser blocks POST requests to `/save`, `/delete`, etc. with CORS errors.
**Why it happens:** Browser sends an OPTIONS preflight request for POST with `Content-Type: application/json`. If the server doesn't handle OPTIONS, the preflight fails.
**How to avoid:** Handle `OPTIONS` method at the top of the request handler, before routing. Return 204 with CORS headers.
**Warning signs:** GET requests work, POST requests fail with "CORS policy" error in browser console.

### Pitfall 4: Path Traversal via .mmd File Requests
**What goes wrong:** A crafted request like `GET /../../etc/passwd` reads files outside the project directory.
**Why it happens:** Naive path joining without validation.
**How to avoid:** Use `DiagramService.resolvePath()` which already has traversal protection. For raw file serving, use `resolveProjectPath()` from `src/utils/paths.ts`. Never construct paths by simple string concatenation.
**Warning signs:** No explicit path validation in the file-serving handler.

### Pitfall 5: tsup Entry Point Not Including Server
**What goes wrong:** Server code exists in src but isn't included in the build output.
**Why it happens:** tsup only compiles explicit entry points listed in `tsup.config.ts`. Currently only `src/cli.ts` and `src/index.ts` are entries.
**How to avoid:** The server module should be imported by `cli.ts` (via dynamic import in the `serve` command action). Since `cli.ts` is an entry point, anything it imports gets bundled. Use dynamic `import()` to keep the server code lazy-loaded.
**Warning signs:** `smartb serve` fails with "Cannot find module" after build.

### Pitfall 6: tree.json Format Mismatch
**What goes wrong:** The file tree endpoint returns a flat list, but live.html expects a nested folder/file tree structure.
**Why it happens:** `DiagramService.listFiles()` returns flat relative paths like `['folder/file.mmd']`. The UI expects a nested JSON tree.
**How to avoid:** Build a tree transformation function that converts flat paths to the nested structure live.html expects:
```json
[
  {
    "type": "folder",
    "name": "folder-name",
    "children": [
      { "type": "file", "name": "file.mmd", "path": "folder-name/file.mmd" }
    ]
  }
]
```
**Warning signs:** Sidebar shows nothing or shows flat filenames without folder hierarchy.

## Code Examples

Verified patterns from official sources:

### JSON Response Helper
```typescript
// Source: Node.js http docs
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  setCorsHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}
```

### POST Body Parser
```typescript
// Source: Node.js stream/http docs
async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T;
}
```

### Server Startup with Port Fallback and Browser Open
```typescript
// Source: detect-port docs + open docs + Node.js http docs
import { createServer } from 'node:http';
import { detect } from 'detect-port';
import open from 'open';
import { log } from '../utils/logger.js';

export async function startServer(options: {
  port: number;
  dir: string;
  openBrowser: boolean;
}): Promise<void> {
  const actualPort = await detect(options.port);
  if (actualPort !== options.port) {
    log.warn(`Port ${options.port} is in use, using port ${actualPort}`);
  }

  const service = new DiagramService(path.resolve(options.dir));
  const handler = createRouter(service);
  const server = createServer(handler);

  server.listen(actualPort, () => {
    const url = `http://localhost:${actualPort}`;
    log.info(`Server running at ${url}`);
    if (options.openBrowser) {
      open(url).catch(() => {
        log.warn('Could not open browser automatically');
      });
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    log.info('Shutting down...');
    server.close(() => process.exit(0));
  });
}
```

### Flat-to-Tree Converter for File Listing
```typescript
// Source: custom utility needed for live.html tree.json format
interface TreeNode {
  type: 'file' | 'folder';
  name: string;
  path?: string;
  children?: TreeNode[];
}

function buildFileTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.push({ type: 'file', name: part, path: filePath });
      } else {
        let folder = current.find(
          n => n.type === 'folder' && n.name === part
        );
        if (!folder) {
          folder = { type: 'folder', name: part, children: [] };
          current.push(folder);
        }
        current = folder.children!;
      }
    }
  }

  return root;
}
```

### Mermaid Status Color Injection
```typescript
// Source: Mermaid.js flowchart docs - classDef syntax
// UI-04: Color-coded node status (green/red/yellow/gray)
//
// The existing live.html uses Mermaid's client-side rendering.
// Status colors are applied via CSS classDef in the .mmd content.
// The server's role is to include status in the API response.
//
// classDef ok fill:#22c55e,stroke:#16a34a,color:#fff;
// classDef problem fill:#ef4444,stroke:#dc2626,color:#fff;
// classDef inProgress fill:#eab308,stroke:#ca8a04,color:#000;
// classDef discarded fill:#9ca3af,stroke:#6b7280,color:#fff;
//
// Status colors should be injected into the Mermaid content
// based on annotation flags, either server-side before sending
// or client-side in live.html after receiving the diagram content.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express.js for everything | Built-in http for simple servers, Fastify/Hono for APIs | 2023+ | Less dependency weight for dev tools |
| `__dirname` in ESM | `import.meta.dirname` (Node 21.2+) | Node 21.2 / 2023 | No `fileURLToPath(import.meta.url)` workaround needed |
| `get-port` (ESM-only, complex API) | `detect-port` (dual CJS+ESM, simple API) | Stable | Simpler integration, no ESM-only friction |
| Custom port probing | `detect-port` or `get-port` | Stable | Handles edge cases developers miss |

**Deprecated/outdated:**
- Express 4.x: Still maintained but CJS-first, does not fit ESM-first projects
- `portfinder`: Last published 2021, effectively abandoned. Use `detect-port` instead.

## Open Questions

1. **Should the server watch for file changes in Phase 2 or defer to Phase 3?**
   - What we know: Phase 3 explicitly covers WebSocket + file watching. The existing live.html polls via `setInterval(syncFile, 2000)` which works with simple HTTP GET.
   - What's unclear: Whether the polling approach is "good enough" for Phase 2 or if basic file watching should be added early.
   - Recommendation: **Defer to Phase 3.** The polling in live.html already works. Phase 2 just needs the GET endpoint to return current file content. Phase 3 replaces polling with WebSocket push.

2. **Should /save, /delete, /mkdir, /move endpoints be implemented in Phase 2?**
   - What we know: live.html calls these endpoints. They're needed for the full editor experience. But the Phase 2 requirements only mention listing (HTTP-02) and reading (HTTP-03) diagrams.
   - What's unclear: Whether Phase 2 should be read-only or support the full edit workflow.
   - Recommendation: **Implement all 6 endpoints.** The code is trivial (~5 lines each), DiagramService already has the primitives, and the UI won't work properly without them. The write endpoints are not in the explicit requirements but are needed for the success criteria ("starts a server that serves a browser-based diagram viewer" -- the viewer includes the editor).

3. **Status color visualization (UI-04): server-side or client-side?**
   - What we know: Mermaid supports `classDef` for styling nodes. The DiagramNode type has an optional `status` field. The existing live.html doesn't currently implement status colors.
   - What's unclear: Whether status colors should be injected server-side into the Mermaid content or applied client-side after rendering.
   - Recommendation: **Client-side in live.html.** The server returns diagram content with flags/status via the REST API. The browser JS injects `classDef` and `class` directives before calling `mermaid.render()`. This keeps server logic simple and allows the UI to update styles without re-fetching.

4. **Inline error display (UI-07): how to surface validation errors?**
   - What we know: `DiagramService.readDiagram()` returns a `ValidationResult` with `errors[]` containing `message`, `line`, and `column`. The existing live.html catches Mermaid render errors and shows them inline.
   - What's unclear: Whether server-side validation errors should be shown in addition to Mermaid's own client-side errors.
   - Recommendation: **Return validation in the REST API response, and enhance live.html to show structured errors.** The server's regex-based validator catches issues before Mermaid even tries. The client should show both: server validation errors (with line numbers) and Mermaid render errors.

## Sources

### Primary (HIGH confidence)
- `/nodejs/node/v22_20_0` (Context7) - HTTP server createServer, listen, request handling
- `/fastify/fastify` (Context7) - TypeScript setup, lifecycle hooks, evaluated but not selected
- `/fastify/fastify-static` (Context7) - Static file serving patterns, evaluated but not selected
- `/fastify/fastify-cors` (Context7) - CORS configuration patterns, used as reference for hand-rolled approach
- `/tj/commander.js` (Context7) - Subcommand definition with options and action handlers
- Node.js v22 documentation (http, fs, path, net modules)

### Secondary (MEDIUM confidence)
- [detect-port npm](https://www.npmjs.com/package/detect-port) - v2.1.0, port detection API verified
- [open npm](https://www.npmjs.com/package/open) - v11.0.0, ESM-only, cross-platform browser opening verified
- [Mermaid.js Flowchart Styling](https://mermaid.ai/open-source/syntax/flowchart.html) - classDef syntax for node colors
- [Fastify tsup ESM issues](https://github.com/fastify/fastify-cli/issues/487) - Known bundling friction, factored into decision

### Tertiary (LOW confidence)
- None -- all critical findings verified with primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Node.js built-in http is well-documented, detect-port/open are stable small packages with clear APIs
- Architecture: HIGH - Pattern follows existing codebase conventions (built-in over external), existing static assets and DiagramService define clear integration points
- Pitfalls: HIGH - Path resolution, CORS preflight, tsup entry points are well-understood problems with verified solutions
- UI requirements (status colors, errors): MEDIUM - Implementation approach is clear but some UI decisions remain open

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable domain, 30-day validity)
