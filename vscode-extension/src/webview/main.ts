/**
 * Webview script for the SmartB Diagrams sidebar panel.
 * Runs inside the VS Code webview context (browser sandbox).
 *
 * Communicates with the extension host via the VS Code API postMessage bridge.
 * Actual mermaid rendering will be implemented in plan 07-02 -- this is a
 * working skeleton that proves the postMessage pipeline.
 */

// Declare the VS Code API type for TypeScript
declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): Record<string, unknown> | undefined;
  setState(state: Record<string, unknown>): void;
};

(function () {
  const vscode = acquireVsCodeApi();

  // Restore previous state
  const state = vscode.getState() || {};

  const diagramEl = document.getElementById('diagram');
  const statusEl = document.getElementById('connection-status');

  /** Remove all child nodes from an element. */
  function clearElement(el: HTMLElement): void {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  // Listen for messages from the extension host
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data;

    switch (msg.type) {
      case 'diagram:update': {
        // Placeholder: show that a diagram message was received.
        // Full mermaid rendering will be implemented in 07-02.
        if (diagramEl && msg.content) {
          clearElement(diagramEl);
          const info = document.createElement('p');
          info.className = 'status-message';
          info.textContent = `Diagram received: ${msg.file || 'unknown'}`;
          diagramEl.appendChild(info);

          // Persist current file in state
          vscode.setState({ ...state, currentFile: msg.file });
        }
        break;
      }

      case 'connection:status': {
        if (statusEl) {
          const status: string = msg.status;
          statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
          statusEl.className = `connection-status ${status}`;
        }
        break;
      }
    }
  });
})();
