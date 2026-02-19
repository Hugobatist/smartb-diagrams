import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DiagramContent, Flag, NodeStatus, RiskAnnotation, RiskLevel, ValidationResult } from './types.js';
import type { GraphModel } from './graph-types.js';
import { parseDiagramContent } from './parser.js';
import { injectAnnotations, parseAllAnnotations } from './annotations.js';
import { validateMermaidSyntax } from './validator.js';
import { parseMermaidToGraph } from './graph-parser.js';
import { resolveProjectPath } from '../utils/paths.js';
import { discoverMmdFiles } from '../project/discovery.js';

/** All parsed annotation data from a .mmd file */
interface AnnotationData {
  raw: string;
  mermaidContent: string;
  flags: Map<string, Flag>;
  statuses: Map<string, NodeStatus>;
  breakpoints: Set<string>;
  risks: Map<string, RiskAnnotation>;
}

/**
 * DiagramService -- single entry point for all .mmd file operations.
 * Each instance is bound to a project root for path security.
 */
export class DiagramService {
  /** Per-file write locks to serialize concurrent write operations */
  private writeLocks = new Map<string, Promise<void>>();

  /**
   * Serialize write operations on a given file path.
   * Each call waits for the previous write on the same file to finish before running.
   * Cleans up lock entry when no further writes are queued.
   */
  private async withWriteLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.writeLocks.get(filePath) ?? Promise.resolve();
    const current = prev.then(fn, fn); // run fn after previous completes (even if it failed)
    const settled = current.then(() => {}, () => {}); // swallow errors for the lock chain
    this.writeLocks.set(filePath, settled);
    const result = await current;
    // Clean up lock entry if no subsequent write has been queued
    if (this.writeLocks.get(filePath) === settled) {
      this.writeLocks.delete(filePath);
    }
    return result;
  }

  constructor(private readonly projectRoot: string) {}

  /**
   * Read a .mmd file and parse all annotations + mermaid content in one pass.
   */
  private async readAllAnnotations(filePath: string): Promise<AnnotationData> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    const { mermaidContent } = parseDiagramContent(raw);
    const { flags, statuses, breakpoints, risks } = parseAllAnnotations(raw);
    return { raw, mermaidContent, flags, statuses, breakpoints, risks };
  }

  /**
   * Read-modify-write cycle for annotation mutations.
   * Acquires the write lock, reads all annotations, calls modifyFn to mutate them,
   * then writes the result back.
   */
  private async modifyAnnotation(
    filePath: string,
    modifyFn: (data: AnnotationData) => void,
  ): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const data = await this.readAllAnnotations(filePath);
      modifyFn(data);
      await this._writeDiagramInternal(
        filePath, data.mermaidContent, data.flags, data.statuses, data.breakpoints, data.risks,
      );
    });
  }

  /**
   * Read and parse a .mmd file.
   * Resolves path with traversal protection, parses content, and validates syntax.
   */
  async readDiagram(filePath: string): Promise<DiagramContent> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    const { mermaidContent, diagramType } = parseDiagramContent(raw);
    const { flags, statuses } = parseAllAnnotations(raw);
    const validation = validateMermaidSyntax(mermaidContent);

    // Ensure diagramType from parser is reflected in validation result
    if (diagramType && !validation.diagramType) {
      validation.diagramType = diagramType;
    }

    return { raw, mermaidContent, flags, statuses, validation, filePath };
  }

  /**
   * Read a .mmd file and parse it into a structured GraphModel.
   */
  async readGraph(filePath: string): Promise<GraphModel> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    return parseMermaidToGraph(raw, filePath);
  }

  /**
   * Write a .mmd file. If flags or statuses are provided, injects annotation block.
   * Creates parent directories if they don't exist.
   */
  async writeDiagram(
    filePath: string,
    content: string,
    flags?: Map<string, Flag>,
    statuses?: Map<string, NodeStatus>,
    breakpoints?: Set<string>,
    risks?: Map<string, RiskAnnotation>,
  ): Promise<void> {
    return this.withWriteLock(filePath, () =>
      this._writeDiagramInternal(filePath, content, flags, statuses, breakpoints, risks),
    );
  }

  /**
   * Write diagram content while preserving existing developer-owned annotations (flags, breakpoints).
   * Reads existing annotations first, merges caller-provided statuses/risks on top, preserves flags
   * and breakpoints unconditionally, then writes the merged result atomically under the write lock.
   *
   * Merge semantics:
   * - `content`: always replaces the Mermaid diagram body
   * - `statuses`: if provided, replaces all statuses; if undefined, preserves existing
   * - `risks`: if provided, replaces all risks; if undefined, preserves existing
   * - `flags`: always preserved from the file (developer-owned, never touched by MCP)
   * - `breakpoints`: always preserved from the file (developer-owned, never touched by MCP)
   */
  async writeDiagramPreserving(
    filePath: string,
    content: string,
    statuses?: Map<string, NodeStatus>,
    risks?: Map<string, RiskAnnotation>,
  ): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      // Read existing annotations (if file exists)
      let existingFlags = new Map<string, Flag>();
      let existingBreakpoints = new Set<string>();
      let existingStatuses = new Map<string, NodeStatus>();
      let existingRisks = new Map<string, RiskAnnotation>();
      try {
        const data = await this.readAllAnnotations(filePath);
        existingFlags = data.flags;
        existingBreakpoints = data.breakpoints;
        existingStatuses = data.statuses;
        existingRisks = data.risks;
      } catch {
        // File doesn't exist yet -- empty defaults are fine
      }

      await this._writeDiagramInternal(
        filePath,
        content,
        existingFlags,                    // always preserve
        statuses ?? existingStatuses,     // replace if provided, else preserve
        existingBreakpoints,              // always preserve
        risks ?? existingRisks,           // replace if provided, else preserve
      );
    });
  }

  /**
   * Write raw content to a .mmd file under the write lock.
   * Does NOT process annotations -- writes content as-is.
   * Used by /save endpoint which receives pre-formatted content from the editor.
   */
  async writeRaw(filePath: string, content: string): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const resolved = this.resolvePath(filePath);
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content, 'utf-8');
    });
  }

  /**
   * Internal write without acquiring the lock.
   * Used by methods that already hold the write lock for the same file.
   */
  private async _writeDiagramInternal(
    filePath: string,
    content: string,
    flags?: Map<string, Flag>,
    statuses?: Map<string, NodeStatus>,
    breakpoints?: Set<string>,
    risks?: Map<string, RiskAnnotation>,
  ): Promise<void> {
    const resolved = this.resolvePath(filePath);
    let output = content;

    if (flags || statuses || breakpoints || risks) {
      output = injectAnnotations(content, flags ?? new Map(), statuses, breakpoints, risks);
    }

    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, output, 'utf-8');
  }

  /** Get all flags from a .mmd file as an array. */
  async getFlags(filePath: string): Promise<Flag[]> {
    const diagram = await this.readDiagram(filePath);
    return Array.from(diagram.flags.values());
  }

  /** Set (add or update) a flag on a specific node. */
  async setFlag(filePath: string, nodeId: string, message: string): Promise<void> {
    return this.modifyAnnotation(filePath, (data) => {
      data.flags.set(nodeId, { nodeId, message });
    });
  }

  /** Remove a flag from a specific node. */
  async removeFlag(filePath: string, nodeId: string): Promise<void> {
    return this.modifyAnnotation(filePath, (data) => {
      data.flags.delete(nodeId);
    });
  }

  /** Get all statuses from a .mmd file. */
  async getStatuses(filePath: string): Promise<Map<string, NodeStatus>> {
    const diagram = await this.readDiagram(filePath);
    return diagram.statuses;
  }

  /** Set (add or update) a status on a specific node. */
  async setStatus(filePath: string, nodeId: string, status: NodeStatus): Promise<void> {
    return this.modifyAnnotation(filePath, (data) => {
      data.statuses.set(nodeId, status);
    });
  }

  /** Remove a status from a specific node. */
  async removeStatus(filePath: string, nodeId: string): Promise<void> {
    return this.modifyAnnotation(filePath, (data) => {
      data.statuses.delete(nodeId);
    });
  }

  /** Get all breakpoints from a .mmd file. */
  async getBreakpoints(filePath: string): Promise<Set<string>> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    return parseAllAnnotations(raw).breakpoints;
  }

  /** Set (add) a breakpoint on a specific node. */
  async setBreakpoint(filePath: string, nodeId: string): Promise<void> {
    return this.modifyAnnotation(filePath, (data) => {
      data.breakpoints.add(nodeId);
    });
  }

  /** Remove a breakpoint from a specific node. */
  async removeBreakpoint(filePath: string, nodeId: string): Promise<void> {
    return this.modifyAnnotation(filePath, (data) => {
      data.breakpoints.delete(nodeId);
    });
  }

  /** Get all risk annotations from a .mmd file. */
  async getRisks(filePath: string): Promise<Map<string, RiskAnnotation>> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    return parseAllAnnotations(raw).risks;
  }

  /** Set (add or update) a risk annotation on a specific node. */
  async setRisk(filePath: string, nodeId: string, level: RiskLevel, reason: string): Promise<void> {
    return this.modifyAnnotation(filePath, (data) => {
      data.risks.set(nodeId, { nodeId, level, reason });
    });
  }

  /** Remove a risk annotation from a specific node. */
  async removeRisk(filePath: string, nodeId: string): Promise<void> {
    return this.modifyAnnotation(filePath, (data) => {
      data.risks.delete(nodeId);
    });
  }

  /** Validate the Mermaid syntax of a .mmd file. */
  async validate(filePath: string): Promise<ValidationResult> {
    const diagram = await this.readDiagram(filePath);
    return diagram.validation;
  }

  /** List all .mmd files in the project root. */
  async listFiles(): Promise<string[]> {
    return discoverMmdFiles(this.projectRoot);
  }

  /**
   * Resolve a relative file path against the project root.
   * Single chokepoint for path security -- rejects path traversal.
   */
  private resolvePath(filePath: string): string {
    return resolveProjectPath(this.projectRoot, filePath);
  }
}
