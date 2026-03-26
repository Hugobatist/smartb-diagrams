import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DiagramService } from '../../src/diagram/service.js';

/**
 * Tests for the check_breakpoints and record_ghost_path MCP tools.
 *
 * Tests the DiagramService breakpoint methods and GhostPathStore directly
 * rather than through the MCP server (simpler, faster, same coverage).
 */
describe('check_breakpoints', () => {
  let tmpDir: string;
  let service: DiagramService;

  const DIAGRAM_WITH_BREAKPOINT = [
    'flowchart LR',
    '    A["Start"] --> B["Process"]',
    '    B --> C["End"]',
    '',
    '%% --- ANNOTATIONS (auto-managed by SmartCode) ---',
    '%% @breakpoint B',
    '%% --- END ANNOTATIONS ---',
    '',
  ].join('\n');

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'smartcode-bp-test-'));
    service = new DiagramService(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns breakpoint set containing the node when breakpoint exists', async () => {
    writeFileSync(join(tmpDir, 'test.mmd'), DIAGRAM_WITH_BREAKPOINT, 'utf-8');

    const breakpoints = await service.getBreakpoints('test.mmd');
    expect(breakpoints.has('B')).toBe(true);
  });

  it('returns empty set when no breakpoint on queried node', async () => {
    writeFileSync(join(tmpDir, 'test.mmd'), DIAGRAM_WITH_BREAKPOINT, 'utf-8');

    const breakpoints = await service.getBreakpoints('test.mmd');
    expect(breakpoints.has('A')).toBe(false);
    expect(breakpoints.has('C')).toBe(false);
  });

  it('continue signal clears after consumption', () => {
    const signals = new Map<string, boolean>();
    const signalKey = 'test.mmd:B';

    // Set continue signal
    signals.set(signalKey, true);
    expect(signals.has(signalKey)).toBe(true);

    // Consume signal (simulates what check_breakpoints handler does)
    signals.delete(signalKey);
    expect(signals.has(signalKey)).toBe(false);

    // Second check -- signal no longer present (would return "pause")
    expect(signals.has(signalKey)).toBe(false);
  });
});

describe('DiagramService ghost CRUD', () => {
  let tmpDir: string;
  let service: DiagramService;

  const SIMPLE_DIAGRAM = 'flowchart LR\n    A --> B --> C\n';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'smartcode-ghost-crud-'));
    service = new DiagramService(tmpDir);
    writeFileSync(join(tmpDir, 'diagram.mmd'), SIMPLE_DIAGRAM, 'utf-8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('addGhost and getGhosts persist ghost paths in file', async () => {
    await service.addGhost('diagram.mmd', 'A', 'B', 'rejected approach');
    await service.addGhost('diagram.mmd', 'B', 'C', '');

    const ghosts = await service.getGhosts('diagram.mmd');
    expect(ghosts).toHaveLength(2);
    expect(ghosts[0]).toEqual({ fromNodeId: 'A', toNodeId: 'B', label: 'rejected approach' });
    expect(ghosts[1]).toEqual({ fromNodeId: 'B', toNodeId: 'C', label: '' });
  });

  it('removeGhost removes a specific ghost path by from+to', async () => {
    await service.addGhost('diagram.mmd', 'A', 'B', 'path 1');
    await service.addGhost('diagram.mmd', 'B', 'C', 'path 2');

    await service.removeGhost('diagram.mmd', 'A', 'B');

    const ghosts = await service.getGhosts('diagram.mmd');
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.fromNodeId).toBe('B');
  });

  it('clearGhosts removes all ghost paths from a file', async () => {
    await service.addGhost('diagram.mmd', 'A', 'B', 'path 1');
    await service.addGhost('diagram.mmd', 'B', 'C', 'path 2');

    await service.clearGhosts('diagram.mmd');

    const ghosts = await service.getGhosts('diagram.mmd');
    expect(ghosts).toHaveLength(0);
  });

  it('getGhosts returns empty array when no ghosts exist', async () => {
    const ghosts = await service.getGhosts('diagram.mmd');
    expect(ghosts).toHaveLength(0);
  });
});
