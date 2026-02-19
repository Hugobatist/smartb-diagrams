import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileWatcher } from '../../src/watcher/file-watcher.js';

// ===================================================================
// FileWatcher initialization and event classification tests
// ===================================================================

describe('FileWatcher', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    // Close all watchers first
    for (const cleanup of cleanups) {
      await cleanup();
    }
    cleanups.length = 0;

    // Remove temp directories
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  function createTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'smartb-watcher-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('pre-populates knownFiles from existing .mmd files', async () => {
    const dir = createTmpDir();

    // Create pre-existing .mmd files before starting the watcher
    writeFileSync(join(dir, 'existing.mmd'), 'flowchart LR\n    A --> B\n', 'utf-8');
    writeFileSync(join(dir, 'another.mmd'), 'flowchart TD\n    X --> Y\n', 'utf-8');

    const changes: string[] = [];
    const adds: string[] = [];
    const removes: string[] = [];

    const watcher = new FileWatcher(
      dir,
      (f) => changes.push(f),
      (f) => adds.push(f),
      (f) => removes.push(f),
    );
    cleanups.push(() => watcher.close());

    // Wait for discovery to complete
    await watcher.whenReady();

    // Modify the existing file -- should trigger onFileChanged, NOT onFileAdded
    await writeFile(join(dir, 'existing.mmd'), 'flowchart LR\n    A --> B --> C\n', 'utf-8');

    // Wait for debounce (80ms) + ready gate + buffer
    await new Promise((r) => setTimeout(r, 300));

    expect(changes).toContain('existing.mmd');
    expect(adds).not.toContain('existing.mmd');
  });

  it('classifies truly new files as "add"', async () => {
    const dir = createTmpDir();

    // Start watcher with NO pre-existing files
    const changes: string[] = [];
    const adds: string[] = [];
    const removes: string[] = [];

    const watcher = new FileWatcher(
      dir,
      (f) => changes.push(f),
      (f) => adds.push(f),
      (f) => removes.push(f),
    );
    cleanups.push(() => watcher.close());

    await watcher.whenReady();

    // Create a new file after the watcher has started
    await writeFile(join(dir, 'brand-new.mmd'), 'flowchart LR\n    New --> File\n', 'utf-8');

    // Wait for debounce + buffer
    await new Promise((r) => setTimeout(r, 300));

    expect(adds).toContain('brand-new.mmd');
    expect(changes).not.toContain('brand-new.mmd');
  });

  it('whenReady() resolves even when directory has no .mmd files', async () => {
    const dir = createTmpDir();

    const watcher = new FileWatcher(
      dir,
      () => {},
      () => {},
      () => {},
    );
    cleanups.push(() => watcher.close());

    // Should resolve without errors
    await expect(watcher.whenReady()).resolves.toBeUndefined();
  });
});
