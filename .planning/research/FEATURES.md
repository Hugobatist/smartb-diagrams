# Feature Research

**Domain:** AI observability / developer visualization tooling for AI coding agents
**Researched:** 2026-02-14
**Confidence:** MEDIUM — based on verified ecosystem research across AI coding tools, observability platforms, diagram tools, MCP ecosystem, and VS Code extensions. Some claims about competitor internals are LOW confidence (based on articles, not firsthand testing).

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Live diagram rendering** | Every diagram tool (Mermaid Live Editor, Excalidraw, D2) renders in real-time. Users will not tolerate a "compile then view" workflow. | LOW | Already in prototype. 2s polling works but WebSocket would feel instantaneous. |
| **VS Code integration (side panel)** | Developers live in VS Code / Cursor. A standalone browser tab is friction. GitLens, Thunder Client, and every successful dev tool lives in the IDE sidebar. | HIGH | VS Code Webview API is mature but state management across panel visibility is tricky. Webview UI Toolkit is deprecated — use native VS Code API components where possible. |
| **MCP server (tools + resources)** | MCP is the standard for AI tool integration (adopted by Anthropic, OpenAI, Google). Claude Code and Cursor already consume MCP servers. Without MCP, the tool cannot receive data from or send instructions to AI agents. | HIGH | Use official TypeScript SDK (`@modelcontextprotocol/sdk`). Expose tools for: reading flags, updating diagram state, getting current diagram context. Expose resources for: diagram files, flag state. |
| **File-based persistence (.mmd files)** | Developers expect git-friendly, text-based artifacts. Mermaid's strength is that diagrams are code. Binary formats or databases would break the mental model. | LOW | Already in prototype. Keep `%% @flag` annotation format — it's elegant and grep-friendly. |
| **Pan, zoom, fit-to-view** | Every canvas tool (Excalidraw, tldraw, Figma, Mermaid Live) has this. Users expect scroll-to-zoom, drag-to-pan, and a "fit" button. | LOW | Already in prototype. |
| **Keyboard shortcuts** | Developer tools without keyboard shortcuts feel amateur. ESLint, Prettier, GitLens all have them. Cursor Blame shows that devs expect keyboard-first interaction. | LOW | Already in prototype (F for flag, N for node, A for arrow). Ensure these work in VS Code extension context without conflicting. |
| **Error handling for malformed diagrams** | Mermaid Live Editor shows inline errors. Users will paste broken syntax and expect helpful feedback, not a blank screen. | LOW | Already in prototype. Enhance with line-number-specific error highlighting. |
| **Export (SVG, PNG)** | Standard in every diagram tool. Users need to put diagrams in docs, presentations, PRs. | LOW | Already in prototype. |
| **Multi-file / multi-project support** | Developers work on multiple projects. A tool that only handles one diagram at a time is a toy. File tree navigation is baseline. | MEDIUM | Already in prototype (folder tree). Need project-scoping so each repo gets its own namespace when installed globally via npm. |
| **Auto-refresh / live sync** | The core promise is "see what AI is doing in real-time." If the diagram doesn't update when the AI changes the .mmd file, the tool is useless. | MEDIUM | Currently 2s polling. WebSocket would be better. File watcher (chokidar/fs.watch) is the right mechanism. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Bidirectional flag system (dev flags node, AI reads flag)** | **The core innovation.** No existing tool does this. Cursor shows reasoning but you cannot flag a specific step. Devin shows plans but feedback is conversational, not spatial. LangSmith/Langfuse show traces but are read-only — you observe, you don't intervene. SmartB lets you point at a node and say "this is wrong" and the AI reads that flag via MCP. This is the closest thing to "surgical intervention in AI reasoning." | MEDIUM | Already in prototype via `%% @flag` annotations. MCP server must expose a `read_flags` tool so AI agents can poll for developer feedback. The flag-to-action loop is the product. |
| **AI-generated diagrams from agent reasoning** | Instead of manually writing Mermaid, the AI agent emits its plan as a diagram. This turns SmartB from "diagram viewer" to "reasoning visualizer." Cursor Composer 1.5 shows plans before execution — SmartB would show them as navigable flowcharts. | HIGH | Requires defining a schema/convention for how AI agents emit reasoning. Could be an MCP tool (`update_diagram`) the AI calls, or a prompt template that instructs the AI to write .mmd files. The hardest part is getting the AI to structure its reasoning as a diagram without degrading its coding performance. |
| **Semantic zoom / hierarchical navigation** | Large projects produce large diagrams. Observability tools (Grafana, Datadog) solve this with drill-down dashboards. tldraw solves it with infinite canvas + minimap. D2 supports diagram layers. SmartB should let users see high-level phases, then zoom into a phase to see individual steps. | HIGH | Mermaid subgraphs are the natural mechanism. Need a UI layer that collapses/expands subgraphs and provides breadcrumb navigation. This is what Grafana's "explore" view does — start broad, drill into specifics. |
| **Color-coded status visualization** | Visual distinction between node states (green=OK, red=problem, yellow=in-progress, gray=discarded) is an interaction pattern from observability dashboards (Grafana status panels, Datadog service maps). No AI coding tool shows status per reasoning step. | LOW | Already in prototype via Mermaid style classes. Extend with dynamic status updates from MCP — AI agent calls `update_node_status(nodeId, "complete")`. |
| **Session timeline / reasoning history** | LangSmith and Langfuse show traces over time. Cursor Blame shows which AI conversation produced each line. SmartB should let developers scrub through the evolution of a diagram — "what did the AI's plan look like 5 minutes ago vs now?" | HIGH | Requires versioning diagram state. Could use git history of .mmd files, or maintain an in-memory timeline. The UX challenge is making timeline scrubbing feel natural (like a video scrubber, not a git log). |
| **Cursor Blame-style attribution** | Cursor Blame links code to the AI conversation that produced it. SmartB could link diagram nodes to the specific AI action/tool call that created them. "This node was added when Claude called the search tool." | MEDIUM | Requires MCP integration to tag nodes with metadata about which tool call or conversation turn produced them. Stored as Mermaid comments (`%% @source tool:search turn:14`). |
| **Flag-to-prompt pipeline** | When a dev flags a node, SmartB doesn't just mark it — it generates a contextual correction prompt: "The user flagged step 'Parse config' as incorrect. The flag says: 'Config is YAML not JSON.' Please revise your approach." This is more powerful than a raw annotation. | MEDIUM | Builds on flag system. MCP tool `get_correction_context(nodeId)` returns structured prompt with diagram context, flag content, and surrounding nodes. The AI can call this proactively or the human can trigger it. |
| **WebSocket real-time sync** | Replaces 2s polling. Instant diagram updates when AI modifies .mmd files. Reduces perceived latency from 2000ms to <50ms. Every real-time collaboration tool (Figma, tldraw, Google Docs) uses WebSocket. | MEDIUM | File watcher + WebSocket server. Well-understood pattern. VS Code Live Preview extension uses exactly this architecture (HTTP server + WebSocket for live reload). |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full diagram editor (draw.io style)** | "Let me drag nodes around and draw connections visually." | Mermaid is text-based by design. Adding a full visual editor means maintaining two representations (visual layout + Mermaid text), which creates sync bugs and bloats the codebase. Excalidraw tried mermaid-to-excalidraw and it's a one-way conversion, not bidirectional. The value of SmartB is observability, not diagramming. | Keep the Mermaid text editor. Let developers edit node labels and add connections via lightweight popovers (already in prototype). For full visual editing, export to Excalidraw. |
| **Support for all diagram types (sequence, ER, Gantt, etc.)** | "Mermaid supports 13 diagram types, why limit to flowcharts?" | AI reasoning is naturally a flowchart/state diagram. Sequence diagrams, ER diagrams, Gantt charts don't map to "what is the AI thinking." Supporting them adds complexity without improving the core use case. | Support flowchart and state diagrams. Those map to AI reasoning. Add others only if clear demand emerges. |
| **Cloud sync / team collaboration** | "I want my team to see the same diagrams." | Adds authentication, server infrastructure, data storage, GDPR compliance. Violates local-first principle. Competes with Notion, Google Docs, Mermaid Chart Pro — all of which do this better. | Diagrams are .mmd files in git. Teams collaborate through git. If real-time collab is needed, use VS Code Live Share. |
| **AI model selection / prompt engineering UI** | "Let me choose which AI model to use and tune prompts." | SmartB is not an AI coding tool — it's an observability layer for AI coding tools. Adding model selection makes it a Cursor/Copilot competitor. This is scope creep that destroys focus. | MCP is model-agnostic. SmartB works with whatever AI tool the developer already uses. |
| **Metrics dashboards (token usage, cost, latency)** | "Show me how many tokens my AI is using." | This is what LangSmith, Langfuse, Helicone, and Braintrust already do well. Building dashboards means competing with well-funded observability platforms on their home turf. SmartB's value is visual/spatial reasoning, not metrics. | Integrate with existing observability tools. Emit OpenTelemetry spans so data flows into Grafana/Datadog. Don't build the dashboard. |
| **Natural language diagram generation** | "Let me describe what I want and generate a diagram." | Eraser.io and Mermaid Chart already do this. It's a commodity feature. The value of SmartB is that AI agents generate diagrams from their actual reasoning — not that a human describes a diagram in English. | Focus on AI-agent-generated diagrams (the differentiator). Human diagram creation stays text-based via Mermaid syntax. |
| **Mobile / tablet support** | "I want to check diagrams on my phone." | Developer tools are desktop-first. No one debugs AI reasoning on a phone. Responsive design for complex SVG diagrams is a rabbit hole. | Desktop only. VS Code extension is the primary interface. |
| **Plugin / extension marketplace** | "Let users build plugins for SmartB." | Premature abstraction. Building a plugin system before you have users is engineering theater. | Build a good MCP server. MCP IS the extension mechanism. Third parties extend SmartB by building MCP servers that emit diagrams or read flags. |

## Feature Dependencies

```
[MCP Server (tools + resources)]
    |
    |--required-by--> [Bidirectional flag system]
    |                      |--required-by--> [Flag-to-prompt pipeline]
    |
    |--required-by--> [AI-generated diagrams]
    |                      |--required-by--> [Semantic zoom]
    |                      |--required-by--> [Session timeline]
    |                      |--required-by--> [Cursor Blame-style attribution]
    |
    |--required-by--> [Color-coded status (dynamic)]

[File watcher]
    |--required-by--> [WebSocket real-time sync]
    |                      |--enhances--> [Auto-refresh / live sync]

[VS Code extension]
    |--requires--> [WebSocket real-time sync]
    |--requires--> [MCP Server] (to connect AI tool to SmartB)
    |--enhances--> [Keyboard shortcuts] (must not conflict with VS Code)

[npm global package]
    |--requires--> [MCP Server]
    |--requires--> [File-based persistence]
    |--requires--> [Multi-project support]

[Live diagram rendering]
    |--required-by--> [Pan, zoom, fit-to-view]
    |--required-by--> [Color-coded status]
    |--required-by--> [Export (SVG, PNG)]
    |--required-by--> [Semantic zoom]
```

### Dependency Notes

- **MCP Server is the critical dependency.** The three biggest differentiators (bidirectional flags, AI-generated diagrams, status updates) all require the AI agent to communicate with SmartB via MCP. Without MCP, SmartB is a nice Mermaid viewer — with MCP, it's an AI observability layer.
- **WebSocket requires file watcher.** The upgrade from polling to WebSocket needs a file system watcher (chokidar or Node's native fs.watch) to detect .mmd file changes and push updates.
- **VS Code extension requires WebSocket.** The extension's side panel needs a real-time communication channel to the server. HTTP polling in a VS Code webview would be wasteful.
- **Semantic zoom requires AI-generated diagrams.** Manual diagrams are too small to need semantic zoom. The feature only becomes necessary when AI agents generate complex, multi-phase reasoning diagrams.
- **Session timeline requires either git history or explicit versioning.** The simplest approach is git-based (each AI update commits the .mmd file), but this may create too many commits. An in-memory ring buffer of recent states is lighter.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] **MCP server with tools: `read_flags`, `update_diagram`, `get_diagram_context`** — this is the interface between AI agents and SmartB. Without it, no bidirectional communication.
- [ ] **npm global package (`npx smartb-diagrams`)** — developers need a one-command install. `npm install -g smartb-diagrams && smartb init && smartb serve`.
- [ ] **Live Mermaid rendering with WebSocket sync** — upgrade from polling. File watcher detects .mmd changes, pushes via WebSocket.
- [ ] **Bidirectional flag system via MCP** — developer flags a node, AI reads flags via MCP tool call.
- [ ] **Color-coded node status** — AI agent can set node status (ok/problem/in-progress/discarded) via MCP.
- [ ] **CLI commands (init, serve, status)** — professional developer tool basics.
- [ ] **Multi-project support** — each project gets its own diagram namespace.

### Add After Validation (v1.x)

Features to add once core is working and first users confirm the concept.

- [ ] **VS Code extension (side panel)** — trigger: users complain about switching to browser tab.
- [ ] **AI-generated diagram templates/conventions** — trigger: users struggle to get their AI agent to emit useful diagrams. Provide MCP prompts that instruct the AI.
- [ ] **Flag-to-prompt pipeline** — trigger: users find raw flags insufficient; they want SmartB to generate corrective instructions.
- [ ] **Session timeline (scrub through diagram versions)** — trigger: users want to replay how the AI's plan evolved.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Semantic zoom / hierarchical navigation** — defer: requires complex UI work and only valuable for large diagrams.
- [ ] **Cursor Blame-style attribution** — defer: requires deep integration with specific AI tools' conversation history.
- [ ] **OpenTelemetry span emission** — defer: only valuable for teams already using Grafana/Datadog.
- [ ] **Collaborative features (VS Code Live Share integration)** — defer: premature until single-user experience is excellent.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| MCP server (tools + resources) | HIGH | HIGH | P1 |
| npm global package | HIGH | MEDIUM | P1 |
| WebSocket real-time sync | HIGH | MEDIUM | P1 |
| Bidirectional flag system via MCP | HIGH | MEDIUM | P1 |
| Color-coded node status via MCP | MEDIUM | LOW | P1 |
| CLI commands (init, serve, status) | MEDIUM | MEDIUM | P1 |
| Multi-project support | MEDIUM | MEDIUM | P1 |
| VS Code extension (side panel) | HIGH | HIGH | P2 |
| AI-generated diagram conventions | HIGH | MEDIUM | P2 |
| Flag-to-prompt pipeline | MEDIUM | MEDIUM | P2 |
| Session timeline | MEDIUM | HIGH | P2 |
| Semantic zoom | MEDIUM | HIGH | P3 |
| Cursor Blame attribution | LOW | HIGH | P3 |
| OpenTelemetry integration | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — the MCP server + npm package + real-time sync form the minimum viable product
- P2: Should have, add when possible — VS Code extension and AI diagram conventions are the next wave
- P3: Nice to have, future consideration — advanced features that depend on user growth

## Competitor Feature Analysis

| Feature | Cursor | Claude Code | Devin | LangSmith/Langfuse | SmartB Approach |
|---------|--------|-------------|-------|-------------------|-----------------|
| **AI reasoning visibility** | High: inline in editor, Cursor Blame | Low: CLI output only, no visual | Medium: web UI with plans, but async | High: full trace capture with nested spans | **Spatial**: flowchart of reasoning steps, not a log stream |
| **Developer intervention** | Medium: edit code inline, approve/reject | Low: conversational only | Medium: Interactive Planning review-before-execute | None: read-only traces | **High**: flag specific nodes, AI reads flags via MCP |
| **Real-time updates** | Yes: in-editor | Yes: terminal output | Yes: web UI | Near-real-time: trace streaming | Yes: WebSocket diagram updates |
| **Multi-step plan visualization** | Cursor Composer shows plan list | Claude Code shows thinking in terminal | Devin shows plan before execution | Trace waterfall diagram | **Flowchart with status colors and flags** |
| **Version history** | Git integration | Git integration | Session history in web UI | Full trace history with replay | Diagram version timeline (planned) |
| **Integration model** | Proprietary IDE | CLI + MCP | Proprietary web platform | SDK instrumentation | **MCP server**: works with any MCP-compatible tool |
| **Cost** | $20-40/mo subscription | API usage-based | $500/mo | Free tier + usage-based | Free / open source |

### Key Competitive Insight

No existing tool combines (1) visual/spatial representation of AI reasoning with (2) bidirectional developer feedback that the AI can read. The closest competitors are:

- **Cursor Blame**: visual attribution but read-only (you can see reasoning history but not flag problems spatially)
- **Devin Interactive Planning**: plan review but conversational (you type feedback in chat, not on a diagram)
- **LangSmith traces**: detailed execution traces but passive (observe only, no intervention mechanism)

SmartB's unique position is the intersection of **visual** (diagrams, not logs) + **bidirectional** (flag, not just observe) + **open** (MCP, not proprietary).

## Sources

### AI Coding Tools
- [Top 10 Vibe Coding Tools in 2026](https://www.nucamp.co/blog/top-10-vibe-coding-tools-in-2026-cursor-copilot-claude-code-more) — MEDIUM confidence
- [Best AI Coding Agents for 2026](https://www.faros.ai/blog/best-ai-coding-agents-2026) — MEDIUM confidence
- [Cursor AI Review 2026](https://prismic.io/blog/cursor-ai) — MEDIUM confidence
- [Devin vs Cursor: Developer Choices 2026](https://www.builder.io/blog/devin-vs-cursor) — MEDIUM confidence
- [Cursor Release Notes Feb 2026](https://releasebot.io/updates/cursor) — MEDIUM confidence
- [Agent-Native Development: Devin 2.0](https://medium.com/@takafumi.endo/agent-native-development-a-deep-dive-into-devin-2-0s-technical-design-3451587d23c0) — LOW confidence (single source)

### AI Observability Platforms
- [15 AI Agent Observability Tools 2026](https://aimultiple.com/agentic-monitoring) — MEDIUM confidence
- [Top 5 AI Agent Observability Platforms 2026](https://o-mega.ai/articles/top-5-ai-agent-observability-platforms-the-ultimate-2026-guide) — MEDIUM confidence
- [LangSmith Observability](https://www.langchain.com/langsmith/observability) — HIGH confidence (official)
- [Langfuse](https://langfuse.com/) — HIGH confidence (official)
- [Grafana AI Observability](https://grafana.com/docs/grafana-cloud/monitor-applications/ai-observability/) — HIGH confidence (official)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — HIGH confidence (official spec)
- [Datadog OTel GenAI Support](https://www.datadoghq.com/blog/llm-otel-semantic-convention/) — HIGH confidence (official)

### MCP Ecosystem
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) — HIGH confidence (official)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — HIGH confidence (official, verified via Context7)
- [MCP Official Servers](https://github.com/modelcontextprotocol/servers) — HIGH confidence (official)
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) — HIGH confidence (official)
- [Top 10 MCP Servers 2026](https://www.intuz.com/blog/best-mcp-servers) — MEDIUM confidence

### Diagram / Visualization Tools
- [Mermaid.js Official](https://mermaid.js.org/) — HIGH confidence (official, verified via Context7)
- [Mermaid API docs](https://github.com/mermaid-js/mermaid) — HIGH confidence (Context7 verified)
- [Mermaid Live Editor](https://github.com/mermaid-js/mermaid-live-editor) — HIGH confidence (official)
- [tldraw SDK](https://tldraw.dev/) — HIGH confidence (official)
- [Mermaid-to-Excalidraw](https://github.com/excalidraw/mermaid-to-excalidraw) — MEDIUM confidence

### VS Code Extensions
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) — HIGH confidence (official)
- [VS Code Sidebar UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/sidebars) — HIGH confidence (official)
- [Best VS Code Extensions 2026](https://www.builder.io/blog/best-vs-code-extensions-2026) — MEDIUM confidence
- [Building VS Code Extensions 2026](https://abdulkadersafi.com/blog/building-vs-code-extensions-in-2026-the-complete-modern-guide) — MEDIUM confidence

---
*Feature research for: AI observability / developer visualization tooling*
*Researched: 2026-02-14*
