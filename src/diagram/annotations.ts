import type { Flag, GhostPathAnnotation, NodeStatus, RiskAnnotation, RiskLevel } from './types.js';
import { log } from '../utils/logger.js';

export const ANNOTATION_START = '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---';
export const ANNOTATION_END = '%% --- END ANNOTATIONS ---';
const FLAG_REGEX = /^%%\s*@flag\s+(\S+)\s+"([^"]*)"$/;
const STATUS_REGEX = /^%%\s*@status\s+(\S+)\s+(\S+)$/;
export const BREAKPOINT_REGEX = /^%%\s*@breakpoint\s+(\S+)$/;
export const RISK_REGEX = /^%%\s*@risk\s+(\S+)\s+(high|medium|low)\s+"([^"]*)"$/;
export const GHOST_REGEX = /^%%\s*@ghost\s+(\S+)\s+(\S+)\s+"([^"]*)"$/;

const VALID_STATUSES: readonly string[] = ['ok', 'problem', 'in-progress', 'discarded'];

/** Result of parsing all annotation types in a single pass */
export interface AllAnnotations {
  flags: Map<string, Flag>;
  statuses: Map<string, NodeStatus>;
  breakpoints: Set<string>;
  risks: Map<string, RiskAnnotation>;
  ghosts: GhostPathAnnotation[];
}

/**
 * Parse all annotation types (flags, statuses, breakpoints, risks) in a single pass.
 * Iterates through lines once, matching each annotation regex.
 * Unrecognized lines inside the annotation block are logged as debug warnings.
 */
export function parseAllAnnotations(content: string): AllAnnotations {
  const flags = new Map<string, Flag>();
  const statuses = new Map<string, NodeStatus>();
  const breakpoints = new Set<string>();
  const risks = new Map<string, RiskAnnotation>();
  const ghosts: GhostPathAnnotation[] = [];
  const lines = content.split('\n');

  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === ANNOTATION_START) {
      inBlock = true;
      continue;
    }

    if (trimmed === ANNOTATION_END) {
      inBlock = false;
      continue;
    }

    if (!inBlock || trimmed === '') continue;

    let match = FLAG_REGEX.exec(trimmed);
    if (match) {
      flags.set(match[1]!, { nodeId: match[1]!, message: match[2]! });
      continue;
    }

    match = STATUS_REGEX.exec(trimmed);
    if (match) {
      const statusValue = match[2]!;
      if (VALID_STATUSES.includes(statusValue)) {
        statuses.set(match[1]!, statusValue as NodeStatus);
      } else {
        log.debug(`Skipping invalid status value: ${statusValue}`);
      }
      continue;
    }

    match = BREAKPOINT_REGEX.exec(trimmed);
    if (match) {
      breakpoints.add(match[1]!);
      continue;
    }

    match = RISK_REGEX.exec(trimmed);
    if (match) {
      risks.set(match[1]!, { nodeId: match[1]!, level: match[2]! as RiskLevel, reason: match[3]! });
      continue;
    }

    match = GHOST_REGEX.exec(trimmed);
    if (match) {
      ghosts.push({ fromNodeId: match[1]!, toNodeId: match[2]!, label: match[3]! });
      continue;
    }

    log.debug(`Skipping unrecognized annotation line: ${trimmed}`);
  }

  return { flags, statuses, breakpoints, risks, ghosts };
}

/** Parse all `%% @flag` lines. Delegates to parseAllAnnotations. */
export function parseFlags(content: string): Map<string, Flag> {
  return parseAllAnnotations(content).flags;
}

/** Parse all `%% @status` lines. Delegates to parseAllAnnotations. */
export function parseStatuses(content: string): Map<string, NodeStatus> {
  return parseAllAnnotations(content).statuses;
}

/** Parse all `%% @breakpoint` lines. Delegates to parseAllAnnotations. */
export function parseBreakpoints(content: string): Set<string> {
  return parseAllAnnotations(content).breakpoints;
}

/** Parse all `%% @risk` lines. Delegates to parseAllAnnotations. */
export function parseRisks(content: string): Map<string, RiskAnnotation> {
  return parseAllAnnotations(content).risks;
}

/** Parse all `%% @ghost` lines. Delegates to parseAllAnnotations. */
export function parseGhosts(content: string): GhostPathAnnotation[] {
  return parseAllAnnotations(content).ghosts;
}

/**
 * Remove the entire annotation block (from ANNOTATION_START to ANNOTATION_END inclusive)
 * and any trailing blank lines. Returns pure Mermaid content.
 */
export function stripAnnotations(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === ANNOTATION_START) {
      inBlock = true;
      continue;
    }

    if (trimmed === ANNOTATION_END) {
      inBlock = false;
      continue;
    }

    if (!inBlock) {
      result.push(line);
    }
  }

  // Remove trailing blank lines
  while (result.length > 0 && result[result.length - 1]!.trim() === '') {
    result.pop();
  }

  // Ensure single trailing newline
  return result.join('\n') + '\n';
}

/**
 * Strip existing annotations, then append a new annotation block at the end.
 * If both flags and statuses maps are empty, returns content with no annotation block.
 * Escapes double quotes in flag messages by replacing " with ''.
 */
export function injectAnnotations(
  content: string,
  flags: Map<string, Flag>,
  statuses?: Map<string, NodeStatus>,
  breakpoints?: Set<string>,
  risks?: Map<string, RiskAnnotation>,
  ghosts?: GhostPathAnnotation[],
): string {
  const clean = stripAnnotations(content);

  const hasFlags = flags.size > 0;
  const hasStatuses = statuses !== undefined && statuses.size > 0;
  const hasBreakpoints = breakpoints !== undefined && breakpoints.size > 0;
  const hasRisks = risks !== undefined && risks.size > 0;
  const hasGhosts = ghosts !== undefined && ghosts.length > 0;

  if (!hasFlags && !hasStatuses && !hasBreakpoints && !hasRisks && !hasGhosts) {
    return clean;
  }

  const lines: string[] = [
    '',
    ANNOTATION_START,
  ];

  for (const [nodeId, flag] of flags) {
    const escapedMessage = flag.message.replace(/"/g, "''");
    lines.push(`%% @flag ${nodeId} "${escapedMessage}"`);
  }

  if (hasStatuses) {
    for (const [nodeId, status] of statuses!) {
      lines.push(`%% @status ${nodeId} ${status}`);
    }
  }

  if (hasBreakpoints) {
    for (const nodeId of breakpoints!) {
      lines.push(`%% @breakpoint ${nodeId}`);
    }
  }

  if (hasRisks) {
    for (const [nodeId, risk] of risks!) {
      const escapedReason = risk.reason.replace(/"/g, "''");
      lines.push(`%% @risk ${nodeId} ${risk.level} "${escapedReason}"`);
    }
  }

  if (hasGhosts) {
    for (const ghost of ghosts!) {
      const escapedLabel = ghost.label.replace(/"/g, "''");
      lines.push(`%% @ghost ${ghost.fromNodeId} ${ghost.toNodeId} "${escapedLabel}"`);
    }
  }

  lines.push(ANNOTATION_END);
  lines.push('');

  return clean.trimEnd() + '\n' + lines.join('\n');
}
