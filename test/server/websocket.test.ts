import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocketManager, type WsMessage } from '../../src/server/websocket.js';
import WebSocket, { WebSocketServer } from 'ws';

/** Wait for a WebSocket to reach OPEN state */
function waitForOpen(ws: WebSocket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), timeoutMs);
    ws.once('open', () => { clearTimeout(timer); resolve(); });
    ws.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/** Wait for the next WebSocket message and return its string data */
function waitForMessage(ws: WebSocket, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket message timeout')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(data.toString());
    });
  });
}

describe('WebSocketManager', { timeout: 10_000 }, () => {
  let httpServer: Server;
  let wsManager: WebSocketManager;
  let port: number;
  const openClients: WebSocket[] = [];

  /** Helper to create a WebSocket client and track it for cleanup */
  function createClient(path: string): WebSocket {
    const ws = new WebSocket(`ws://localhost:${port}${path}`);
    openClients.push(ws);
    return ws;
  }

  beforeEach(async () => {
    httpServer = createServer();
    wsManager = new WebSocketManager(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    const addr = httpServer.address();
    if (typeof addr === 'object' && addr) {
      port = addr.port;
    }
  });

  afterEach(async () => {
    // Close all tracked clients
    await Promise.all(
      openClients.map(
        (ws) =>
          new Promise<void>((resolve) => {
            if (ws.readyState === WebSocket.CLOSED) {
              resolve();
              return;
            }
            ws.on('close', () => resolve());
            ws.close();
          }),
      ),
    );
    openClients.length = 0;

    wsManager.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // --- Namespace creation and routing ---

  it('creates default namespace on /ws connection', async () => {
    const ws = createClient('/ws');
    const msg = await waitForMessage(ws);
    const parsed = JSON.parse(msg);
    expect(parsed).toEqual({ type: 'connected', project: 'default' });
  });

  it('creates named namespace on /ws/project-name', async () => {
    const ws = createClient('/ws/my-project');
    const msg = await waitForMessage(ws);
    const parsed = JSON.parse(msg);
    expect(parsed).toEqual({ type: 'connected', project: 'my-project' });
  });

  it('rejects connections to non-/ws paths', async () => {
    const ws = createClient('/other-path');

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Expected socket close')), 3000);
      ws.on('close', () => { clearTimeout(timer); resolve(); });
      ws.on('error', () => { clearTimeout(timer); resolve(); });
    });

    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });

  it('addProject creates a namespace without needing a client connection', () => {
    wsManager.addProject('pre-created');
    // getClientCount should work (returns 0) -- proves namespace exists
    expect(wsManager.getClientCount('pre-created')).toBe(0);
  });

  // --- Broadcast ---

  it('broadcast sends message only to clients in the target namespace', async () => {
    const clientA = createClient('/ws/proj-a');
    const clientB = createClient('/ws/proj-b');

    // Consume 'connected' messages
    await Promise.all([waitForMessage(clientA), waitForMessage(clientB)]);

    let clientBReceived = false;
    clientB.on('message', () => { clientBReceived = true; });

    const message: WsMessage = {
      type: 'file:changed',
      file: 'test.mmd',
      content: 'flowchart LR\n  A-->B',
    };
    wsManager.broadcast('proj-a', message);

    const raw = await waitForMessage(clientA, 2000);
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe('file:changed');
    expect(parsed.file).toBe('test.mmd');

    // Give clientB time to (not) receive
    await new Promise((r) => setTimeout(r, 200));
    expect(clientBReceived).toBe(false);
  });

  it('broadcast skips clients that are not in OPEN state', async () => {
    const client = createClient('/ws');
    await waitForMessage(client); // consume 'connected'

    // Close the client so its readyState is no longer OPEN
    client.close();
    await new Promise<void>((resolve) => client.on('close', () => resolve()));

    // Should not throw even though only client is closed
    expect(() => {
      wsManager.broadcast('default', {
        type: 'file:changed',
        file: 'test.mmd',
        content: 'flowchart LR\n  X-->Y',
      });
    }).not.toThrow();
  });

  it('broadcast to non-existent namespace does nothing (no error)', () => {
    expect(() => {
      wsManager.broadcast('nonexistent', {
        type: 'file:changed',
        file: 'test.mmd',
        content: 'flowchart LR\n  A-->B',
      });
    }).not.toThrow();
  });

  // --- BroadcastAll ---

  it('broadcastAll sends message to all namespaces', async () => {
    const clientDefault = createClient('/ws');
    const clientNamed = createClient('/ws/other');

    // Consume 'connected' messages
    await Promise.all([waitForMessage(clientDefault), waitForMessage(clientNamed)]);

    const message: WsMessage = {
      type: 'tree:updated',
      files: ['a.mmd', 'b.mmd'],
    };
    wsManager.broadcastAll(message);

    const [rawDefault, rawNamed] = await Promise.all([
      waitForMessage(clientDefault, 2000),
      waitForMessage(clientNamed, 2000),
    ]);

    const msgDefault = JSON.parse(rawDefault);
    const msgNamed = JSON.parse(rawNamed);

    expect(msgDefault).toEqual(message);
    expect(msgNamed).toEqual(message);
  });

  it('broadcastAll skips non-OPEN clients across namespaces', async () => {
    const openClient = createClient('/ws/open-ns');
    const closingClient = createClient('/ws/closing-ns');

    await Promise.all([waitForMessage(openClient), waitForMessage(closingClient)]);

    // Close one client
    closingClient.close();
    await new Promise<void>((resolve) => closingClient.on('close', () => resolve()));

    const message: WsMessage = {
      type: 'tree:updated',
      files: ['x.mmd'],
    };
    wsManager.broadcastAll(message);

    // The open client should still receive the message
    const raw = await waitForMessage(openClient, 2000);
    expect(JSON.parse(raw)).toEqual(message);
  });

  // --- Client count ---

  it('getClientCount returns count for a specific namespace', async () => {
    expect(wsManager.getClientCount('default')).toBe(0);

    const client1 = createClient('/ws');
    const client2 = createClient('/ws');
    await Promise.all([waitForMessage(client1), waitForMessage(client2)]);

    expect(wsManager.getClientCount('default')).toBe(2);
  });

  it('getClientCount returns 0 for non-existent namespace', () => {
    expect(wsManager.getClientCount('nonexistent')).toBe(0);
  });

  it('getClientCount without namespace returns total across all namespaces', async () => {
    const c1 = createClient('/ws');
    const c2 = createClient('/ws/project-x');
    const c3 = createClient('/ws/project-x');

    await Promise.all([waitForMessage(c1), waitForMessage(c2), waitForMessage(c3)]);

    // 1 in default + 2 in project-x = 3
    expect(wsManager.getClientCount()).toBe(3);
  });

  it('getClientCount excludes non-OPEN clients', async () => {
    const c1 = createClient('/ws');
    const c2 = createClient('/ws');
    await Promise.all([waitForMessage(c1), waitForMessage(c2)]);

    expect(wsManager.getClientCount('default')).toBe(2);

    // Close one
    c1.close();
    await new Promise<void>((resolve) => c1.on('close', () => resolve()));

    expect(wsManager.getClientCount('default')).toBe(1);
  });

  // --- Close ---

  it('close clears all namespaces', async () => {
    const client = createClient('/ws');
    await waitForMessage(client);

    wsManager.addProject('extra-namespace');
    wsManager.close();

    // After close, counts should all be 0 / namespaces gone
    expect(wsManager.getClientCount('default')).toBe(0);
    expect(wsManager.getClientCount('extra-namespace')).toBe(0);
    expect(wsManager.getClientCount()).toBe(0);
  });

  // --- URL decoding ---

  it('handles URL-encoded project names', async () => {
    const ws = createClient('/ws/my%20project');
    const msg = await waitForMessage(ws);
    const parsed = JSON.parse(msg);
    expect(parsed).toEqual({ type: 'connected', project: 'my project' });
  });

  // --- Multiple messages ---

  it('broadcast delivers multiple sequential messages in order', async () => {
    const client = createClient('/ws');
    await waitForMessage(client); // consume 'connected'

    const messages: WsMessage[] = [
      { type: 'file:changed', file: 'a.mmd', content: 'flowchart LR\n  A-->B' },
      { type: 'file:changed', file: 'b.mmd', content: 'flowchart TD\n  X-->Y' },
      { type: 'file:removed', file: 'c.mmd' },
    ];

    for (const msg of messages) {
      wsManager.broadcast('default', msg);
    }

    const received: string[] = [];
    await new Promise<void>((resolve) => {
      client.on('message', (data) => {
        received.push(data.toString());
        if (received.length === 3) resolve();
      });
      setTimeout(() => resolve(), 2000);
    });

    expect(received).toHaveLength(3);
    expect(JSON.parse(received[0]!).file).toBe('a.mmd');
    expect(JSON.parse(received[1]!).file).toBe('b.mmd');
    expect(JSON.parse(received[2]!).file).toBe('c.mmd');
  });
});
