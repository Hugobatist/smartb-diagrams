import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DiagramService } from '../../src/diagram/service.js';
import { GhostPathStore } from '../../src/server/ghost-store.js';
import { SessionStore } from '../../src/session/session-store.js';
import { registerTools } from '../../src/mcp/tools.js';

/**
 * Captures tool handlers registered via McpServer.registerTool() so we can
 * invoke them directly in tests without spinning up MCP transport.
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function createMockMcpServer() {
  const tools = new Map<string, ToolHandler>();

  const mockServer = {
    registerTool(name: string, _config: unknown, handler: ToolHandler) {
      tools.set(name, handler);
    },
  };

  return { server: mockServer as any, tools };
}

const SIMPLE_DIAGRAM = [
  'flowchart LR',
  '    A["Start"] --> B["Process"]',
  '    B --> C["End"]',
  '',
].join('\n');

// ===================================================================
// get_diagram_context completeness tests (breakpoints, risks, ghostPaths)
// ===================================================================

describe('get_diagram_context completeness', () => {
  let tmpDir: string;
  let service: DiagramService;
  let ghostStore: GhostPathStore;
  let sessionStore: SessionStore;
  let tools: Map<string, ToolHandler>;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'smartb-ctx-completeness-'));
    service = new DiagramService(tmpDir);
    ghostStore = new GhostPathStore();
    sessionStore = new SessionStore(tmpDir);

    const mock = createMockMcpServer();
    tools = mock.tools;

    registerTools(mock.server, service, {
      ghostStore,
      sessionStore,
      breakpointContinueSignals: new Map(),
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes breakpoints in get_diagram_context response', async () => {
    // Create diagram and add a breakpoint
    writeFileSync(join(tmpDir, 'bp-ctx.mmd'), SIMPLE_DIAGRAM, 'utf-8');
    await service.setBreakpoint('bp-ctx.mmd', 'A');

    const handler = tools.get('get_diagram_context')!;
    const result = await handler({ filePath: 'bp-ctx.mmd' });

    expect(result.isError).toBeUndefined();
    const ctx = JSON.parse(result.content[0]!.text);
    expect(ctx.breakpoints).toBeDefined();
    expect(ctx.breakpoints).toContain('A');
  });

  it('includes risks in get_diagram_context response', async () => {
    // Create diagram and add a risk
    writeFileSync(join(tmpDir, 'risk-ctx.mmd'), SIMPLE_DIAGRAM, 'utf-8');
    await service.setRisk('risk-ctx.mmd', 'B', 'high', 'touches production');

    const handler = tools.get('get_diagram_context')!;
    const result = await handler({ filePath: 'risk-ctx.mmd' });

    expect(result.isError).toBeUndefined();
    const ctx = JSON.parse(result.content[0]!.text);
    expect(ctx.risks).toBeDefined();
    expect(ctx.risks).toHaveLength(1);
    expect(ctx.risks[0]).toEqual({
      nodeId: 'B',
      level: 'high',
      reason: 'touches production',
    });
  });

  it('includes ghost paths from store in get_diagram_context response', async () => {
    // Create diagram and add a ghost path to the store
    writeFileSync(join(tmpDir, 'ghost-ctx.mmd'), SIMPLE_DIAGRAM, 'utf-8');
    ghostStore.add('ghost-ctx.mmd', {
      fromNodeId: 'A',
      toNodeId: 'C',
      label: 'Skipped step',
      timestamp: Date.now(),
    });

    const handler = tools.get('get_diagram_context')!;
    const result = await handler({ filePath: 'ghost-ctx.mmd' });

    expect(result.isError).toBeUndefined();
    const ctx = JSON.parse(result.content[0]!.text);
    expect(ctx.ghostPaths).toBeDefined();
    expect(ctx.ghostPaths).toHaveLength(1);
    expect(ctx.ghostPaths[0]).toEqual({
      fromNodeId: 'A',
      toNodeId: 'C',
      label: 'Skipped step',
    });
  });

  it('returns empty arrays for breakpoints, risks, ghostPaths when none exist', async () => {
    writeFileSync(join(tmpDir, 'empty-ctx.mmd'), SIMPLE_DIAGRAM, 'utf-8');

    const handler = tools.get('get_diagram_context')!;
    const result = await handler({ filePath: 'empty-ctx.mmd' });

    expect(result.isError).toBeUndefined();
    const ctx = JSON.parse(result.content[0]!.text);
    expect(ctx.breakpoints).toEqual([]);
    expect(ctx.risks).toEqual([]);
    expect(ctx.ghostPaths).toEqual([]);
  });

  it('includes all data together: flags, statuses, breakpoints, risks, ghostPaths', async () => {
    // Create diagram with annotations
    const annotatedDiagram = [
      'flowchart LR',
      '    A["Start"] --> B["Process"]',
      '    B --> C["End"]',
      '',
      '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---',
      '%% @flag B "Needs review"',
      '%% @status A ok',
      '%% @breakpoint B',
      '%% @risk C high "Data loss risk"',
      '%% --- END ANNOTATIONS ---',
      '',
    ].join('\n');

    writeFileSync(join(tmpDir, 'full-ctx.mmd'), annotatedDiagram, 'utf-8');
    ghostStore.add('full-ctx.mmd', {
      fromNodeId: 'A',
      toNodeId: 'C',
      label: 'Rejected path',
      timestamp: Date.now(),
    });

    const handler = tools.get('get_diagram_context')!;
    const result = await handler({ filePath: 'full-ctx.mmd' });

    expect(result.isError).toBeUndefined();
    const ctx = JSON.parse(result.content[0]!.text);

    // Flags
    expect(ctx.flags).toHaveLength(1);
    expect(ctx.flags[0].nodeId).toBe('B');

    // Statuses
    expect(ctx.statuses).toHaveProperty('A', 'ok');

    // Breakpoints
    expect(ctx.breakpoints).toContain('B');

    // Risks
    expect(ctx.risks).toHaveLength(1);
    expect(ctx.risks[0].nodeId).toBe('C');
    expect(ctx.risks[0].level).toBe('high');

    // Ghost paths
    expect(ctx.ghostPaths).toHaveLength(1);
    expect(ctx.ghostPaths[0].fromNodeId).toBe('A');
    expect(ctx.ghostPaths[0].toNodeId).toBe('C');
  });
});
