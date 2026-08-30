export interface HttpCheckResult {
  status: number;
  ok: boolean;
  headers: Headers;
  durationMs: number;
  error?: Error;
}

export interface DnsCheckResult {
  /** Resolved records, shape depends on the record type queried. `null` on failure. */
  records: Awaited<ReturnType<typeof Deno.resolveDns>> | null;
  durationMs: number;
  error?: Error;
}

/**
 * Every result shape a checker can produce. Lives here rather than in the
 * monitor registry so the notification layer can depend on it without
 * depending on the checkers themselves.
 */
export type CheckResult = HttpCheckResult | DnsCheckResult;
