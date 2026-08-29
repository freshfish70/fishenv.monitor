import { Kysely } from "kysely";
import { serve } from "@fishenv/http";
import { NodeNativeSqliteDialect } from "./src/db/dialect/mod.ts";
import { migrate } from "./src/db/migrate.ts";
import { MonitorRepository } from "./src/db/monitor-repository.ts";
import { loadMonitorConfigs } from "./src/config-loader/load-monitors.ts";
import { runAll } from "./src/scheduler/runner.ts";
import { createServer } from "./src/server/mod.ts";
import { logger } from "./src/logger.ts";
import type { Database } from "./src/db/schema.ts";

const MONITORS_GLOB = Deno.env.get("FISHENV_MONITORS_GLOB") ??
  "./monitors/**/*.ts";
const DB_PATH = Deno.env.get("FISHENV_DB_PATH") ?? "./monitor.sqlite";
const PORT = Number(Deno.env.get("FISHENV_MONITOR_PORT") ?? "8081");

async function main(): Promise<void> {
  const { monitors, errors } = await loadMonitorConfigs(MONITORS_GLOB);

  for (const { file, error } of errors) {
    logger.error(`Failed to load monitor config "${file}":`, error);
  }

  if (monitors.length === 0) {
    logger.warn(`No monitors loaded from "${MONITORS_GLOB}". Exiting.`);
    return;
  }

  logger.info(
    `Loaded ${monitors.length} monitor(s); ${errors.length} file(s) failed to load.`,
  );

  const db = new Kysely<Database>({
    dialect: new NodeNativeSqliteDialect(DB_PATH),
  });
  await migrate(db);
  const repo = new MonitorRepository(db);

  serve(createServer(repo), {
    port: PORT,
    onListen: ({ hostname, port }) =>
      logger.info(`Monitor API listening at http://${hostname}:${port}`),
  });

  const controller = new AbortController();
  const shutdown = () => controller.abort();
  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);

  await runAll(monitors, { repo, logger }, controller.signal);

  await db.destroy();
  logger.info("Shut down cleanly.");

  // Deno.addSignalListener above disables Deno's default exit-on-signal
  // behavior, so we must terminate explicitly. Without this, the still-open
  // HTTP listener from `serve()` (never wired to `controller.signal`) keeps
  // the process alive indefinitely after Ctrl+C.
  Deno.exit(0);
}

if (import.meta.main) {
  await main();
}
