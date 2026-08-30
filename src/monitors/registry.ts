import type { IsDownResult, MonitorConfig } from "../types/monitor.ts";
import type {
  CheckResult,
  DnsCheckResult,
  HttpCheckResult,
} from "../types/result.ts";
import { checkDns, defaultDnsIsDown } from "./dns.ts";
import { checkHttp, defaultHttpIsDown } from "./http.ts";

export type { CheckResult };

/** Runs the appropriate checker for `monitor.type`. Single dispatch point — no switch elsewhere. */
export function check(
  monitor: MonitorConfig,
  signal: AbortSignal,
): Promise<CheckResult> {
  switch (monitor.type) {
    case "http":
    case "https":
      return checkHttp(monitor, signal);
    case "dns":
      return checkDns(monitor, signal);
  }
}

/**
 * Runs `monitor`'s custom `isDown` if it defined one, otherwise the type's
 * default. `result` must come from `check(monitor, ...)`. Single dispatch
 * point for the isDown union-callback-typing problem — no switch elsewhere.
 */
export async function resolveIsDown(
  monitor: MonitorConfig,
  result: CheckResult,
): Promise<IsDownResult> {
  switch (monitor.type) {
    case "http":
    case "https": {
      const httpResult = result as HttpCheckResult;
      return monitor.isDown
        ? await monitor.isDown(monitor, httpResult)
        : defaultHttpIsDown(monitor, httpResult);
    }
    case "dns": {
      const dnsResult = result as DnsCheckResult;
      return monitor.isDown
        ? await monitor.isDown(monitor, dnsResult)
        : defaultDnsIsDown(monitor, dnsResult);
    }
  }
}
