# SmartB Diagrams

Live AI reasoning diagrams in your VS Code sidebar.

## Features

- **Live Mermaid diagram rendering** in sidebar panel
- **Real-time updates** via WebSocket (no manual refresh)
- **Click nodes to add flag annotations** for AI correction
- **Connection status indicator** in status bar
- **Automatic reconnection** with exponential backoff

## Requirements

- A running SmartB server (`npx smartb-diagrams serve`)
- Node.js 22 or later

## Getting Started

1. Install the extension
2. Start SmartB server: `npx smartb-diagrams serve`
3. Open the SmartB sidebar (click the icon in the activity bar)
4. The diagram appears automatically

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `smartb.serverUrl` | WebSocket URL of the SmartB server | `ws://localhost:3333/ws` |
| `smartb.autoConnect` | Auto-connect to server on startup | `true` |

## Commands

| Command | Description |
|---------|-------------|
| `SmartB: Reconnect to Server` | Manually reconnect to the SmartB server |
| `SmartB: Open in Browser` | Open the SmartB UI in your default browser |
