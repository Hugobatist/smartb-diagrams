# SmartB Diagrams

## What This Is

An AI observability layer that visualizes how AI coding agents think in real-time. Developers connect it to their AI tools (Cursor, VS Code + Copilot, Claude Code) and see live flowcharts of the AI's reasoning as it works. When something looks wrong, they flag it directly on the diagram and the AI course-corrects. It's a visual debugger for AI agents — not another coding tool, but a plugin that makes existing tools transparent.

## Core Value

Developers can see what their AI is thinking and intervene surgically before it finishes — turning black-box AI coding into a transparent, collaborative process.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ HTTP server serving Mermaid diagrams with 2s auto-refresh — existing prototype
- ✓ Flag system with bidirectional communication via `%% @flag` annotations — existing prototype
- ✓ Visual flag panel showing all active flags — existing prototype
- ✓ Diagram editor with inline node editing — existing prototype

### Active

<!-- Current scope. Building toward these. -->

- [ ] MCP server that AI tools can connect to (read flags, update diagrams, get context)
- [ ] npm global package installable via `npm install -g smartb-diagrams`
- [ ] VS Code extension with side panel diagram view
- [ ] Auto-generation of Mermaid diagrams from AI agent reasoning
- [ ] Hierarchical navigation with semantic zoom for large projects
- [ ] Multi-project support (each project gets its own diagram namespace)
- [ ] Real-time WebSocket sync (replace polling)
- [ ] CLI commands for common operations (init, serve, status)

### Out of Scope

- Full IDE replacement (Cursor competitor) — we're a plugin, not a platform
- Non-developer users (no-code builders) — our users are devs who use AI tools
- Diagram types beyond Mermaid — Mermaid is the lingua franca, keep it simple
- Cloud/SaaS hosting — local-first tool, runs on developer's machine
- Mobile support — desktop IDE plugin only

## Context

**Existing prototype:** Python HTTP server (serve.py) + vanilla JS SPA (live.html) with Mermaid rendering, annotation system (flags with `%% @flag` persistence in .mmd files), and basic diagram editor. Currently used internally across 3 projects (SmartB plano-de-acao, folha-salarial-hering, univale-bi).

**Market context:** AI coding tools (Cursor $400M+, GitHub Copilot, Claude Code, Devin) are exploding but none offer visual reasoning transparency. Developers accept AI output on faith. The gap between "AI wrote code" and "I understand what it did" is the opportunity.

**Technical ecosystem:** MCP (Model Context Protocol) is the emerging standard for AI tool integration. VS Code extension API is mature. Mermaid.js is widely adopted for diagrams. TypeScript is the standard for developer tooling.

**Key insight from analysis:** The real value isn't "no-code for non-coders" — it's observability. Like how DevOps has Datadog for infrastructure, developers need a visual layer for AI reasoning.

## Constraints

- **Tech stack**: TypeScript + Node.js — must be npm-installable, no Python dependency in production
- **Architecture**: Single process for MCP server + HTTP server — simplicity over microservices
- **Compatibility**: Must work with MCP-compatible tools (Claude Code, Cursor) and VS Code
- **Performance**: Diagram updates must feel instant (<100ms perceived latency)
- **Dependencies**: Minimal — no heavy frameworks, keep install size small
- **Existing code**: Prototype is vanilla JS + Python — needs full rewrite in TypeScript

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python for production | npm ecosystem for global install, MCP SDK is TypeScript-first | — Pending |
| Single process (MCP + HTTP) | Simpler deployment, one `npx` command to start | — Pending |
| npm global package distribution | Standard for dev tools, easy install/update | — Pending |
| Plugin approach over standalone product | Compete on niche (observability) not platform (IDE) | — Pending |
| Mermaid-only diagram format | Widely known, text-based (git-friendly), sufficient for flowcharts | — Pending |
| Local-first architecture | Privacy, speed, no cloud dependency | — Pending |

---
*Last updated: 2026-02-14 after initialization*
