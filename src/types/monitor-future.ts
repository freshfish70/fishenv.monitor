// Type definitions for monitor types that are not implemented yet.
// These are intentionally NOT part of the `MonitorConfig` runtime union in
// `./monitor.ts` — there is no checker for them, and `createMonitor()` rejects
// them at compile time via a poison-pill overload. They exist here only so the
// eventual shape of the discriminated union is known and can be typed against
// ahead of implementation.

export interface TcpMonitorConfig {
  type: "tcp";
  name: string;
  interval: number;
  host: string;
  port: number;
  timeout?: number;
}

export interface PingMonitorConfig {
  type: "ping";
  name: string;
  interval: number;
  host: string;
  count?: number;
  timeout?: number;
}

export interface UdpMonitorConfig {
  type: "udp";
  name: string;
  interval: number;
  host: string;
  port: number;
  /** Payload to send; a response (any bytes) within `timeout` is considered up. */
  payload?: Uint8Array;
  timeout?: number;
}

export interface WebsocketMonitorConfig {
  type: "websocket";
  name: string;
  interval: number;
  url: string;
  /** Sent after connect; if omitted, a successful connection is enough to be "up". */
  message?: string;
  timeout?: number;
}
