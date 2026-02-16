import type { GhostPath } from '../diagram/types.js';

/**
 * In-memory store for ghost paths per file.
 * Ghost paths represent AI-suggested alternative flows that haven't been committed to the diagram.
 */
export class GhostPathStore {
  private static readonly MAX_PATHS_PER_FILE = 100;
  private paths = new Map<string, GhostPath[]>();

  /** Add a ghost path for a specific file (evicts oldest when limit reached) */
  add(filePath: string, ghost: GhostPath): void {
    const list = this.paths.get(filePath) ?? [];
    list.push(ghost);
    // Evict oldest entries when limit exceeded
    while (list.length > GhostPathStore.MAX_PATHS_PER_FILE) {
      list.shift();
    }
    this.paths.set(filePath, list);
  }

  /** Get all ghost paths for a specific file */
  get(filePath: string): GhostPath[] {
    return this.paths.get(filePath) ?? [];
  }

  /** Clear ghost paths for a specific file */
  clear(filePath: string): void {
    this.paths.delete(filePath);
  }

  /** Clear all ghost paths across all files */
  clearAll(): void {
    this.paths.clear();
  }
}
