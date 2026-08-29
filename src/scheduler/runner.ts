import { delay } from "@std/async";
import type { NormalizedMonitorConfig } from "../types/monitor.ts";
import { type RunnerContext, runSingleCheck } from "./run-single-check.ts";

export type { RunnerContext };

async function runMonitorLoop(
  monitor: NormalizedMonitorConfig,
  ctx: RunnerContext,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const start = Date.now();
    try {
      await runSingleCheck(monitor, ctx, signal);
    } catch (err) {
      // Isolate bugs in one monitor's check from crashing the whole runner.
      ctx.logger.error(`Unexpected error checking "${monitor.name}"`, err);
    }
    const waitMs = Math.max(0, monitor.interval * 1000 - (Date.now() - start));
    await delay(waitMs, { signal }).catch(() => {});
  }
}

/** Runs every monitor on its own self-rescheduling interval loop until `signal` aborts. */
export async function runAll(
  monitors: NormalizedMonitorConfig[],
  ctx: RunnerContext,
  signal: AbortSignal,
): Promise<void> {
  await Promise.allSettled(
    monitors.map((monitor) => runMonitorLoop(monitor, ctx, signal)),
  );
}
