import type { HttpMonitorConfig, IsDownResult } from "../types/monitor.ts";
import type { HttpCheckResult } from "../types/result.ts";

export async function checkHttp(
  config: HttpMonitorConfig,
  signal: AbortSignal,
): Promise<HttpCheckResult> {
  const start = performance.now();
  try {
    const effective = config.prepare ? await config.prepare(config) : config;
    const headers = new Headers(effective.headers);
    if (effective.auth?.type === "basic") {
      headers.set(
        "Authorization",
        `Basic ${
          btoa(`${effective.auth.username}:${effective.auth.password}`)
        }`,
      );
    } else if (effective.auth?.type === "bearer") {
      headers.set("Authorization", `Bearer ${effective.auth.token}`);
    }
    const combined = AbortSignal.any([
      signal,
      AbortSignal.timeout(effective.timeout ?? 10_000),
    ]);
    const res = await fetch(effective.url, {
      method: effective.method ?? "GET",
      headers,
      body: effective.body,
      signal: combined,
    });
    // Drain the body so the connection can be released back to the pool.
    await res.body?.cancel();
    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      durationMs: performance.now() - start,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      headers: new Headers(),
      durationMs: performance.now() - start,
      error: error as Error,
    };
  }
}

export function defaultHttpIsDown(
  _config: HttpMonitorConfig,
  result: HttpCheckResult,
): IsDownResult {
  if (result.error) {
    return { down: true, message: `Request failed: ${result.error.message}` };
  }
  if (result.status < 200 || result.status >= 300) {
    return { down: true, message: `Unexpected status code ${result.status}` };
  }
  return { down: false, message: "Service is up" };
}
