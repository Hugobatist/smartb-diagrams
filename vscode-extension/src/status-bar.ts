import * as vscode from 'vscode';

/**
 * Manages the status bar item that shows the SmartB server connection state.
 * Displays an icon with colored background reflecting connected/disconnected/reconnecting.
 */
export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      'smartb.connectionStatus',
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.name = 'SmartB Connection';
    this.item.command = 'smartb.reconnect';
    this.setStatus('disconnected');
    this.item.show();
  }

  /** Update the status bar to reflect the current connection state. */
  setStatus(status: 'connected' | 'disconnected' | 'reconnecting'): void {
    switch (status) {
      case 'connected':
        this.item.text = '$(check) SmartB';
        this.item.tooltip = 'SmartB: Connected to server';
        this.item.backgroundColor = undefined;
        break;
      case 'disconnected':
        this.item.text = '$(error) SmartB';
        this.item.tooltip = 'SmartB: Disconnected (click to reconnect)';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
      case 'reconnecting':
        this.item.text = '$(sync~spin) SmartB';
        this.item.tooltip = 'SmartB: Reconnecting...';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
    }
  }

  /** Dispose of the status bar item. */
  dispose(): void {
    this.item.dispose();
  }
}
