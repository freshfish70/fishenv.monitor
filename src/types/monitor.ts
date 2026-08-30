import type {
  NotificationEventKind,
  NotificationTarget,
} from "./notification.ts";
import type { DnsCheckResult, HttpCheckResult } from "./result.ts";

export type MonitorType =
  | "http"
  | "https"
  | "dns"
  | "tcp"
  | "ping"
  | "udp"
  | "websocket";

/** "unknown" until a monitor's first check has been recorded. */
export type MonitorState = "up" | "down" | "unknown";

export interface IsDownResult {
  down: boolean;
  /**
   * Endpoints to notify — either the endpoint objects themselves (preferred:
   * a typo is then a compile error) or their names. Omit to notify every
   * endpoint in `notification`.
   */
  channels?: (string | NotificationTarget)[];
  message: string;
}

/**
 * When to notify, independent of which endpoints get notified.
 *
 * Defaults to transitions only, which is what almost everyone wants. To keep
 * hearing about an outage, add the `still-*` kinds and throttle them with
 * `repeatEvery` — without a throttle they fire on *every* check, which for a
 * 10s interval is thousands of messages a day.
 */
export interface NotifyPolicy {
  /** Default `["down", "up"]`. */
  on?: NotificationEventKind[];
  /** Seconds between repeat notifications for a `still-*` kind. */
  repeatEvery?: number;
  /** Seconds an endpoint must stay quiet after any send. Applied per endpoint. */
  cooldown?: number;
}

interface BaseMonitorConfig<TType extends MonitorType, TResult> {
  name: string;
  type: TType;
  /** Check interval, in seconds. */
  interval: number;
  notification?: NotificationTarget[];
  /** When to notify. Defaults to state transitions only. */
  notify?: NotifyPolicy;
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
