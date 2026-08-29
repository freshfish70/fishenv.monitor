import { expandGlob } from "@std/fs";
import { toFileUrl } from "@std/path";
import * as v from "valibot";
import { MonitorConfigSchema } from "./monitor-schema.ts";
import type { NormalizedMonitorConfig } from "../types/monitor.ts";

export interface LoadError {
  file: string;
  error: unknown;
}

export interface LoadResult {
  monitors: NormalizedMonitorConfig[];
  errors: LoadError[];
}

/**
 * Scans `pattern` for monitor config files and dynamically imports each
 * one's default export. Files with no default export are skipped silently —
 * the glob also matches supporting modules like notification.ts, which only
 * have named exports. A file that DOES have a default export but is broken
 * (syntax error, failed shape validation, duplicate name) is isolated and
 * reported in `errors` without aborting the scan of the remaining files.
 */
export async function loadMonitorConfigs(
  pattern = "./monitors/**/*.ts",
): Promise<LoadResult> {
  const monitors: NormalizedMonitorConfig[] = [];
  const errors: LoadError[] = [];
  const seenNames = new Set<string>();

  for await (const entry of expandGlob(pattern, { includeDirs: false })) {
    try {
      // Monitor files live in the consumer's project, not this package, so
      // the import target can't exist at publish time and isn't part of
      // this package's module graph.
      // deno-lint-ignore unanalyzable-dynamic-import
      const mod = await import(toFileUrl(entry.path).href);
      if (mod.default === undefined) continue;
      const parsed = v.parse(
        MonitorConfigSchema,
        mod.default,
      ) as NormalizedMonitorConfig;
      if (seenNames.has(parsed.name)) {
        throw new Error(`Duplicate monitor name "${parsed.name}"`);
      }
      seenNames.add(parsed.name);
      monitors.push(parsed);
    } catch (error) {
      errors.push({ file: entry.path, error });
    }
  }

  return { monitors, errors };
}
