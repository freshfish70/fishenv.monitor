import { assertEquals } from "@std/assert";
import { Kysely } from "kysely";
import { NodeNativeSqliteDialect } from "../db/dialect/mod.ts";
import { migrate } from "../db/migrate.ts";
import { MonitorRepository } from "../db/monitor-repository.ts";
import { notifyEvent } from "./dispatch.ts";
import type { Database } from "../db/schema.ts";
import type {
  IsDownResult,
  NormalizedMonitorConfig,
} from "../types/monitor.ts";
import type {
  NotificationEvent,
  NotificationTarget,
} from "../types/notification.ts";
import type { Logger } from "../logger.ts";

const warnings: string[] = [];
const silentLogger: Logger = {
  info: () => {},
  warn: (...args) => warnings.push(args.join(" ")),
  error: () => {},
};

function fakeEndpoint(name: string, notified: string[]): NotificationTarget {
  return {
    name,
    type: "discord",
    notify(event) {
      notified.push(`${name}:${event.kind}`);
      return Promise.resolve(true);
    },
  };
}

function event(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    kind: "down",
    monitor: { id: "svc-1", name: "svc", type: "http" },
    message: "boom",
    state: "down",
    previousState: "up",
    checkedAt: new Date(),
    consecutive: 1,
    durationMs: 5,
    result: { status: 500, ok: false, headers: new Headers(), durationMs: 5 },
    ...overrides,
  };
}

function monitorWith(
  notification: NotificationTarget[],
  notify?: NormalizedMonitorConfig["notify"],
): NormalizedMonitorConfig {
  return {
    id: "svc-1",
    name: "svc",
    type: "http",
    interval: 30,
    url: "https://example.com",
    notification,
    notify,
  };
}

async function withRepo(
  fn: (repo: MonitorRepository, db: Kysely<Database>) => Promise<void>,
): Promise<void> {
  const db = new Kysely<Database>({
    dialect: new NodeNativeSqliteDialect(":memory:"),
  });
  await migrate(db);
  // notifications.monitor_id references monitors(id).
  await db.insertInto("monitors").values({
    id: "svc-1",
    name: "svc",
    type: "http",
    last_state: "up",
    last_checked_at: null,
    last_transition_at: null,
    consecutive: 0,
    updated_at: new Date().toISOString(),
  }).execute();
  try {
    await fn(new MonitorRepository(db), db);
  } finally {
    await db.destroy();
  }
}

const DOWN: IsDownResult = { down: true, message: "boom" };

Deno.test("notifies every endpoint when channels is omitted", async () => {
  await withRepo(async (repo) => {
    const notified: string[] = [];
    const monitor = monitorWith([
      fakeEndpoint("a", notified),
      fakeEndpoint("b", notified),
    ]);

    await notifyEvent(monitor, event(), DOWN, { repo, logger: silentLogger });

    assertEquals(notified.sort(), ["a:down", "b:down"]);
  });
});

Deno.test("channels narrows the endpoints, by name or by endpoint object", async () => {
  await withRepo(async (repo) => {
    const notified: string[] = [];
    const a = fakeEndpoint("a", notified);
    const b = fakeEndpoint("b", notified);
    const monitor = monitorWith([a, b]);
    const ctx = { repo, logger: silentLogger };

    await notifyEvent(monitor, event(), { ...DOWN, channels: ["b"] }, ctx);
    assertEquals(notified, ["b:down"]);

    notified.length = 0;
    await notifyEvent(monitor, event(), { ...DOWN, channels: [a] }, ctx);
    assertEquals(notified, ["a:down"]);
  });
});

Deno.test("an endpoint not declared on the monitor is skipped and warned about", async () => {
  await withRepo(async (repo) => {
    warnings.length = 0;
    const notified: string[] = [];
    const monitor = monitorWith([fakeEndpoint("a", notified)]);

    await notifyEvent(
      monitor,
      event(),
      { ...DOWN, channels: ["nonexistent"] },
      { repo, logger: silentLogger },
    );

    assertEquals(notified, []);
    assertEquals(warnings.length, 1);
  });
});

Deno.test("one endpoint failing does not stop the others, and is recorded", async () => {
  await withRepo(async (repo, db) => {
    const notified: string[] = [];
    const failing: NotificationTarget = {
      name: "failing",
      type: "discord",
      notify: () => Promise.reject(new Error("webhook 500")),
    };
    const monitor = monitorWith([fakeEndpoint("a", notified), failing]);

    await notifyEvent(monitor, event(), DOWN, { repo, logger: silentLogger });

    assertEquals(notified, ["a:down"]);

    const rows = await db
      .selectFrom("notifications")
      .selectAll()
      .orderBy("endpoint")
      .execute();
    assertEquals(rows.map((row) => [row.endpoint, row.ok, row.error]), [
      ["a", 1, null],
      ["failing", 0, "webhook 500"],
    ]);
  });
});

Deno.test("a vetoed format records nothing — no delivery was attempted", async () => {
  await withRepo(async (repo, db) => {
    const vetoing: NotificationTarget = {
      name: "quiet",
      type: "discord",
      notify: () => Promise.resolve(false),
    };

    await notifyEvent(monitorWith([vetoing]), event(), DOWN, {
      repo,
      logger: silentLogger,
    });

    const rows = await db.selectFrom("notifications").selectAll().execute();
    assertEquals(rows.length, 0);
  });
});

Deno.test("cooldown suppresses a second send to the same endpoint", async () => {
  await withRepo(async (repo) => {
    const notified: string[] = [];
    const monitor = monitorWith([fakeEndpoint("a", notified)], {
      cooldown: 300,
    });
    const ctx = { repo, logger: silentLogger };

    await notifyEvent(monitor, event(), DOWN, ctx);
    assertEquals(notified, ["a:down"]);

    // Same second — still inside the 300s window.
    await notifyEvent(monitor, event({ kind: "up" }), DOWN, ctx);
    assertEquals(notified, ["a:down"]);

    // Far enough in the future that the cooldown has lapsed.
    const later = new Date(Date.now() + 301_000);
    await notifyEvent(
      monitor,
      event({ kind: "up", checkedAt: later }),
      DOWN,
      ctx,
    );
    assertEquals(notified, ["a:down", "a:up"]);
  });
});
