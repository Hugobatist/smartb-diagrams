import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DiagramService } from '../diagram/service.js';
import type { RiskLevel } from '../diagram/types.js';
import { sendJson, readJsonBody, type Route } from './server.js';

const VALID_RISK_LEVELS = new Set<string>(['high', 'medium', 'low']);

/**
 * Register annotation REST endpoints (risk levels).
 * Follows the same pattern as breakpoint-routes.ts.
 */
export function registerAnnotationRoutes(
  routes: Route[],
  service: DiagramService,
): void {
  // -------------------------------------------------------
  // GET /api/annotations/:file/risks -- Get all risk annotations
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/annotations/(?<file>.+)/risks$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const risks = await service.getRisks(file);
        const entries: Array<{ nodeId: string; level: string; reason: string }> = [];
        for (const [, risk] of risks) {
          entries.push({ nodeId: risk.nodeId, level: risk.level, reason: risk.reason });
        }
        sendJson(res, { risks: entries });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // POST /api/annotations/:file/risk -- Set a risk annotation
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/api/annotations/(?<file>.+)/risk$'),
    handler: async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const body = await readJsonBody<{ nodeId: string; level: string; reason: string }>(req);
        if (!body.nodeId || !body.level || !body.reason) {
          sendJson(res, { error: 'Missing nodeId, level, or reason' }, 400);
          return;
        }
        if (!VALID_RISK_LEVELS.has(body.level)) {
          sendJson(res, { error: `Invalid level: must be high, medium, or low` }, 400);
          return;
        }
        await service.setRisk(file, body.nodeId, body.level as RiskLevel, body.reason);
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // DELETE /api/annotations/:file/risk -- Remove a risk annotation
  // -------------------------------------------------------
  routes.push({
    method: 'DELETE',
    pattern: new RegExp('^/api/annotations/(?<file>.+)/risk$'),
    handler: async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const body = await readJsonBody<{ nodeId: string }>(req);
        if (!body.nodeId) {
          sendJson(res, { error: 'Missing nodeId' }, 400);
          return;
        }
        await service.removeRisk(file, body.nodeId);
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });
}
