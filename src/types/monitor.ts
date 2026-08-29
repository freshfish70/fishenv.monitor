import type { NotificationEndpoint } from "./notification.ts";
import type { DnsCheckResult, HttpCheckResult } from "./result.ts";

export type MonitorType =
  | "http"
  | "https"
  | "dns"
  | "tcp"
  | "ping"
  | "udp"
  | "websocket";

export interface IsDownResult {
  down: boolean;
  message: string;
  /** Endpoint names to notify. Omit to notify every endpoint in `notification`. */
  channels?: string[];
}

interface BaseMonitorConfig<TType extends MonitorType, TResult> {
  name: string;
  type: TType;
  /** Check interval, in seconds. */
  interval: number;
  notification?: NotificationEndpoint[];
  /** Called before each check. Return a (possibly modified) config to use for that check. */
  prepare?(config: this): this | Promise<this>;
  /** If omitted, the type's default isDown behavior is used. */
  isDown?(config: this, result: TResult): IsDownResult | Promise<IsDownResult>;
}

export type HttpAuth =
  | { type: "basic"; username: string; password: string }
  | { type: "bearer"; token: string };

export interface HttpMonitorConfig
  extends BaseMonitorConfig<"http" | "https", HttpCheckResult> {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  auth?: HttpAuth;
  /** Request timeout, in ms. Default 10_000. */
  timeout?: number;
}

export interface DnsMonitorConfig
  extends BaseMonitorConfig<"dns", DnsCheckResult> {
  hostname: string;
  /** Default "A". */
  recordType?: Deno.RecordType;
  /** Resolution timeout, in ms. */
  timeout?: number;
}

/** Runtime union — only monitor types with an implemented checker. */
export type MonitorConfig = HttpMonitorConfig | DnsMonitorConfig;

/**
 * What `createMonitor()` actually returns: the user's config plus a stable
 * `id` (slug of `name`) derived at normalization time. Scheduler/db code
 * takes this type, since an `id` is required to key persisted state.
 */
export type NormalizedMonitorConfig = MonitorConfig & { id: string };
