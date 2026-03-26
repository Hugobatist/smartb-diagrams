import * as vscode from 'vscode';

/**
 * Manages the status bar item that shows the SmartCode server connection state.
 * Displays an icon with colored background reflecting connected/disconnected/reconnecting.
 */
export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      'smartcode.connectionStatus',
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.name = 'SmartCode Connection';
    this.item.command = 'smartcode.reconnect';
    this.setStatus('disconnected');
    this.item.show();
  }

  /** Update the status bar to reflect the current connection state. */
  setStatus(status: 'connected' | 'disconnected' | 'reconnecting'): void {
    switch (status) {
      case 'connected':
        this.item.text = '$(check) SmartCode';
        this.item.tooltip = 'SmartCode: Connected to server';
        this.item.backgroundColor = undefined;
        break;
      case 'disconnected':
        this.item.text = '$(error) SmartCode';
        this.item.tooltip = 'SmartCode: Disconnected (click to reconnect)';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
      case 'reconnecting':
        this.item.text = '$(sync~spin) SmartCode';
        this.item.tooltip = 'SmartCode: Reconnecting...';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
    }
  }

  /** Dispose of the status bar item. */
  dispose(): void {
    this.item.dispose();
  }
}
