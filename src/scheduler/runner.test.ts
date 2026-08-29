import { assert } from "@std/assert";
import { Kysely } from "kysely";
import { runAll } from "./runner.ts";
import { NodeNativeSqliteDialect } from "../db/dialect/mod.ts";
import { migrate } from "../db/migrate.ts";
import { MonitorRepository } from "../db/monitor-repository.ts";
import type { NormalizedMonitorConfig } from "../types/monitor.ts";
import type { Logger } from "../logger.ts";
import type { Database } from "../db/schema.ts";

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

function silentLogger(): Logger {
  return { info() {}, warn() {}, error() {} };
}

Deno.test("runAll checks immediately, reschedules on the interval, and stops on abort", async () => {
  const db = new Kysely<Database>({
    dialect: new NodeNativeSqliteDialect(":memory:"),
  });
  await migrate(db);
  const repo = new MonitorRepository(db);
  let callCount = 0;
  const monitor: NormalizedMonitorConfig = {
    id: "svc-1",
    name: "svc",
    type: "http",
    interval: 0.02, // 20ms, for a fast test
    url: "https://example.com",
    notification: [],
  };
  const controller = new AbortController();

  await withMockedFetch(
    () => {
      callCount++;
      return Promise.resolve(new Response("ok", { status: 200 }));
    },
    async () => {
      const runPromise = runAll(
        [monitor],
        { repo, logger: silentLogger() },
        controller.signal,
      );
      await new Promise((resolve) => setTimeout(resolve, 70));
      controller.abort();
      await runPromise;
    },
  );

  assert(callCount >= 2, `expected at least 2 checks, got ${callCount}`);
  await db.destroy();
});

Deno.test("runAll isolates a throwing check from stopping the loop", async () => {
  const db = new Kysely<Database>({
    dialect: new NodeNativeSqliteDialect(":memory:"),
  });
  await migrate(db);
  const repo = new MonitorRepository(db);
  const errors: unknown[] = [];
  const monitor: NormalizedMonitorConfig = {
    id: "svc-1",
    name: "svc",
    type: "http",
    interval: 0.02,
    url: "https://example.com",
    notification: [],
    isDown() {
      throw new Error("boom");
    },
  };
  const controller = new AbortController();

  await withMockedFetch(
    () => Promise.resolve(new Response("ok", { status: 200 })),
    async () => {
      const runPromise = runAll(
        [monitor],
        {
          repo,
          logger: {
            info() {},
            warn() {},
            error: (...args) => errors.push(args),
          },
        },
        controller.signal,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      controller.abort();
      await runPromise;
    },
  );

  assert(
    errors.length >= 2,
    `expected the loop to keep running after throws, got ${errors.length} logged errors`,
  );
  await db.destroy();
});
