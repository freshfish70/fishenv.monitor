import type { IsDownResult, MonitorConfig } from "../types/monitor.ts";
import type {
  MonitorNotifyContext,
  NotificationEndpoint,
} from "../types/notification.ts";

function resolveChannels(
  monitor: MonitorConfig,
  isDownResult: IsDownResult,
): NotificationEndpoint[] {
  const all = monitor.notification ?? [];
  if (!isDownResult.channels) return all;

  const byName = new Map(
    all.map((endpoint) => [endpoint.name, endpoint] as const),
  );
  const resolved: NotificationEndpoint[] = [];
  for (const channelName of isDownResult.channels) {
    const endpoint = byName.get(channelName);
    if (endpoint) {
      resolved.push(endpoint);
    } else {
      console.warn(
        `Unknown notification channel "${channelName}" on monitor "${monitor.name}"`,
      );
    }
  }
  return resolved;
}

export async function notifyTransition(
  monitor: MonitorConfig,
  direction: "up" | "down",
  isDownResult: IsDownResult,
  ctx: MonitorNotifyContext,
): Promise<void> {
  const endpoints = resolveChannels(monitor, isDownResult);
  const results = await Promise.allSettled(
    endpoints.map((endpoint) => endpoint.notify(direction, ctx)),
  );
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      console.error(
        `Notification to "${endpoints[i].name}" failed:`,
        result.reason,
      );
    }
  }
}
