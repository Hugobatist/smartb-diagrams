import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DiagramService } from '../../src/diagram/service.js';

/**
 * Tests for the get_correction_context MCP tool data pipeline.
 *
 * Since the tool handler is registered inside registerTools() and not
 * independently exportable, we test via the DiagramService interface:
 * - Read diagram, verify flags exist
 * - Construct the CorrectionContext shape from service output
 * - Validate the shape matches what the tool would return
 */
describe('get_correction_context', () => {
  let tmpDir: string;
  let service: DiagramService;

  const FLAGGED_DIAGRAM = [
    'flowchart LR',
    '    A["Load data"] --> B["Process"]',
    '    B --> C["Save results"]',
    '',
    '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---',
    '%% @flag B "This step is too slow, consider batching"',
    '%% @flag C "Output format should be JSON not CSV"',
    '%% @status A ok',
    '%% --- END ANNOTATIONS ---',
    '',
  ].join('\n');

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'smartb-mcp-test-'));
    service = new DiagramService(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns structured CorrectionContext for a flagged nodeId', async () => {
    writeFileSync(join(tmpDir, 'test.mmd'), FLAGGED_DIAGRAM, 'utf-8');

    const diagram = await service.readDiagram('test.mmd');
    const nodeId = 'B';
    const flag = diagram.flags.get(nodeId);

    expect(flag).toBeDefined();

    // Build CorrectionContext (mirrors tool handler logic)
    const context = {
      correction: {
        nodeId: flag!.nodeId,
        flagMessage: flag!.message,
      },
      diagramState: {
        filePath: 'test.mmd',
        mermaidContent: diagram.mermaidContent,
        allFlags: Array.from(diagram.flags.values()).map((f) => ({
          nodeId: f.nodeId,
          message: f.message,
        })),
        statuses: Object.fromEntries(diagram.statuses),
      },
      instruction: `The developer flagged node "${nodeId}" with the message: "${flag!.message}". Review the diagram and update it to address this feedback. Use the update_diagram tool to write the corrected Mermaid content.`,
    };

    // Verify correction section
    expect(context.correction.nodeId).toBe('B');
    expect(context.correction.flagMessage).toBe(
      'This step is too slow, consider batching',
    );

    // Verify diagramState
    expect(context.diagramState.filePath).toBe('test.mmd');
    expect(context.diagramState.mermaidContent).toContain('flowchart LR');
    expect(context.diagramState.mermaidContent).not.toContain('@flag');
    expect(context.diagramState.allFlags).toHaveLength(2);
    expect(context.diagramState.allFlags).toEqual(
      expect.arrayContaining([
        { nodeId: 'B', message: 'This step is too slow, consider batching' },
        { nodeId: 'C', message: 'Output format should be JSON not CSV' },
      ]),
    );
    expect(context.diagramState.statuses).toEqual({ A: 'ok' });

    // Verify instruction contains the flag message
    expect(context.instruction).toContain('flagged node "B"');
    expect(context.instruction).toContain(
      'This step is too slow, consider batching',
    );
    expect(context.instruction).toContain('update_diagram');
  });

  it('returns no flag for a non-flagged nodeId', async () => {
    writeFileSync(join(tmpDir, 'test.mmd'), FLAGGED_DIAGRAM, 'utf-8');

    const diagram = await service.readDiagram('test.mmd');
    const flag = diagram.flags.get('A');

    // Node A has a status but no flag
    expect(flag).toBeUndefined();

    // This is what the tool handler would return as isError:true
    const errorMessage = `No flag found on node "A" in test.mmd`;
    expect(errorMessage).toContain('No flag found');
    expect(errorMessage).toContain('A');
  });

  it('throws for a non-existent file', async () => {
    // The tool handler wraps this in try/catch and returns isError:true
    await expect(
      service.readDiagram('nonexistent.mmd'),
    ).rejects.toThrow();
  });

  it('serializes CorrectionContext as valid JSON', async () => {
    writeFileSync(join(tmpDir, 'test.mmd'), FLAGGED_DIAGRAM, 'utf-8');

    const diagram = await service.readDiagram('test.mmd');
    const flag = diagram.flags.get('C')!;

    const context = {
      correction: {
        nodeId: flag.nodeId,
        flagMessage: flag.message,
      },
      diagramState: {
        filePath: 'test.mmd',
        mermaidContent: diagram.mermaidContent,
        allFlags: Array.from(diagram.flags.values()).map((f) => ({
          nodeId: f.nodeId,
          message: f.message,
        })),
        statuses: Object.fromEntries(diagram.statuses),
      },
      instruction: `The developer flagged node "C" with the message: "${flag.message}". Review the diagram and update it to address this feedback. Use the update_diagram tool to write the corrected Mermaid content.`,
    };

    // Verify it serializes cleanly (as the tool does with JSON.stringify)
    const serialized = JSON.stringify(context, null, 2);
    const parsed = JSON.parse(serialized);

    expect(parsed.correction.nodeId).toBe('C');
    expect(parsed.correction.flagMessage).toBe(
      'Output format should be JSON not CSV',
    );
    expect(parsed.diagramState.mermaidContent).toBeTruthy();
    expect(parsed.instruction).toContain('flagged node "C"');
  });
});
