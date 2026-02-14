# Project Research Summary

**Project:** SmartB Diagrams
**Domain:** AI observability / developer visualization tooling
**Researched:** 2026-02-14
**Confidence:** HIGH

## Executive Summary

SmartB Diagrams is an AI observability tool that visualizes AI agent reasoning as interactive Mermaid flowcharts with bidirectional developer feedback. The product sits at the intersection of three established domains: MCP-based AI tool integration, VS Code developer tooling, and real-time diagram rendering. Research shows this is a novel combination — existing AI tools (Cursor, Claude Code, Devin) provide reasoning visibility but lack spatial/visual intervention mechanisms, while observability platforms (LangSmith, Langfuse) are read-only. SmartB's unique value is the bidirectional flag system: developers flag specific reasoning steps spatially on a diagram, and AI agents read those flags via MCP to adjust their approach.

The recommended technical approach is a single-process Node.js architecture that simultaneously operates as an MCP server (stdio transport for AI tools), HTTP/WebSocket server (for browser and VS Code extension), and file watcher (for real-time diagram updates). This leverages the MCP TypeScript SDK v1.x (stable), chokidar for file watching, ws for WebSocket, and client-side Mermaid.js for rendering. The file system acts as the protocol — .mmd files contain both AI-generated Mermaid diagrams and developer-added `%% @flag` annotations. The architecture is proven in similar tools (VS Code Live Preview uses HTTP+WebSocket for live reload, MCP servers commonly run stdio+HTTP simultaneously).

The critical risk is scalability: diagrams become cognitively and computationally unreadable beyond 50-100 nodes, which is precisely what AI agent traces will produce. This is the graveyard where UML tools died. Mitigation requires hierarchical collapsing, progressive disclosure, and rendering limits from day one. Secondary risks include stdout pollution corrupting the MCP stdio transport (the #1 MCP server bug), VS Code webview memory leaks, and Windows installation failures (30% of VS Code users). All are well-documented with clear prevention strategies.

## Key Findings

### Recommended Stack

The stack is mature and well-documented. Node.js 22.x LTS provides the runtime foundation with native WebSocket client support and active LTS until 2027. TypeScript 5.9.x offers excellent module resolution for the ESM-based architecture. The MCP TypeScript SDK v1.26.0 is production-ready with 25K+ dependents — research recommends starting with v1.x now and migrating to v2 when it stabilizes (expected Q1 2026 but still pre-alpha as of Feb 2026). The v1 to v2 migration is straightforward, primarily affecting import paths.

**Core technologies:**
- **Node.js 22.x LTS**: Runtime with native fetch/WebSocket client, active LTS until 2027-04-30
- **@modelcontextprotocol/sdk v1.26.0**: Official MCP server framework, stdio transport, Zod schema integration
- **ws v8.19.x**: Standard WebSocket server library (25K+ dependents), zero dependencies, battle-tested
- **Mermaid.js v11.12.x**: Browser-side diagram rendering, load via CDN or bundle into webview
- **chokidar v5.x**: File watching for real-time updates, ESM-only, works cross-platform
- **commander v14.x**: CLI argument parsing for subcommands (init, serve, status)
- **tsup v8.5.x + esbuild v0.27.x**: Build tooling for npm package and VS Code extension bundling

**Critical stack decisions:**
- Use Zod v3.25.x (not v4) with MCP SDK v1.x — v4 has incompatible imports
- Render Mermaid client-side only — server-side requires headless Chromium (200MB+, 500ms+ latency)
- Avoid Express/Fastify — Node's http module handles 3-4 routes without framework overhead
- Single process architecture — MCP stdio, HTTP, WebSocket all share one event loop with shared state

### Expected Features

The feature landscape is clear. Table stakes are what every diagram tool and developer tool provides: live rendering, VS Code integration, file-based persistence, keyboard shortcuts, and error handling. Missing any of these makes the product feel incomplete. The competitive advantage comes from bidirectional flags (the core innovation — no competitor does this), AI-generated diagrams, color-coded status visualization, and WebSocket real-time sync (upgrading from 2s polling).

**Must have (table stakes):**
- Live diagram rendering with pan/zoom/fit-to-view
- VS Code integration (side panel with webview)
- MCP server exposing tools (update_diagram, read_flags, get_context) and resources (diagram files)
- File-based persistence (.mmd files with `%% @flag` annotations)
- Keyboard shortcuts for developer-first interaction
- Error handling for malformed Mermaid syntax
- Multi-project support with namespacing
- Auto-refresh / live sync (WebSocket, not polling)

**Should have (competitive differentiators):**
- **Bidirectional flag system** — THE core innovation: dev flags node, AI reads flag via MCP
- AI-generated diagrams from agent reasoning (not just manual Mermaid editing)
- Semantic zoom / hierarchical navigation for large diagrams
- Color-coded status visualization (green=OK, red=problem, yellow=in-progress)
- Session timeline / reasoning history (scrub through diagram evolution)
- Flag-to-prompt pipeline (auto-generate contextual correction prompts from flags)

**Defer (v2+):**
- Cursor Blame-style attribution (which conversation turn created which node)
- OpenTelemetry span emission (integration with Grafana/Datadog)
- Full visual editor (draw.io style) — violates text-based design principle
- Cloud sync / team collaboration — violates local-first principle
- Metrics dashboards — competes with LangSmith/Langfuse on their turf

**Anti-features (never build):**
- Full diagram editor with drag-and-drop (breaks bidirectional text ↔ visual sync)
- Support for all 13 Mermaid diagram types (only flowchart/state map to AI reasoning)
- AI model selection UI (SmartB is observability, not an AI coding tool)
- Natural language diagram generation (commodity feature, not our value prop)
- Plugin marketplace (premature abstraction before users exist)

### Architecture Approach

The architecture is a single Node.js process hosting three servers simultaneously: an MCP server on stdio (for AI tool integration), an HTTP server on a TCP port (for static file serving), and a WebSocket server attached to the HTTP server (for real-time diagram updates). This is achievable because all three are event-driven and non-blocking. The file system is the protocol — .mmd files are the single source of truth shared between the AI agent (writes diagrams), the developer (writes `%% @flag` annotations), and all clients (read and render). A chokidar file watcher detects .mmd changes and broadcasts updates via WebSocket to all connected clients (browser, VS Code extension).

**Major components:**
1. **MCP Server** — receives AI tool requests via stdio JSON-RPC, exposes tools for diagram updates and flag reading, shares state with HTTP/WS server
2. **HTTP/WebSocket Server** — serves live.html to browser, handles REST endpoints, pushes real-time updates via WebSocket to browser and VS Code extension
3. **File Watcher** — monitors .mmd files with chokidar, triggers WebSocket broadcasts on change
4. **Diagram Service** — core business logic layer, reads/writes .mmd files, parses/injects `%% @flag` annotations, single source of truth
5. **VS Code Extension** — WebviewViewProvider for sidebar panel, WebSocket client connecting to server, not an embedded server

**Key architectural patterns:**
- **Single Process, Multiple Transports** — stdio for MCP, TCP for HTTP/WS, shared in-memory state
- **File-as-Protocol** — .mmd file is the communication bus between AI and developer
- **WebSocket Push with File Watcher** — chokidar detects changes, broadcasts to clients, <50ms latency
- **Monorepo with packages** — core (pure logic), server (I/O + MCP + HTTP + WS), vscode (extension)

**Data flows:**
- AI → Display: MCP tool call → file write → chokidar → WebSocket broadcast → render (<100ms target)
- Developer → AI: Click flag → WebSocket → file write with annotation → AI reads via MCP (async, next-read)
- File tree sync: chokidar watches `**/*.mmd` → broadcasts add/remove/change → UI updates

### Critical Pitfalls

Research identified seven critical pitfalls that have killed similar tools. The most severe is scalability: diagrams become unreadable beyond 50 nodes, which AI traces will easily exceed. This killed UML tools. Mitigation requires hierarchical collapsing and rendering limits from day one. The #1 operational bug is stdout pollution corrupting MCP stdio — any `console.log()` breaks the protocol, and this appears in Anthropic's own repos. Prevention requires stderr-only logging and lint rules.

1. **console.log() corrupts MCP stdio transport** — Any stdout write breaks JSON-RPC protocol. Fix: stderr-only logging from day one, lint rule banning console.log, intercept stdout in dev mode. Warning signs: "connection closed unexpectedly" with no server error.

2. **SSE transport is deprecated** — MCP spec deprecated SSE in 2025-03-26, replaced with Streamable HTTP. Building on SSE means a rewrite within 6-12 months. Fix: Use stdio for local (primary use case), Streamable HTTP for remote if needed. Never use SSE.

3. **Webview state loss and memory leaks** — VS Code destroys webviews when tabs move to background. Using `retainContextWhenHidden: true` prevents loss but causes memory leaks (extension host grows to GB over hours). Fix: Use `getState()`/`setState()` API for persistence, register all listeners to `context.subscriptions` for cleanup.

4. **Diagrams unreadable at scale (UML Death)** — Beyond 50 nodes, cognitive overload makes diagrams useless. Mermaid rendering is O(n²), breaks at 100+ connections. Fix: Hard rendering limits (max 50 visible nodes), hierarchical collapsing, consider ELK layout or D3/Cytoscape for large graphs.

5. **Single-process architecture collapses under load** — CPU-intensive operations (Mermaid layout) block event loop, freezing WebSocket and MCP. Fix: Monitor event loop delay from day one, move rendering to worker threads by Phase 3, implement timeouts on MCP handlers.

6. **npm global package fails on Windows** — Shebang, path separators, postinstall scripts behave differently on Windows (30% of VS Code users). Fix: Use `path.join()` everywhere, `cross-env` for scripts, test on Windows in CI from first publish.

7. **Building a code replacement tool instead of observability** — Feature creep toward "edit diagram to change code" is the graveyard of visual programming tools. Fix: Enforce product boundary — SmartB is read-only observability, diagrams are derived views not source of truth.

## Implications for Roadmap

Based on research, the roadmap should follow a strict dependency chain dictated by architecture and risk mitigation. The core insight: you cannot build MCP integration before you have solid HTTP/WebSocket infrastructure, and you cannot build the VS Code extension before WebSocket is working. Scalability mitigation (hierarchical collapsing) must come early because large diagrams are inevitable with AI traces.

### Phase 1: Foundation (Core + HTTP Server)
**Rationale:** The Diagram Service (core business logic) is the foundation every component depends on. HTTP server comes first because you need to serve the browser UI before adding real-time updates to it. This phase establishes the file-as-protocol pattern and validates the .mmd annotation format.

**Delivers:**
- Core package: diagram parsing, flag annotation logic, TypeScript types
- Server package: CLI entry point, HTTP server serving live.html
- Browser UI: Mermaid rendering with manual refresh
- npm package structure with correct shebang, cross-platform paths

**Addresses (features):**
- File-based persistence (.mmd files)
- Error handling for malformed diagrams
- Pan/zoom/fit-to-view
- Export (SVG/PNG)

**Avoids (pitfalls):**
- Windows install failures — use `path.join()`, test in CI from day one
- npm bundling issues — verify static assets with `npm pack --dry-run`

**Research flag:** None — well-documented patterns (Node HTTP server, npm packaging).

---

### Phase 2: Real-Time Sync (WebSocket + File Watcher)
**Rationale:** WebSocket must come before MCP because MCP tool calls trigger file writes that need to propagate to clients. You need the push infrastructure working before adding the AI integration layer. This phase upgrades from 2s polling to <50ms real-time updates, which is critical for the product promise of "see what AI is doing in real-time."

**Delivers:**
- File watcher (chokidar) monitoring .mmd files
- WebSocket server attached to HTTP server
- Browser client upgraded from polling to WebSocket
- Automatic reconnection with exponential backoff
- Multi-file / multi-project support with file tree updates

**Addresses (features):**
- WebSocket real-time sync (differentiator vs 2s polling)
- Auto-refresh / live sync (table stakes)
- Multi-project support

**Uses (stack):**
- chokidar v5.x for file watching
- ws v8.19.x for WebSocket server
- WebSocket reconnection patterns from research

**Avoids (pitfalls):**
- WebSocket reconnection failures — implement exponential backoff from start
- Event loop blocking — monitor event loop delay, set baseline

**Research flag:** None — WebSocket + file watcher is a standard pattern (VS Code Live Preview uses exactly this).

---

### Phase 3: MCP Integration (Bidirectional Flags)
**Rationale:** With the real-time infrastructure solid, now add the AI integration layer. This is where SmartB becomes more than a Mermaid viewer — it becomes an AI observability tool. The flag system is the core innovation and requires both WebSocket (for flag submission from browser) and file watcher (for flag persistence and AI reading) to be working.

**Delivers:**
- MCP server using stdio transport
- MCP tools: `update_diagram`, `read_flags`, `get_diagram_context`
- MCP resources: diagram files, flag state
- Bidirectional flag system: browser → WebSocket → file annotation → MCP read
- Color-coded node status via MCP
- AI-generated diagram conventions and templates

**Addresses (features):**
- MCP server with tools + resources (table stakes)
- Bidirectional flag system (THE differentiator)
- Color-coded status visualization
- AI-generated diagrams

**Uses (stack):**
- @modelcontextprotocol/sdk v1.26.0
- Zod v3.25.x for schemas
- Commander for CLI subcommands (init, serve, status)

**Avoids (pitfalls):**
- stdout pollution — stderr-only logging, lint rule, MCP Inspector testing
- SSE deprecation — use stdio, NOT SSE
- MCP security — validate all file paths, no access outside project root

**Implements (architecture):**
- Single process with MCP stdio + HTTP/WS
- File-as-protocol pattern fully operational
- Shared Diagram Service state across all transports

**Research flag:** NEEDS RESEARCH — MCP tool/resource design for optimal AI agent UX. Research how AI agents prefer to receive diagram context and flag data (structured JSON schemas, prompt templates, etc.).

---

### Phase 4: VS Code Extension
**Rationale:** The extension is a pure consumer of the WebSocket server — it adds no new server-side capability. It can only be built after WebSocket is stable. This phase is high-value (developers live in VS Code) but architecturally independent from earlier phases.

**Delivers:**
- VS Code extension package
- WebviewViewProvider for sidebar panel
- WebSocket client connecting to server
- Webview state persistence via `getState()`/`setState()`
- Auto-start server if not running (optional)
- VS Code Marketplace publication

**Addresses (features):**
- VS Code integration (table stakes)
- Keyboard shortcuts integrated with VS Code keybindings

**Uses (stack):**
- @types/vscode ^1.96.0
- esbuild for extension bundling
- Webview API with strict CSP

**Avoids (pitfalls):**
- Webview memory leaks — `getState`/`setState`, NOT `retainContextWhenHidden`
- Extension host blocking — never embed server in extension, only WebSocket client
- Publishing rejections — follow VS Code Marketplace checklist

**Implements (architecture):**
- Extension as WebSocket client (same protocol as browser)
- Extension ↔ webview communication via postMessage

**Research flag:** None — VS Code webview and marketplace publishing are well-documented.

---

### Phase 5: Scalability & Polish
**Rationale:** By this phase, the full architecture is working (Core + HTTP + WebSocket + MCP + VS Code). Now address the critical scalability pitfall before any public launch. This phase prevents the "UML Death" — diagrams becoming unreadable walls of spaghetti.

**Delivers:**
- Hierarchical collapsing (expand/collapse subgraphs)
- Semantic zoom with breadcrumb navigation
- Rendering limits (max 50 visible nodes)
- Focus mode (show subgraph relevant to selected node + context)
- Session timeline / reasoning history (diagram version scrubbing)
- Worker thread offloading for large diagram layout
- Flag-to-prompt pipeline (auto-generate contextual correction prompts)

**Addresses (features):**
- Semantic zoom / hierarchical navigation (differentiator)
- Session timeline (differentiator)
- Flag-to-prompt pipeline (differentiator)

**Avoids (pitfalls):**
- Diagrams unreadable at scale — hard limits, progressive disclosure
- Single-process collapse — worker threads for heavy computation
- Product scope creep — enforce read-only observability boundary

**Research flag:** NEEDS RESEARCH — Best practices for hierarchical diagram navigation UX. Study Grafana drill-down, tldraw infinite canvas, D2 layers. This is a UX-heavy phase requiring interaction design research.

---

### Phase Ordering Rationale

1. **Dependency chain:** Core → HTTP → WebSocket → MCP → VS Code. Each phase depends on the previous. You cannot build MCP before WebSocket (MCP updates need to propagate), and you cannot build VS Code extension before WebSocket (it is a WS client).

2. **Risk mitigation order:** Windows compatibility and bundling (Phase 1) must be correct from first publish. WebSocket reconnection (Phase 2) must be solid before adding MCP (Phase 3) which multiplies complexity. Scalability (Phase 5) must come before public launch because large diagrams are inevitable with AI traces.

3. **Value delivery:** Phases 1-3 deliver the core value proposition (bidirectional flags between developer and AI via diagrams). Phase 4 (VS Code) is high-value polish. Phase 5 (scalability) prevents product death.

4. **Architectural emergence:** The architecture is fully realized by Phase 4. Phase 5 is optimization and advanced features, not new architectural components.

### Research Flags

**Phases needing deeper research during planning:**

- **Phase 3 (MCP Integration):** MCP tool/resource schema design for AI agent UX. Research: how do AI agents prefer to receive diagram context? What JSON schema structure for flags? What prompt templates help AI agents understand diagram state? Sources: MCP official server examples, Claude Code/Cursor integration patterns.

- **Phase 5 (Scalability & Polish):** Hierarchical diagram navigation UX patterns. Research: Grafana drill-down UX, tldraw infinite canvas implementation, D2 layer system, Cytoscape.js performance with large graphs. This is interaction design research, not just technical.

**Phases with standard patterns (skip research-phase):**

- **Phase 1:** Node HTTP server, npm packaging, cross-platform paths — all well-documented in Node.js docs.
- **Phase 2:** WebSocket + file watcher live reload pattern — established in VS Code Live Preview and similar tools.
- **Phase 4:** VS Code extension with webview — official VS Code API documentation is comprehensive.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official docs and Context7. Version compatibility matrix cross-checked. MCP SDK v1 vs v2 decision is based on direct inspection of the typescript-sdk repo. |
| Features | MEDIUM | Verified ecosystem research across AI tools, observability platforms, diagram tools. Table stakes vs differentiators are clear. Some claims about competitor internals (Cursor Blame, Devin Interactive Planning) are based on articles not firsthand testing. |
| Architecture | HIGH | Single-process MCP+HTTP+WS pattern verified in multiple sources (FastMCP, VS Code Live Preview, MCP dual-transport examples). File-as-protocol is proven in similar tools. Component boundaries are clear. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (stdout pollution, UML Death, webview memory leaks) verified with primary sources (GitHub issues, official docs). Historical lessons (why UML failed, why visual programming fails) synthesized from multiple analyses but inherently involve interpretation. |

**Overall confidence:** HIGH

The stack, architecture, and critical pitfalls are all grounded in official documentation and verified examples. The feature landscape is synthesized from broader ecosystem research and has more uncertainty, but the table stakes vs differentiators distinction is clear. The primary execution risk is not technical (the technologies are proven) but product (staying focused on observability vs creeping into code editing).

### Gaps to Address

1. **MCP tool/resource schema design:** Research establishes WHAT to build (tools for update_diagram, read_flags, get_context) but not the exact JSON schema structure or how AI agents will consume this data in practice. This needs validation during Phase 3 implementation with real AI agent testing.

2. **Diagram scalability threshold:** Research cites "50 nodes" and "100 connections" as limits based on Mermaid performance discussions, but the exact threshold will depend on diagram density and structure. Phase 5 should start with performance profiling on real AI traces to establish actual limits.

3. **VS Code extension user adoption patterns:** Unknown how developers will discover/install the extension vs the npm package. The relationship between `npm install -g smartb-diagrams` and the VS Code extension needs validation. Does the extension auto-install the npm package? Does it prompt? This is a UX gap to resolve in Phase 4 planning.

4. **AI agent diagram generation quality:** Research assumes AI agents will emit useful diagrams when given MCP tools. This is unproven. Phase 3 should include extensive testing with Claude, Cursor, and other MCP clients to validate the diagram quality and refine the conventions/templates.

## Sources

### Primary Sources (HIGH confidence)

**Context7 verified:**
- `/modelcontextprotocol/typescript-sdk` — MCP server API, transport options, tool/resource registration
- `/mermaid-js/mermaid` — Mermaid.render() API, browser-only rendering, v11 documentation
- `/microsoft/vscode-docs` — Webview panel API, message passing, extension lifecycle

**Official documentation:**
- [MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18) — Transport protocols, SSE deprecation
- [MCP Build Server Tutorial](https://modelcontextprotocol.io/docs/develop/build-server) — Official project structure, stdio setup
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) — How Claude Code connects to MCP servers
- [Node.js Releases](https://nodejs.org/en/about/previous-releases) — LTS schedule, v22 Active LTS
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) — getState/setState, CSP, lifecycle
- [VS Code Extension Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

**npm packages (official):**
- ws v8.19.0, commander v14.0.3, tsup v8.5.1, chokidar v5.x, mermaid v11.12.2, esbuild v0.27.3, vitest v4.0.18

### Secondary Sources (MEDIUM confidence)

**AI coding tools ecosystem:**
- [Top 10 Vibe Coding Tools 2026](https://www.nucamp.co/blog/top-10-vibe-coding-tools-in-2026)
- [Best AI Coding Agents 2026](https://www.faros.ai/blog/best-ai-coding-agents-2026)
- [Cursor Release Notes Feb 2026](https://releasebot.io/updates/cursor)
- [Devin 2.0 Technical Design](https://medium.com/@takafumi.endo/agent-native-development-a-deep-dive-into-devin-2-0s-technical-design)

**AI observability platforms:**
- [15 AI Agent Observability Tools 2026](https://aimultiple.com/agentic-monitoring)
- [LangSmith Observability](https://www.langchain.com/langsmith/observability)
- [Grafana AI Observability](https://grafana.com/docs/grafana-cloud/monitor-applications/ai-observability/)

**MCP ecosystem:**
- [MCP Transport Comparison](https://mcpcat.io/guides/comparing-stdio-sse-streamablehttp/)
- [Why MCP Deprecated SSE](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [Top 10 MCP Servers 2026](https://www.intuz.com/blog/best-mcp-servers)

**Architecture patterns:**
- [FastMCP custom HTTP routes](https://github.com/punkpeye/fastmcp) — MCP + HTTP in same process
- [Live Reloading from Scratch in Node.js](https://www.alexander-morse.com/blog/live-reloading-from-scratch-in-nodejs/) — chokidar + ws pattern
- [One MCP Server, Two Transports (Microsoft)](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/one-mcp-server-two-transports-stdio-and-http/4443915)

**Pitfalls and debugging:**
- [Chrome DevTools MCP stdout corruption](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/570)
- [VS Code extension host memory issues](https://github.com/microsoft/vscode/issues/171017)
- [Mermaid rendering optimization](https://github.com/mermaid-js/mermaid/issues/7328)
- [GitLab Mermaid byte limit](https://gitlab.com/gitlab-org/gitlab/-/issues/27173)

### Tertiary Sources (LOW-MEDIUM confidence)

**Developer tool adoption and UX:**
- [6 Things Developer Tools Must Have in 2026 (Evil Martians)](https://evilmartians.com/chronicles/six-things-developer-tools-must-have-to-earn-trust-and-adoption)
- [Stack Overflow 2025 Developer Survey](https://stackoverflow.blog/2025/12/29/developers-remain-willing-but-reluctant-to-use-ai-the-2025-developer-survey-results-are-here)

**Visual programming history:**
- [sbensu: We need visual programming. No, not like that.](https://blog.sbensu.com/posts/demand-for-visual-programming/)
- [UML is Back. Or is it? (USI Research)](https://www.inf.usi.ch/phd/raglianti/publications/Romeo2025a.pdf)
- [Why Most Developers Don't Like Visual Programming](https://analyticsindiamag.com/deep-tech/why-most-developers-dont-like-visual-programming/)

---
*Research completed: 2026-02-14*
*Ready for roadmap: yes*
