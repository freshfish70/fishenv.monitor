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
