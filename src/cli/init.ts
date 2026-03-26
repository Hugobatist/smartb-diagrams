import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { log } from '../utils/logger.js';

/** Default project config for .smartcode.json */
const DEFAULT_CONFIG = {
  version: 1,
  diagramDir: '.',
  port: 3333,
};

/** MCP config so Claude Code / Cursor auto-start SmartCode */
const MCP_CONFIG = {
  mcpServers: {
    'smartcode': {
      command: 'smartcode',
      args: ['mcp', '--serve'],
    },
  },
};

/** Sample reasoning.mmd content for new projects */
const SAMPLE_DIAGRAM = `flowchart LR
    Start["Problem Statement"] --> Analyze["Analyze Requirements"]
    Analyze --> Plan["Create Plan"]
    Plan --> Implement["Implement Solution"]
    Implement --> Verify["Verify Results"]
    Verify --> Done["Complete"]
`;

/**
 * Initialize a SmartCode project in the given directory.
 * Creates .smartcode.json config and a sample reasoning.mmd file.
 *
 * @param dir - Directory to initialize (default: current directory)
 * @param force - Overwrite existing .smartcode.json if present
 */
export async function initProject(dir: string, force?: boolean): Promise<void> {
  const resolvedDir = path.resolve(dir);
  const configPath = path.join(resolvedDir, '.smartcode.json');
  const diagramPath = path.join(resolvedDir, 'reasoning.mmd');

  // Check if already initialized
  const exists = await access(configPath).then(() => true).catch(() => false);
  if (exists && !force) {
    throw new Error(
      'Already initialized: .smartcode.json exists. Use --force to reinitialize.',
    );
  }

  // Write .smartcode.json
  await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8');

  // Write .mcp.json (MCP config for AI tools)
  const mcpPath = path.join(resolvedDir, '.mcp.json');
  const mcpExists = await access(mcpPath).then(() => true).catch(() => false);
  if (!mcpExists || force) {
    await writeFile(mcpPath, JSON.stringify(MCP_CONFIG, null, 2) + '\n', 'utf-8');
  }

  // Write reasoning.mmd (only if missing or force)
  const diagramExists = await access(diagramPath).then(() => true).catch(() => false);
  if (!diagramExists || force) {
    await writeFile(diagramPath, SAMPLE_DIAGRAM, 'utf-8');
  }

  log.info(pc.green('Initialized SmartCode'));
  log.info(pc.dim(`  ${configPath}`));
  log.info(pc.dim(`  ${mcpPath}`));
  log.info(pc.dim(`  ${diagramPath}`));
  log.info('');
  log.info(`Open this project in ${pc.cyan('Claude Code')} or ${pc.cyan('Cursor')} — SmartCode starts automatically.`);
  log.info(`Or run ${pc.cyan('smartcode serve')} to start the viewer manually.`);
}
