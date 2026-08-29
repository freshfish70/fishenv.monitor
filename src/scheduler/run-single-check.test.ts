import { assertEquals } from "@std/assert";
import { Kysely } from "kysely";
import { NodeNativeSqliteDialect } from "../db/dialect/mod.ts";
import { migrate } from "../db/migrate.ts";
import { MonitorRepository } from "../db/monitor-repository.ts";
import { runSingleCheck } from "./run-single-check.ts";
import type { NormalizedMonitorConfig } from "../types/monitor.ts";
import type { NotificationEndpoint } from "../types/notification.ts";
import { logger } from "../logger.ts";
import type { Database } from "../db/schema.ts";

function fakeEndpoint(
  name: string,
  calls: string[],
): NotificationEndpoint<"discord"> {
  return {
    name,
    type: "discord",
    notify(direction) {
      calls.push(direction);
      return Promise.resolve();
    },
  };
}

function withMockedFetch<T>(
  impl: typeof fetch,
  fn: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("runSingleCheck notifies down then up exactly once across transitions", async () => {
  const db = new Kysely<Database>({
    dialect: new NodeNativeSqliteDialect(":memory:"),
  });
  await migrate(db);
  const repo = new MonitorRepository(db);
  const calls: string[] = [];
  const monitor: NormalizedMonitorConfig = {
    id: "svc-1",
    name: "svc",
    type: "http",
    interval: 30,
    url: "https://example.com",
    notification: [fakeEndpoint("ep", calls)],
  };
  const ctx = { repo, logger };
  const signal = new AbortController().signal;
  const up = () => Promise.resolve(new Response("ok", { status: 200 }));
  const down = () => Promise.resolve(new Response("err", { status: 500 }));

  // First-ever check comes back up: must NOT fire an "up" alert (previous state was "unknown").
  await withMockedFetch(up, () => runSingleCheck(monitor, ctx, signal));
  assertEquals(calls, []);

  // Transition to down: fires exactly one "down" alert.
  await withMockedFetch(down, () => runSingleCheck(monitor, ctx, signal));
  assertEquals(calls, ["down"]);

  // Still down: no repeat alert.
  await withMockedFetch(down, () => runSingleCheck(monitor, ctx, signal));
  assertEquals(calls, ["down"]);

  // Recovers: fires exactly one "up" alert.
  await withMockedFetch(up, () => runSingleCheck(monitor, ctx, signal));
  assertEquals(calls, ["down", "up"]);

  // Still up: no repeat alert.
  await withMockedFetch(up, () => runSingleCheck(monitor, ctx, signal));
  assertEquals(calls, ["down", "up"]);

  await db.destroy();
});

Deno.test("runSingleCheck records a check_results row on every call regardless of transition", async () => {
  const db = new Kysely<Database>({
    dialect: new NodeNativeSqliteDialect(":memory:"),
  });
  await migrate(db);
  const repo = new MonitorRepository(db);
  const monitor: NormalizedMonitorConfig = {
    id: "svc-1",
    name: "svc",
    type: "http",
    interval: 30,
    url: "https://example.com",
    notification: [],
  };
  const ctx = { repo, logger };
  const signal = new AbortController().signal;
  const up = () => Promise.resolve(new Response("ok", { status: 200 }));

  await withMockedFetch(up, () => runSingleCheck(monitor, ctx, signal));
  await withMockedFetch(up, () => runSingleCheck(monitor, ctx, signal));

  const rows = await db.selectFrom("check_results").selectAll().execute();
  assertEquals(rows.length, 2);

  await db.destroy();
});
