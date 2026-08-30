import { assertEquals } from "@std/assert";
import { Kysely } from "kysely";
import { NodeNativeSqliteDialect } from "../db/dialect/mod.ts";
import { migrate } from "../db/migrate.ts";
import { MonitorRepository } from "../db/monitor-repository.ts";
import { resolveEventKind, runSingleCheck } from "./run-single-check.ts";
import type { NormalizedMonitorConfig } from "../types/monitor.ts";
import type { NotificationTarget } from "../types/notification.ts";
import type { Logger } from "../logger.ts";
import type { Database } from "../db/schema.ts";

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function fakeEndpoint(name: string, calls: string[]): NotificationTarget {
  return {
    name,
    type: "discord",
    notify(event) {
      calls.push(event.kind);
      return Promise.resolve(true);
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

async function withDb(
  fn: (repo: MonitorRepository, db: Kysely<Database>) => Promise<void>,
): Promise<void> {
  const db = new Kysely<Database>({
    dialect: new NodeNativeSqliteDialect(":memory:"),
  });
  await migrate(db);
  try {
    await fn(new MonitorRepository(db), db);
  } finally {
    await db.destroy();
  }
}

function monitor(
  overrides: Partial<NormalizedMonitorConfig> = {},
): NormalizedMonitorConfig {
  return {
    id: "svc-1",
    name: "svc",
    type: "http",
    interval: 30,
    url: "https://example.com",
    notification: [],
    ...overrides,
  } as NormalizedMonitorConfig;
}

const up = () => Promise.resolve(new Response("ok", { status: 200 }));
const down = () => Promise.resolve(new Response("err", { status: 500 }));

Deno.test("resolveEventKind classifies transitions and repeats", () => {
  assertEquals(resolveEventKind("up", "down"), "down");
  assertEquals(resolveEventKind("down", "up"), "up");
  assertEquals(resolveEventKind("down", "down"), "still-down");
  assertEquals(resolveEventKind("up", "up"), "still-up");
  // First check ever: down is worth an alert, up is not a "recovery".
  assertEquals(resolveEventKind("unknown", "down"), "down");
  assertEquals(resolveEventKind("unknown", "up"), null);
});

Deno.test("notifies down then up exactly once across transitions", async () => {
  await withDb(async (repo) => {
    const calls: string[] = [];
    const svc = monitor({ notification: [fakeEndpoint("ep", calls)] });
    const ctx = { repo, logger: silentLogger };
    const signal = new AbortController().signal;

    // First-ever check comes back up: must NOT fire an "up" alert.
    await withMockedFetch(up, () => runSingleCheck(svc, ctx, signal));
    assertEquals(calls, []);

    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));
    assertEquals(calls, ["down"]);

    // Still down: no repeat alert under the default policy.
    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));
    assertEquals(calls, ["down"]);

    await withMockedFetch(up, () => runSingleCheck(svc, ctx, signal));
    assertEquals(calls, ["down", "up"]);

    await withMockedFetch(up, () => runSingleCheck(svc, ctx, signal));
    assertEquals(calls, ["down", "up"]);
  });
});

Deno.test("opting into still-down notifies on every non-transition check", async () => {
  await withDb(async (repo) => {
    const calls: string[] = [];
    const svc = monitor({
      notification: [fakeEndpoint("ep", calls)],
      notify: { on: ["down", "up", "still-down"] },
    });
    const ctx = { repo, logger: silentLogger };
    const signal = new AbortController().signal;

    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));
    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));
    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));

    assertEquals(calls, ["down", "still-down", "still-down"]);
  });
});

Deno.test("repeatEvery throttles still-down without touching transitions", async () => {
  await withDb(async (repo) => {
    const calls: string[] = [];
    const svc = monitor({
      notification: [fakeEndpoint("ep", calls)],
      notify: { on: ["down", "up", "still-down"], repeatEvery: 3600 },
    });
    const ctx = { repo, logger: silentLogger };
    const signal = new AbortController().signal;

    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));
    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));
    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));

    // The repeats are inside the hour, so only the transition got through.
    assertEquals(calls, ["down"]);

    // The recovery is a transition and is never throttled by repeatEvery.
    await withMockedFetch(up, () => runSingleCheck(svc, ctx, signal));
    assertEquals(calls, ["down", "up"]);
  });
});

Deno.test("consecutive counts checks in the current state and resets on transition", async () => {
  await withDb(async (repo, db) => {
    const seen: number[] = [];
    const endpoint: NotificationTarget = {
      name: "ep",
      type: "discord",
      notify(event) {
        seen.push(event.consecutive);
        return Promise.resolve(true);
      },
    };
    const svc = monitor({
      notification: [endpoint],
      notify: { on: ["down", "up", "still-down", "still-up"] },
    });
    const ctx = { repo, logger: silentLogger };
    const signal = new AbortController().signal;

    await withMockedFetch(up, () => runSingleCheck(svc, ctx, signal));
    await withMockedFetch(up, () => runSingleCheck(svc, ctx, signal));
    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));
    await withMockedFetch(down, () => runSingleCheck(svc, ctx, signal));

    // First check is suppressed (unknown -> up), so: still-up 2, down 1, still-down 2.
    assertEquals(seen, [2, 1, 2]);

    const row = await db
      .selectFrom("monitors")
      .select("consecutive")
      .where("id", "=", "svc-1")
      .executeTakeFirstOrThrow();
    assertEquals(row.consecutive, 2);
  });
});

Deno.test("records a check_results row on every call regardless of transition", async () => {
  await withDb(async (repo, db) => {
    const svc = monitor();
    const ctx = { repo, logger: silentLogger };
    const signal = new AbortController().signal;

    await withMockedFetch(up, () => runSingleCheck(svc, ctx, signal));
    await withMockedFetch(up, () => runSingleCheck(svc, ctx, signal));

    const rows = await db.selectFrom("check_results").selectAll().execute();
    assertEquals(rows.length, 2);
  });
});
