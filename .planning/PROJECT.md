# SmartB Diagrams

## What This Is

An AI observability layer that visualizes how AI coding agents think in real-time. Developers connect it to their AI tools (Cursor, VS Code + Copilot, Claude Code) and see live interactive diagrams of the AI's reasoning as it works. When something looks wrong, they flag it directly on the diagram and the AI course-corrects. It's a visual debugger for AI agents — not another coding tool, but a plugin that makes existing tools transparent.

## Core Value

Developers can see what their AI is thinking and intervene surgically before it finishes — turning black-box AI coding into a transparent, collaborative process.

## Current Milestone: v2.1 Stability & Usability

**Goal:** Fix all critical bugs found in deep 4-agent audit of v2.0 features. Ghost Paths, Heatmap, and core MCP tools are broken or unusable in practice. Make every shipped feature actually work end-to-end for real users.

**Target fixes:**
- Ghost Paths: modal blocks creation, no persistence, not in get_diagram_context, no clear/delete UI
- Heatmap: no automatic tracking, only updates on session end, no mode toggle UI, stale on file switch
- Core MCP: update_diagram destroys flags/breakpoints, get_diagram_context missing data
- Infrastructure: FileWatcher race condition, /save bypasses write lock, broadcastAll leaks between projects
- Polish: keyboard shortcut conflicts, CSS file over 500 lines, PNG export loses ghost paths, missing type exports

## Requirements

### Validated

<!-- Shipped and confirmed valuable in v1.0. -->

- ✓ TypeScript npm package with CLI (`smartb serve/init/status`) — v1.0
- ✓ HTTP server serving Mermaid diagrams with real-time WebSocket sync — v1.0
- ✓ Flag system with bidirectional communication via `%% @flag` annotations — v1.0
- ✓ Visual flag panel showing all active flags — v1.0
- ✓ Diagram editor with node/edge add/remove/edit — v1.0
- ✓ MCP server for AI tool integration (read flags, update diagrams, correction context) — v1.0
- ✓ VS Code extension with sidebar panel and WebSocket connection — v1.0
- ✓ Pan/zoom, keyboard shortcuts, SVG/PNG export — v1.0
- ✓ File tree sidebar with create/delete/rename files — v1.0
- ✓ Node search with highlight navigation (Ctrl+F) — v1.0
- ✓ Subgraph collapse/expand (partial) — v1.0

### Active

<!-- Current scope: v2.1 Stability & Usability -->

- [ ] Fix modal.js to allow empty ghost path labels (critical UX bug)
- [ ] Preserve existing flags/breakpoints when update_diagram is called
- [ ] Persist ghost paths as @ghost annotations in .mmd files
- [ ] Include ghost paths, breakpoints, and risks in get_diagram_context
- [ ] Add automatic heatmap tracking (clicks, edits, status changes)
- [ ] Real-time heatmap updates during session recording
- [ ] Heatmap mode toggle UI (risk vs frequency)
- [ ] Fix FileWatcher first-event race condition
- [ ] Route /save through DiagramService write lock
- [ ] Ghost path clear/delete UI and individual deletion
- [ ] Use project-scoped broadcast for ghost paths
- [ ] Re-fetch heatmap data on file switch
- [ ] Fix keyboard shortcut 'B' firing in unexpected contexts
- [ ] Split main.css (577 lines, exceeds 500-line limit)
- [ ] Fix PNG export to include ghost paths
- [ ] Export missing types (RiskLevel, RiskAnnotation, GhostPath)

### Out of Scope

- Full IDE replacement (Cursor competitor) — we're a plugin, not a platform
- Non-developer users (no-code builders) — our users are devs who use AI tools
- Cloud/SaaS hosting — local-first tool, runs on developer's machine
- Mobile support — desktop IDE plugin only
- Non-Mermaid input formats — .mmd remains the source format (but rendering is custom)
- Freehand drawing / whiteboard mode — we're a structured diagram tool, not Excalidraw

## Context

**v1.0 delivered:** TypeScript npm package with HTTP server, WebSocket real-time sync, browser UI with pan/zoom/flags/search/export, MCP server for AI tools, VS Code extension, and partial subgraph collapse/expand. 8 phases completed.

**v2.0 delivered:** Custom interactive canvas (dagre + SVG), node selection/drag/inline-edit, context menu, undo/redo, copy/paste, folder management, AI breakpoints, ghost paths, risk heatmap, session replay. 8 phases (9-16) completed.

**v2.1 motivation:** Deep 4-agent audit revealed that v2.0's advanced features (Ghost Paths, Heatmap, Session Recording) were structurally built but practically broken. The modal blocks ghost path creation, heatmap has zero data without explicit MCP sessions, update_diagram silently destroys developer flags, and several race conditions exist. Users cannot effectively use the features they see in the UI.

**Audit methodology:** 4 parallel Opus agents conducted exhaustive code review: (1) Ghost Paths end-to-end, (2) Heatmap/Sessions end-to-end, (3) Full MCP-to-Browser data flow, (4) Code quality and bug hunting. Found 18+ issues across critical/high/medium severity.

## Constraints

- **Tech stack**: TypeScript + Node.js — must be npm-installable, no Python dependency in production
- **Architecture**: Single process for MCP server + HTTP server — simplicity over microservices
- **Compatibility**: Must work with MCP-compatible tools (Claude Code, Cursor) and VS Code
- **Performance**: Diagram updates must feel instant (<100ms perceived latency)
- **Dependencies**: Minimal — no heavy frameworks, keep install size small
- **Input format**: .mmd files remain the source of truth — custom renderer reads .mmd, not a new format
- **Browser UI**: Vanilla JS — no React/Vue/frameworks in static/
- **Backward compatibility**: Existing .mmd files with flags/statuses must work with new renderer

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python for production | npm ecosystem for global install, MCP SDK is TypeScript-first | ✓ Good |
| Single process (MCP + HTTP) | Simpler deployment, one `npx` command to start | ✓ Good |
| npm global package distribution | Standard for dev tools, easy install/update | ✓ Good |
| Plugin approach over standalone product | Compete on niche (observability) not platform (IDE) | ✓ Good |
| Mermaid-only input format (.mmd) | Widely known, text-based (git-friendly), AI tools can generate it | ✓ Good |
| Local-first architecture | Privacy, speed, no cloud dependency | ✓ Good |
| Replace Mermaid renderer with custom canvas | Mermaid SVG is static — can't select/drag/manipulate nodes. Custom renderer unlocks interactive UX and advanced features | ✓ Good |
| Dagre for layout engine | Same engine Mermaid uses internally, proven for directed graphs | ✓ Good |
| Ghost paths in-memory only (v2.0) | Session-scoped data, simpler than file persistence | ⚠️ Revisit — users lose data on restart |
| Heatmap dependent on MCP sessions only (v2.0) | Clean separation, explicit recording | ⚠️ Revisit — unusable without auto-tracking |

---
*Last updated: 2026-02-19 after v2.1 milestone initialization (deep audit)*
