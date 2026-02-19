import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DiagramService } from '../diagram/service.js';
import type { WebSocketManager } from './websocket.js';
import { sendJson, readJsonBody, type Route } from './server.js';

/**
 * Register ghost path REST endpoints.
 * Ghost paths are now persisted as @ghost annotations in .mmd files via DiagramService.
 */
export function registerGhostPathRoutes(
  routes: Route[],
  service: DiagramService,
  wsManager?: WebSocketManager,
): void {
  // -------------------------------------------------------
  // GET /api/ghost-paths/:file -- Get ghost paths for a file
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/ghost-paths/(?<file>.+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const ghosts = await service.getGhosts(file);
        sendJson(res, { ghostPaths: ghosts });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // POST /api/ghost-paths/:file -- Add a ghost path
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/api/ghost-paths/(?<file>.+)$'),
    handler: async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const body = await readJsonBody<{ fromNodeId: string; toNodeId: string; label?: string }>(req);
        if (!body.fromNodeId || !body.toNodeId) {
          sendJson(res, { error: 'Missing fromNodeId or toNodeId' }, 400);
          return;
        }
        await service.addGhost(file, body.fromNodeId, body.toNodeId, body.label ?? '');
        const ghostPaths = await service.getGhosts(file);
        if (wsManager) {
          wsManager.broadcastAll({ type: 'ghost:update', file, ghostPaths });
        }
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // DELETE /api/ghost-paths/:file -- Clear all ghost paths for a file
  // -------------------------------------------------------
  routes.push({
    method: 'DELETE',
    pattern: new RegExp('^/api/ghost-paths/(?<file>.+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        await service.clearGhosts(file);
        if (wsManager) {
          wsManager.broadcastAll({ type: 'ghost:update', file, ghostPaths: [] });
        }
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });
}
