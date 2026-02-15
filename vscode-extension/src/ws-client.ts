import WebSocket from 'ws';

export interface WsClientCallbacks {
  onMessage: (msg: unknown) => void;
  onStatus: (status: 'connected' | 'disconnected' | 'reconnecting') => void;
}

/**
 * Reconnecting WebSocket client for the extension host (Node.js context).
 * Connects to a running SmartB server and relays messages to the extension.
 *
 * Mirrors the logic in static/ws-client.js but adapted for Node.js with the `ws` library.
 */
export class SmartBWsClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private static readonly BASE_DELAY = 500; // 500ms initial delay
  private static readonly MAX_DELAY = 16_000; // 16s cap

  constructor(
    private serverUrl: string,
    private callbacks: WsClientCallbacks,
  ) {}

  /** Open a WebSocket connection to the SmartB server. */
  connect(): void {
    if (this.disposed) return;
    // Guard: don't create a new connection if one is already open or connecting
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.ws = new WebSocket(this.serverUrl);

    this.ws.on('open', () => {
      this.attempt = 0;
      this.callbacks.onStatus('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.callbacks.onMessage(msg);
      } catch {
        // Ignore non-JSON messages
      }
    });

    this.ws.on('close', () => {
      this.callbacks.onStatus('disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', () => {
      // No-op: close fires after error
    });
  }

  /** Close the connection and prevent reconnection. */
  disconnect(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Disconnect and reconnect with a fresh connection. */
  reconnect(): void {
    this.disposed = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.attempt = 0;
    this.connect();
  }

  /** Update the server URL and reconnect. */
  updateUrl(url: string): void {
    this.serverUrl = url;
    this.reconnect();
  }

  /** Whether the WebSocket is currently open. */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;

    const delay = Math.min(
      SmartBWsClient.BASE_DELAY * Math.pow(2, this.attempt),
      SmartBWsClient.MAX_DELAY,
    );
    // Jitter: 50-100% of delay
    const jitter = delay * (0.5 + Math.random() * 0.5);
    this.attempt++;
    this.callbacks.onStatus('reconnecting');
    this.timer = setTimeout(() => this.connect(), jitter);
  }
}
