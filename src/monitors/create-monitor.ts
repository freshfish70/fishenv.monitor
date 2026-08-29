import type {
  DnsMonitorConfig,
  HttpMonitorConfig,
  MonitorConfig,
  NormalizedMonitorConfig,
} from "../types/monitor.ts";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeMonitorConfig(
  config: MonitorConfig,
): NormalizedMonitorConfig {
  return {
    ...config,
    notification: config.notification ?? [],
    id: slugify(config.name),
  } as NormalizedMonitorConfig;
}

export function createMonitor(
  config: HttpMonitorConfig,
): HttpMonitorConfig & { id: string };
export function createMonitor(
  config: DnsMonitorConfig,
): DnsMonitorConfig & { id: string };
// Poison-pill overload: monitor types without an implemented checker are not
// part of `MonitorConfig`, so calling createMonitor() with one falls through
// to this overload and fails to compile with a readable message instead of
// TypeScript's generic "no overload matches this call".
export function createMonitor(
  config: { type: "tcp" | "ping" | "udp" | "websocket" } & {
    readonly __error:
      "This monitor type is not implemented yet in fishenv.monitor. Only 'http' | 'https' | 'dns' are supported.";
  },
): never;
export function createMonitor(
  config: MonitorConfig | { type: "tcp" | "ping" | "udp" | "websocket" },
): NormalizedMonitorConfig {
  return normalizeMonitorConfig(config as MonitorConfig);
}
