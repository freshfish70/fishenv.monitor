import type {
  MonitorState,
  NormalizedMonitorConfig,
} from "../types/monitor.ts";
import type {
  NotificationEvent,
  NotificationEventKind,
} from "../types/notification.ts";
import type { MonitorRepository } from "../db/monitor-repository.ts";
import type { Logger } from "../logger.ts";
import { check, resolveIsDown } from "../monitors/registry.ts";
import { notifyEvent } from "../notification/dispatch.ts";

export interface RunnerContext {
  repo: MonitorRepository;
  logger: Logger;
}

const DEFAULT_ON: NotificationEventKind[] = ["down", "up"];

/**
 * Classifies a check against the previous state.
 *
 * Returns `null` only for the first check of a monitor that is already
 * healthy — otherwise every monitor would announce a recovery from nothing on
 * startup.
 */
export function resolveEventKind(
  previous: MonitorState,
  next: Exclude<MonitorState, "unknown">,
): NotificationEventKind | null {
  if (previous === next) return next === "down" ? "still-down" : "still-up";
  if (next === "down") return "down";
  return previous === "unknown" ? null : "up";
}

/**
 * Whether a repeat (`still-*`) notification is due yet.
 *
 * With no `repeatEvery` an opted-in `still-*` kind fires on every check, which
 * is the literal "tell me every time" reading and is why `repeatEvery` exists.
 */
async function repeatIsDue(
  monitor: NormalizedMonitorConfig,
  now: Date,
  repo: MonitorRepository,
): Promise<boolean> {
  const repeatEvery = monitor.notify?.repeatEvery;
  if (!repeatEvery) return true;

  const endpoints = monitor.notification ?? [];
  const lastSends = await Promise.all(
    endpoints.map((endpoint) =>
      repo.getLastNotifiedAt(monitor.id, endpoint.name)
    ),
  );
  const mostRecent = lastSends
    .filter((sentAt): sentAt is Date => sentAt !== null)
    .reduce<number | null>(
      (newest, sentAt) => Math.max(newest ?? 0, sentAt.getTime()),
      null,
    );

  if (mostRecent === null) return true;
  return now.getTime() - mostRecent >= repeatEvery * 1000;
}

/** check -> isDown -> persist -> notify, subject to the monitor's notify policy. */
export async function runSingleCheck(
  monitor: NormalizedMonitorConfig,
  ctx: RunnerContext,
  signal: AbortSignal,
): Promise<void> {
  const result = await check(monitor, signal);
  const isDownResult = await resolveIsDown(monitor, result);

  // Read fresh from the db (not an in-memory var) so transitions are detected
  // correctly even if the process was restarted since the last check.
  const previous = await ctx.repo.getState(
    monitor.id,
    monitor.name,
    monitor.type,
  );
  const newState: Exclude<MonitorState, "unknown"> = isDownResult.down
    ? "down"
    : "up";
  const transitioned = newState !== previous.state;
  const consecutive = transitioned ? 1 : previous.consecutive + 1;

  await ctx.repo.recordCheckResult(
    monitor.id,
    isDownResult,
    result,
    consecutive,
  );
  if (transitioned) await ctx.repo.updateState(monitor.id, newState);

  const kind = resolveEventKind(previous.state, newState);
  if (kind === null) return;

  const on = monitor.notify?.on ?? DEFAULT_ON;
  if (!on.includes(kind)) return;

  const checkedAt = new Date();
  if (
    kind.startsWith("still-") &&
    !await repeatIsDue(monitor, checkedAt, ctx.repo)
  ) {
    return;
  }

  const event: NotificationEvent = {
    kind,
    monitor: { id: monitor.id, name: monitor.name, type: monitor.type },
    message: isDownResult.message,
    state: newState,
    previousState: previous.state,
    checkedAt,
    consecutive,
    durationMs: result.durationMs,
    result,
  };

  await notifyEvent(monitor, event, isDownResult, ctx);
}
