# SmartCode

Live AI reasoning diagrams in your VS Code sidebar.

## Features

- **Live Mermaid diagram rendering** in sidebar panel
- **Real-time updates** via WebSocket (no manual refresh)
- **Click nodes to add flag annotations** for AI correction
- **Connection status indicator** in status bar
- **Automatic reconnection** with exponential backoff

## Requirements

- A running SmartCode server (`npx smartcode serve`)
- Node.js 22 or later

## Getting Started

1. Install the extension
2. Start SmartCode server: `npx smartcode serve`
3. Open the SmartCode sidebar (click the icon in the activity bar)
4. The diagram appears automatically

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `smartcode.serverUrl` | WebSocket URL of the SmartCode server | `ws://localhost:3333/ws` |
| `smartcode.autoConnect` | Auto-connect to server on startup | `true` |

## Commands

| Command | Description |
|---------|-------------|
| `SmartCode: Reconnect to Server` | Manually reconnect to the SmartCode server |
| `SmartCode: Open in Browser` | Open the SmartCode UI in your default browser |
