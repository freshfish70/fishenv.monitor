import type { NormalizedMonitorConfig } from "../types/monitor.ts";
import type { MonitorRepository } from "../db/monitor-repository.ts";
import type { Logger } from "../logger.ts";
import { check, resolveIsDown } from "../monitors/registry.ts";
import { notifyTransition } from "../notification/dispatch.ts";

export interface RunnerContext {
  repo: MonitorRepository;
  logger: Logger;
}

/** check -> isDown -> persist -> notify only on an up<->down state transition. */
export async function runSingleCheck(
  monitor: NormalizedMonitorConfig,
  ctx: RunnerContext,
  signal: AbortSignal,
): Promise<void> {
  const result = await check(monitor, signal);
  const isDownResult = await resolveIsDown(monitor, result);

  // Read fresh from the db (not an in-memory var) so transitions are detected
  // correctly even if the process was restarted since the last check.
  const previousState = await ctx.repo.getState(
    monitor.id,
    monitor.name,
    monitor.type,
  );
  const newState = isDownResult.down ? "down" : "up";

  await ctx.repo.recordCheckResult(monitor.id, isDownResult, result);

  if (newState === previousState) return;

  await ctx.repo.updateState(monitor.id, newState);
  const notifyCtx = {
    name: monitor.name,
    type: monitor.type,
    message: isDownResult.message,
  };

  if (newState === "down") {
    await notifyTransition(monitor, "down", isDownResult, notifyCtx);
  } else if (previousState !== "unknown") {
    // Only fire "up" if we previously knew it was down — avoids a spurious
    // recovery alert on the very first check of an already-healthy monitor.
    await notifyTransition(monitor, "up", isDownResult, notifyCtx);
  }
}
