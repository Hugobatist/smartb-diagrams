import * as vscode from 'vscode';
import { DiagramViewProvider } from './diagram-provider.js';
import { SmartBWsClient } from './ws-client.js';

export function activate(context: vscode.ExtensionContext): void {
  // 1. Create and register the sidebar webview provider
  const provider = new DiagramViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DiagramViewProvider.viewType, provider),
  );

  // 2. Read configuration
  const config = vscode.workspace.getConfiguration('smartb');
  const serverUrl = config.get<string>('serverUrl', 'ws://localhost:3333/ws');
  const autoConnect = config.get<boolean>('autoConnect', true);

  // 3. Create WebSocket client with callbacks that relay to the webview
  const wsClient = new SmartBWsClient(serverUrl, {
    onMessage: (msg) => {
      provider.postMessage({ type: 'diagram:update', ...(msg as object) });
    },
    onStatus: (status) => {
      provider.postMessage({ type: 'connection:status', status });
    },
  });

  // 4. Auto-connect if configured
  if (autoConnect) {
    wsClient.connect();
  }

  // 5. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('smartb.reconnect', () => {
      wsClient.reconnect();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartb.openBrowser', () => {
      const wsUrl = vscode.workspace.getConfiguration('smartb').get<string>('serverUrl', 'ws://localhost:3333/ws');
      // Convert ws:// URL to http:// URL, removing /ws path
      const httpUrl = wsUrl
        .replace(/^wss?:\/\//, 'http://')
        .replace(/\/ws\/?$/, '');
      vscode.env.openExternal(vscode.Uri.parse(httpUrl));
    }),
  );

  // 6. Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('smartb.serverUrl')) {
        const newUrl = vscode.workspace.getConfiguration('smartb').get<string>('serverUrl', 'ws://localhost:3333/ws');
        wsClient.updateUrl(newUrl);
      }
    }),
  );

  // 7. Clean up WebSocket on deactivation
  context.subscriptions.push({
    dispose: () => wsClient.disconnect(),
  });
}

export function deactivate(): void {
  // Cleanup handled by disposables registered in activate()
}
