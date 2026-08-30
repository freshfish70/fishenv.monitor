import type {
  IsDownResult,
  NormalizedMonitorConfig,
} from "../types/monitor.ts";
import type {
  NotificationEvent,
  NotificationTarget,
} from "../types/notification.ts";
import type { MonitorRepository } from "../db/monitor-repository.ts";
import type { Logger } from "../logger.ts";

export interface DispatchContext {
  repo: MonitorRepository;
  logger: Logger;
}

/**
 * Which endpoints hear about this event.
 *
 * `monitor.notification` is the source of truth for who *can* be notified;
 * `isDown().channels` only narrows it. An endpoint named there but not
 * declared on the monitor is a config mistake, so it is logged and skipped
 * rather than silently notified.
 */
export function resolveChannels(
  monitor: NormalizedMonitorConfig,
  isDownResult: IsDownResult,
  logger: Logger,
): NotificationTarget[] {
  const all = monitor.notification ?? [];
  if (!isDownResult.channels) return all;

  const byName = new Map(all.map((endpoint) => [endpoint.name, endpoint]));
  const resolved = new Map<string, NotificationTarget>();

  for (const channel of isDownResult.channels) {
    const name = typeof channel === "string" ? channel : channel.name;
    const endpoint = byName.get(name);
    if (endpoint) {
      resolved.set(name, endpoint);
    } else {
      logger.warn(
        `Monitor "${monitor.name}" selected notification channel "${name}", ` +
          `which is not in its notification list. Skipping.`,
      );
    }
  }

  return [...resolved.values()];
}

async function notifyOne(
  monitor: NormalizedMonitorConfig,
  endpoint: NotificationTarget,
  event: NotificationEvent,
  ctx: DispatchContext,
): Promise<void> {
  const cooldown = monitor.notify?.cooldown;
  if (cooldown) {
    const last = await ctx.repo.getLastNotifiedAt(monitor.id, endpoint.name);
    if (last && event.checkedAt.getTime() - last.getTime() < cooldown * 1000) {
      ctx.logger.info(
        `Skipping "${endpoint.name}" for "${monitor.name}": within ${cooldown}s cooldown.`,
      );
      return;
    }
  }

  try {
    const sent = await endpoint.notify(event);
    // A formatter returning null means "nothing to say" — no delivery was
    // attempted, so it neither gets recorded nor starts a cooldown.
    if (!sent) return;
    await ctx.repo.recordNotification({
      monitorId: monitor.id,
      endpoint: endpoint.name,
      channel: endpoint.type,
      kind: event.kind,
      ok: true,
    });
  } catch (error) {
    ctx.logger.error(`Notification to "${endpoint.name}" failed:`, error);
    await ctx.repo.recordNotification({
      monitorId: monitor.id,
      endpoint: endpoint.name,
      channel: endpoint.type,
      kind: event.kind,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Formats and delivers `event` to every endpoint the monitor selected. */
export async function notifyEvent(
  monitor: NormalizedMonitorConfig,
  event: NotificationEvent,
  isDownResult: IsDownResult,
  ctx: DispatchContext,
): Promise<void> {
  const endpoints = resolveChannels(monitor, isDownResult, ctx.logger);
  const settled = await Promise.allSettled(
    endpoints.map((endpoint) => notifyOne(monitor, endpoint, event, ctx)),
  );
  for (const outcome of settled) {
    // notifyOne handles delivery errors itself; anything landing here is the
    // bookkeeping write failing, which must not take down the other endpoints.
    if (outcome.status === "rejected") {
      ctx.logger.error("Recording a notification failed:", outcome.reason);
    }
  }
}
