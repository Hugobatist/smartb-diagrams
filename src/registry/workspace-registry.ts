/**
 * Workspace Registry -- shared JSON file at ~/.smartb/workspaces.json
 * that tracks all running SmartB server instances.
 *
 * Each instance registers on startup and deregisters on shutdown.
 * The browser reads this registry to build the workspace switcher dropdown.
 *
 * Uses atomic write (write to temp file + rename) to avoid race conditions
 * between simultaneous MCP/serve processes.
 */
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { log } from '../utils/logger.js';

/** A single workspace entry in the registry */
export interface WorkspaceEntry {
  name: string;
  dir: string;
  port: number;
  pid: number;
}

const SMARTB_DIR = join(homedir(), '.smartb');
const REGISTRY_PATH = join(SMARTB_DIR, 'workspaces.json');

/** Read the registry file, returning an empty array on any error */
async function readRegistry(): Promise<WorkspaceEntry[]> {
  try {
    const raw = await readFile(REGISTRY_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Atomically write the registry (write to temp + rename) */
async function writeRegistry(entries: WorkspaceEntry[]): Promise<void> {
  await mkdir(SMARTB_DIR, { recursive: true });
  const tempPath = join(tmpdir(), `smartb-registry-${randomBytes(4).toString('hex')}.json`);
  await writeFile(tempPath, JSON.stringify(entries, null, 2), 'utf-8');
  try {
    await rename(tempPath, REGISTRY_PATH);
  } catch {
    // rename across filesystems can fail; fall back to write-in-place
    await writeFile(REGISTRY_PATH, JSON.stringify(entries, null, 2), 'utf-8');
    await unlink(tempPath).catch(() => {});
  }
}

/** Check if a process with the given PID is still alive */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = just check existence
    return true;
  } catch {
    return false;
  }
}

/** Filter out entries whose processes have died (crash cleanup) */
function filterAlive(entries: WorkspaceEntry[]): WorkspaceEntry[] {
  return entries.filter((e) => isProcessAlive(e.pid));
}

/**
 * Register this server instance in the workspace registry.
 * Derives workspace name from the last segment of the directory path.
 */
export async function register(dir: string, port: number): Promise<void> {
  const name = basename(dir) || dir;
  const pid = process.pid;
  const entries = filterAlive(await readRegistry());

  // Remove any stale entry for the same port or same dir
  const cleaned = entries.filter((e) => e.port !== port && e.dir !== dir);
  cleaned.push({ name, dir, port, pid });

  await writeRegistry(cleaned);
  log.debug(`Workspace registered: ${name} (port ${port}, pid ${pid})`);
}

/**
 * Remove this server instance from the workspace registry.
 */
export async function deregister(port: number): Promise<void> {
  const entries = await readRegistry();
  const filtered = entries.filter((e) => e.port !== port);
  await writeRegistry(filtered);
  log.debug(`Workspace deregistered (port ${port})`);
}

/**
 * List all live workspace entries (filters out dead PIDs).
 */
export async function list(): Promise<WorkspaceEntry[]> {
  const entries = await readRegistry();
  const alive = filterAlive(entries);

  // If we filtered out dead entries, rewrite the file to clean up
  if (alive.length !== entries.length) {
    await writeRegistry(alive).catch(() => {});
  }

  return alive;
}
