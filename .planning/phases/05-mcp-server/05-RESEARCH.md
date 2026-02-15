# Phase 5: MCP Server - Research

**Researched:** 2026-02-15
**Domain:** Model Context Protocol (MCP) stdio server, tool/resource registration, shared-state architecture
**Confidence:** HIGH

## Summary

The MCP TypeScript SDK (`@modelcontextprotocol/sdk` v1.26.0) provides a high-level `McpServer` class that handles tool/resource registration and JSON-RPC protocol negotiation. The server connects to AI tools (Claude Code, Cursor) via `StdioServerTransport`, which communicates over stdin/stdout. This means **all logging must go to stderr** -- any stdout write corrupts the protocol.

The critical architectural challenge for this phase is MCP-10: the MCP server and the HTTP/WS server must share the same process and state. Since `StdioServerTransport` just wraps `process.stdin`/`process.stdout`, it can coexist with an HTTP server in the same Node.js process. The `McpServer` instance needs access to the same `DiagramService` and `WebSocketManager` instances that the HTTP server uses, so tool calls (e.g., `update_diagram`) can write files that the file watcher picks up and broadcasts to browser clients within 100ms.

The SDK uses Zod (v3.25+ or v4) for schema validation. The project already requires Node 22+, and the SDK is ESM-compatible. The existing logger already writes to stderr via `console.error()`, which satisfies MCP-09 out of the box.

**Primary recommendation:** Use `@modelcontextprotocol/sdk` v1.26.0 with `McpServer` + `StdioServerTransport`. Create the MCP server in the same process as the HTTP server, sharing `DiagramService` instances. Register 4 tools and 2 resources using `registerTool()` / `registerResource()` with Zod input schemas. Add a `smartb mcp` CLI command that starts the stdio server (optionally with `--serve` to also start HTTP+WS in the same process).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.26.0 | MCP server framework | Official Anthropic SDK; provides McpServer, StdioServerTransport, ResourceTemplate |
| `zod` | ^3.25 or ^4.0 | Schema validation for MCP tools | Peer dependency of MCP SDK; used for input/output schema definitions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (existing) `chokidar` | ^5.0.0 | File watching | Already in project -- triggers WS broadcast when MCP writes files |
| (existing) `ws` | ^8.19.0 | WebSocket | Already in project -- broadcasts file changes to browser |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@modelcontextprotocol/sdk` v1.x | v2 (`@modelcontextprotocol/server`) | v2 is not yet published to npm (pre-alpha, expected Q1 2026). Stick with stable v1.26.0 |
| `McpServer` (high-level) | `Server` (low-level) | Low-level requires manual JSON-RPC handling. McpServer wraps it with tool/resource registration helpers |
| `fastmcp` (community wrapper) | `@modelcontextprotocol/sdk` | Official SDK is more stable, well-documented, and maintained by Anthropic |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk zod
```

**Note on Zod version:** The MCP SDK accepts `zod ^3.25 || ^4.0` as peer dependency. Zod v4 is latest (4.3.6). The v1.x branch SDK "internally imports from `zod/v4`, but maintains backwards compatibility with projects using Zod v3.25 or later." Use `zod@^4.0` since this project is greenfield for MCP and there are no existing Zod dependencies.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── mcp/
│   ├── server.ts          # McpServer creation, tool & resource registration
│   ├── tools.ts           # Tool handlers (update_diagram, read_flags, get_diagram_context, update_node_status)
│   ├── resources.ts       # Resource handlers (diagram list, diagram content)
│   └── schemas.ts         # Zod schemas for all tool inputs/outputs
├── server/
│   ├── server.ts          # (existing) HTTP server + createHttpServer
│   └── ...
├── diagram/
│   ├── service.ts         # (existing) DiagramService - shared between MCP and HTTP
│   └── ...
└── cli.ts                 # (existing) Add `smartb mcp` command
```

### Pattern 1: Shared DiagramService Between MCP and HTTP
**What:** Both the MCP tool handlers and the HTTP route handlers use the same `DiagramService` instance bound to the project directory. When the MCP tool writes a file via `DiagramService.writeDiagram()`, the chokidar watcher detects the change and broadcasts it via WebSocket to the browser.
**When to use:** Always -- this is the core architecture for MCP-10.
**Example:**
```typescript
// Source: Architectural pattern derived from existing codebase
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DiagramService } from '../diagram/service.js';

export function createMcpServer(service: DiagramService): McpServer {
  const server = new McpServer({
    name: 'smartb-diagrams',
    version: '0.1.0',
  });

  // Register tools that use the shared DiagramService
  // Register resources that use the shared DiagramService
  registerTools(server, service);
  registerResources(server, service);

  return server;
}

// In CLI: create shared service, start both servers
const service = new DiagramService(projectDir);
const mcpServer = createMcpServer(service);
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
```

### Pattern 2: Tool Registration with registerTool() API
**What:** The v1.26.0 SDK supports both the legacy `tool()` API and the modern `registerTool()` API. Use `registerTool()` for cleaner config objects.
**When to use:** For all tool registrations.
**Example:**
```typescript
// Source: https://modelcontextprotocol.io/docs/develop/build-server (TypeScript tab)
import { z } from 'zod';

server.registerTool(
  'update_diagram',
  {
    description: 'Create or update a .mmd diagram file with Mermaid content',
    inputSchema: {
      filePath: z.string().describe('Relative path to the .mmd file (e.g., "architecture.mmd")'),
      content: z.string().describe('Full Mermaid diagram content'),
    },
  },
  async ({ filePath, content }) => {
    await service.writeDiagram(filePath, content);
    return {
      content: [{ type: 'text', text: `Diagram updated: ${filePath}` }],
    };
  }
);
```

### Pattern 3: Resource Registration with registerResource() API
**What:** Resources expose read-only data. Use static URI for the diagram list, and `ResourceTemplate` with URI parameters for individual diagram content.
**When to use:** For MCP-06 (list) and MCP-07 (content).
**Example:**
```typescript
// Source: Context7 /modelcontextprotocol/typescript-sdk + official docs
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

// Static resource: list of diagrams
server.registerResource(
  'diagram-list',
  'smartb://diagrams',
  {
    title: 'Available Diagrams',
    description: 'List of all .mmd diagram files in the project',
    mimeType: 'application/json',
  },
  async (uri) => {
    const files = await service.listFiles();
    return {
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ files }) }],
    };
  }
);

// Dynamic resource: individual diagram content
server.registerResource(
  'diagram-content',
  new ResourceTemplate('smartb://diagrams/{filePath}', {
    list: async () => {
      const files = await service.listFiles();
      return {
        resources: files.map(f => ({
          uri: `smartb://diagrams/${encodeURIComponent(f)}`,
          name: f,
        })),
      };
    },
  }),
  {
    title: 'Diagram Content',
    description: 'Content of a specific .mmd diagram file',
    mimeType: 'text/plain',
  },
  async (uri, { filePath }) => {
    const decoded = decodeURIComponent(filePath as string);
    const diagram = await service.readDiagram(decoded);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'text/plain',
        text: diagram.mermaidContent,
      }],
    };
  }
);
```

### Pattern 4: CLI Integration with smartb mcp Command
**What:** Add a `smartb mcp` command that starts the MCP stdio server. When `--serve` is also passed, start the HTTP+WS server in the same process so changes via MCP tools appear in the browser immediately.
**When to use:** This is how AI tools (Claude Code, Cursor) will invoke the MCP server.
**Example:**
```typescript
// CLI configuration for claude_desktop_config.json or .claude/settings.json
{
  "mcpServers": {
    "smartb-diagrams": {
      "command": "node",
      "args": ["/path/to/smartb-diagrams/dist/cli.js", "mcp", "--dir", "/path/to/project"]
    }
  }
}
```

### Anti-Patterns to Avoid
- **Writing to stdout in MCP mode:** Any `console.log()` or `process.stdout.write()` corrupts the JSON-RPC stdio transport. The existing logger uses `console.error()` -- keep it that way. The MCP server entry point must NOT enable any middleware/library that writes to stdout.
- **Separate process for MCP and HTTP:** Running them in different processes means they cannot share in-memory state (DiagramService, WebSocket connections). Use a single process with both transports active.
- **Raw JSON-RPC handling:** Using the low-level `Server` class instead of `McpServer` means reimplementing tool discovery, schema validation, and error formatting. Use the high-level API.
- **Wrapping inputSchema in z.object():** The `registerTool()` API with the Zod schema shorthand expects raw Zod shapes (an object of Zod types), NOT wrapped in `z.object()`. The SDK wraps it internally. Passing `z.object(...)` would create a double-wrapped schema.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol negotiation | Custom JSON-RPC handler | `McpServer` from SDK | Protocol has initialization, capability negotiation, and error codes |
| Schema validation | Manual JSON parsing | Zod schemas via SDK's `inputSchema` | SDK auto-validates and returns structured errors to client |
| Stdio transport | Manual stdin/stdout parsing | `StdioServerTransport` | Handles message framing, buffering, and newline-delimited JSON |
| Resource URI templates | Regex-based URI matching | `ResourceTemplate` from SDK | Handles URI parsing, variable extraction, and listing |
| Tool discovery | Custom tool listing | `McpServer.registerTool()` | SDK auto-handles `tools/list` and `tools/call` JSON-RPC methods |

**Key insight:** The MCP SDK handles all protocol-level concerns (initialization, capability negotiation, JSON-RPC framing, error codes). The developer only needs to register tools/resources with business logic callbacks.

## Common Pitfalls

### Pitfall 1: stdout Corruption
**What goes wrong:** Any write to stdout (console.log, process.stdout.write, library that logs to stdout) corrupts the MCP JSON-RPC stream, causing the AI tool to disconnect or hang.
**Why it happens:** Stdio transport uses stdout as its data channel. Mixed data breaks JSON-RPC message framing.
**How to avoid:** (1) The existing logger already uses `console.error()` -- verify nothing changes this. (2) Never use `console.log()` anywhere in MCP code paths. (3) Set `DEBUG` env var to enable debug logging (already goes to stderr). (4) Test by piping stdout to a file and verifying it only contains valid JSON-RPC messages.
**Warning signs:** MCP client shows "connection lost" or "parse error"; server process appears to hang.

### Pitfall 2: MCP Server Blocks HTTP Server (Event Loop)
**What goes wrong:** If tool handlers do heavy synchronous work, they block the Node.js event loop, preventing the HTTP server from responding and WebSocket broadcasts from firing.
**Why it happens:** Both MCP stdio and HTTP server share the same event loop in a single-process architecture.
**How to avoid:** All tool handlers must be async and do I/O only (file reads/writes). The existing DiagramService methods are already async. Avoid `readFileSync` or any sync operations.
**Warning signs:** Browser UI freezes during MCP tool calls; WebSocket pings time out.

### Pitfall 3: File Write Race Between MCP and Watcher
**What goes wrong:** MCP `update_diagram` writes a file, the file watcher fires, reads the file, but the write hasn't fully flushed yet, resulting in partial content broadcast.
**Why it happens:** chokidar's `change` event fires on filesystem notification, which may occur before the write buffer is fully flushed.
**How to avoid:** The existing DiagramService uses `writeFile()` from `node:fs/promises` which awaits the full write. chokidar v5 has `atomic: true` enabled (already configured). This should handle it, but test under load.
**Warning signs:** Browser shows truncated or corrupted diagram content after MCP update.

### Pitfall 4: Zod Schema Mismatch Between v3 and v4
**What goes wrong:** The SDK accepts both Zod v3.25+ and v4 as peer dependencies, but importing from the wrong path causes runtime errors.
**Why it happens:** Zod v4 has a different internal structure. The SDK imports from `zod/v4` internally.
**How to avoid:** Install `zod@^4.0` and import directly from `zod`. Use `import { z } from 'zod'` consistently. Do not mix `zod/v3` and `zod/v4` imports in the same codebase.
**Warning signs:** "Cannot find module" or "z.object is not a function" errors at runtime.

### Pitfall 5: registerTool inputSchema Format
**What goes wrong:** Passing `z.object({ ... })` to `inputSchema` instead of a raw Zod shape causes double-wrapping and schema validation failures.
**Why it happens:** The official quickstart example on modelcontextprotocol.io shows the shorthand format (raw shape object, not wrapped in z.object). The SDK wraps it internally.
**How to avoid:** Pass inputSchema as `{ fieldName: z.string(), ... }` NOT as `z.object({ fieldName: z.string() })`. Follow the official quickstart pattern.
**Warning signs:** AI tool reports "invalid schema" or parameters don't get validated correctly.

### Pitfall 6: MCP Server Not Exiting Cleanly
**What goes wrong:** When the AI tool disconnects, the MCP server process stays alive because the HTTP server keeps the event loop open.
**Why it happens:** `http.Server.listen()` keeps the process alive. The StdioServerTransport doesn't signal shutdown when the parent process disconnects.
**How to avoid:** Listen for the `close` event on the MCP server and gracefully shut down the HTTP server. Also handle `SIGINT`, `SIGTERM`, and stdin `end` events.
**Warning signs:** Zombie node processes after Claude Code sessions end.

## Code Examples

Verified patterns from official sources:

### Complete MCP Server Entry Point (stdio)
```typescript
// Source: https://modelcontextprotocol.io/docs/develop/build-server (TypeScript)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'smartb-diagrams',
  version: '0.1.0',
});

// Register tools...
server.registerTool(
  'tool_name',
  {
    description: 'Tool description for AI agent',
    inputSchema: {
      param1: z.string().describe('Parameter description for AI agent'),
    },
  },
  async ({ param1 }) => {
    // Tool logic
    return {
      content: [{ type: 'text', text: 'Result text' }],
    };
  }
);

// Start transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Server running on stdio'); // stderr is safe
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### Registering a Static Resource
```typescript
// Source: Context7 /modelcontextprotocol/typescript-sdk + official migration guide
server.registerResource(
  'diagram-list',
  'smartb://diagrams',
  {
    title: 'Available Diagrams',
    description: 'List of .mmd files in the project',
    mimeType: 'application/json',
  },
  async (uri) => ({
    contents: [{ uri: uri.href, text: JSON.stringify({ files: ['arch.mmd'] }) }],
  })
);
```

### Registering a Dynamic Resource with URI Template
```typescript
// Source: Context7 /modelcontextprotocol/typescript-sdk
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

server.registerResource(
  'diagram-content',
  new ResourceTemplate('smartb://diagrams/{filePath}', {
    list: async () => ({
      resources: [{ uri: 'smartb://diagrams/arch.mmd', name: 'arch.mmd' }],
    }),
  }),
  { title: 'Diagram Content', mimeType: 'text/plain' },
  async (uri, { filePath }) => ({
    contents: [{ uri: uri.href, text: 'graph LR\n  A --> B' }],
  })
);
```

### Tool Descriptions Optimized for AI Agent UX
```typescript
// Source: Design pattern for optimal AI tool usability
server.registerTool(
  'update_diagram',
  {
    description: 'Create or update a Mermaid diagram (.mmd file). ' +
      'The content should be valid Mermaid syntax (flowchart, sequence, class, etc). ' +
      'Changes appear in the browser viewer within 100ms via WebSocket.',
    inputSchema: {
      filePath: z.string()
        .describe('Relative path to the .mmd file within the project (e.g., "architecture.mmd", "flows/auth.mmd")'),
      content: z.string()
        .describe('Full Mermaid diagram content. Must start with a diagram type keyword (e.g., "graph LR", "sequenceDiagram")'),
    },
  },
  async ({ filePath, content }) => {
    // Validate before writing
    // Write via shared DiagramService
    // Return success with validation info
  }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `server.tool()` (variadic) | `server.registerTool()` (config object) | SDK v1.20+ | Cleaner API, supports title, outputSchema, annotations |
| `server.resource()` | `server.registerResource()` | SDK v1.20+ | Requires metadata argument (even if empty `{}`) |
| `@modelcontextprotocol/sdk` (monolith) | `@modelcontextprotocol/server` (split) | v2 (NOT YET RELEASED) | v2 is pre-alpha on main branch; v1.26.0 remains stable |
| HTTP+SSE transport | Streamable HTTP transport | SDK v1.10.0 | SSE deprecated but still functional; not relevant for stdio use |

**Deprecated/outdated:**
- `server.tool()` legacy API: Still works in v1.x but `registerTool()` is preferred
- `server.resource()` legacy API: Still works but `registerResource()` is preferred
- HTTP+SSE transport: Deprecated in favor of Streamable HTTP (neither used here -- we use stdio)
- v2 package names (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`, `@modelcontextprotocol/core`): NOT published to npm yet

## Open Questions

1. **Dual-mode CLI: `smartb mcp` vs `smartb mcp --serve`**
   - What we know: MCP-10 requires shared state. Starting HTTP+WS in the same process alongside stdio is straightforward technically.
   - What's unclear: Should `smartb mcp` always start the HTTP server, or only when `--serve` is passed? If the browser is already running from a separate `smartb serve`, should `smartb mcp` connect to it instead?
   - Recommendation: Default `smartb mcp` starts stdio-only (lightweight for AI tools). Add `--serve` flag to optionally start HTTP+WS in the same process. For the "already running server" case, just let the file watcher handle it -- MCP writes files, the already-running server's watcher picks them up.

2. **update_node_status implementation (MCP-05)**
   - What we know: `NodeStatus` type exists ('ok' | 'problem' | 'in-progress' | 'discarded'). The browser UI already supports classDef-based coloring.
   - What's unclear: Where is node status stored? Currently status is rendered via classDef directives appended at render time (browser-side). MCP would need to persist status in the .mmd file or an annotation format.
   - Recommendation: Store node status as a new annotation type (e.g., `%% @status nodeId "ok"`) alongside flags. Parse and inject them the same way flags work. This keeps everything in the .mmd file and the file watcher broadcasts changes automatically.

3. **Error handling strategy for tool calls**
   - What we know: The SDK supports returning `isError: true` in tool results.
   - What's unclear: How verbose should error messages be? Should we include stack traces?
   - Recommendation: Return structured errors with message and optional code. Never include stack traces (they leak implementation details to AI agents). Use `isError: true` for recoverable errors (file not found, validation failure). Throw for unrecoverable errors (SDK handles these).

## Sources

### Primary (HIGH confidence)
- Context7 `/modelcontextprotocol/typescript-sdk` -- tool registration, resource registration, ResourceTemplate API, McpServer initialization
- [Official Build Server Guide](https://modelcontextprotocol.io/docs/develop/build-server) -- Complete TypeScript stdio server example with registerTool() API
- [GitHub typescript-sdk server.md](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/server.md) -- StdioServerTransport, registerTool, registerResource, Zod integration
- npm registry: `@modelcontextprotocol/sdk` v1.26.0 (verified installed), `@modelcontextprotocol/server` NOT FOUND on npm

### Secondary (MEDIUM confidence)
- [GitHub typescript-sdk migration.md](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/migration.md) -- v1 to v2 migration guide (v2 not yet released)
- [GitHub typescript-sdk README (main)](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md) -- v2 pre-alpha status, Q1 2026 target
- [GitHub typescript-sdk releases](https://github.com/modelcontextprotocol/typescript-sdk/releases) -- v1.26.0 is latest (Feb 4, 2025)

### Tertiary (LOW confidence)
- WebSearch on shared state between MCP stdio and HTTP server -- no established pattern found; architectural reasoning is sound but unverified in production

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Verified via npm registry, Context7, official docs; SDK v1.26.0 is the only stable choice
- Architecture: HIGH -- Shared DiagramService pattern follows from existing codebase architecture and MCP-10 requirement
- Pitfalls: HIGH -- stdout corruption is extensively documented; other pitfalls derived from MCP protocol spec and Node.js fundamentals
- Tool/Resource schema design: MEDIUM -- API verified via official docs but optimal AI agent UX descriptions are design choices
- Node status storage: MEDIUM -- Extending the existing annotation system is logical but untested for this specific use case

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable SDK; watch for v2 release)
