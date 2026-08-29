import type { DnsMonitorConfig, IsDownResult } from "../types/monitor.ts";
import type { DnsCheckResult } from "../types/result.ts";

export async function checkDns(
  config: DnsMonitorConfig,
  signal: AbortSignal,
): Promise<DnsCheckResult> {
  const start = performance.now();
  try {
    const effective = config.prepare ? await config.prepare(config) : config;
    const combined = AbortSignal.any([
      signal,
      AbortSignal.timeout(effective.timeout ?? 10_000),
    ]);
    const records = await Deno.resolveDns(
      effective.hostname,
      effective.recordType ?? "A",
      {
        signal: combined,
      },
    );
    return { records, durationMs: performance.now() - start };
  } catch (error) {
    return {
      records: null,
      durationMs: performance.now() - start,
      error: error as Error,
    };
  }
}

export function defaultDnsIsDown(
  _config: DnsMonitorConfig,
  result: DnsCheckResult,
): IsDownResult {
  if (result.error) {
    return {
      down: true,
      message: `DNS resolution failed: ${result.error.message}`,
    };
  }
  if (result.records === null || result.records.length === 0) {
    return { down: true, message: "No DNS records returned" };
  }
  return { down: false, message: "Service is up" };
}
