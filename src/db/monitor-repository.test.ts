import { assertEquals } from "@std/assert";
import { Kysely } from "kysely";
import { NodeNativeSqliteDialect } from "./dialect/mod.ts";
import { migrate } from "./migrate.ts";
import { MonitorRepository } from "./monitor-repository.ts";
import type { Database } from "./schema.ts";

function openDb(path: string): Kysely<Database> {
  return new Kysely<Database>({ dialect: new NodeNativeSqliteDialect(path) });
}

Deno.test("getState registers an unseen monitor as 'unknown'", async () => {
  const db = openDb(":memory:");
  await migrate(db);
  const repo = new MonitorRepository(db);

  const state = await repo.getState("svc-1", "svc", "http");
  assertEquals(state, "unknown");

  const row = await db.selectFrom("monitors").selectAll().where(
    "id",
    "=",
    "svc-1",
  ).executeTakeFirst();
  assertEquals(row?.name, "svc");
  assertEquals(row?.type, "http");
  assertEquals(row?.last_state, "unknown");

  await db.destroy();
});

Deno.test("updateState persists the new state and getState reflects it", async () => {
  const db = openDb(":memory:");
  await migrate(db);
  const repo = new MonitorRepository(db);

  await repo.getState("svc-1", "svc", "http");
  await repo.updateState("svc-1", "down");
  assertEquals(await repo.getState("svc-1", "svc", "http"), "down");

  await db.destroy();
});

Deno.test("recordCheckResult inserts a row into check_results", async () => {
  const db = openDb(":memory:");
  await migrate(db);
  const repo = new MonitorRepository(db);

  await repo.getState("svc-1", "svc", "http");
  await repo.recordCheckResult(
    "svc-1",
    { down: true, message: "boom" },
    { status: 500, ok: false, headers: new Headers(), durationMs: 12.3 },
  );

  const rows = await db.selectFrom("check_results").selectAll().where(
    "monitor_id",
    "=",
    "svc-1",
  ).execute();
  assertEquals(rows.length, 1);
  assertEquals(rows[0].down, 1);
  assertEquals(rows[0].message, "boom");
});

Deno.test("transition state survives a simulated process restart (file-backed db reopened)", async () => {
  const path = await Deno.makeTempFile({ suffix: ".sqlite" });
  try {
    const db1 = openDb(path);
    await migrate(db1);
    const repo1 = new MonitorRepository(db1);
    await repo1.getState("svc-1", "svc", "http");
    await repo1.updateState("svc-1", "down");
    await db1.destroy();

    // "restart": a fresh Kysely/repository instance against the same file.
    const db2 = openDb(path);
    await migrate(db2);
    const repo2 = new MonitorRepository(db2);
    assertEquals(await repo2.getState("svc-1", "svc", "http"), "down");
    await db2.destroy();
  } finally {
    await Deno.remove(path);
  }
});
