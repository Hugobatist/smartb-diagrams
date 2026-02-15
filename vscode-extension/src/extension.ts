import * as vscode from 'vscode';
import * as http from 'node:http';
import { DiagramViewProvider } from './diagram-provider.js';
import { SmartBWsClient } from './ws-client.js';

/** Derive HTTP base URL from the WebSocket URL. */
function getHttpBaseUrl(wsUrl: string): string {
  return wsUrl
    .replace(/^wss?:\/\//, 'http://')
    .replace(/\/ws\/?$/, '');
}

/** POST JSON to a URL using Node.js built-in http module. */
function httpPost(url: string, body: object): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 5000,
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => (responseBody += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(data);
    req.end();
  });
}

export function activate(context: vscode.ExtensionContext): void {
  // Track current file and cached contents from WebSocket messages
  let currentFile = '';
  const fileContents = new Map<string, string>();

  // 1. Create and register the sidebar webview provider
  const provider = new DiagramViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DiagramViewProvider.viewType, provider),
  );

  // 2. Read configuration
  const config = vscode.workspace.getConfiguration('smartb');
  let serverUrl = config.get<string>('serverUrl', 'ws://localhost:3333/ws');
  const autoConnect = config.get<boolean>('autoConnect', true);

  // 3. Handle messages from the webview
  provider.onWebviewMessage = (msg: unknown) => {
    handleWebviewMessage(msg);
  };

  // Callback to send initial state when webview becomes visible
  provider.onWebviewReady = () => {
    if (currentFile && fileContents.has(currentFile)) {
      provider.postMessage({
        type: 'diagram:update',
        file: currentFile,
        content: fileContents.get(currentFile),
      });
    }
  };

  // 4. Create WebSocket client with callbacks that relay to the webview
  const wsClient = new SmartBWsClient(serverUrl, {
    onMessage: (msg) => {
      const wsMsg = msg as Record<string, unknown>;

      // Track file contents for flag saving and initial state restore
      if (wsMsg.type === 'file:changed' && typeof wsMsg.file === 'string' && typeof wsMsg.content === 'string') {
        fileContents.set(wsMsg.file, wsMsg.content);
        currentFile = wsMsg.file;
      }

      // Relay all messages to webview
      provider.postMessage({ type: 'diagram:update', ...(msg as object) });
    },
    onStatus: (status) => {
      provider.postMessage({ type: 'connection:status', status });
    },
  });

  // 5. Auto-connect if configured
  if (autoConnect) {
    wsClient.connect();
  }

  // 6. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('smartb.reconnect', () => {
      wsClient.reconnect();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartb.openBrowser', () => {
      const wsUrl = vscode.workspace.getConfiguration('smartb').get<string>('serverUrl', 'ws://localhost:3333/ws');
      const httpUrl = getHttpBaseUrl(wsUrl);
      vscode.env.openExternal(vscode.Uri.parse(httpUrl));
    }),
  );

  // 7. Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('smartb.serverUrl')) {
        serverUrl = vscode.workspace.getConfiguration('smartb').get<string>('serverUrl', 'ws://localhost:3333/ws');
        wsClient.updateUrl(serverUrl);
      }
    }),
  );

  // 8. Clean up WebSocket on deactivation
  context.subscriptions.push({
    dispose: () => wsClient.disconnect(),
  });

  /** Handle messages sent from the webview via postMessage. */
  function handleWebviewMessage(msg: unknown): void {
    const data = msg as Record<string, unknown>;

    if (data.type === 'addFlag') {
      const nodeId = data.nodeId as string;
      const message = data.message as string;
      if (!nodeId || !message) return;
      saveFlag(nodeId, message);
    }

    if (data.type === 'selectFile') {
      const file = data.file as string;
      if (!file) return;
      currentFile = file;
      // If we have cached content, send it immediately
      if (fileContents.has(file)) {
        provider.postMessage({
          type: 'diagram:update',
          file,
          content: fileContents.get(file),
        });
      }
    }
  }

  /** Save a flag annotation to the .mmd file via SmartB server /save endpoint. */
  async function saveFlag(nodeId: string, message: string): Promise<void> {
    if (!currentFile) {
      vscode.window.showErrorMessage('SmartB: No diagram file is currently active.');
      return;
    }

    const content = fileContents.get(currentFile);
    if (!content) {
      vscode.window.showErrorMessage('SmartB: No cached content for the current diagram.');
      return;
    }

    // Append the flag annotation line to the current content.
    // The SmartB server's DiagramService normalizes annotations on the next read cycle.
    const flagLine = `%% @flag ${nodeId} "${message}"`;
    const updatedContent = content.trimEnd() + '\n' + flagLine + '\n';

    try {
      const httpBaseUrl = getHttpBaseUrl(serverUrl);
      await httpPost(`${httpBaseUrl}/save`, {
        filename: currentFile,
        content: updatedContent,
      });
      // Update local cache with the new content
      fileContents.set(currentFile, updatedContent);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      vscode.window.showErrorMessage(`SmartB: Failed to save flag - ${errMsg}`);
    }
  }
}

export function deactivate(): void {
  // Cleanup handled by disposables registered in activate()
}
